import React, { useEffect } from "react";
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

/** Guess a flow type tag from the full journey path — checks end first, then middle, then falls back */
function getFlowTag(
  path: string[],
  titles: Record<string, string>,
  ids?: Record<string, string>,
): { label: string; color: string } {
  const endTitle = titles[path[path.length - 1]]?.toLowerCase() || "";
  const endId = path[path.length - 1].toLowerCase();
  const anyTitle = path.map((p) => titles[p]?.toLowerCase() || "").join(" | ");
  const anyId = path.map((p) => p.toLowerCase()).join(" | ");
  const endText = `${endTitle} ${endId}`;
  const anyText = `${anyTitle} ${anyId}`;

  // Priority order: most specific (danger/commit) first, generic last
  const rules: Array<[string, string, RegExp]> = [
    ["danger",    "bg-red-100 text-red-700 dark:bg-red-500/25 dark:text-red-300",              /active[- ]?ride|dispatched|confirming|cancellation[- ]?failed|cancel[- ]?confirm/],
    ["book",      "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",          /book|reserve|request|pickup[- ]?spot|ride[- ]?options|review and continue/],
    ["checkout",  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", /checkout|cart|upsell|place[- ]?order|order[- ]?placed|confirmation|review order/],
    ["payment",   "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",      /wallet|payment|card|uber[- ]?cash|currency|gift[- ]?card|add[- ]?funds/],
    ["safety",    "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",              /safety|ridecheck|trusted[- ]?contact|verify[- ]?ride|pin|teen[- ]?safety|driver[- ]?safety/],
    ["auth",      "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",  /auth[- ]?sheet|log[- ]?in|sign[- ]?up|verify|2fa|passkey|recovery/],
    ["cancel",    "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",               /cancel/],
    ["support",   "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",  /help|support|chat|inbox|messages|feedback/],
    ["receipt",   "bg-lime-100 text-lime-700 dark:bg-lime-500/20 dark:text-lime-300",          /receipt|trip[- ]?detail/],
    ["upsell",    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300", /uber[- ]?one|membership|trial|promo|commute[- ]?hub/],
    ["referral",  "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",          /invite|refer|gift[- ]?a[- ]?ride/],
    ["search",    "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",  /search|results|filters?|plan[- ]?ride|airline[- ]?picker/],
    ["discovery", "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",          /restaurant[- ]?detail|store|product[- ]?detail|item[- ]?detail|listing/],
    ["settings",  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",          /setting|preferences?|communication|notification|privacy[- ]?data|privacy[- ]?center|shortcuts|saved[- ]?places|personal[- ]?info|security/],
    ["profile",   "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",          /profile|account|business[- ]?hub|family|saved[- ]?groups/],
    ["legal",     "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",      /legal|terms|privacy[- ]?policy|license|open[- ]?source/],
    ["history",   "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300",  /activity|history|past[- ]?trip|order[- ]?detail/],
  ];

  // Check end-of-path first (strongest signal)
  for (const [label, color, pattern] of rules) {
    if (pattern.test(endText)) return { label, color };
  }
  // Then anywhere in the path
  for (const [label, color, pattern] of rules) {
    if (pattern.test(anyText)) return { label, color };
  }

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
  const hasActivePath = activePath !== null;

  // Toggle a body class so the mobile-only CSS in uber.astro/airbnb.astro can
  // re-flow the panel into a fixed bottom bar AND hide the regular bottom bar.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("atlas-mobile-journey-active", hasActivePath);
    return () => { document.body.classList.remove("atlas-mobile-journey-active"); };
  }, [hasActivePath]);

  return (
    <div
      className={`atlas-journey-panel w-[300px] shrink-0 bg-gray-50 dark:bg-zinc-900 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden ${hasActivePath ? "atlas-journey-panel--active" : ""}`}
    >

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
          <div className="atlas-journey-stepper-header shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            {/* Top row: ← All Journeys (left) + Step N of M (right) */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <button
                onClick={onClearPath}
                className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 hover:text-[#9D61FF] transition-colors uppercase tracking-wider"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3L5 8l5 5" /></svg>
                All Journeys
              </button>
              <span className="text-[10px] font-mono text-[#9D61FF] shrink-0">
                Step {stepIndex + 1} of {activePath.length}
              </span>
            </div>
            {/* Title — allowed to wrap to 2 lines */}
            <div className="text-xs font-semibold text-gray-800 dark:text-gray-100 leading-snug line-clamp-2">
              {screenTitles[activePath[0]]} → {screenTitles[activePath[activePath.length - 1]]}
            </div>
          </div>

          {/* Prev/Next */}
          <div className="atlas-journey-stepper-controls shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <button
              onClick={() => onGoToStep(stepIndex - 1)}
              disabled={stepIndex === 0}
              className="px-4 py-2 text-[10px] font-mono uppercase tracking-wider border border-gray-200 dark:border-gray-700 disabled:opacity-20 hover:border-[#9D61FF]/50 hover:text-[#9D61FF] transition-colors"
            >
              Prev
            </button>
            <div className="flex-1 flex items-center gap-1.5 justify-center flex-wrap">
              {activePath.map((_, i) => (
                <button
                  key={i}
                  onClick={() => onGoToStep(i)}
                  className={`w-4 h-4 transition-colors ${
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
              className="px-4 py-2 text-[10px] font-mono uppercase tracking-wider border border-gray-200 dark:border-gray-700 disabled:opacity-20 hover:border-[#9D61FF]/50 hover:text-[#9D61FF] transition-colors"
            >
              Next
            </button>
          </div>

          {/* Step timeline */}
          <div className="atlas-journey-step-timeline flex-1 overflow-y-auto">
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
