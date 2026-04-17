"""
iOS static screen skeleton extraction.

Public API:
    extract_skeleton(input_path, work_dir=None) -> dict
    render_markdown_report(skeleton) -> str

Uses only built-in macOS tools: nm, otool, xcrun swift-demangle, plistlib.
No third-party deps. Run anywhere with Xcode command line tools installed.
"""
from __future__ import annotations

import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Iterable

from . import react_native

SWIFT_DEMANGLE_BATCH = 2000

SWIFTUI_FRAMEWORK_MODULES = {
    "SwiftUI", "_SwiftUI_SwiftPM", "Foundation", "UIKit", "CoreFoundation",
    "Combine", "Swift", "_Concurrency", "_StringProcessing", "RegexBuilder",
    "ObjectiveC", "Dispatch", "os", "OSLog", "_MapKit_SwiftUI", "MapKit",
    "Lottie", "VisionKit", "WebKit", "AVFoundation", "AVKit", "PassKit",
    "AuthenticationServices", "LocalAuthentication", "PencilKit", "PhotosUI",
    "AppTrackingTransparency", "BackgroundTasks", "Network", "Speech",
    "AppIntents", "Charts",
}

COMMON_NOISE_PREFIXES = (
    "_TtC", "$s", "Swift.", "SwiftUI.", "Foundation.", "UIKit.", "Combine.",
    "_Concurrency.", "ObjectiveC.", "CoreFoundation.", "CoreGraphics.",
)

OAUTH_SCHEME_PATTERNS = (
    re.compile(r"^fb\d+$"),
    re.compile(r"^com\.googleusercontent"),
    re.compile(r"braintree", re.IGNORECASE),
)

# ── App bundle resolution ─────────────────────────────────────────────


def _resolve_app(input_path: Path, work_dir: Path) -> Path:
    if input_path.suffix == ".app":
        return input_path
    if input_path.suffix != ".ipa":
        raise ValueError(f"Unsupported input: {input_path} (expected .ipa or .app)")
    extract_dir = work_dir / "extracted"
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(input_path) as zf:
        zf.extractall(extract_dir)
    apps = list((extract_dir / "Payload").glob("*.app"))
    if not apps:
        raise RuntimeError(f"No .app bundle found inside {input_path}")
    return apps[0]


def _load_info_plist_raw(plist_path: Path) -> tuple[dict | list | None, str]:
    raw = plist_path.read_bytes()
    try:
        return plistlib.loads(raw), "plist"
    except Exception:
        pass
    try:
        import json as _json
        return _json.loads(raw.decode("utf-8", errors="replace")), "json"
    except Exception:
        return None, "unknown"


def _parse_info_plist(app_bundle: Path) -> dict:
    plist_path = app_bundle / "Info.plist"
    parsed, fmt = _load_info_plist_raw(plist_path)

    info_dict: dict = {}
    url_types: list = []
    if isinstance(parsed, dict):
        info_dict = parsed
        url_types = info_dict.get("CFBundleURLTypes") or []
    elif isinstance(parsed, list):
        url_types = parsed

    url_schemes: list[str] = []
    for url_type in url_types:
        if isinstance(url_type, dict):
            url_schemes.extend(url_type.get("CFBundleURLSchemes", []) or [])

    derived_exe = app_bundle.name[:-len(".app")] if app_bundle.suffix == ".app" else None
    executable = info_dict.get("CFBundleExecutable") or derived_exe

    return {
        "bundle_id": info_dict.get("CFBundleIdentifier"),
        "bundle_name": info_dict.get("CFBundleName") or derived_exe,
        "display_name": (
            info_dict.get("CFBundleDisplayName")
            or info_dict.get("CFBundleName")
            or derived_exe
        ),
        "version": info_dict.get("CFBundleShortVersionString"),
        "executable": executable,
        "url_schemes": url_schemes,
        "minimum_os": info_dict.get("MinimumOSVersion"),
        "info_plist_format": fmt,
        "info_plist_truncated": isinstance(parsed, list),
    }


def _find_main_binary(app_bundle: Path, info: dict) -> Path:
    exe = info.get("executable")
    if exe:
        cand = app_bundle / exe
        if cand.exists():
            return cand
    for child in app_bundle.iterdir():
        if child.is_file() and child.stat().st_mode & 0o111:
            return child
    raise RuntimeError(f"Could not locate main binary inside {app_bundle}")


# ── ObjC class extraction (otool -ov walks __objc_classlist) ──────────

_CLASS_HEADER_RE = re.compile(r"^[0-9a-f]{16} 0x[0-9a-f]+\s*$")
_NAME_LINE_RE = re.compile(r"^ {8}name\s+0x[0-9a-f]+\s+(\S+)\s*$")
_SUPERCLASS_LINE_RE = re.compile(r"^    superclass\s+0x[0-9a-f]+(?:\s+(\S+))?\s*$")


def _parse_otool_classlist(binary: Path) -> list[dict]:
    proc = subprocess.run(
        ["otool", "-ov", str(binary)],
        capture_output=True, text=True, check=False,
    )
    classes: list[dict] = []
    in_classlist = False
    current_superclass: str | None = None
    saw_meta = False

    for line in proc.stdout.splitlines():
        if line.startswith("Contents of"):
            in_classlist = "__objc_classlist" in line
            continue
        if not in_classlist:
            continue
        if line.startswith("Meta Class"):
            saw_meta = True
            continue
        if _CLASS_HEADER_RE.match(line):
            saw_meta = False
            current_superclass = None
            continue
        if saw_meta:
            continue
        sm = _SUPERCLASS_LINE_RE.match(line)
        if sm:
            current_superclass = sm.group(1)
            continue
        nm = _NAME_LINE_RE.match(line)
        if nm:
            classes.append({
                "mangled_name": nm.group(1),
                "superclass_external": current_superclass,
            })
            current_superclass = None
    return classes


# ── Mach-O section parsing (for __swift5_types) ───────────────────────


def _parse_macho_sections(otool_l_output: str) -> dict:
    sections: dict[tuple[str, str], dict] = {}
    cur: dict = {"sectname": None, "segname": None, "addr": None, "size": None, "offset": None}

    def commit(c: dict) -> None:
        if c["sectname"] and c["segname"] and c["offset"] is not None:
            sections[(c["segname"], c["sectname"])] = {
                "addr": c["addr"], "size": c["size"], "offset": c["offset"],
            }

    for line in otool_l_output.splitlines():
        s = line.strip()
        if s.startswith("sectname "):
            commit(cur)
            cur = {"sectname": s.split()[-1], "segname": None,
                   "addr": None, "size": None, "offset": None}
        elif s.startswith("segname "):
            cur["segname"] = s.split()[-1]
        elif s.startswith("addr "):
            try: cur["addr"] = int(s.split()[-1], 16)
            except ValueError: pass
        elif s.startswith("size "):
            try: cur["size"] = int(s.split()[-1], 16)
            except ValueError: pass
        elif s.startswith("offset "):
            try: cur["offset"] = int(s.split()[-1])
            except ValueError: pass
    commit(cur)
    return sections


def _read_cstring(buf: bytes, offset: int, max_len: int = 256) -> str | None:
    if not (0 <= offset < len(buf)):
        return None
    end = buf.find(b"\x00", offset, min(len(buf), offset + max_len))
    if end == -1:
        return None
    try:
        return buf[offset:end].decode("utf-8")
    except UnicodeDecodeError:
        return None


def _parse_swift5_types(binary: Path) -> list[dict]:
    """
    Walk __TEXT.__swift5_types as an array of 4-byte signed relative pointers
    to TypeContextDescriptor records. Layout: flags(4) + parent_ptr(4) + name_ptr(4).
    Parent pointer at +4 lets us recover the immediate module name.
    """
    sect_proc = subprocess.run(
        ["otool", "-l", str(binary)], capture_output=True, text=True, check=False,
    )
    sections = _parse_macho_sections(sect_proc.stdout)

    out: list[dict] = []
    seen_descriptors: set[int] = set()
    data: bytes | None = None

    for sect_key in [("__TEXT", "__swift5_types"), ("__TEXT", "__swift5_types2")]:
        sect = sections.get(sect_key)
        if not sect:
            continue
        if data is None:
            data = binary.read_bytes()
        n_entries = sect["size"] // 4
        for i in range(n_entries):
            entry_off = sect["offset"] + i * 4
            if entry_off + 4 > len(data):
                break
            val = int.from_bytes(data[entry_off:entry_off + 4], "little", signed=True)
            if val == 0:
                continue
            descriptor_off = entry_off + val
            if descriptor_off in seen_descriptors:
                continue
            if not (0 <= descriptor_off + 12 <= len(data)):
                continue
            seen_descriptors.add(descriptor_off)

            name_ptr_off = descriptor_off + 8
            name_val = int.from_bytes(data[name_ptr_off:name_ptr_off + 4], "little", signed=True)
            if name_val == 0 or name_val & 1:
                continue
            name = _read_cstring(data, name_ptr_off + name_val)
            if not name or not (name[0].isalpha() or name[0] == "_"):
                continue

            module: str | None = None
            parent_ptr_off = descriptor_off + 4
            parent_val = int.from_bytes(data[parent_ptr_off:parent_ptr_off + 4], "little", signed=True)
            if parent_val != 0 and not (parent_val & 1):
                parent_off = parent_ptr_off + parent_val
                if 0 <= parent_off + 12 <= len(data):
                    p_name_ptr_off = parent_off + 8
                    p_name_val = int.from_bytes(
                        data[p_name_ptr_off:p_name_ptr_off + 4], "little", signed=True,
                    )
                    if p_name_val != 0 and not (p_name_val & 1):
                        cand = _read_cstring(data, p_name_ptr_off + p_name_val)
                        if cand and cand[0].isalpha() and all(
                            c.isalnum() or c == "_" for c in cand
                        ):
                            module = cand

            out.append({
                "name": name,
                "module": module,
                "qualified_name": f"{module}.{name}" if module else name,
            })
    return out


# ── nm-based Swift symbol fallback ────────────────────────────────────


def _collect_swift_metadata_symbols(binary: Path) -> list[str]:
    proc = subprocess.run(
        ["nm", "-arch", "arm64", str(binary)],
        capture_output=True, text=True, check=False,
    )
    syms: list[str] = []
    for line in proc.stdout.splitlines():
        parts = line.split()
        if not parts:
            continue
        sym = parts[-1]
        if sym.startswith(("_$s", "$s")) and sym.endswith(("N", "Mn", "Ma", "Mf")):
            syms.append(sym)
    return syms


def _demangle(symbols: Iterable[str]) -> list[str]:
    syms = list(symbols)
    if not syms:
        return []
    out: list[str] = []
    for i in range(0, len(syms), SWIFT_DEMANGLE_BATCH):
        batch = syms[i:i + SWIFT_DEMANGLE_BATCH]
        proc = subprocess.run(
            ["xcrun", "swift-demangle", "-compact"],
            input="\n".join(batch),
            capture_output=True, text=True, check=False,
        )
        out.extend(proc.stdout.splitlines())
    return out


def _demangle_class_names(classes: list[dict]) -> list[dict]:
    names = [c["mangled_name"] for c in classes]
    out = _demangle(names)
    for c, d in zip(classes, out):
        c["demangled_name"] = d.strip() or c["mangled_name"]
    return classes


_DEMANGLED_TYPE_RE = re.compile(
    r"(?:type metadata(?: accessor)?(?: function)?|nominal type descriptor|full type metadata)"
    r" for ([A-Za-z_][\w.]*)"
)


def _extract_swift_types(demangled_lines: list[str]) -> list[str]:
    types: set[str] = set()
    for line in demangled_lines:
        m = _DEMANGLED_TYPE_RE.search(line)
        if m:
            types.add(m.group(1))
    return sorted(types)


# ── Screen classification heuristics ──────────────────────────────────

_SCREEN_HEURISTICS = [
    (lambda b: b.endswith("ViewController"), "uikit_viewcontroller", "high"),
    (lambda b: b.endswith("Screen"), "swiftui_screen", "high"),
    (lambda b: b.endswith("Page"), "swiftui_page", "medium"),
    (lambda b: b.endswith("Sheet"), "swiftui_sheet", "medium"),
    (lambda b: b.endswith("Modal"), "swiftui_modal", "medium"),
    (lambda b: b.endswith("View") and not any(b.endswith(x) for x in (
        "SubView", "ItemView", "CellView", "RowView", "BadgeView",
        "IconView", "LabelView", "ImageView", "ButtonView", "TextView",
    )), "swiftui_view", "low"),
]


def _classify(bare: str) -> tuple[str, str] | None:
    for test, kind, conf in _SCREEN_HEURISTICS:
        if test(bare):
            return kind, conf
    return None


def _is_noise(full_name: str) -> bool:
    return any(full_name.startswith(p) for p in COMMON_NOISE_PREFIXES)


_VC_SUPERCLASS_RE = re.compile(r"_OBJC_CLASS_\$_(\w*ViewController\w*)")


def _merge_candidates(
    swift_types: list[str],
    swift_section_types: list[dict],
    classlist: list[dict],
) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []

    # Pass 1: direct UIViewController-family subclasses (ObjC superclass match).
    for c in classlist:
        sc = c.get("superclass_external") or ""
        sc_match = _VC_SUPERCLASS_RE.search(sc)
        full = c["demangled_name"]
        bare = full.rsplit(".", 1)[-1] if "." in full else full
        module = full.rsplit(".", 1)[0] if "." in full else None
        if sc_match and bare not in seen:
            out.append({
                "name": bare, "qualified_name": full, "module": module,
                "kind": "uikit_viewcontroller", "confidence": "high",
                "source": "objc_classlist", "superclass": sc_match.group(1),
            })
            seen.add(bare)

    # Pass 2: classlist entries whose name contains "ViewController".
    for c in classlist:
        full = c["demangled_name"]
        bare = full.rsplit(".", 1)[-1] if "." in full else full
        module = full.rsplit(".", 1)[0] if "." in full else None
        if "ViewController" in bare and bare not in seen:
            out.append({
                "name": bare, "qualified_name": full, "module": module,
                "kind": "uikit_viewcontroller", "confidence": "medium",
                "source": "objc_classlist_namematch",
            })
            seen.add(bare)

    # Pass 3: Swift types from __swift5_types section.
    for entry in swift_section_types:
        bare = entry["name"]
        module = entry.get("module")
        if bare in seen or module in SWIFTUI_FRAMEWORK_MODULES:
            continue
        verdict = _classify(bare)
        if verdict is None:
            continue
        kind, conf = verdict
        out.append({
            "name": bare, "qualified_name": entry.get("qualified_name", bare),
            "module": module, "kind": kind, "confidence": conf,
            "source": "swift5_types_section",
        })
        seen.add(bare)

    # Pass 4: Swift metadata symbols via nm (legacy fallback for unstripped types).
    for full in swift_types:
        if _is_noise(full):
            continue
        bare = full.rsplit(".", 1)[-1]
        if bare in seen:
            continue
        verdict = _classify(bare)
        if verdict is None:
            continue
        kind, conf = verdict
        module = full.rsplit(".", 1)[0] if "." in full else None
        if module in SWIFTUI_FRAMEWORK_MODULES:
            continue
        out.append({
            "name": bare, "qualified_name": full, "module": module,
            "kind": kind, "confidence": conf, "source": "swift_metadata_nm",
        })
        seen.add(bare)

    confidence_order = {"high": 0, "medium": 1, "low": 2}
    out.sort(key=lambda r: (confidence_order.get(r["confidence"], 9), r["name"]))
    return out


def _is_oauth_callback(scheme: str) -> bool:
    return any(p.search(scheme) for p in OAUTH_SCHEME_PATTERNS)


def _build_deep_links(url_schemes: list[str]) -> list[dict]:
    out: list[dict] = []
    for scheme in url_schemes:
        out.append({
            "scheme": f"{scheme}://",
            "is_oauth_callback": _is_oauth_callback(scheme),
            "note": (
                "OAuth callback (likely not user-facing entry)"
                if _is_oauth_callback(scheme)
                else "Public deep-link entry point"
            ),
        })
    return out


# ── Public API ────────────────────────────────────────────────────────


def extract_skeleton(input_path: Path, work_dir: Path | None = None,
                     log: bool = True) -> dict:
    """
    Extract a static screen skeleton from an iOS .ipa or .app.
    Returns a JSON-serialisable dict.
    """
    cleanup = work_dir is None
    if work_dir is None:
        work_dir = Path(tempfile.mkdtemp(prefix="ios-skeleton-"))
    else:
        work_dir.mkdir(parents=True, exist_ok=True)

    def _log(msg: str) -> None:
        if log:
            print(msg, file=sys.stderr)

    try:
        app_bundle = _resolve_app(input_path, work_dir)
        _log(f"Analyzing {app_bundle.name}...")
        info = _parse_info_plist(app_bundle)
        binary = _find_main_binary(app_bundle, info)

        _log("  parsing __objc_classlist via otool -ov...")
        classlist = _parse_otool_classlist(binary)
        _log(f"  found {len(classlist)} ObjC classes; demangling...")
        classlist = _demangle_class_names(classlist)

        _log("  parsing __swift5_types section...")
        swift_section_types = _parse_swift5_types(binary)
        _log(f"  found {len(swift_section_types)} Swift type descriptors")

        _log("  collecting Swift type metadata symbols...")
        swift_syms = _collect_swift_metadata_symbols(binary)
        swift_types = _extract_swift_types(_demangle(swift_syms))

        native_screens = _merge_candidates(swift_types, swift_section_types, classlist)

        # React Native: if a JS bundle is shipped inside the .app, extract its
        # screens too. Pure-RN apps have a tiny native footprint and almost
        # everything in the JS bundle.
        rn_screens: list[dict] = []
        rn_meta: dict | None = None
        jsbundle = react_native.find_jsbundle(app_bundle)
        if jsbundle is not None:
            _log(f"  found React Native JS bundle: {jsbundle.name}")
            rn_meta = react_native.bundle_metadata(jsbundle)
            _log(f"  parsing JS bundle ({rn_meta['size_bytes'] // 1024} KB, "
                 f"{'Hermes' if rn_meta['is_hermes'] else 'plain JS'})...")
            rn_screens = react_native.extract_rn_screens(jsbundle)
            _log(f"  extracted {len(rn_screens)} React Native screen candidates")

        # Merge native + RN, dedup by name
        seen = {s["name"] for s in native_screens}
        for s in rn_screens:
            if s["name"] not in seen:
                native_screens.append(s)
                seen.add(s["name"])
        # Re-sort with RN entries inline
        confidence_order = {"high": 0, "medium": 1, "low": 2}
        native_screens.sort(key=lambda r: (confidence_order.get(r["confidence"], 9), r["name"]))
        screens = native_screens

        deep_links = _build_deep_links(info["url_schemes"])

        by_kind: dict[str, int] = {}
        by_source: dict[str, int] = {}
        for s in screens:
            by_kind[s["kind"]] = by_kind.get(s["kind"], 0) + 1
            by_source[s["source"]] = by_source.get(s["source"], 0) + 1

        gaps = [
            "Edges (which screen leads to which) are NOT extracted statically.",
            "Auth-gated, feature-flagged, and server-driven screens are invisible.",
            "SwiftUI child views composed via @ViewBuilder vanish at compile time.",
            "The runtime BFS agent must verify the skeleton and discover edges.",
        ]
        if rn_meta:
            gaps.append(
                "React Native screens come from Hermes string-table grep — names "
                "may include concatenation artifacts where adjacent strings ran "
                "together in the packed buffer."
            )

        return {
            "schema_version": 1,
            "platform": "ios",
            "app": info,
            "react_native_bundle": rn_meta,
            "stats": {
                "objc_classlist_total": len(classlist),
                "swift5_types_section_total": len(swift_section_types),
                "swift_metadata_nm_types": len(swift_types),
                "react_native_screens": len(rn_screens),
                "candidate_screens": len(screens),
                "screens_by_kind": by_kind,
                "screens_by_source": by_source,
                "deep_link_entries": len(deep_links),
            },
            "candidate_screens": screens,
            "deep_link_entries": deep_links,
            "known_gaps": gaps,
        }
    finally:
        if cleanup:
            shutil.rmtree(work_dir, ignore_errors=True)


def render_markdown_report(skeleton: dict) -> str:
    """Human/agent-readable Markdown summary of the skeleton."""
    app = skeleton["app"]
    stats = skeleton["stats"]
    name = app.get("display_name") or app.get("bundle_name") or "Unknown App"

    L: list[str] = []
    L.append(f"# {name} — Static Screen Skeleton")
    L.append("")
    L.append(
        "> Pre-exploration skeleton extracted from the app binary. "
        "Use as a *target list* for BFS exploration: these are screens we know exist. "
        "Edges (which screen leads to which) are NOT in the skeleton — runtime BFS finds those."
    )
    L.append("")
    L.append("## App")
    L.append("")
    L.append(f"- **Bundle ID**: `{app.get('bundle_id') or '(unknown — Info.plist truncated)'}`")
    L.append(f"- **Bundle name**: `{app.get('bundle_name')}`")
    L.append(f"- **Version**: `{app.get('version') or '(unknown)'}`")
    L.append(f"- **Min iOS**: `{app.get('minimum_os') or '(unknown)'}`")
    L.append(f"- **Executable**: `{app.get('executable')}`")
    if app.get("info_plist_truncated"):
        L.append(
            "- ⚠️ **Info.plist truncated** — only URL types present. Bundle ID/version unrecoverable."
        )
    L.append("")

    rn_meta = skeleton.get("react_native_bundle")
    if rn_meta:
        L.append("## React Native bundle detected")
        L.append("")
        L.append(
            f"This is a React Native app. Screens live in **`{Path(rn_meta['path']).name}`** "
            f"({rn_meta['size_bytes'] // 1024:,} KB, "
            f"{'Hermes bytecode' if rn_meta['is_hermes'] else 'plain JS'}). "
            f"The native binary is a thin shell — most candidate screens below "
            f"come from the JS bundle string table."
        )
        L.append("")

    L.append("## Coverage")
    L.append("")
    L.append(f"- ObjC classes in binary: **{stats['objc_classlist_total']:,}**")
    L.append(f"- Swift type descriptors in `__swift5_types`: **{stats['swift5_types_section_total']:,}**")
    L.append(f"- Swift type metadata symbols (nm): **{stats['swift_metadata_nm_types']:,}**")
    if rn_meta:
        L.append(f"- React Native screens (from JS bundle): **{stats.get('react_native_screens', 0):,}**")
    L.append(f"- **Candidate screens: {stats['candidate_screens']}**")
    L.append(f"- Deep-link entry points: {stats['deep_link_entries']}")
    L.append("")
    L.append("By kind:")
    for k, n in sorted(stats["screens_by_kind"].items(), key=lambda x: -x[1]):
        L.append(f"- `{k}`: {n}")
    L.append("")
    L.append("By extraction source:")
    for src, n in sorted(stats["screens_by_source"].items(), key=lambda x: -x[1]):
        L.append(f"- `{src}`: {n}")
    L.append("")

    L.append("## Deep-link entry points")
    L.append("")
    L.append("URL schemes that can launch the app directly into a flow.")
    L.append("Use these to bypass the cold-launch path when the skeleton")
    L.append("suggests the target screen is many taps deep.")
    L.append("")
    L.append("| Scheme | Likely use |")
    L.append("|---|---|")
    for dl in skeleton["deep_link_entries"]:
        L.append(f"| `{dl['scheme']}` | {dl.get('note', '')} |")
    L.append("")

    high_med = [s for s in skeleton["candidate_screens"] if s["confidence"] in ("high", "medium")]
    low = [s for s in skeleton["candidate_screens"] if s["confidence"] == "low"]
    by_mod: dict[str, list[dict]] = defaultdict(list)
    for s in high_med:
        by_mod[s.get("module") or "(no module)"].append(s)

    L.append("## Candidate screens (grouped by module)")
    L.append("")
    if rn_meta:
        low_note = (
            f"({len(low)} additional low-confidence candidates are in the JSON but "
            f"omitted here — these are mostly Hermes string-table concatenation "
            f"artifacts where two real screen names ran together in the packed buffer.)"
        )
    else:
        low_note = (
            f"({len(low)} additional low-confidence `*View` candidates are in the JSON "
            f"but omitted here — they're mostly SwiftUI subviews, cells, badges.)"
        )
    L.append(f"Showing **{len(high_med)} high/medium-confidence screens**. {low_note}")
    L.append("")
    L.append(
        "Confidence: **🟢 high** = direct UIViewController subclass, name ends in `Screen`, "
        "or recognized React Native screen pattern; **🟡 medium** = name contains "
        "`ViewController` or ends in `Page`/`Sheet`/`Modal`."
    )
    L.append("")
    for mod in sorted(by_mod, key=lambda m: -len(by_mod[m])):
        screens = by_mod[mod]
        L.append(f"### `{mod}` — {len(screens)} screens")
        L.append("")
        for s in screens:
            badge = {"high": "🟢", "medium": "🟡"}.get(s["confidence"], "⚪")
            sc = s.get("superclass")
            sc_str = f" : `{sc}`" if sc else ""
            L.append(f"- {badge} `{s['name']}`{sc_str} _{s['kind'].replace('_', ' ')}_")
        L.append("")

    L.append("## Known gaps")
    L.append("")
    for g in skeleton["known_gaps"]:
        L.append(f"- {g}")
    L.append("")

    L.append("## How the agent should use this")
    L.append("")
    L.append(
        "1. Treat the **candidate screens** as a target checklist. Every entry the "
        "runtime BFS doesn't visit is either auth-gated, feature-flagged, or "
        "unreachable from the agent's current entry path."
    )
    L.append(
        "2. When you reach an unmapped screen, look up whether the visible "
        "controller class name (from accessibility hints or page-source dumps) "
        "matches a candidate to assign a stable ID."
    )
    L.append(
        "3. Use **deep-link schemes** to jump directly into deep flows that "
        "would otherwise take 5+ taps from cold launch."
    )
    L.append(
        "4. Group related screens by module — a single module is usually one "
        "user-facing feature (e.g. `DDChat` = chat, `PaymentModule` = payment)."
    )
    L.append("")
    return "\n".join(L)
