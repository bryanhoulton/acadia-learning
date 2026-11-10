import { memo } from "react";

import { COLORS, DIMENSIONS } from "../constants";
import type { ViewBox } from "../utils";

interface LinePathProps {
  points: [number, number][];
  view: ViewBox;
  color?: string;
  style?: "solid" | "dashed" | "dotted";
  width?: number;
}

/**
 * Renders a line or polyline through given points
 */
export const LinePath = memo(function LinePath({
  points,
  view,
  color = COLORS.functions[0],
  style = "solid",
  width = DIMENSIONS.functionWidth,
}: LinePathProps) {
  if (points.length < 2) return null;

  const xToPixel = (x: number) =>
    ((x - view.xMin) / (view.xMax - view.xMin)) * view.width;
  const yToPixel = (y: number) =>
    ((view.yMax - y) / (view.yMax - view.yMin)) * view.height;

  // Build path
  const pathData = points
    .map(([x, y], i) => {
      const px = xToPixel(x);
      const py = yToPixel(y);
      return i === 0 ? `M ${px} ${py}` : `L ${px} ${py}`;
    })
    .join(" ");

  // Dash pattern based on style
  let strokeDasharray: string | undefined;
  switch (style) {
    case "dashed":
      strokeDasharray = "8 4";
      break;
    case "dotted":
      strokeDasharray = "2 4";
      break;
    default:
      strokeDasharray = undefined;
  }

  return (
    <path
      d={pathData}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={strokeDasharray}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
});
