import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { JourneyPanel } from "./JourneyPanel";
import { ScreenNode } from "./ScreenNode";
import { ScreenPanel } from "./ScreenPanel";
import { StartEndNode } from "./StartEndNode";
import type { ScreenMap, Screen } from "./types";

/** Enumerate all simple paths from entry screen via DFS */
function enumeratePaths(screenMap: ScreenMap, maxPaths = 20): string[][] {
  if (!screenMap.screens.length) return [];
  const adj: Record<string, string[]> = {};
  for (const t of screenMap.transitions) {
    if (!adj[t.from_screen]) adj[t.from_screen] = [];
    if (!adj[t.from_screen].includes(t.to_screen)) adj[t.from_screen].push(t.to_screen);
  }
  const start = screenMap.screens[0].screen_id;
  const paths: string[][] = [];
  function dfs(node: string, path: string[]) {
    if (paths.length >= maxPaths) return;
    const neighbors = (adj[node] || []).filter((n) => !path.includes(n));
    if (neighbors.length === 0 && path.length > 1) { paths.push([...path]); return; }
    for (const n of neighbors) { path.push(n); dfs(n, path); path.pop(); }
  }
  dfs(start, [start]);
  return paths;
}

// ── Layout ──────────────────────────────────────────────────────────

const NODE_WIDTH = 175;
const NODE_HEIGHT = 350;
const MARKER_WIDTH = 160;
const MARKER_HEIGHT = 50;

// ── Dagre layout with BFS-aware edge filtering ──────────────────────
// Only feeds FORWARD edges (BFS tree edges) to dagre for layout.
// Back-edges are drawn as dashed overlays — they don't affect positioning.

function layoutGraph(screenMap: ScreenMap): { nodes: Node[]; edges: Edge[] } {
  if (!screenMap.screens.length) return { nodes: [], edges: [] };

  const entryId = screenMap.screens[0].screen_id;

  // BFS to compute depths and identify tree edges
  const adj: Record<string, Set<string>> = {};
  for (const t of screenMap.transitions) {
    if (!adj[t.from_screen]) adj[t.from_screen] = new Set();
    adj[t.from_screen].add(t.to_screen);
  }

  const depth: Record<string, number> = {};
  const treeEdges = new Set<string>(); // "from->to" keys that form the BFS tree
  const queue: string[] = [entryId];
  depth[entryId] = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of (adj[current] || new Set())) {
      if (!(next in depth)) {
        depth[next] = depth[current] + 1;
        treeEdges.add(`${current}->${next}`);
        queue.push(next);
      }
    }
  }
  for (const s of screenMap.screens) {
    if (!(s.screen_id in depth)) depth[s.screen_id] = 0;
  }

  // Terminal screens
  const hasOutgoing = new Set(screenMap.transitions.map((t) => t.from_screen));
  const terminalIds = screenMap.screens
    .filter((s) => !hasOutgoing.has(s.screen_id))
    .map((s) => s.screen_id);

  const screenTitles: Record<string, string> = {};
  for (const s of screenMap.screens) screenTitles[s.screen_id] = s.title;

  // ── Dagre: only tree edges ────────────────────────────────────────

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 100,
    ranksep: 100,
    marginx: 60,
    marginy: 60,
  });

  g.setNode("__start__", { width: MARKER_WIDTH, height: MARKER_HEIGHT });
  for (const s of screenMap.screens) {
    g.setNode(s.screen_id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const tid of terminalIds) {
    g.setNode(`__end_${tid}__`, { width: MARKER_WIDTH, height: MARKER_HEIGHT });
  }

  // Only add BFS tree edges + start/end connections to dagre
  g.setEdge("__start__", entryId);
  for (const key of treeEdges) {
    const [from, to] = key.split("->");
    g.setEdge(from, to);
  }
  for (const tid of terminalIds) {
    g.setEdge(tid, `__end_${tid}__`);
  }

  dagre.layout(g);

  // ── Build nodes ───────────────────────────────────────────────────

  const nodes: Node[] = [];

  // Build screen nodes first so we can reference their positions
  const screenPositions: Record<string, { x: number; y: number }> = {};
  for (const screen of screenMap.screens) {
    const pos = g.node(screen.screen_id);
    screenPositions[screen.screen_id] = { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
    nodes.push({
      id: screen.screen_id,
      type: "screen",
      position: screenPositions[screen.screen_id],
      data: {
        label: screen.title,
        screenshot: screen.screenshot,
        elementCount: screen.elements.length,
        notes: screen.notes,
        platform: screenMap.platform,
      },
    });
  }

  // Start node — align x center with entry screen's center
  const startPos = g.node("__start__");
  const entryPos = screenPositions[entryId];
  const startX = entryPos ? entryPos.x + NODE_WIDTH / 2 - MARKER_WIDTH / 2 : startPos.x - MARKER_WIDTH / 2;
  nodes.unshift({
    id: "__start__",
    type: "startEnd",
    position: { x: startX, y: startPos.y - MARKER_HEIGHT / 2 },
    data: { label: `Start: ${screenMap.app_name}`, nodeKind: "start" },
  });

  // End nodes — align x center with their connected screen's center
  for (const tid of terminalIds) {
    const pos = g.node(`__end_${tid}__`);
    const parentPos = screenPositions[tid];
    const endX = parentPos ? parentPos.x + NODE_WIDTH / 2 - MARKER_WIDTH / 2 : pos.x - MARKER_WIDTH / 2;
    nodes.push({
      id: `__end_${tid}__`,
      type: "startEnd",
      position: { x: endX, y: pos.y - MARKER_HEIGHT / 2 },
      data: { label: `End: ${screenTitles[tid] || tid}`, nodeKind: "end" },
    });
  }

  // ── Build edges ───────────────────────────────────────────────────

  const defaultEdgeStyle = {
    style: { stroke: "#9D61FF", strokeWidth: 1.5 },
    labelStyle: {
      fill: "#C4A1FF", fontSize: 11, fontWeight: 500,
      fontFamily: "JetBrains Mono, monospace",
    },
    labelBgStyle: { fill: "#1f2937", fillOpacity: 0.9 },
    labelBgPadding: [8, 4] as [number, number],
    labelBgBorderRadius: 2,
    type: "smoothstep" as const,
  };

  const edgeMap = new Map<string, string[]>();
  for (const t of screenMap.transitions) {
    const key = `${t.from_screen}->${t.to_screen}`;
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key)!.push(t.action);
  }

  const edges: Edge[] = [];

  // Start edge
  edges.push({
    id: "__start_edge__",
    source: "__start__", target: entryId,
    label: "entry",
    ...defaultEdgeStyle,
    style: { stroke: "#10b981", strokeWidth: 2 },
    labelStyle: { ...defaultEdgeStyle.labelStyle, fill: "#6ee7b7" },
  });

  // Screen edges — tree vs back
  for (const [key, actions] of edgeMap.entries()) {
    const [source, target] = key.split("->");
    const label = actions.length === 1
      ? actions[0].replace(/^tap\s*/, "").replace(/['"]/g, "")
      : `${actions.length} paths`;
    const isBack = !treeEdges.has(key);

    edges.push({
      id: key, source, target, label,
      ...defaultEdgeStyle,
      style: isBack
        ? { stroke: "#9D61FF", strokeWidth: 1, strokeDasharray: "6 4" }
        : { stroke: "#9D61FF", strokeWidth: 1.5 },
    });
  }

  // End edges
  for (const tid of terminalIds) {
    edges.push({
      id: `__end_edge_${tid}__`,
      source: tid, target: `__end_${tid}__`,
      ...defaultEdgeStyle,
      style: { stroke: "#9ca3af", strokeWidth: 1.5, strokeDasharray: "6 3" },
    });
  }

  return { nodes, edges };
}

// ── Node types ──────────────────────────────────────────────────────

const nodeTypes = { screen: ScreenNode, startEnd: StartEndNode };

// ── Inner Flow ──────────────────────────────────────────────────────

interface AtlasFlowInnerProps {
  screenMap: ScreenMap;
  screenshotBase: string;
}

function AtlasFlowInner({ screenMap, screenshotBase }: AtlasFlowInnerProps) {
  const { fitView, setCenter, getNode } = useReactFlow();
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => layoutGraph(screenMap),
    [screenMap]
  );
  const paths = useMemo(() => enumeratePaths(screenMap), [screenMap]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, , onEdgesChange] = useEdgesState(layoutEdges);

  // Detect dark mode for SVG edge labels (can't use Tailwind dark: in SVG fills)
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Shared state
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string[] | null>(null);
  const [selectedPathIdx, setSelectedPathIdx] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const activeScreen = activeScreenId
    ? screenMap.screens.find((s) => s.screen_id === activeScreenId) ?? null
    : null;

  // Fix screenshot paths once on mount
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const screenshot = n.data.screenshot as string | undefined;
        if (!screenshot || screenshot.startsWith("http") || screenshot.startsWith(screenshotBase)) return n;
        return { ...n, data: { ...n.data, screenshot: `${screenshotBase}/${screenshot.split("/").pop()}` } };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayEdges = useMemo(() => {
    const labelFill = isDark ? "#C4A1FF" : "#7C3AED";
    const labelBg = isDark ? "#1f2937" : "#f3f4f6";
    const startLabelFill = isDark ? "#6ee7b7" : "#059669";

    return edges.map((e) => {
      const isOnPath = !highlightedPath ||
        new Set(
          highlightedPath.slice(0, -1).map((_, i) => `${highlightedPath[i]}->${highlightedPath[i + 1]}`)
        ).has(`${e.source}->${e.target}`) ||
        e.id.startsWith("__start") || e.id.startsWith("__end");

      return {
        ...e,
        labelStyle: {
          ...(e.labelStyle as object),
          fill: e.id === "__start_edge__" ? startLabelFill : labelFill,
        },
        labelBgStyle: { fill: labelBg, fillOpacity: 0.9 },
        style: {
          ...e.style,
          opacity: isOnPath ? 1 : 0.1,
          transition: "opacity 0.3s",
        },
      };
    });
  }, [edges, highlightedPath, isDark]);

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.12, duration: 600 }), 300);
  }, [fitView]);

  // Center map on a screen node (no panel side-effect — used by journey nav on mobile)
  const centerOnScreen = useCallback(
    (screenId: string) => {
      const node = getNode(screenId);
      if (node) {
        setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, { zoom: 0.85, duration: 400 });
      }
    },
    [getNode, setCenter]
  );

  // Navigate to a screen — opens the ScreenPanel + centers the map (used by node clicks)
  const selectScreen = useCallback(
    (screenId: string) => {
      setActiveScreenId(screenId);
      centerOnScreen(screenId);
    },
    [centerOnScreen]
  );

  // Journey controls — center map only, never auto-open ScreenPanel.
  // On mobile, ScreenPanel is fullscreen and would hide the journey navigator.
  // On desktop the user can still tap a node to open the right-rail screen detail.
  const handleSelectPath = useCallback((idx: number) => {
    const path = paths[idx];
    setSelectedPathIdx(idx);
    setStepIndex(0);
    setHighlightedPath(path);
    centerOnScreen(path[0]);
  }, [paths, centerOnScreen]);

  const handleClearPath = useCallback(() => {
    setSelectedPathIdx(null);
    setStepIndex(0);
    setHighlightedPath(null);
  }, []);

  const handleGoToStep = useCallback((i: number) => {
    if (selectedPathIdx === null) return;
    const path = paths[selectedPathIdx];
    const clamped = Math.max(0, Math.min(i, path.length - 1));
    setStepIndex(clamped);
    centerOnScreen(path[clamped]);
  }, [selectedPathIdx, paths, centerOnScreen]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id === "__start__") {
        // Start node opens the entry screen
        if (screenMap.screens.length > 0) selectScreen(screenMap.screens[0].screen_id);
      } else if (!node.id.startsWith("__")) {
        selectScreen(node.id);
      }
    },
    [selectScreen, screenMap]
  );

  return (
    <div style={{ width: "100%", height: "100%", display: "flex" }}>
      {/* Left: Journey navigator */}
      <JourneyPanel
        screenMap={screenMap}
        paths={paths}
        selectedPathIdx={selectedPathIdx}
        stepIndex={stepIndex}
        onSelectPath={handleSelectPath}
        onClearPath={handleClearPath}
        onGoToStep={handleGoToStep}
      />

      {/* Center: Map */}
      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={nodes.map((n) => ({
            ...n,
            className: [
              highlightedPath && !highlightedPath.includes(n.id) && !n.id.startsWith("__") ? "atlas-dimmed" : "",
              n.id === activeScreenId ? "atlas-active" : "",
            ].filter(Boolean).join(" ") || undefined,
          }))}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.08}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          className="bg-white dark:bg-zinc-950"
          nodesFocusable
          elementsSelectable
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={32}
            size={2}
            color="currentColor"
            className="text-zinc-300 dark:text-zinc-600"
          />
          <Controls
            showInteractive={false}
            showFitView={true}
            className="!rounded-none !border-gray-200 dark:!border-gray-700 !shadow-sm dark:!shadow-none"
          />
        </ReactFlow>
      </div>

      {/* Right: Screen details */}
      {activeScreen && (
        <ScreenPanel
          screen={activeScreen}
          screenMap={screenMap}
          screenshotBase={screenshotBase}
          onNavigate={selectScreen}
          onClose={() => setActiveScreenId(null)}
        />
      )}
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────

interface AtlasGraphProps {
  screenMap: ScreenMap;
  screenshotBase: string;
}

export function AtlasGraph({ screenMap, screenshotBase }: AtlasGraphProps) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlowProvider>
        <AtlasFlowInner screenMap={screenMap} screenshotBase={screenshotBase} />
      </ReactFlowProvider>
    </div>
  );
}
