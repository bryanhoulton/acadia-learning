/**
 * HighlightPopover Component
 *
 * A popover that appears when clicking on a highlight.
 * Uses direct positioning based on the anchor rect.
 *
 * Allows users to:
 * - Change the highlight color
 * - Add/edit a note
 * - Delete the highlight
 *
 * Design Ethos:
 * - Direct manipulation: Changes apply immediately
 * - No blocking: Popover doesn't prevent interaction elsewhere
 * - Clear affordances: Buttons are clearly labeled
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AnimatePresence,
  motion,
} from 'framer-motion';
import {
  Check,
  Trash2,
  X,
} from 'lucide-react';

import { FloatingPortal } from '@floating-ui/react';

import {
  HIGHLIGHT_COLORS,
  type HighlightColorKey,
  SPRING_CONFIG,
  TIMING,
} from '../constants';
import type { TextHighlight } from '../schema';

// ============================================
// Types
// ============================================

interface HighlightPopoverProps {
  /** The highlight being edited, or null if closed */
  highlight: TextHighlight | null;
  /** Position to render the popover (anchor rect) */
  anchorRect: DOMRect | null;
  /** Called when color is changed */
  onColorChange: (id: string, color: HighlightColorKey) => void;
  /** Called when note is updated */
  onNoteChange: (id: string, note: string) => void;
  /** Called when highlight is deleted */
  onDelete: (id: string) => void;
  /** Called when popover should close */
  onClose: () => void;
}

// ============================================
// Color Button Component
// ============================================

interface ColorButtonProps {
  color: HighlightColorKey;
  isActive: boolean;
  onClick: () => void;
}

function ColorButton({ color, isActive, onClick }: ColorButtonProps) {
  const colors = HIGHLIGHT_COLORS[color];

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="relative w-7 h-7 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      style={{ backgroundColor: colors.solid }}
      aria-label={`${colors.name} highlight`}
    >
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", ...SPRING_CONFIG.BOUNCY }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ============================================
// Main Component
// ============================================

export function HighlightPopover({
  highlight,
  anchorRect,
  onColorChange,
  onNoteChange,
  onDelete,
  onClose,
}: HighlightPopoverProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [localNote, setLocalNote] = useState("");
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const isOpen = highlight !== null && anchorRect !== null;

  // Calculate position when anchorRect changes
  useEffect(() => {
    if (!anchorRect || !isOpen) {
      setPosition(null);
      return;
    }

    // Position below the highlight, centered horizontally
    const popoverWidth = 288; // w-72 = 18rem = 288px
    const padding = 12;

    let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
    let top = anchorRect.bottom + padding;

    // Keep within viewport horizontally
    if (left < padding) {
      left = padding;
    } else if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }

    // If not enough space below, position above
    const popoverHeight = 280; // approximate height
    if (top + popoverHeight > window.innerHeight - padding) {
      top = anchorRect.top - popoverHeight - padding;
    }

    // Keep within viewport vertically
    if (top < padding) {
      top = padding;
    }

    setPosition({ top, left });
  }, [anchorRect, isOpen]);

  // Sync local note with highlight
  useEffect(() => {
    if (highlight) {
      setLocalNote(highlight.note || "");
    }
  }, [highlight]);

  // Focus textarea when opening
  useEffect(() => {
    if (isOpen && position && textareaRef.current) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, TIMING.FAST);
      return () => clearTimeout(timer);
    }
  }, [isOpen, position]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (highlight && localNote !== (highlight.note || "")) {
          onNoteChange(highlight.id, localNote);
        }
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, highlight, localNote, onNoteChange, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        if (highlight && localNote !== (highlight.note || "")) {
          onNoteChange(highlight.id, localNote);
        }
        onClose();
      }
    };

    // Delay adding listener to avoid immediate close from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, highlight, localNote, onNoteChange, onClose]);

  const handleColorClick = useCallback(
    (color: HighlightColorKey) => {
      if (highlight) {
        onColorChange(highlight.id, color);
      }
    },
    [highlight, onColorChange]
  );

  const handleDelete = useCallback(() => {
    if (highlight) {
      onDelete(highlight.id);
      onClose();
    }
  }, [highlight, onDelete, onClose]);

  const handleNoteBlur = useCallback(() => {
    if (highlight && localNote !== (highlight.note || "")) {
      onNoteChange(highlight.id, localNote);
    }
  }, [highlight, localNote, onNoteChange]);

  return (
    <AnimatePresence>
      {isOpen && position && (
        <FloatingPortal>
          <motion.div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              width: 288, // Fixed width to prevent layout shifts
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="z-50 bg-white rounded-xl shadow-xl border border-neutral-200 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <span className="text-sm font-medium text-neutral-700">
                Edit Highlight
              </span>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4 overflow-hidden">
              {/* Color picker */}
              <div>
                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                  Color
                </label>
                <div className="flex gap-2 mt-2 py-1">
                  {(Object.keys(HIGHLIGHT_COLORS) as HighlightColorKey[]).map(
                    (color) => (
                      <ColorButton
                        key={color}
                        color={color}
                        isActive={highlight?.color === color}
                        onClick={() => handleColorClick(color)}
                      />
                    )
                  )}
                </div>
              </div>

              {/* Note input */}
              <div>
                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                  Note
                </label>
                <textarea
                  ref={textareaRef}
                  value={localNote}
                  onChange={(e) => setLocalNote(e.target.value)}
                  onBlur={handleNoteBlur}
                  placeholder="Add a note..."
                  className="w-full mt-2 p-2 text-sm border border-neutral-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-100">
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Remove highlight
              </button>
            </div>
          </motion.div>
        </FloatingPortal>
      )}
    </AnimatePresence>
  );
}
