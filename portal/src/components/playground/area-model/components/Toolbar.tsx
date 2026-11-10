/**
 * Toolbar Component
 *
 * Bottom toolbar for the Area Model playground.
 * Conditionally displays controls based on configuration:
 * - Color picker (when allowColorChange)
 * - Clear button (when allowClear)
 * - Add shape button (when allowAddingShapes)
 *
 * The toolbar only renders if at least one control is enabled.
 */

import type { AreaModelColorKey } from '../schema';
import { ColorPicker } from './ColorPicker';

export interface ToolbarProps {
  /** Color picker settings */
  showColorPicker: boolean;
  availableColors: AreaModelColorKey[];
  activeColor: AreaModelColorKey;
  onColorChange: (color: AreaModelColorKey) => void;
  /** Clear button */
  showClearButton: boolean;
  onClear: () => void;
  /** Add shape button */
  showAddButton: boolean;
  onAddShape: () => void;
}

export function Toolbar({
  showColorPicker,
  availableColors,
  activeColor,
  onColorChange,
  showClearButton,
  onClear,
  showAddButton,
  onAddShape,
}: ToolbarProps) {
  // Don't render if no controls are visible
  if (!showColorPicker && !showClearButton && !showAddButton) {
    return null;
  }

  return (
    <div className="px-4 py-3 border-t border-neutral-100 bg-neutral-50">
      <div className="flex items-center justify-between">
        {/* Left side: Color picker */}
        <div className="flex items-center gap-3">
          {showColorPicker && (
            <ColorPicker
              colors={availableColors}
              activeColor={activeColor}
              onColorChange={onColorChange}
            />
          )}
        </div>

        {/* Right side: Action buttons */}
        <div className="flex items-center gap-2">
          {showClearButton && (
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-md text-neutral-600 bg-white border border-neutral-200 hover:bg-neutral-50 transition-colors"
              onClick={onClear}
            >
              Clear All
            </button>
          )}
          {showAddButton && (
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-white border border-neutral-200 hover:bg-neutral-50 transition-colors"
              onClick={onAddShape}
            >
              + Add Shape
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
