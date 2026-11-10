/**
 * ReadingToolbar Component
 *
 * A floating, draggable toolbar for reading mode that provides:
 * - Highlight tool toggle with color picker
 * - Drag handle to reposition anywhere on screen
 *
 * Design Ethos:
 * - Clear affordances: Active tool is visually distinct
 * - Fast feedback: Tool selection is instant
 * - Non-blocking: Toolbar floats and can be moved out of the way
 * - Direct manipulation: Drag to reposition
 */

import {
  useCallback,
  useRef,
} from 'react';

import {
  motion,
  useDragControls,
} from 'framer-motion';
import {
  Check,
  GripVertical,
  Highlighter,
} from 'lucide-react';

import {
  HIGHLIGHT_COLORS,
  type HighlightColorKey,
  SPRING_CONFIG,
  TIMING,
} from '../constants';
import type { ReadingTool } from '../schema';

// ============================================
// Types
// ============================================

interface ReadingToolbarProps {
  /** Available tools */
  availableTools: ReadingTool[];
  /** Currently active tool */
  activeTool: ReadingTool | null;
  /** Current highlight color */
  activeColor: HighlightColorKey;
  /** Called when tool is selected */
  onToolChange: (tool: ReadingTool | null) => void;
  /** Called when color is changed */
  onColorChange: (color: HighlightColorKey) => void;
}

// ============================================
// Tool Button Component
// ============================================

const TOOL_CONFIG: Record<
  ReadingTool,
  { icon: typeof Highlighter; label: string }
> = {
  highlight: { icon: Highlighter, label: "Highlight" },
};

interface ToolButtonProps {
  tool: ReadingTool;
  isActive: boolean;
  onClick: () => void;
}

function ToolButton({ tool, isActive, onClick }: ToolButtonProps) {
  const config = TOOL_CONFIG[tool];

  // Skip rendering if tool is not configured
  if (!config) {
    return null;
  }

  const Icon = config.icon;

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`
        relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
        transition-colors duration-${TIMING.FAST}
        ${
          isActive
            ? "bg-blue-100 text-blue-700"
            : "text-neutral-600 hover:bg-neutral-100"
        }
      `}
    >
      <Icon className="w-4 h-4" />
      <span>{config.label}</span>

      {/* Active indicator */}
      {isActive && (
        <motion.div
          layoutId="active-tool-indicator"
          className="absolute inset-0 bg-blue-100 rounded-lg -z-10"
          transition={{ type: "spring", ...SPRING_CONFIG.SNAPPY }}
        />
      )}
    </motion.button>
  );
}

// ============================================
// Color Picker Component
// ============================================

interface ColorPickerProps {
  activeColor: HighlightColorKey;
  onColorChange: (color: HighlightColorKey) => void;
}

interface ColorPickerInternalProps extends ColorPickerProps {
  show: boolean;
}

// Content width: 5 buttons (24px) + 4 gaps (8px) + buffer = 168px
const COLOR_PICKER_CONTENT_WIDTH = 168;

function ColorPicker({
  activeColor,
  onColorChange,
  show,
}: ColorPickerInternalProps) {
  return (
    <motion.div
      initial={false}
      animate={{
        width: show ? COLOR_PICKER_CONTENT_WIDTH : 0,
        opacity: show ? 1 : 0,
        paddingLeft: show ? 8 : 0,
        paddingRight: show ? 8 : 0,
      }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex items-center gap-2 py-1 overflow-hidden"
    >
      {(Object.keys(HIGHLIGHT_COLORS) as HighlightColorKey[]).map((color) => {
        const colors = HIGHLIGHT_COLORS[color];
        const isActive = color === activeColor;

        return (
          <button
            key={color}
            onClick={() => onColorChange(color)}
            className="relative w-6 h-6 rounded-full flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 hover:scale-110 active:scale-95 transition-transform"
            style={{ backgroundColor: colors.solid }}
            aria-label={colors.name}
          >
            {isActive && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
            )}
          </button>
        );
      })}
    </motion.div>
  );
}

// ============================================
// Main Component
// ============================================

export function ReadingToolbar({
  availableTools,
  activeTool,
  activeColor,
  onToolChange,
  onColorChange,
}: ReadingToolbarProps) {
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  const handleToolClick = useCallback(
    (tool: ReadingTool) => {
      // Toggle tool off if clicking the same one
      if (activeTool === tool) {
        onToolChange(null);
      } else {
        onToolChange(tool);
      }
    },
    [activeTool, onToolChange]
  );

  // Show color picker only when highlight tool is active
  const showColorPicker = activeTool === "highlight";

  return (
    <>
      {/* Invisible drag constraint boundary */}
      <div
        ref={constraintsRef}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Floating toolbar */}
      <motion.div
        drag
        dragControls={dragControls}
        dragMomentum={false}
        dragElastic={0.1}
        dragConstraints={constraintsRef}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", ...SPRING_CONFIG.GENTLE }}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 inline-flex items-center p-1.5 pl-1 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-neutral-200/80 cursor-default"
        style={{ touchAction: "none" }}
      >
        {/* Drag handle */}
        <motion.div
          onPointerDown={(e) => dragControls.start(e)}
          className="flex items-center justify-center w-6 h-8 rounded-lg cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          title="Drag to move"
        >
          <GripVertical className="w-4 h-4" />
        </motion.div>

        {/* Separator */}
        <div className="w-px h-6 bg-neutral-200 mx-1" />

        {/* Tool buttons */}
        <div className="flex items-center gap-1">
          {availableTools.map((tool) => (
            <ToolButton
              key={tool}
              tool={tool}
              isActive={activeTool === tool}
              onClick={() => handleToolClick(tool)}
            />
          ))}
        </div>

        {/* Color picker (shown when highlight is active) */}
        <ColorPicker
          activeColor={activeColor}
          onColorChange={onColorChange}
          show={showColorPicker}
        />
      </motion.div>
    </>
  );
}
