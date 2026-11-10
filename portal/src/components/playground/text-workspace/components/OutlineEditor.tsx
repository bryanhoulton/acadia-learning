/**
 * OutlineEditor Component
 *
 * An interactive outline editor with:
 * - Add/remove outline points
 * - Drag-to-reorder functionality
 * - Inline editing
 *
 * Design Ethos:
 * - Direct manipulation: Drag to reorder
 * - Predictable: Clear drop targets
 * - Satisfying: Spring animations on reorder
 */

import { useCallback, useRef, useState } from "react";

import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
} from "framer-motion";
import { Check, GripVertical, Plus, X } from "lucide-react";

import { SPRING_CONFIG, TIMING } from "../constants";

// ============================================
// Types
// ============================================

interface OutlineEditorProps {
  /** Current outline items */
  items: string[];
  /** Called when items change */
  onChange: (items: string[]) => void;
  /** Template type (for hints) */
  template?: "paragraph" | "essay" | "summary";
  /** Whether editing is disabled */
  disabled?: boolean;
}

// ============================================
// Outline Item Component
// ============================================

interface OutlineItemProps {
  item: string;
  index: number;
  onUpdate: (value: string) => void;
  onRemove: () => void;
  disabled?: boolean;
}

function OutlineItem({
  item,
  index,
  onUpdate,
  onRemove,
  disabled,
}: OutlineItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragControls = useDragControls();

  const handleSave = useCallback(() => {
    if (editValue.trim()) {
      onUpdate(editValue.trim());
    } else {
      setEditValue(item);
    }
    setIsEditing(false);
  }, [editValue, item, onUpdate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        setEditValue(item);
        setIsEditing(false);
      }
    },
    [handleSave, item],
  );

  const startEditing = useCallback(() => {
    if (disabled) return;
    setIsEditing(true);
    setEditValue(item);
    // Focus after render
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled, item]);

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: "spring", ...SPRING_CONFIG.SNAPPY }}
      className={`
        group flex items-center gap-2 p-3 bg-white rounded-lg border border-neutral-200
        ${!disabled ? "hover:border-neutral-300 hover:shadow-sm" : ""}
        transition-all duration-${TIMING.FAST}
      `}
    >
      {/* Drag handle */}
      {!disabled && (
        <motion.div
          onPointerDown={(e) => dragControls.start(e)}
          className="p-1 cursor-grab active:cursor-grabbing text-neutral-300 hover:text-neutral-500 transition-colors"
        >
          <GripVertical className="w-4 h-4" />
        </motion.div>
      )}

      {/* Number indicator */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center">
        {index + 1}
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="flex-1 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="flex-1 px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSave}
            className="p-1 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          className={`flex-1 text-sm text-neutral-700 ${!disabled ? "cursor-text" : ""}`}
          onClick={startEditing}
        >
          {item}
        </div>
      )}

      {/* Remove button */}
      {!disabled && !isEditing && (
        <button
          onClick={onRemove}
          className="p-1 rounded text-neutral-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </Reorder.Item>
  );
}

// ============================================
// Template Hints
// ============================================

const TEMPLATE_HINTS: Record<string, string[]> = {
  paragraph: [
    "Topic sentence",
    "Supporting detail 1",
    "Supporting detail 2",
    "Concluding sentence",
  ],
  essay: [
    "Introduction / Hook",
    "Thesis statement",
    "Body paragraph 1",
    "Body paragraph 2",
    "Body paragraph 3",
    "Conclusion",
  ],
  summary: [
    "Main idea",
    "Key point 1",
    "Key point 2",
    "Key point 3",
    "Conclusion",
  ],
};

// ============================================
// Main Component
// ============================================

export function OutlineEditor({
  items,
  onChange,
  template = "paragraph",
  disabled = false,
}: OutlineEditorProps) {
  const [newItemValue, setNewItemValue] = useState("");
  const [isAddingItem, setIsAddingItem] = useState(false);
  const newItemInputRef = useRef<HTMLInputElement>(null);

  const hints = TEMPLATE_HINTS[template] || TEMPLATE_HINTS.paragraph;

  const handleReorder = useCallback(
    (newOrder: string[]) => {
      if (!disabled) {
        onChange(newOrder);
      }
    },
    [disabled, onChange],
  );

  const handleAddItem = useCallback(() => {
    if (!newItemValue.trim()) return;

    onChange([...items, newItemValue.trim()]);
    setNewItemValue("");
    setIsAddingItem(false);
  }, [items, newItemValue, onChange]);

  const handleUpdateItem = useCallback(
    (index: number, value: string) => {
      const newItems = [...items];
      newItems[index] = value;
      onChange(newItems);
    },
    [items, onChange],
  );

  const handleRemoveItem = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    },
    [items, onChange],
  );

  const handleAddKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleAddItem();
      } else if (e.key === "Escape") {
        setNewItemValue("");
        setIsAddingItem(false);
      }
    },
    [handleAddItem],
  );

  const startAddingItem = useCallback(() => {
    setIsAddingItem(true);
    setTimeout(() => newItemInputRef.current?.focus(), 0);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">
          Outline
          <span className="text-neutral-400 font-normal ml-2">
            ({template})
          </span>
        </h3>
        {items.length < hints.length && !disabled && (
          <span className="text-xs text-neutral-400">
            Hint: {hints[items.length]}
          </span>
        )}
      </div>

      {/* Items list */}
      <Reorder.Group
        axis="y"
        values={items}
        onReorder={handleReorder}
        className="space-y-2"
      >
        <AnimatePresence mode="popLayout">
          {items.map((item, index) => (
            <OutlineItem
              key={item}
              item={item}
              index={index}
              onUpdate={(value) => handleUpdateItem(index, value)}
              onRemove={() => handleRemoveItem(index)}
              disabled={disabled}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>

      {/* Add item input */}
      {!disabled && (
        <AnimatePresence mode="wait">
          {isAddingItem ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", ...SPRING_CONFIG.SNAPPY }}
              className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200"
            >
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center">
                {items.length + 1}
              </div>
              <input
                ref={newItemInputRef}
                type="text"
                value={newItemValue}
                onChange={(e) => setNewItemValue(e.target.value)}
                onKeyDown={handleAddKeyDown}
                placeholder={hints[items.length] || "Add outline point..."}
                className="flex-1 px-2 py-1 text-sm bg-white border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddItem}
                disabled={!newItemValue.trim()}
                className="p-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setNewItemValue("");
                  setIsAddingItem(false);
                }}
                className="p-1 rounded text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={startAddingItem}
              className="w-full flex items-center justify-center gap-2 p-3 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-dashed border-blue-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add outline point
            </motion.button>
          )}
        </AnimatePresence>
      )}

      {/* Empty state */}
      {items.length === 0 && disabled && (
        <div className="p-4 text-center text-neutral-400 text-sm">
          No outline items yet
        </div>
      )}
    </motion.div>
  );
}
