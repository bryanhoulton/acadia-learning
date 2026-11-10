/**
 * ColorPicker Component
 *
 * Displays a row of color swatches for selecting the active shading color.
 * The active color is highlighted with a darker border, ring, and slight scale.
 */

import { AREA_MODEL_COLORS as COLORS } from '../definition';
import type { AreaModelColorKey } from '../schema';

export interface ColorPickerProps {
  colors: AreaModelColorKey[];
  activeColor: AreaModelColorKey;
  onColorChange: (color: AreaModelColorKey) => void;
}

export function ColorPicker({
  colors,
  activeColor,
  onColorChange,
}: ColorPickerProps) {
  return (
    <div className="flex items-center gap-2.5">
      {colors.map((colorKey) => {
        const isActive = activeColor === colorKey;
        return (
          <button
            key={colorKey}
            className={`w-8 h-8 rounded-full transition-all duration-150 ${
              isActive
                ? "scale-115 shadow-md ring-2 ring-offset-2"
                : "border-2 border-neutral-300 hover:scale-110 hover:border-neutral-400 hover:shadow-sm"
            }`}
            style={{
              backgroundColor: COLORS[colorKey].fill,
              borderColor: isActive ? COLORS[colorKey].highlight : undefined,
              ["--tw-ring-color" as string]: isActive ? COLORS[colorKey].highlight : undefined,
            }}
            onClick={() => onColorChange(colorKey)}
            title={COLORS[colorKey].name}
            aria-label={`Select ${COLORS[colorKey].name} color`}
            aria-pressed={isActive}
          />
        );
      })}
    </div>
  );
}
