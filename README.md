# App Explorer

Map every screen and user path in a mobile app. Boots a cloud device, systematically explores the app, and generates an interactive navigation map with screenshots.

Built for use with [Claude Code](https://claude.ai/code) + [Revyl CLI](https://github.com/RevylAI/revyl-cli).

## How It Works

1. Claude Code uploads your app build and starts a cloud device via Revyl CLI
2. It systematically explores every screen using BFS — tapping buttons, following links, navigating tabs
3. Each screen is captured with a screenshot and its interactive elements are cataloged
4. An interactive report is generated with a navigation graph, screenshots, user paths, and a step-through journey navigator

The `app-explorer` CLI handles data tracking and report generation. Claude Code (guided by `CLAUDE.md`) handles the exploration intelligence. The `frontend/` template provides an interactive viewer for the results.

## Setup

### Prerequisites

- [Revyl CLI](https://github.com/RevylAI/revyl-cli) installed and authenticated (`revyl auth login`)
- Python 3.11+
- Node.js 20+ (for the interactive viewer)
- An APK (Android) or APP bundle (iOS)

### Install

```bash
cd app-explorer
pip install -e .
```

### Explore

Open Claude Code in the `app-explorer/` directory and ask it to explore your app:

```
Explore the app at ./my-app.apk and map all screens
```

Claude will read `CLAUDE.md`, initialize the workspace, start a device, and begin the exploration.

### View the Report

After exploration, view the interactive report:

```bash
# Copy results into the viewer
cp workspace/screen-map.json frontend/public/data/
cp reports/screenshots/*.png frontend/public/data/

# Start the viewer
cd frontend
npm install
npm run dev
```

Open `http://localhost:4321` to see the interactive map with:
- **Map tab** — interactive graph with screen nodes, transitions, and start/end markers
- **Screens tab** — screenshot gallery of all discovered screens
- **Report tab** — summary stats, screen inventory, user paths, and edge cases

Features:
- Journey navigator — step through each user path with prev/next
- Path highlighting — select a journey to dim unrelated screens on the map
- Screen details panel — click any screen to see its elements and connections
- Dark/light mode toggle

## CLI Reference

```bash
# Initialize workspace
app-explorer init --app-name "MyApp" --platform android

# Track a discovered screen
app-explorer screen add --id "home" --title "Home Screen" --screenshot screenshots/home.png

# List all screens
app-explorer screen list
app-explorer screen list --unexplored

# Record a navigation transition
app-explorer transition --from "home" --to "shop" --action "tap 'Shop tab'"

# Generate markdown report
app-explorer report

# Start over
app-explorer reset --yes
```

All commands support `--json` for machine-readable output.

## Project Structure

```
app-explorer/
├── CLAUDE.md                # AI exploration instructions
├── app_explorer/            # Python CLI
│   ├── cli.py               # Typer commands
│   ├── models.py            # Pydantic data models
│   ├── store.py             # JSON persistence
│   └── report.py            # Markdown report generator
├── frontend/                # Interactive viewer (Astro + React)
│   ├── src/
│   │   ├── report.astro     # Main page template
│   │   └── components/      # React components (graph, panels, nodes)
│   └── public/data/         # Place screen-map.json + screenshots here
├── workspace/               # CLI working directory
└── reports/                 # CLI output
```

## Built With

- [Revyl CLI](https://github.com/RevylAI/revyl-cli) — Cloud device provisioning and AI-grounded app interaction
- [Claude Code](https://claude.ai/code) — AI agent for exploration orchestration
- [React Flow](https://reactflow.dev) — Interactive graph visualization
