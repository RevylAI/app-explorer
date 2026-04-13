"""Data models for the app exploration screen map."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Element(BaseModel):
    """An interactive element discovered on a screen."""

    label: str
    element_type: str  # button, input, link, tab, list_item, icon
    explored: bool = False
    leads_to: str | None = None  # screen_id this navigates to
    notes: str | None = None


class Screen(BaseModel):
    """A unique screen in the app."""

    screen_id: str
    title: str
    screenshot: str  # relative path to screenshot file
    elements: list[Element] = Field(default_factory=list)
    notes: str | None = None


class Transition(BaseModel):
    """A navigation edge between two screens."""

    from_screen: str
    to_screen: str
    action: str  # e.g. "tap 'Sign In button'"


class ScreenMap(BaseModel):
    """The complete app exploration graph."""

    app_name: str = ""
    platform: str = ""
    screens: list[Screen] = Field(default_factory=list)
    transitions: list[Transition] = Field(default_factory=list)
