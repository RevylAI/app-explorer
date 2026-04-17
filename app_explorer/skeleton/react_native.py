"""
React Native screen extraction from a Hermes-compiled JS bundle.

Hermes packs all string literals into one tight buffer with no separators,
so a naive `strings` dump returns one giant blob. We grep that blob for
screen-name patterns (e.g. `*Screen`, `*Modal`, `*Sheet`, `*Page`) and apply
heuristic filters to drop the worst Hermes concatenation artifacts.

This is best-effort. For higher-quality output, parse the Hermes bytecode
header and string table directly, or use `hermes-dec`. We trade accuracy for
zero external dependencies.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

HERMES_MAGIC = b"\xc6\x1f\xbc\x03\xc1\x03\x19\x1f"

# Non-greedy `{2,40}?` so that adjacent strings like
# "AddHouseholdBioScreenAddHouseholdPhotosScreen" get split into two matches
# ("AddHouseholdBioScreen", "AddHouseholdPhotosScreen") instead of one merged.
PATTERNS = [
    (re.compile(r"[A-Z][a-z][A-Za-z]{2,40}?Screen"), "rn_screen", "high"),
    (re.compile(r"[A-Z][a-z][A-Za-z]{2,40}?Modal"), "rn_modal", "medium"),
    (re.compile(r"[A-Z][a-z][A-Za-z]{2,40}?Sheet"), "rn_sheet", "medium"),
    (re.compile(r"[A-Z][a-z][A-Za-z]{2,40}?Page"), "rn_page", "medium"),
]

# Names containing these substrings (not at the start) are almost certainly
# Hermes concatenation artifacts where two real strings butted up against one
# another in the packed buffer.
CONCATENATION_FRAGMENTS = (
    # JS / RN runtime fragments that show up mid-name
    "lazy", "Async", "Promise", "Capture", "Resolve", "Renderer",
    "Observer", "Listener", "Dispatcher", "Reducer", "Selector",
    "PerformanceEntries", "RegExp", "WithSelected", "createMock",
    "isFetch", "fetchPage", "Fragment", "Closure",
    # Style / layout noise
    "styleSheet", "StyleSheet", "borderRadius", "BorderRadius",
    "AdoptedStyle", "adoptedStyle",
    # Internal flags / state
    "isOpen", "isFetching", "isClosed", "shouldFlush", "shouldSet",
    "handleBottom", "handleTop", "handleSafe",
    # Locale / i18n garbage that sometimes lands adjacent
    "Prefecture", "Latn", "Cyrl",
)

# Real screens almost always start with one of these "verb-y" or feature prefixes.
# A name with no recognised prefix isn't disqualified, just ranked lower.
LIKELY_PREFIXES = (
    "Add", "Edit", "Delete", "Remove", "Confirm", "Cancel", "Submit",
    "Browse", "Search", "Filter", "Sort", "View", "Detail", "Show",
    "Login", "Signup", "Auth", "Onboard", "Welcome", "Splash", "Home",
    "Profile", "Settings", "Account", "Notification", "Inbox", "Chat",
    "Booking", "Trip", "Order", "Payment", "Checkout", "Cart", "Wishlist",
    "Listing", "Property", "Calendar", "Availability", "Schedule",
    "Verification", "Identity", "Document", "Photo", "Video", "Camera",
    "Map", "Address", "Location", "Contact", "Help", "Support", "FAQ",
    "Terms", "Privacy", "Legal", "Policy", "Tutorial", "Guide",
    "Review", "Rating", "Feedback", "Report",
    "Swap", "Share", "Refer", "Invite", "Approval", "Request",
    "Household", "Resident", "Guest", "Host", "Cleaner",
    "Bedroom", "Bathroom", "Kitchen", "Linen", "Storage",
    "Image", "Card", "List", "Grid", "Page", "Tab", "Modal", "Sheet",
    "Bottom", "Top", "Side", "Center", "Header", "Footer", "Empty",
    "Error", "Loading", "Success", "Pending", "Connect", "Disconnect",
)


def _is_likely_concatenation(name: str) -> bool:
    if len(name) > 50:
        return True
    # Mid-word fragment match (skip start-of-name matches because some real
    # names happen to start with one of these words).
    for frag in CONCATENATION_FRAGMENTS:
        idx = name.find(frag)
        if idx > 2:  # mid-name, not at the start
            return True
    return False


_LOWERCASE_FRAGMENT_RE = re.compile(r"[a-z][a-z]+(?=[A-Z])")


def _looks_like_artifact(name: str) -> bool:
    """
    Hermes packs strings tightly with no separators, so adjacent identifiers
    can run together (e.g. "AmountSuspense" + "PrimaryChildren" + "renderTo" +
    "Screen" → "AmountSuspensePrimaryChildrenderToScreen"). These artifacts
    look like word salads with many camelCase boundaries and unusual length.

    Real screens are typically 1-3 compound words. We mark > 3 boundaries OR
    > 38 chars as "low confidence" — they end up in the JSON but not the
    customer-facing markdown report.
    """
    boundaries = len(_LOWERCASE_FRAGMENT_RE.findall(name))
    if boundaries > 3:
        return True
    if len(name) > 38:
        return True
    # First camelCase segment is 1-2 chars (e.g. "MswapDetailsScreen" =
    # leftover "M" stuck onto "swapDetailsScreen"). Real screens start with
    # full words. "Add", "Get", "Set", etc. are 3 chars and stay valid.
    first_word_match = re.match(r"^[A-Z][a-z]+", name)
    if first_word_match and len(first_word_match.group(0)) < 3:
        return True
    # First segment is "Async"/"Resolve"/etc. — JS runtime words that show up
    # as adjacent strings, not as real screen-name prefixes.
    runtime_prefix_words = {"Async", "Resolve", "Promise", "Reject",
                            "Pending", "Settle", "Cancelable"}
    if first_word_match and first_word_match.group(0) in runtime_prefix_words:
        # Async could be a real prefix occasionally, but in this context it's
        # almost always a packed-string artifact, so demote.
        return True
    # Mid-name fragments that almost never appear in real React component names.
    artifact_substrings = (
        "Suspense", "Mutationuse", "Queryuse", "useInfinite",
        "renderTo", "RenderTo", "pointersect", "Pointersect",
        "Aumlt", "ddpg", "shouldFlush", "Capture",
    )
    for s in artifact_substrings:
        # In real names these never appear except as the prefix; mid-name = artifact.
        idx = name.find(s)
        if idx > 0:
            return True
    return False


def _confidence(name: str, default: str) -> str:
    """Keep the suffix-based default unless the name looks like a Hermes artifact."""
    if _looks_like_artifact(name):
        return "low"
    return default


def is_hermes(bundle_path: Path) -> bool:
    try:
        with bundle_path.open("rb") as f:
            return f.read(8) == HERMES_MAGIC
    except OSError:
        return False


def find_jsbundle(app_bundle: Path) -> Path | None:
    """Look for a React Native JS bundle inside an iOS .app bundle."""
    for name in ("main.jsbundle", "index.bundle", "main.bundle"):
        cand = app_bundle / name
        if cand.exists():
            return cand
    # Search one level deep too.
    for sub in app_bundle.iterdir():
        if sub.is_dir():
            for name in ("main.jsbundle", "index.bundle"):
                cand = sub / name
                if cand.exists():
                    return cand
    return None


def extract_rn_screens(bundle_path: Path) -> list[dict]:
    """Extract candidate React Native screens from a JS bundle (Hermes or plain JS)."""
    proc = subprocess.run(
        ["strings", "-a", "-n", "8", str(bundle_path)],
        capture_output=True, text=True, check=False,
    )
    text = proc.stdout

    out: list[dict] = []
    seen: set[str] = set()

    for pattern, kind, default_conf in PATTERNS:
        for m in pattern.finditer(text):
            name = m.group(0)
            if name in seen:
                continue
            if _is_likely_concatenation(name):
                continue
            seen.add(name)
            out.append({
                "name": name,
                "qualified_name": name,
                "module": None,
                "kind": kind,
                "confidence": _confidence(name, default_conf),
                "source": "hermes_strings",
            })
    return out


def bundle_metadata(bundle_path: Path) -> dict:
    """Return a small descriptor for the JS bundle (for the report header)."""
    return {
        "path": str(bundle_path),
        "size_bytes": bundle_path.stat().st_size,
        "is_hermes": is_hermes(bundle_path),
    }
