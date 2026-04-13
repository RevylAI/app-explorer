import { Handle, Position, type NodeProps } from "@xyflow/react";
import React, { memo, useState } from "react";

interface ScreenNodeData {
  label: string;
  screenshot: string;
  elementCount: number;
  notes: string | null;
  platform: string;
  [key: string]: unknown;
}

/**
 * ScreenNode — styled after the trace viewer's CaptureNode.
 * Colored border (blue default, purple selected), full screenshot, sharp corners.
 */
function ScreenNodeComponent(props: NodeProps) {
  const { selected } = props;
  const data = props.data as ScreenNodeData;
  const [imgLoaded, setImgLoaded] = useState(false);

  const borderColor = selected ? "border-[#9D61FF]" : "border-blue-500";
  const bgTint = selected ? "bg-[#9D61FF]/10" : "bg-blue-500/10";
  const handleColor = selected ? "!bg-[#9D61FF]" : "!bg-blue-500";
  const handleBorder = selected ? "!border-[#9D61FF]/60" : "!border-blue-400";

  return (
    <div className="relative cursor-pointer flex flex-col items-center">
      <Handle
        type="target"
        position={Position.Top}
        className={`!w-3 !h-3 !-top-1.5 ${handleColor} !border-2 ${handleBorder} transition-colors`}
      />

      {/* Title above the image */}
      <div className="mb-1.5 max-w-[180px]">
        <div className="text-[10px] font-semibold text-gray-900 dark:text-white leading-tight text-center" style={{ wordBreak: "break-word" }}>
          {data.label}
        </div>
      </div>

      {/* Bordered screenshot — border hugs the image */}
      <div
        className={`transition-all duration-200 p-1 ${bgTint} inline-block`}
        style={{ borderWidth: 3, borderStyle: "solid", borderColor: selected ? "#9D61FF" : "#3b82f6" }}
      >
        <div className="relative bg-white dark:bg-black" style={{ height: 300 }}>
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900" style={{ width: 150 }}>
              <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
          <img
            src={data.screenshot}
            alt={data.label}
            className={`h-full w-auto object-contain transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setImgLoaded(true)}
            draggable={false}
          />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={`!w-3 !h-3 !-bottom-1.5 ${handleColor} !border-2 ${handleBorder} transition-colors`}
      />
    </div>
  );
}

export const ScreenNode = memo(ScreenNodeComponent);
