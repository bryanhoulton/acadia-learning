import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "slate-ui";

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  direction?: "horizontal" | "vertical";
  position?: "start" | "end";
}

export function ResizeHandle({
  onResize,
  direction = "horizontal",
  position = "end",
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const startPosRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPosRef.current = direction === "horizontal" ? e.clientX : e.clientY;
    },
    [direction]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, direction, onResize]);

  const positionClasses =
    direction === "horizontal"
      ? position === "end"
        ? "right-0 -mr-1.5"
        : "left-0 -ml-1.5"
      : position === "end"
        ? "bottom-0 -mb-1.5"
        : "top-0 -mt-1.5";

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "absolute z-10",
        direction === "horizontal"
          ? "w-3 cursor-col-resize top-0 bottom-0"
          : "h-3 cursor-row-resize left-0 right-0",
        positionClasses
      )}
    >
      {/* Visual indicator - only visible on hover/drag */}
      <div
        className={cn(
          "absolute transition-opacity duration-150 bg-blue-500 rounded-full",
          direction === "horizontal"
            ? "w-1 inset-y-0 left-1/2 -translate-x-1/2"
            : "h-1 inset-x-0 top-1/2 -translate-y-1/2",
          isHovered || isDragging ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}

