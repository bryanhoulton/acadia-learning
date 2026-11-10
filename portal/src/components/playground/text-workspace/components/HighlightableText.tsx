/**
 * HighlightableText Component
 *
 * Renders text with word-snapping selection for highlighting.
 * Groups consecutive highlighted words into single spans for clean visuals.
 *
 * Features:
 * - Custom selection that snaps to word boundaries
 * - Contiguous highlight spans (no gaps between words)
 * - Click existing highlights to edit
 * - Hover tooltips for highlights with notes
 *
 * Design Ethos:
 * - Predictable: Selection always snaps to complete words
 * - Clean visuals: Highlights are single continuous spans
 * - Direct manipulation: Immediate visual feedback
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AnimatePresence,
  motion,
} from 'framer-motion';

import { FloatingPortal } from '@floating-ui/react';

import {
  HIGHLIGHT_COLORS,
  type HighlightColorKey,
  TIMING,
  TYPOGRAPHY,
} from '../constants';
import type { TextHighlight } from '../schema';
import {
  getCharRangeForWordSelection,
  getSelectableWords,
  tokenizeWords,
  type WordToken,
} from '../utils';

// ============================================
// Types
// ============================================

interface HighlightableTextProps {
  text: string;
  highlights: TextHighlight[];
  allowHighlight: boolean;
  activeColor: HighlightColorKey;
  onCreateHighlight: (
    start: number,
    end: number,
    color: HighlightColorKey
  ) => void;
  onHighlightClick: (highlight: TextHighlight, rect: DOMRect) => void;
}

interface SelectionState {
  startWordIndex: number;
  endWordIndex: number;
}

/** A rendered segment - either plain text or a highlight span */
interface RenderSegment {
  type: "text" | "highlight" | "selection";
  content: string;
  start: number;
  end: number;
  highlight?: TextHighlight;
  color?: HighlightColorKey;
}

// ============================================
// Segment Builder - Groups text into highlight/selection spans
// ============================================

function buildRenderSegments(
  text: string,
  tokens: WordToken[],
  selectableWords: WordToken[],
  highlights: TextHighlight[],
  selectedWordIndices: Set<number>,
  selectionColor: HighlightColorKey
): RenderSegment[] {
  if (!text) return [];

  // Build a character-level map of what's happening at each position
  type CharState = {
    highlight?: TextHighlight;
    isSelected: boolean;
    wordIndex?: number;
  };

  const charMap: CharState[] = new Array(text.length).fill(null).map(() => ({
    isSelected: false,
  }));

  // Mark highlights
  for (const h of highlights) {
    for (let i = h.start; i < h.end && i < text.length; i++) {
      charMap[i].highlight = h;
    }
  }

  // Mark selections and word indices
  for (const word of selectableWords) {
    const selectableIdx = selectableWords.indexOf(word);
    const isSelected = selectedWordIndices.has(selectableIdx);

    for (let i = word.start; i < word.end && i < text.length; i++) {
      charMap[i].isSelected = isSelected;
      charMap[i].wordIndex = selectableIdx;
    }

    // Also mark whitespace between selected words as selected
    if (isSelected) {
      const nextWordIdx = selectableIdx + 1;
      if (
        nextWordIdx < selectableWords.length &&
        selectedWordIndices.has(nextWordIdx)
      ) {
        const nextWord = selectableWords[nextWordIdx];
        for (let i = word.end; i < nextWord.start && i < text.length; i++) {
          charMap[i].isSelected = true;
        }
      }
    }
  }

  // Now build segments by finding runs of same state
  const segments: RenderSegment[] = [];
  let i = 0;

  while (i < text.length) {
    const state = charMap[i];
    let j = i + 1;

    // Selection takes visual priority over highlight
    if (state.isSelected) {
      while (j < text.length && charMap[j].isSelected) {
        j++;
      }
      segments.push({
        type: "selection",
        content: text.slice(i, j),
        start: i,
        end: j,
        color: selectionColor,
      });
    } else if (state.highlight) {
      const h = state.highlight;
      while (
        j < text.length &&
        charMap[j].highlight?.id === h.id &&
        !charMap[j].isSelected
      ) {
        j++;
      }
      segments.push({
        type: "highlight",
        content: text.slice(i, j),
        start: i,
        end: j,
        highlight: h,
      });
    } else {
      while (
        j < text.length &&
        !charMap[j].highlight &&
        !charMap[j].isSelected
      ) {
        j++;
      }
      segments.push({
        type: "text",
        content: text.slice(i, j),
        start: i,
        end: j,
      });
    }

    i = j;
  }

  return segments;
}

// ============================================
// Highlight Span Component with Note Tooltip
// ============================================

interface HighlightSpanProps {
  segment: RenderSegment;
  onHighlightClick: (highlight: TextHighlight, rect: DOMRect) => void;
}

function HighlightSpan({ segment, onHighlightClick }: HighlightSpanProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const highlight = segment.highlight!;
  const colorKey = highlight.color as HighlightColorKey;
  const colors = HIGHLIGHT_COLORS[colorKey] || HIGHLIGHT_COLORS.yellow;
  const hasNote = !!highlight.note;

  // Calculate tooltip position when showing
  useEffect(() => {
    if (showTooltip && hasNote && spanRef.current) {
      const rect = spanRef.current.getBoundingClientRect();
      const padding = 8;

      // Position above the highlight, centered horizontally
      const left = rect.left + rect.width / 2;
      const top = rect.top - padding;

      setTooltipPosition({ top, left });
    } else {
      setTooltipPosition(null);
    }
  }, [showTooltip, hasNote]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (hasNote) {
      // Delay showing tooltip
      hoverTimeoutRef.current = setTimeout(() => {
        setShowTooltip(true);
      }, 400);
    }
  }, [hasNote]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setShowTooltip(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (spanRef.current) {
        const rect = spanRef.current.getBoundingClientRect();
        onHighlightClick(highlight, rect);
      }
    },
    [highlight, onHighlightClick]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <>
      <span
        ref={spanRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="cursor-pointer rounded-sm"
        style={{
          backgroundColor: isHovered ? colors.hover : colors.fill,
          padding: "2px 0",
          transition: `background-color ${TIMING.FAST}ms ease-out`,
        }}
      >
        {segment.content}
      </span>

      {/* Note tooltip */}
      <AnimatePresence>
        {showTooltip && hasNote && tooltipPosition && (
          <FloatingPortal>
            <motion.div
              style={{
                position: "fixed",
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                transform: "translate(-50%, -100%)",
              }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="z-50 max-w-xs px-3 py-2 text-sm bg-neutral-800 text-white rounded-lg shadow-lg pointer-events-none"
            >
              {highlight.note}
            </motion.div>
          </FloatingPortal>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================
// Main Component
// ============================================

export function HighlightableText({
  text,
  highlights,
  allowHighlight,
  activeColor,
  onCreateHighlight,
  onHighlightClick,
}: HighlightableTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<SelectionState | null>(null);

  // Tokenize text into words
  const tokens = useMemo(() => tokenizeWords(text), [text]);
  const selectableWords = useMemo(() => getSelectableWords(tokens), [tokens]);

  // Calculate which word indices are in the current selection
  const selectedWordIndices = useMemo(() => {
    if (!selection) return new Set<number>();

    const minIdx = Math.min(selection.startWordIndex, selection.endWordIndex);
    const maxIdx = Math.max(selection.startWordIndex, selection.endWordIndex);

    const indices = new Set<number>();
    for (let i = minIdx; i <= maxIdx; i++) {
      indices.add(i);
    }
    return indices;
  }, [selection]);

  // Build render segments
  const segments = useMemo(
    () =>
      buildRenderSegments(
        text,
        tokens,
        selectableWords,
        highlights,
        selectedWordIndices,
        activeColor
      ),
    [
      text,
      tokens,
      selectableWords,
      highlights,
      selectedWordIndices,
      activeColor,
    ]
  );

  // Find which selectable word index a character position belongs to
  const getWordIndexAtPosition = useCallback(
    (charPos: number): number => {
      for (let i = 0; i < selectableWords.length; i++) {
        const word = selectableWords[i];
        if (charPos >= word.start && charPos < word.end) {
          return i;
        }
      }
      // Check whitespace - assign to nearest word
      for (let i = 0; i < selectableWords.length - 1; i++) {
        const curr = selectableWords[i];
        const next = selectableWords[i + 1];
        if (charPos >= curr.end && charPos < next.start) {
          return i;
        }
      }
      return -1;
    },
    [selectableWords]
  );

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!allowHighlight || !containerRef.current) return;

      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range) return;

      const preRange = document.createRange();
      preRange.selectNodeContents(containerRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      const charPos = preRange.toString().length;

      const wordIndex = getWordIndexAtPosition(charPos);
      if (wordIndex >= 0) {
        setIsSelecting(true);
        setSelection({ startWordIndex: wordIndex, endWordIndex: wordIndex });
      }
    },
    [allowHighlight, getWordIndexAtPosition]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelecting || !containerRef.current) return;

      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range) return;

      const preRange = document.createRange();
      preRange.selectNodeContents(containerRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      const charPos = preRange.toString().length;

      const wordIndex = getWordIndexAtPosition(charPos);
      if (wordIndex >= 0) {
        setSelection((prev) =>
          prev ? { ...prev, endWordIndex: wordIndex } : null
        );
      }
    },
    [isSelecting, getWordIndexAtPosition]
  );

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || !selection) {
      setIsSelecting(false);
      setSelection(null);
      return;
    }

    const { start, end } = getCharRangeForWordSelection(
      tokens,
      selection.startWordIndex,
      selection.endWordIndex
    );

    if (end > start) {
      onCreateHighlight(start, end, activeColor);
    }

    setIsSelecting(false);
    setSelection(null);
  }, [isSelecting, selection, tokens, activeColor, onCreateHighlight]);

  // Global mouseup listener
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting && selection) {
        const { start, end } = getCharRangeForWordSelection(
          tokens,
          selection.startWordIndex,
          selection.endWordIndex
        );
        if (end > start) {
          onCreateHighlight(start, end, activeColor);
        }
      }
      setIsSelecting(false);
      setSelection(null);
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [isSelecting, selection, tokens, activeColor, onCreateHighlight]);

  return (
    <div
      ref={containerRef}
      className="leading-relaxed"
      style={{
        lineHeight: TYPOGRAPHY.LINE_HEIGHT,
        fontSize: TYPOGRAPHY.FONT_SIZE,
        // Use a crosshair cursor to indicate highlight mode is active
        cursor: allowHighlight ? "crosshair" : "default",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {segments.map((segment, i) => {
        if (segment.type === "selection") {
          const colors = HIGHLIGHT_COLORS[segment.color || activeColor];
          return (
            <span
              key={`sel-${i}`}
              className="rounded-sm"
              style={{
                backgroundColor: colors.fill,
                padding: "2px 0",
              }}
            >
              {segment.content}
            </span>
          );
        }

        if (segment.type === "highlight") {
          return (
            <HighlightSpan
              key={`hl-${segment.highlight!.id}-${i}`}
              segment={segment}
              onHighlightClick={onHighlightClick}
            />
          );
        }

        return <span key={`txt-${i}`}>{segment.content}</span>;
      })}
    </div>
  );
}
