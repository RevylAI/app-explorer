import { Handle, Position, type NodeProps } from "@xyflow/react";
import React, { memo } from "react";

interface StartEndNodeData {
  label: string;
  nodeKind: "start" | "end";
  [key: string]: unknown;
}

function StartEndNodeComponent(props: NodeProps) {
  const { selected } = props;
  const data = props.data as StartEndNodeData;
  const isStart = data.nodeKind === "start";

  const borderColor = selected
    ? "border-[#9D61FF]"
    : isStart
      ? "border-emerald-500"
      : "border-gray-400 dark:border-gray-600";

  const iconColor = isStart
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-gray-500 dark:text-gray-400";

  return (
    <div
      className={`
        relative transition-all duration-200 px-5 py-3 border-2 ${borderColor}
        bg-gray-50 dark:bg-zinc-900 shadow-sm dark:shadow-none
        hover:bg-gray-100 dark:hover:bg-[#9D61FF]/[0.04]
        flex items-center gap-2.5 min-w-[120px] justify-center cursor-pointer
        ${selected ? "ring-1 ring-[#9D61FF]/30 shadow-md" : ""}
      `}
    >
      {/* Icon */}
      <div className={`w-4 h-4 flex-shrink-0 ${iconColor}`}>
        {isStart ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        )}
      </div>

      {/* Label */}
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-100 whitespace-nowrap">
        {data.label}
      </span>

      {/* Handles — start has only source, end has only target */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-gray-400 dark:!bg-gray-500 !border-2 !border-gray-300 dark:!border-gray-600 !w-3 !h-3 !-top-1.5"
        />
      )}
      {isStart && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-emerald-500 !border-2 !border-emerald-400 !w-3 !h-3 !-bottom-1.5"
        />
      )}
    </div>
  );
}

export const StartEndNode = memo(StartEndNodeComponent);
