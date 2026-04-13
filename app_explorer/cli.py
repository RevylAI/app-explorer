"""App Explorer CLI — track screens and transitions during app exploration."""

from __future__ import annotations

import json
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from . import store
from .models import Element
from .report import generate_report

app = typer.Typer(name="app-explorer", help="Map every screen and user path in a mobile app.")
screen_app = typer.Typer(help="Manage discovered screens.")
app.add_typer(screen_app, name="screen")

console = Console()


# ── init ──────────────────────────────────────────────────────────────

@app.command()
def init(
    app_name: str = typer.Option(..., "--app-name", help="Name of the app being explored"),
    platform: str = typer.Option(..., "--platform", help="android or ios"),
    as_json: bool = typer.Option(False, "--json", help="Output as JSON"),
):
    """Initialize a new exploration workspace."""
    m = store.init_map(app_name=app_name, platform=platform)
    if as_json:
        console.print_json(m.model_dump_json())
    else:
        console.print(f"Initialized exploration for [bold]{app_name}[/bold] ({platform})")
        console.print(f"Screen map: {store.SCREEN_MAP_PATH}")


# ── screen add ────────────────────────────────────────────────────────

@screen_app.command("add")
def screen_add(
    screen_id: str = typer.Option(..., "--id", help="Unique screen identifier (kebab-case)"),
    title: str = typer.Option(..., "--title", help="Human-readable screen title"),
    screenshot: str = typer.Option(..., "--screenshot", help="Path to screenshot file"),
    elements_json: str = typer.Option("[]", "--elements-json", help="JSON array of elements"),
    notes: str = typer.Option(None, "--notes", help="Notes about this screen"),
    as_json: bool = typer.Option(False, "--json", help="Output as JSON"),
):
    """Register a discovered screen."""
    elements = [Element.model_validate(e) for e in json.loads(elements_json)]
    screen = store.add_screen(
        screen_id=screen_id,
        title=title,
        screenshot=screenshot,
        elements=elements,
        notes=notes,
    )
    if as_json:
        console.print_json(screen.model_dump_json())
    else:
        console.print(f"Added screen [bold]{screen_id}[/bold]: {title}")


# ── screen list ───────────────────────────────────────────────────────

@screen_app.command("list")
def screen_list(
    unexplored: bool = typer.Option(False, "--unexplored", help="Only show screens with unexplored elements"),
    as_json: bool = typer.Option(False, "--json", help="Output as JSON"),
):
    """List all discovered screens."""
    m = store.load_map()

    if unexplored:
        data = store.get_unexplored_screens()
        if as_json:
            console.print_json(json.dumps(data))
        else:
            if not data:
                console.print("All elements explored.")
                return
            table = Table(title="Screens with Unexplored Elements")
            table.add_column("Screen ID")
            table.add_column("Title")
            table.add_column("Unexplored")
            for d in data:
                table.add_row(d["screen_id"], d["title"], str(d["unexplored_count"]))
            console.print(table)
        return

    if as_json:
        console.print_json(json.dumps([s.model_dump() for s in m.screens]))
    else:
        if not m.screens:
            console.print("No screens discovered yet.")
            return
        table = Table(title=f"Screens — {m.app_name} ({m.platform})")
        table.add_column("#", style="dim")
        table.add_column("Screen ID", style="bold")
        table.add_column("Title")
        table.add_column("Elements")
        table.add_column("Screenshot")
        for i, s in enumerate(m.screens, 1):
            explored = sum(1 for e in s.elements if e.explored)
            total = len(s.elements)
            table.add_row(str(i), s.screen_id, s.title, f"{explored}/{total}", s.screenshot)
        console.print(table)


# ── transition add ────────────────────────────────────────────────────

@app.command("transition")
def transition_add(
    from_screen: str = typer.Option(..., "--from", help="Source screen ID"),
    to_screen: str = typer.Option(..., "--to", help="Destination screen ID"),
    action: str = typer.Option(..., "--action", help="Action that triggered the transition"),
    as_json: bool = typer.Option(False, "--json", help="Output as JSON"),
):
    """Record a navigation transition between screens."""
    t = store.add_transition(from_screen=from_screen, to_screen=to_screen, action=action)
    if as_json:
        console.print_json(t.model_dump_json())
    else:
        console.print(f"Transition: [bold]{from_screen}[/bold] -> [bold]{to_screen}[/bold] ({action})")


# ── report ────────────────────────────────────────────────────────────

@app.command()
def report(
    output: str = typer.Option(None, "--output", help="Output file path"),
    as_json: bool = typer.Option(False, "--json", help="Output as JSON"),
):
    """Generate the exploration report."""
    m = store.load_map()
    out_path = Path(output) if output else None
    result = generate_report(m, output=out_path)
    if as_json:
        console.print_json(json.dumps(result))
    else:
        if "error" in result:
            console.print(f"[red]{result['error']}[/red]")
            raise typer.Exit(1)
        console.print(f"Report generated: [bold]{result['report_path']}[/bold]")
        console.print(f"  Screens: {result['screens']} | Transitions: {result['transitions']} | Coverage: {result['coverage_pct']}%")


# ── reset ─────────────────────────────────────────────────────────────

@app.command()
def reset(
    confirm: bool = typer.Option(False, "--yes", help="Skip confirmation"),
):
    """Reset the exploration — delete screen map and screenshots."""
    if not confirm:
        confirm = typer.confirm("Delete all exploration data?")
    if not confirm:
        raise typer.Abort()
    if store.SCREEN_MAP_PATH.exists():
        store.SCREEN_MAP_PATH.unlink()
    screenshots = Path("reports/screenshots")
    if screenshots.exists():
        for f in screenshots.iterdir():
            f.unlink()
    console.print("Exploration data reset.")
