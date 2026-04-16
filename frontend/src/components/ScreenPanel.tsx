import React, { useState } from "react";
import type { Screen, ScreenMap } from "./types";

interface ScreenPanelProps {
  screen: Screen;
  screenMap: ScreenMap;
  screenshotBase: string;
  onNavigate: (screenId: string) => void;
  onClose: () => void;
}

const elementTypeColors: Record<string, string> = {
  button: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  tab: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  input: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  icon: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  list_item: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  link: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
};

export function ScreenPanel({ screen, screenMap, screenshotBase, onNavigate, onClose }: ScreenPanelProps) {
  const [showElements, setShowElements] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);

  const imgName = screen.screenshot.split("/").pop();
  const screenshotUrl = `${screenshotBase}/${imgName}`;

  const outgoing = screenMap.transitions.filter((t) => t.from_screen === screen.screen_id);
  const incoming = screenMap.transitions.filter((t) => t.to_screen === screen.screen_id);

  function getThumb(screenId: string): string {
    const s = screenMap.screens.find((sc) => sc.screen_id === screenId);
    if (!s) return "";
    return `${screenshotBase}/${s.screenshot.split("/").pop()}`;
  }

  return (
    <>
      {imgExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setImgExpanded(false)}
        >
          <img src={screenshotUrl} alt={screen.title} className="max-h-[90vh] max-w-[90vw] object-contain shadow-2xl" />
        </div>
      )}

      <div className="atlas-screen-panel w-[340px] shrink-0 bg-gray-50 dark:bg-zinc-900 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">{screen.title}</div>
            <div className="text-[11px] font-mono text-gray-400 mt-0.5">{screen.screen_id}</div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors shrink-0 mt-0.5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Screenshot */}
          <div className="p-3">
            <div
              className="border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
              onClick={() => setImgExpanded(true)}
            >
              <img src={screenshotUrl} alt={screen.title} className="w-full object-contain bg-white dark:bg-black" />
            </div>
          </div>

          {/* Notes */}
          {screen.notes && (
            <div className="px-4 pb-3">
              <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-2">
                {screen.notes}
              </div>
            </div>
          )}

          {/* Elements — collapsed by default */}
          <div className="px-4 pb-3">
            <button onClick={() => setShowElements(!showElements)} className="flex items-center gap-2 w-full text-left">
              <svg className={`w-3 h-3 text-gray-400 transition-transform ${showElements ? "rotate-90" : ""}`} viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 3l5 5-5 5" />
              </svg>
              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                Elements ({screen.elements.length})
              </span>
            </button>
            {showElements && (
              <div className="mt-2 space-y-1 pl-5">
                {screen.elements.map((el, i) => {
                  const c = elementTypeColors[el.element_type] || "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300";
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`text-[8px] font-mono px-1 py-0.5 ${c} shrink-0 uppercase`}>{el.element_type}</span>
                      <span className="text-[10px] text-gray-600 dark:text-gray-400 truncate">{el.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Navigates to */}
          {outgoing.length > 0 && (
            <div className="px-4 pb-3">
              <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2">
                Navigates to ({outgoing.length})
              </div>
              <div className="space-y-1.5">
                {outgoing.map((t, i) => {
                  const ts = screenMap.screens.find((s) => s.screen_id === t.to_screen);
                  return (
                    <button
                      key={i}
                      onClick={() => onNavigate(t.to_screen)}
                      className="w-full flex items-center gap-2.5 p-1.5 border border-gray-200 dark:border-gray-700 hover:border-[#9D61FF]/50 hover:bg-[#9D61FF]/[0.04] transition-all text-left group"
                    >
                      <img src={getThumb(t.to_screen)} alt="" className="w-8 h-14 object-cover object-top shrink-0 border border-gray-200 dark:border-gray-600" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate group-hover:text-[#9D61FF]">
                          {ts?.title || t.to_screen}
                        </div>
                        <div className="text-[9px] text-gray-400 truncate">
                          {t.action.replace(/^tap\s*/, "").replace(/['"]/g, "")}
                        </div>
                      </div>
                      <svg className="w-3 h-3 text-gray-300 group-hover:text-[#9D61FF] shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3l5 5-5 5" /></svg>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reached from */}
          {incoming.length > 0 && (
            <div className="px-4 pb-4">
              <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2">
                Reached from ({incoming.length})
              </div>
              <div className="space-y-1.5">
                {incoming.map((t, i) => {
                  const ss = screenMap.screens.find((s) => s.screen_id === t.from_screen);
                  return (
                    <button
                      key={i}
                      onClick={() => onNavigate(t.from_screen)}
                      className="w-full flex items-center gap-2.5 p-1.5 border border-gray-200 dark:border-gray-700 hover:border-[#9D61FF]/50 hover:bg-[#9D61FF]/[0.04] transition-all text-left group"
                    >
                      <img src={getThumb(t.from_screen)} alt="" className="w-8 h-14 object-cover object-top shrink-0 border border-gray-200 dark:border-gray-600" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate group-hover:text-[#9D61FF]">
                          {ss?.title || t.from_screen}
                        </div>
                        <div className="text-[9px] text-gray-400 truncate">
                          {t.action.replace(/^tap\s*/, "").replace(/['"]/g, "")}
                        </div>
                      </div>
                      <svg className="w-3 h-3 text-gray-300 group-hover:text-[#9D61FF] shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3l5 5-5 5" /></svg>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
