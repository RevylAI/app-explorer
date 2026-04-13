import React from "react";
import type { ScreenMap } from "./types";

interface JourneyPanelProps {
  screenMap: ScreenMap;
  paths: string[][];
  selectedPathIdx: number | null;
  stepIndex: number;
  onSelectPath: (idx: number) => void;
  onClearPath: () => void;
  onGoToStep: (i: number) => void;
}

/** Guess a flow type tag from the endpoint screen */
function getFlowTag(path: string[], titles: Record<string, string>): { label: string; color: string } {
  const end = titles[path[path.length - 1]]?.toLowerCase() || "";
  if (end.includes("order placed") || end.includes("confirmation")) return { label: "checkout", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" };
  if (end.includes("checkout")) return { label: "checkout", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" };
  if (end.includes("setting") || end.includes("profile") || end.includes("account")) return { label: "settings", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" };
  if (end.includes("order detail")) return { label: "orders", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" };
  if (end.includes("search")) return { label: "browse", color: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" };
  return { label: "navigate", color: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" };
}

/** Build a readable path name from start → end */
function getPathName(path: string[], titles: Record<string, string>): string {
  const start = titles[path[0]] || path[0];
  const end = titles[path[path.length - 1]] || path[path.length - 1];
  if (path.length <= 2) return `${start} → ${end}`;
  // Include a distinguishing middle screen if paths share start+end
  const via = titles[path[1]] || path[1];
  return `${start} → ${end}`;
}

export function JourneyPanel({
  screenMap,
  paths,
  selectedPathIdx,
  stepIndex,
  onSelectPath,
  onClearPath,
  onGoToStep,
}: JourneyPanelProps) {
  const screenTitles: Record<string, string> = {};
  for (const s of screenMap.screens) screenTitles[s.screen_id] = s.title;

  const activePath = selectedPathIdx !== null ? paths[selectedPathIdx] : null;

  return (
    <div className="w-[300px] shrink-0 bg-gray-50 dark:bg-zinc-900 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">

      {selectedPathIdx === null ? (
        <>
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-widest">
              User Journeys
            </div>
            <div className="text-[10px] font-mono text-gray-400 mt-0.5">{paths.length} paths discovered</div>
          </div>

          {/* Path cards */}
          <div className="flex-1 overflow-y-auto">
            {paths.map((path, i) => {
              const tag = getFlowTag(path, screenTitles);
              const startTitle = screenTitles[path[0]] || path[0];
              const endTitle = screenTitles[path[path.length - 1]] || path[path.length - 1];
              const viaTitle = path.length > 2 ? (screenTitles[path[1]] || path[1]) : null;

              return (
                <button
                  key={i}
                  onClick={() => onSelectPath(i)}
                  className="w-full text-left px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 hover:bg-[#9D61FF]/[0.04] transition-colors group"
                >
                  {/* Top row: tag + screen count */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 uppercase tracking-wider ${tag.color}`}>
                      {tag.label}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">
                      {path.length} screens
                    </span>
                  </div>

                  {/* Main: start → end */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white truncate">
                      {startTitle}
                    </span>
                    <span className="text-[#9D61FF] text-xs shrink-0">→</span>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white truncate">
                      {endTitle}
                    </span>
                  </div>

                  {/* Via line if path is long */}
                  {viaTitle && (
                    <div className="text-[10px] text-gray-400 truncate">
                      via {viaTitle}{path.length > 3 ? ` + ${path.length - 3} more` : ""}
                    </div>
                  )}

                  {/* Length bar */}
                  <div className="mt-2 flex gap-0.5">
                    {path.map((_, j) => (
                      <div
                        key={j}
                        className="h-1 flex-1 bg-[#9D61FF]/20 group-hover:bg-[#9D61FF]/40 transition-colors"
                        style={{ maxWidth: 24 }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : activePath ? (
        <>
          {/* Path stepper header */}
          <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={onClearPath}
              className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 hover:text-[#9D61FF] transition-colors uppercase tracking-wider mb-2"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3L5 8l5 5" /></svg>
              All Journeys
            </button>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                {screenTitles[activePath[0]]} → {screenTitles[activePath[activePath.length - 1]]}
              </div>
            </div>
            <div className="text-[10px] font-mono text-[#9D61FF] mt-1">
              Step {stepIndex + 1} of {activePath.length}
            </div>
          </div>

          {/* Prev/Next */}
          <div className="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <button
              onClick={() => onGoToStep(stepIndex - 1)}
              disabled={stepIndex === 0}
              className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider border border-gray-200 dark:border-gray-700 disabled:opacity-20 hover:border-[#9D61FF]/50 hover:text-[#9D61FF] transition-colors"
            >
              Prev
            </button>
            <div className="flex-1 flex items-center gap-1 justify-center flex-wrap">
              {activePath.map((_, i) => (
                <button
                  key={i}
                  onClick={() => onGoToStep(i)}
                  className={`w-2.5 h-2.5 transition-colors ${
                    i === stepIndex ? "bg-[#9D61FF]"
                      : i < stepIndex ? "bg-[#9D61FF]/30"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => onGoToStep(stepIndex + 1)}
              disabled={stepIndex === activePath.length - 1}
              className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider border border-gray-200 dark:border-gray-700 disabled:opacity-20 hover:border-[#9D61FF]/50 hover:text-[#9D61FF] transition-colors"
            >
              Next
            </button>
          </div>

          {/* Step timeline */}
          <div className="flex-1 overflow-y-auto">
            {activePath.map((sid, i) => {
              const isCurrent = i === stepIndex;
              const isPast = i < stepIndex;

              return (
                <button
                  key={i}
                  onClick={() => onGoToStep(i)}
                  className={`w-full text-left flex items-center gap-4 px-4 py-3 border-b transition-colors ${
                    isCurrent
                      ? "bg-[#9D61FF]/[0.06] border-gray-200/50 dark:border-gray-700/50"
                      : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                  }`}
                >
                  <div className={`w-7 h-7 shrink-0 flex items-center justify-center text-[11px] font-mono font-medium border ${
                    isCurrent
                      ? "border-[#9D61FF] text-[#9D61FF]"
                      : "border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500"
                  }`}>
                    {i + 1}
                  </div>
                  <div className={`truncate ${
                    isCurrent
                      ? "text-[13px] text-gray-900 dark:text-white"
                      : isPast
                        ? "text-xs text-gray-500 dark:text-gray-400"
                        : "text-xs text-gray-600 dark:text-gray-400"
                  }`}>
                    {screenTitles[sid] || sid}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
