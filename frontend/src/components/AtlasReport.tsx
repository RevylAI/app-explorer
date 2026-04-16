import React, { useState } from "react";
import type { ScreenMap } from "./types";

interface AtlasReportProps {
  screenMap: ScreenMap;
  screenshotBase: string;
}

/** Find all simple paths from the entry screen via DFS */
function enumeratePaths(screenMap: ScreenMap, maxPaths = 15): string[][] {
  if (!screenMap.screens.length) return [];

  const adj: Record<string, string[]> = {};
  for (const t of screenMap.transitions) {
    if (!adj[t.from_screen]) adj[t.from_screen] = [];
    adj[t.from_screen].push(t.to_screen);
  }

  const start = screenMap.screens[0].screen_id;
  const paths: string[][] = [];

  function dfs(node: string, path: string[]) {
    if (paths.length >= maxPaths) return;
    const neighbors = adj[node] || [];
    const unvisited = neighbors.filter((n) => !path.includes(n));
    if (unvisited.length === 0 && path.length > 1) {
      paths.push([...path]);
      return;
    }
    for (const n of unvisited) {
      path.push(n);
      dfs(n, path);
      path.pop();
    }
  }

  dfs(start, [start]);
  return paths;
}

/** Find terminal screens (no outgoing transitions) */
function findTerminalScreens(screenMap: ScreenMap): string[] {
  const hasOutgoing = new Set(screenMap.transitions.map((t) => t.from_screen));
  return screenMap.screens
    .filter((s) => !hasOutgoing.has(s.screen_id))
    .map((s) => s.screen_id);
}

const elementTypeColors: Record<string, string> = {
  button: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  tab: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  input: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  icon: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  list_item: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  link: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
};

function ScreenInventorySection({ screenMap, screenshotBase }: { screenMap: ScreenMap; screenshotBase: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="mb-10">
      <h2 className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">
        Screen Inventory
      </h2>

      {/* Mobile stacked list — same expand state as desktop table */}
      <div className="md:hidden border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {screenMap.screens.map((screen, i) => {
          const isExpanded = expandedId === screen.screen_id;
          const imgName = screen.screenshot.split("/").pop();
          const screenshotUrl = `${screenshotBase}/${imgName}`;
          return (
            <div key={screen.screen_id}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : screen.screen_id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${isExpanded ? "bg-[#9D61FF]/[0.05]" : "active:bg-[#9D61FF]/[0.06]"}`}
              >
                <span className="text-[10px] font-mono text-gray-400 tabular-nums w-5 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-gray-800 dark:text-gray-200 truncate">{screen.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-mono text-[#9D61FF]/80 truncate">{screen.screen_id}</span>
                    <span className="text-[9px] font-mono text-gray-400 shrink-0">· {screen.elements.length} el</span>
                  </div>
                </div>
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`} viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 3l5 5-5 5V3z" />
                </svg>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 bg-gray-50/50 dark:bg-zinc-900/50">
                  <img
                    src={screenshotUrl}
                    alt={screen.title}
                    loading="lazy"
                    className="w-full max-h-[60vh] object-contain bg-white dark:bg-black border border-gray-200 dark:border-gray-700 mx-auto"
                  />
                  <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mt-3 mb-1.5">
                    Elements ({screen.elements.length})
                  </div>
                  <div className="space-y-1">
                    {screen.elements.map((el, j) => {
                      const colorClass = elementTypeColors[el.element_type] || "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300";
                      return (
                        <div key={j} className="flex items-center gap-2">
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 ${colorClass} shrink-0 uppercase`}>
                            {el.element_type}
                          </span>
                          <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">{el.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-gray-800">
              <th className="text-left px-4 py-2 text-[10px] font-mono text-gray-400 uppercase tracking-wider">#</th>
              <th className="text-left px-4 py-2 text-[10px] font-mono text-gray-400 uppercase tracking-wider">Screen</th>
              <th className="text-left px-4 py-2 text-[10px] font-mono text-gray-400 uppercase tracking-wider">ID</th>
              <th className="text-left px-4 py-2 text-[10px] font-mono text-gray-400 uppercase tracking-wider">Elements</th>
              <th className="text-left px-4 py-2 text-[10px] font-mono text-gray-400 uppercase tracking-wider">Notes</th>
              <th className="w-10 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {screenMap.screens.map((screen, i) => {
              const isExpanded = expandedId === screen.screen_id;
              const imgName = screen.screenshot.split("/").pop();
              const screenshotUrl = `${screenshotBase}/${imgName}`;
              return (
                <React.Fragment key={screen.screen_id}>
                  <tr
                    className={`border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${isExpanded ? "bg-[#9D61FF]/[0.05]" : "hover:bg-[#9D61FF]/[0.03]"}`}
                    onClick={() => setExpandedId(isExpanded ? null : screen.screen_id)}
                  >
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{screen.title}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[#9D61FF]">{screen.screen_id}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">{screen.elements.length}</td>
                    <td className="px-4 py-2.5 text-xs text-amber-600 dark:text-amber-400">{screen.notes || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-400">
                      <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6 3l5 5-5 5V3z" />
                      </svg>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-zinc-900/50">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="flex gap-6">
                          {/* Screenshot */}
                          <div className="shrink-0">
                            <img
                              src={screenshotUrl}
                              alt={screen.title}
                              className="h-[360px] w-auto object-contain bg-white dark:bg-black border border-gray-200 dark:border-gray-700"
                            />
                          </div>
                          {/* Elements list */}
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-3">
                              Elements ({screen.elements.length})
                            </div>
                            <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
                              {screen.elements.map((el, j) => {
                                const colorClass = elementTypeColors[el.element_type] || "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300";
                                return (
                                  <div key={j} className="flex items-center gap-2">
                                    <span className={`text-[9px] font-mono px-1.5 py-0.5 ${colorClass} shrink-0 uppercase`}>
                                      {el.element_type}
                                    </span>
                                    <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate">{el.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AtlasReport({ screenMap, screenshotBase }: AtlasReportProps) {
  const totalElements = screenMap.screens.reduce((s, sc) => s + sc.elements.length, 0);
  const paths = enumeratePaths(screenMap);
  const terminals = findTerminalScreens(screenMap);
  const screenTitles: Record<string, string> = {};
  for (const s of screenMap.screens) screenTitles[s.screen_id] = s.title;
  const screensWithNotes = screenMap.screens.filter((s) => s.notes);

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* Title */}
      <div className="mb-10">
        <h1 className="text-2xl font-light text-gray-900 dark:text-gray-100 tracking-tight" style={{ fontFamily: "'Funnel Display', sans-serif" }}>
          {screenMap.app_name} — Exploration Report
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono">
          Platform: {screenMap.platform.toUpperCase()} | Generated by Revyl Atlas
        </p>
      </div>

      {/* Summary */}
      <section className="mb-10">
        <h2 className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">
          Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Screens", value: screenMap.screens.length },
            { label: "Transitions", value: screenMap.transitions.length },
            { label: "Elements", value: totalElements },
            { label: "User Paths", value: paths.length },
          ].map((stat) => (
            <div key={stat.label} className="border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-zinc-900 p-4">
              <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {stat.value}
              </div>
              <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Screen inventory — expandable rows (desktop table + mobile stacked list) */}
      <ScreenInventorySection screenMap={screenMap} screenshotBase={screenshotBase} />

      {/* User paths */}
      <section className="mb-10">
        <h2 className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">
          User Paths
        </h2>
        <div className="space-y-3">
          {paths.map((path, i) => (
            <div key={i} className="flex items-start gap-3 group">
              <span className="text-[10px] font-mono text-gray-400 mt-0.5 shrink-0 w-5 text-right">{i + 1}.</span>
              <div className="flex flex-wrap items-center gap-1">
                {path.map((screenId, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && <span className="text-[#9D61FF] text-xs mx-0.5">{"→"}</span>}
                    <span className={`text-xs px-2 py-0.5 border ${
                      j === 0
                        ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                        : j === path.length - 1
                          ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                          : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                    } font-mono`}>
                      {screenTitles[screenId] || screenId}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Edge cases */}
      {screensWithNotes.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">
            Edge Cases
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-2 text-[10px] font-mono text-gray-400 uppercase tracking-wider">Screen</th>
                  <th className="text-left px-4 py-2 text-[10px] font-mono text-gray-400 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody>
                {screensWithNotes.map((screen) => (
                  <tr key={screen.screen_id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-2.5 font-mono text-xs text-[#9D61FF]">{screen.screen_id}</td>
                    <td className="px-4 py-2.5 text-xs text-amber-600 dark:text-amber-400">{screen.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Terminal screens */}
      {terminals.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-200 dark:border-gray-800 pb-2">
            Dead Ends (no outgoing navigation)
          </h2>
          <div className="flex flex-wrap gap-2">
            {terminals.map((id) => (
              <span key={id} className="text-xs font-mono px-2.5 py-1 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                {screenTitles[id] || id}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
