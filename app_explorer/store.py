"""JSON persistence for the screen map."""

from __future__ import annotations

import json
from pathlib import Path

from .models import Element, Screen, ScreenMap, Transition

SCREEN_MAP_PATH = Path("workspace/screen-map.json")


def _ensure_dirs() -> None:
    SCREEN_MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    Path("reports/screenshots").mkdir(parents=True, exist_ok=True)


def load_map() -> ScreenMap:
    if not SCREEN_MAP_PATH.exists():
        return ScreenMap()
    return ScreenMap.model_validate_json(SCREEN_MAP_PATH.read_text())


def save_map(screen_map: ScreenMap) -> None:
    _ensure_dirs()
    SCREEN_MAP_PATH.write_text(screen_map.model_dump_json(indent=2))


def init_map(app_name: str, platform: str) -> ScreenMap:
    _ensure_dirs()
    if SCREEN_MAP_PATH.exists():
        m = load_map()
        m.app_name = app_name
        m.platform = platform
        save_map(m)
        return m
    m = ScreenMap(app_name=app_name, platform=platform)
    save_map(m)
    return m


def add_screen(
    screen_id: str,
    title: str,
    screenshot: str,
    elements: list[Element] | None = None,
    notes: str | None = None,
) -> Screen:
    m = load_map()
    # If screen already exists, update it
    for s in m.screens:
        if s.screen_id == screen_id:
            s.screenshot = screenshot
            if elements:
                s.elements = elements
            if notes:
                s.notes = notes
            save_map(m)
            return s
    screen = Screen(
        screen_id=screen_id,
        title=title,
        screenshot=screenshot,
        elements=elements or [],
        notes=notes,
    )
    m.screens.append(screen)
    save_map(m)
    return screen


def add_transition(from_screen: str, to_screen: str, action: str) -> Transition:
    m = load_map()
    # Deduplicate
    for t in m.transitions:
        if t.from_screen == from_screen and t.to_screen == to_screen and t.action == action:
            return t
    transition = Transition(from_screen=from_screen, to_screen=to_screen, action=action)
    m.transitions.append(transition)
    save_map(m)
    return transition


def get_unexplored_screens() -> list[dict]:
    """Return screens that have unexplored elements."""
    m = load_map()
    results = []
    for s in m.screens:
        unexplored = [e for e in s.elements if not e.explored]
        if unexplored:
            results.append(
                {
                    "screen_id": s.screen_id,
                    "title": s.title,
                    "unexplored_count": len(unexplored),
                    "unexplored_elements": [e.label for e in unexplored],
                }
            )
    return results
