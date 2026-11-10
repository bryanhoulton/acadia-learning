/**
 * ClickableAxisArea Component
 *
 * An invisible interactive area overlaid on the number line
 * that handles hover and click events for point placement.
 */

import { useCallback, useRef } from "react";

import { LINE_Y, PADDING_X, SVG_WIDTH } from "../constants";
import { screenToSvgCoords } from "../utils";

interface ClickableAxisAreaProps {
  onHover: (x: number | null) => void;
  onClick: (x: number) => void;
  enabled: boolean;
}

// Extra padding beyond the axis endpoints
const HORIZONTAL_PADDING = 20;
const VERTICAL_PADDING = 50;

export function ClickableAxisArea({
  onHover,
  onClick,
  enabled,
}: ClickableAxisAreaProps) {
  const ref = useRef<SVGRectElement>(null);

  const getX = useCallback(
    (e: React.MouseEvent<SVGRectElement>): number | null => {
      const svg = ref.current?.ownerSVGElement ?? null;
      const coords = screenToSvgCoords(e.clientX, e.clientY, svg);
      return coords?.x ?? null;
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (!enabled) return;
      const x = getX(e);
      if (x !== null) onHover(x);
    },
    [enabled, onHover, getX],
  );

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (!enabled) return;
      const x = getX(e);
      if (x !== null) onClick(x);
    },
    [enabled, onClick, getX],
  );

  return (
    <rect
      ref={ref}
      x={PADDING_X - HORIZONTAL_PADDING}
      y={LINE_Y - VERTICAL_PADDING}
      width={SVG_WIDTH - 2 * PADDING_X + 2 * HORIZONTAL_PADDING}
      height={VERTICAL_PADDING * 2}
      fill="transparent"
      style={{ cursor: enabled ? "crosshair" : "default" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    />
  );
}
