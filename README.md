# App Explorer

Map every screen and user path in a mobile app. Boots a cloud device, systematically explores the app, and generates an interactive navigation map with screenshots.

Built for use with [Claude Code](https://claude.ai/code) + [Revyl CLI](https://github.com/RevylAI/revyl-cli).

## How It Works

1. _(iOS only)_ Optionally extract a **static screen skeleton** from the binary first — gives the agent a target list of every screen the app contains, before BFS even starts
2. Claude Code uploads your app build and starts a cloud device via Revyl CLI
3. It systematically explores every screen using BFS — tapping buttons, following links, navigating tabs
4. Each screen is captured with a screenshot and its interactive elements are cataloged
5. An interactive report is generated with a navigation graph, screenshots, user paths, and a step-through journey navigator

The `app-explorer` CLI handles data tracking, report generation, and binary skeleton extraction. Claude Code (guided by `CLAUDE.md`) handles the exploration intelligence. The `frontend/` template provides an interactive viewer for the results.

## Setup

### Prerequisites

- [Revyl CLI](https://github.com/RevylAI/revyl-cli) installed and authenticated (`revyl auth login`)
- Python 3.11+
- Node.js 20+ (for the interactive viewer)
- An APK (Android) or APP/IPA bundle (iOS)
- **macOS with Xcode command line tools** if you want to use `app-explorer skeleton ios` (relies on `nm`, `otool`, `xcrun swift-demangle`). The exploration flow itself runs anywhere.

### Install

```bash
cd app-explorer
pip install -e .
```

### (Optional, iOS only) Extract a Static Screen Skeleton First

> **Status:** iOS works today. Android (`.apk`/`.aab`) is on the roadmap — `app-explorer skeleton android` currently prints a "coming soon" message.

Real apps have hundreds of screens. The BFS agent can typically reach ~50 of them before its context fills up. The skeleton command reads the compiled iOS binary directly to enumerate every screen the app contains, giving the agent a target list before exploration even starts.

```bash
app-explorer skeleton ios path/to/App.ipa     # or path/to/App.app
```

Outputs:
- `workspace/skeleton.json` — full machine-readable skeleton (consumed by the agent)
- `reports/skeleton.md` — human/agent-readable summary, grouped by module

**Supports:**
- Native UIKit + Swift apps (parses Mach-O `__objc_classlist` + `__swift5_types` sections)
- React Native apps (auto-detects and parses Hermes JS bundle string table)
- Hybrid apps (extracts both)

**Coverage in practice:**
- ~70-90% of UIKit/Storyboard screens
- ~30-50% of pure SwiftUI screens (some `@ViewBuilder` children vanish at compile time)
- ~50-70% of React Native screens (Hermes string-table artifacts produce noise that's filtered to "low confidence")

**What it gives you:**
- Node list — every candidate screen with confidence rating (`high`/`medium`/`low`)
- Module grouping — features clustered by parent module (e.g. `DDChat`, `PaymentModule`)
- Deep-link entry points — URL schemes that launch the app into specific flows

**What it doesn't give you:**
- **Edges** — the skeleton tells you what screens exist, not how they connect. The runtime BFS still has to discover the navigation graph.
- Auth-gated, feature-flagged, or server-driven screens — those are invisible to static analysis.

When `CLAUDE.md` Step 0 sees a skeleton in the workspace, the agent uses it as a checklist and to assign stable screen IDs at runtime.

### Explore

Open Claude Code in the `app-explorer/` directory and ask it to explore your app:

```
Explore the app at ./my-app.apk and map all screens
```

Claude will read `CLAUDE.md`, initialize the workspace, start a device, and begin the exploration. If you provided an iOS app and ran `skeleton ios` first, the agent will reference the skeleton throughout.

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
# Extract a static screen skeleton from an iOS binary (recommended first step)
app-explorer skeleton ios path/to/App.ipa
app-explorer skeleton ios path/to/App.app
app-explorer skeleton android   # not yet supported — prints coming-soon notice

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
├── CLAUDE.md                  # AI exploration instructions
├── app_explorer/              # Python CLI
│   ├── cli.py                 # Typer commands
│   ├── models.py              # Pydantic data models
│   ├── store.py               # JSON persistence
│   ├── report.py              # Markdown report generator
│   └── skeleton/              # Static screen-skeleton extraction
│       ├── ios.py             # iOS .ipa/.app extractor (Mach-O sections)
│       └── react_native.py    # Hermes JS bundle extractor
├── frontend/                  # Interactive viewer (Astro + React)
│   ├── src/
│   │   ├── report.astro       # Main page template
│   │   └── components/        # React components (graph, panels, nodes)
│   └── public/data/           # Place screen-map.json + screenshots here
├── workspace/                 # CLI working directory (skeleton.json, screen-map.json)
└── reports/                   # CLI output (skeleton.md, exploration-report.md)
```

## Built With

- [Revyl CLI](https://github.com/RevylAI/revyl-cli) — Cloud device provisioning and AI-grounded app interaction
- [Claude Code](https://claude.ai/code) — AI agent for exploration orchestration
- [React Flow](https://reactflow.dev) — Interactive graph visualization
