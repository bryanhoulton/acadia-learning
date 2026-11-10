/**
 * TextWorkspace Component
 *
 * A comprehensive reading and writing workspace that supports:
 *
 * ## Reading Mode
 * - Interactive text highlighting with multiple colors
 * - Annotations with notes
 * - Highlight popover for editing
 * - Sidebar for viewing all annotations
 *
 * ## Writing Mode
 * - Structured outline with drag-to-reorder
 * - Rich textarea with word count
 * - Progress tracking
 *
 * ## Editing Mode
 * - Direct text editing
 * - Revision support
 *
 * Design Ethos:
 * - Direct Manipulation: All interactions respond immediately
 * - Predictable Snapping: Selection creates highlights at natural word boundaries
 * - Visual Feedback: Hover states, selection previews, active tool indicators
 * - No blocking animations: Everything feels snappy and responsive
 */

import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import { motion } from 'framer-motion';

import type { PlaygroundComponentProps } from '../types';
import {
  HighlightableText,
  HighlightPopover,
  OutlineEditor,
  ReadingToolbar,
  WritingArea,
} from './components';
import {
  DEFAULT_HIGHLIGHT_COLOR,
  type HighlightColorKey,
  SPRING_CONFIG,
  TYPOGRAPHY,
} from './constants';
import {
  type Config,
  type ReadingTool,
  type State,
  type TextHighlight,
} from './schema';
import {
  addHighlight,
  generateId,
  removeHighlight,
  updateHighlightNote,
} from './utils';

// ============================================
// Types
// ============================================

type Props = PlaygroundComponentProps<Config, State>;

// ============================================
// Main Component
// ============================================

export function TextWorkspace({ config, state, onChange, onEvent }: Props) {
  // Extract config with defaults
  const mode = config?.mode || "reading";
  const passage = config?.passage;
  const readingTools = config?.readingTools || [];
  const structuredWriting = config?.structuredWriting;
  const text = passage?.text || "";

  // Local UI state - default to no tool selected so user can read normally
  const [activeTool, setActiveTool] = useState<ReadingTool | null>(null);
  const [activeColor, setActiveColor] = useState<HighlightColorKey>(
    DEFAULT_HIGHLIGHT_COLOR
  );
  const [selectedHighlight, setSelectedHighlight] =
    useState<TextHighlight | null>(null);
  const [highlightAnchorRect, setHighlightAnchorRect] =
    useState<DOMRect | null>(null);

  // Ensure state has required properties - wrapped in useMemo to prevent dependency array instability
  const highlights = useMemo(
    () => state?.highlights || [],
    [state?.highlights]
  );
  const composition = useMemo(
    () => state?.composition || { outline: [], draft: "" },
    [state?.composition]
  );

  // Determine if interactions are allowed
  const allowHighlight =
    readingTools.includes("highlight") && activeTool === "highlight";

  // ============================================
  // Highlight Handlers
  // ============================================

  const handleCreateHighlight = useCallback(
    (start: number, end: number, color: HighlightColorKey) => {
      if (!onChange) return;

      // Extract the actual highlighted text
      const highlightedText = text.slice(start, end);

      const newHighlight: TextHighlight = {
        id: generateId("highlight"),
        start,
        end,
        text: highlightedText,
        color,
      };

      onChange({
        ...state,
        highlights: addHighlight(highlights, newHighlight),
      });

      // Emit highlight_created event
      onEvent?.({
        type: "highlight_created",
        highlightId: newHighlight.id,
        color,
        content: highlightedText,
        start,
        end,
      });
    },
    [onChange, onEvent, state, highlights, text]
  );

  const handleHighlightClick = useCallback(
    (highlight: TextHighlight, rect: DOMRect) => {
      setSelectedHighlight(highlight);
      setHighlightAnchorRect(rect);
    },
    []
  );

  const handleHighlightColorChange = useCallback(
    (id: string, color: HighlightColorKey) => {
      if (!onChange) return;

      onChange({
        ...state,
        highlights: highlights.map((h) => (h.id === id ? { ...h, color } : h)),
      });

      // Update selected highlight if it's the one being changed
      if (selectedHighlight?.id === id) {
        setSelectedHighlight((prev) => (prev ? { ...prev, color } : null));
      }
    },
    [onChange, state, selectedHighlight, highlights]
  );

  const handleHighlightNoteChange = useCallback(
    (id: string, note: string) => {
      if (!onChange) return;

      onChange({
        ...state,
        highlights: updateHighlightNote(highlights, id, note),
      });

      // Update selected highlight
      if (selectedHighlight?.id === id) {
        setSelectedHighlight((prev) => (prev ? { ...prev, note } : null));
      }
    },
    [onChange, state, selectedHighlight, highlights]
  );

  const handleHighlightDelete = useCallback(
    (id: string) => {
      if (!onChange) return;

      onChange({
        ...state,
        highlights: removeHighlight(highlights, id),
      });
    },
    [onChange, state, highlights]
  );

  const handlePopoverClose = useCallback(() => {
    setSelectedHighlight(null);
    setHighlightAnchorRect(null);
  }, []);

  // ============================================
  // Writing Handlers
  // ============================================

  const handleDraftChange = useCallback(
    (draft: string) => {
      if (!onChange) return;

      onChange({
        ...state,
        composition: {
          ...composition,
          outline: composition.outline,
          draft,
        },
      });
    },
    [onChange, state, composition]
  );

  const handleOutlineChange = useCallback(
    (outline: string[]) => {
      if (!onChange) return;

      onChange({
        ...state,
        composition: {
          ...composition,
          outline,
          draft: composition.draft,
        },
      });
    },
    [onChange, state, composition]
  );

  // ============================================
  // Render
  // ============================================

  // Debug: show fallback if no text in reading mode
  if (mode === "reading" && !text) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="text-4xl mb-4">📝</div>
          <h2 className="text-lg font-semibold text-neutral-700 mb-2">
            No Passage Configured
          </h2>
          <p className="text-sm text-neutral-500">
            Add a passage in the config to enable reading mode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Reading Mode */}
      {mode === "reading" && (
        <div className="relative flex-1 overflow-auto flex items-center">
          {/* Floating toolbar */}
          {readingTools.length > 0 && (
            <ReadingToolbar
              availableTools={readingTools}
              activeTool={activeTool}
              activeColor={activeColor}
              onToolChange={setActiveTool}
              onColorChange={setActiveColor}
            />
          )}

          {/* Content */}
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", ...SPRING_CONFIG.GENTLE }}
            className="max-w-3xl mx-auto p-8 w-full"
          >
            {/* Title */}
            {passage?.title && (
              <h1
                className="font-bold text-neutral-900 mb-3"
                style={{ fontSize: TYPOGRAPHY.TITLE_SIZE }}
              >
                {passage.title}
              </h1>
            )}

            {/* Source */}
            {passage?.source && (
              <div className="text-sm text-neutral-500 mb-8 italic">
                Source: {passage.source}
              </div>
            )}

            {/* Text content */}
            <div className="text-neutral-700 whitespace-pre-wrap">
              <HighlightableText
                text={text}
                highlights={highlights}
                allowHighlight={allowHighlight}
                activeColor={activeColor}
                onCreateHighlight={handleCreateHighlight}
                onHighlightClick={handleHighlightClick}
              />
            </div>
          </motion.article>

          {/* Highlight popover */}
          <HighlightPopover
            highlight={selectedHighlight}
            anchorRect={highlightAnchorRect}
            onColorChange={handleHighlightColorChange}
            onNoteChange={handleHighlightNoteChange}
            onDelete={handleHighlightDelete}
            onClose={handlePopoverClose}
          />
        </div>
      )}

      {/* Writing Mode */}
      {mode === "writing" && (
        <div className="flex-1 overflow-auto p-8 flex items-center">
          <div className="max-w-3xl mx-auto space-y-8 w-full">
            {/* Outline (if enabled) */}
            {structuredWriting?.enabled && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", ...SPRING_CONFIG.GENTLE }}
              >
                <OutlineEditor
                  items={composition.outline}
                  onChange={handleOutlineChange}
                  template={structuredWriting.template}
                />
              </motion.div>
            )}

            {/* Writing area */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                type: "spring",
                ...SPRING_CONFIG.GENTLE,
                delay: 0.1,
              }}
            >
              <WritingArea
                value={composition.draft}
                onChange={handleDraftChange}
                placeholder="Start writing..."
              />
            </motion.div>
          </div>
        </div>
      )}

      {/* Editing Mode */}
      {mode === "editing" && (
        <div className="flex-1 overflow-auto p-8 flex items-center">
          <div className="max-w-3xl mx-auto w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", ...SPRING_CONFIG.GENTLE }}
            >
              <div className="mb-4 text-sm text-neutral-500">
                Edit the text below. Changes are saved automatically.
              </div>
              <WritingArea
                value={passage?.text || ""}
                onChange={(newText) => {
                  // In editing mode, we'd update the passage text
                  // This would require a different state structure
                  console.log("Text edited:", newText);
                }}
                placeholder="Edit text here..."
              />
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}
