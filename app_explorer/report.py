"""Generate the exploration report from the screen map."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from .models import ScreenMap


def sid_safe(s: str) -> str:
    """Make a screen_id safe for Mermaid node IDs."""
    return s.replace("-", "_")


def _build_mermaid(m: ScreenMap) -> str:
    if not m.transitions:
        return ""
    lines = ["```mermaid", "graph TD"]
    screen_labels = {s.screen_id: s.title for s in m.screens}
    seen_nodes: set[str] = set()
    for t in m.transitions:
        for sid in (t.from_screen, t.to_screen):
            if sid not in seen_nodes:
                label = screen_labels.get(sid, sid)
                lines.append(f'    {sid_safe(sid)}["{label}"]')
                seen_nodes.add(sid)
    for t in m.transitions:
        safe_action = t.action.replace('"', "'")
        lines.append(f'    {sid_safe(t.from_screen)} --> |"{safe_action}"| {sid_safe(t.to_screen)}')
    lines.append("```")
    return "\n".join(lines)


def _enumerate_paths(m: ScreenMap, max_paths: int = 20) -> list[list[str]]:
    """Find all simple paths from the first screen using DFS."""
    if not m.screens:
        return []
    adj: dict[str, list[str]] = {}
    for t in m.transitions:
        adj.setdefault(t.from_screen, []).append(t.to_screen)

    start = m.screens[0].screen_id
    paths: list[list[str]] = []

    def dfs(node: str, path: list[str]) -> None:
        if len(paths) >= max_paths:
            return
        neighbors = adj.get(node, [])
        if not neighbors or all(n in path for n in neighbors):
            if len(path) > 1:
                paths.append(list(path))
            return
        for n in neighbors:
            if n not in path:
                path.append(n)
                dfs(n, path)
                path.pop()

    dfs(start, [start])
    return paths


def generate_report(m: ScreenMap, output: Path | None = None) -> dict:
    """Generate the markdown exploration report."""
    if not m.screens:
        return {"error": "No screens discovered yet. Run an exploration first."}

    date = datetime.now().strftime("%Y-%m-%d")
    total_elements = sum(len(s.elements) for s in m.screens)
    explored_elements = sum(1 for s in m.screens for e in s.elements if e.explored)
    coverage = (explored_elements / total_elements * 100) if total_elements else 0

    lines = [
        f"# App Explorer Report: {m.app_name}",
        "",
        f"**Platform:** {m.platform.capitalize()} | **Date:** {date}",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Screens discovered | {len(m.screens)} |",
        f"| Transitions mapped | {len(m.transitions)} |",
        f"| Interactive elements | {total_elements} |",
        f"| Elements explored | {explored_elements} ({coverage:.0f}%) |",
        "",
    ]

    # Mermaid graph
    mermaid = _build_mermaid(m)
    if mermaid:
        lines.extend(["## Navigation Map", "", mermaid, ""])

    # Screen inventory
    lines.extend(["## Screen Inventory", ""])
    for i, s in enumerate(m.screens, 1):
        lines.extend([
            f"### {i}. {s.title} (`{s.screen_id}`)",
            "",
            f"![{s.title}]({s.screenshot})",
            "",
        ])
        if s.elements:
            lines.append("**Elements:**")
            for e in s.elements:
                dest = f" -> `{e.leads_to}`" if e.leads_to else ""
                status = "" if e.explored else " (unexplored)"
                note = f" -- {e.notes}" if e.notes else ""
                lines.append(f"- {e.label} ({e.element_type}){dest}{status}{note}")
            lines.append("")
        if s.notes:
            lines.append(f"**Notes:** {s.notes}")
            lines.append("")
        lines.extend(["---", ""])

    # User paths
    paths = _enumerate_paths(m)
    if paths:
        screen_titles = {s.screen_id: s.title for s in m.screens}
        lines.extend(["## User Paths", ""])
        for i, path in enumerate(paths, 1):
            readable = " -> ".join(screen_titles.get(sid, sid) for sid in path)
            lines.append(f"{i}. {readable}")
        lines.append("")

    # Edge cases
    edge_cases = [(s.screen_id, s.title, s.notes) for s in m.screens if s.notes]
    if edge_cases:
        lines.extend([
            "## Edge Cases",
            "",
            "| Screen | Title | Notes |",
            "|--------|-------|-------|",
        ])
        for sid, title, notes in edge_cases:
            lines.append(f"| `{sid}` | {title} | {notes} |")
        lines.append("")

    report_content = "\n".join(lines)
    output_path = output or Path("reports/exploration-report.md")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report_content)

    return {
        "success": True,
        "report_path": str(output_path),
        "screens": len(m.screens),
        "transitions": len(m.transitions),
        "coverage_pct": round(coverage, 1),
    }
