/**
 * Text Workspace Utility Functions
 */

import {
  HIGHLIGHT_COLORS,
  type HighlightColorKey,
} from './constants';
import type {
  TextAnnotation,
  TextHighlight,
} from './schema';

// ============================================
// ID Generation
// ============================================

/**
 * Generate a unique ID for highlights/annotations
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// Text Selection Utilities
// ============================================

/**
 * Get the text selection range relative to a container element
 */
export function getSelectionInContainer(
  container: HTMLElement
): { start: number; end: number; text: string } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);

  // Check if selection is within our container
  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }

  // Calculate offset relative to container's text content
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;

  const selectedText = selection.toString();
  const end = start + selectedText.length;

  return { start, end, text: selectedText };
}

/**
 * Clear the current text selection
 */
export function clearSelection(): void {
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
  }
}

// ============================================
// Highlight Management
// ============================================

/**
 * Check if two ranges overlap
 */
export function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number }
): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Merge overlapping highlights of the same color
 */
export function mergeOverlappingHighlights(
  highlights: TextHighlight[]
): TextHighlight[] {
  if (highlights.length <= 1) return highlights;

  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const merged: TextHighlight[] = [];

  for (const highlight of sorted) {
    const last = merged[merged.length - 1];

    if (last && last.color === highlight.color && last.end >= highlight.start) {
      // Merge overlapping highlights of same color
      last.end = Math.max(last.end, highlight.end);
      // Keep the note from the newer highlight if it has one
      if (highlight.note) {
        last.note = highlight.note;
      }
    } else {
      merged.push({ ...highlight });
    }
  }

  return merged;
}

/**
 * Add a new highlight, handling overlaps
 */
export function addHighlight(
  highlights: TextHighlight[],
  newHighlight: TextHighlight
): TextHighlight[] {
  return mergeOverlappingHighlights([...highlights, newHighlight]);
}

/**
 * Remove a highlight by ID
 */
export function removeHighlight(
  highlights: TextHighlight[],
  id: string
): TextHighlight[] {
  return highlights.filter((h) => h.id !== id);
}

/**
 * Update a highlight's note
 */
export function updateHighlightNote(
  highlights: TextHighlight[],
  id: string,
  note: string
): TextHighlight[] {
  return highlights.map((h) => (h.id === id ? { ...h, note } : h));
}

/**
 * Find highlight at a given position
 */
export function findHighlightAtPosition(
  highlights: TextHighlight[],
  position: number
): TextHighlight | undefined {
  return highlights.find((h) => position >= h.start && position < h.end);
}

// ============================================
// Annotation Management
// ============================================

/**
 * Add a new annotation
 */
export function addAnnotation(
  annotations: TextAnnotation[],
  newAnnotation: TextAnnotation
): TextAnnotation[] {
  return [...annotations, newAnnotation].sort(
    (a, b) => a.position - b.position
  );
}

/**
 * Remove an annotation by ID
 */
export function removeAnnotation(
  annotations: TextAnnotation[],
  id: string
): TextAnnotation[] {
  return annotations.filter((a) => a.id !== id);
}

/**
 * Update an annotation's text
 */
export function updateAnnotationText(
  annotations: TextAnnotation[],
  id: string,
  text: string
): TextAnnotation[] {
  return annotations.map((a) => (a.id === id ? { ...a, text } : a));
}

// ============================================
// Text Rendering Utilities
// ============================================

export interface TextSegment {
  type: "text" | "highlight";
  content: string;
  start: number;
  end: number;
  highlight?: TextHighlight;
}

/**
 * Split text into segments based on highlights
 */
export function segmentText(
  text: string,
  highlights: TextHighlight[]
): TextSegment[] {
  if (highlights.length === 0) {
    return [{ type: "text", content: text, start: 0, end: text.length }];
  }

  // Sort highlights by start position
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const segments: TextSegment[] = [];
  let lastEnd = 0;

  for (const highlight of sorted) {
    // Add text before this highlight
    if (highlight.start > lastEnd) {
      segments.push({
        type: "text",
        content: text.slice(lastEnd, highlight.start),
        start: lastEnd,
        end: highlight.start,
      });
    }

    // Add the highlight segment
    segments.push({
      type: "highlight",
      content: text.slice(highlight.start, highlight.end),
      start: highlight.start,
      end: highlight.end,
      highlight,
    });

    lastEnd = highlight.end;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    segments.push({
      type: "text",
      content: text.slice(lastEnd),
      start: lastEnd,
      end: text.length,
    });
  }

  return segments;
}

/**
 * Get the fill color for a highlight
 */
export function getHighlightFill(color: string): string {
  const key = color as HighlightColorKey;
  return HIGHLIGHT_COLORS[key]?.fill ?? HIGHLIGHT_COLORS.yellow.fill;
}

/**
 * Get the hover color for a highlight
 */
export function getHighlightHover(color: string): string {
  const key = color as HighlightColorKey;
  return HIGHLIGHT_COLORS[key]?.hover ?? HIGHLIGHT_COLORS.yellow.hover;
}

// ============================================
// Word Tokenization (for word-snap selection)
// ============================================

export interface WordToken {
  /** The word/token text */
  text: string;
  /** Character start position in original text */
  start: number;
  /** Character end position in original text */
  end: number;
  /** Index in the tokens array */
  index: number;
  /** Whether this is whitespace/punctuation only */
  isWhitespace: boolean;
}

/**
 * Tokenize text into words while preserving positions.
 * Words are separated by whitespace, but we keep track of whitespace too
 * so we can reconstruct the original text and positions.
 */
export function tokenizeWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  // Match either: word characters OR whitespace/punctuation sequences
  const regex = /(\S+|\s+)/g;
  let match;
  let index = 0;

  while ((match = regex.exec(text)) !== null) {
    const tokenText = match[0];
    const isWhitespace = /^\s+$/.test(tokenText);

    tokens.push({
      text: tokenText,
      start: match.index,
      end: match.index + tokenText.length,
      index,
      isWhitespace,
    });
    index++;
  }

  return tokens;
}

/**
 * Get only the selectable words (non-whitespace tokens)
 */
export function getSelectableWords(tokens: WordToken[]): WordToken[] {
  return tokens.filter((t) => !t.isWhitespace);
}

/**
 * Find which word token contains a character position
 */
export function findWordAtPosition(
  tokens: WordToken[],
  charPosition: number
): WordToken | undefined {
  return tokens.find((t) => charPosition >= t.start && charPosition < t.end);
}

/**
 * Get character range for a word selection (inclusive of words between)
 */
export function getCharRangeForWordSelection(
  tokens: WordToken[],
  startWordIndex: number,
  endWordIndex: number
): { start: number; end: number } {
  const selectableWords = getSelectableWords(tokens);
  const minIdx = Math.min(startWordIndex, endWordIndex);
  const maxIdx = Math.max(startWordIndex, endWordIndex);

  const startWord = selectableWords[minIdx];
  const endWord = selectableWords[maxIdx];

  if (!startWord || !endWord) {
    return { start: 0, end: 0 };
  }

  return {
    start: startWord.start,
    end: endWord.end,
  };
}

// ============================================
// Word Count Utilities
// ============================================

/**
 * Count words in text
 */
export function countWords(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

/**
 * Count characters (excluding spaces)
 */
export function countCharacters(text: string, includeSpaces = false): number {
  if (includeSpaces) return text.length;
  return text.replace(/\s/g, "").length;
}

/**
 * Count sentences
 */
export function countSentences(text: string): number {
  if (!text.trim()) return 0;
  // Match sentence-ending punctuation followed by space or end of string
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches ? matches.length : 0;
}

/**
 * Estimate reading time in minutes
 */
export function estimateReadingTime(
  text: string,
  wordsPerMinute = 200
): number {
  const words = countWords(text);
  return Math.ceil(words / wordsPerMinute);
}
