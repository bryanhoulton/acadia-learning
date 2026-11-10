/**
 * WritingArea Component
 *
 * A rich writing area with:
 * - Auto-growing textarea
 * - Word count display
 * - Character count
 * - Writing stats
 *
 * Design Ethos:
 * - Direct manipulation: Text input is immediate
 * - Non-blocking: Stats update without interfering
 * - Clear feedback: Word count updates in real-time
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import { Clock, FileText, LetterText } from "lucide-react";

import { SPRING_CONFIG, TYPOGRAPHY } from "../constants";
import { countCharacters, countWords, estimateReadingTime } from "../utils";

// ============================================
// Types
// ============================================

interface WritingAreaProps {
  /** Current draft content */
  value: string;
  /** Called when content changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Minimum word count goal (optional) */
  wordGoal?: number;
  /** Whether editing is disabled */
  disabled?: boolean;
}

// ============================================
// Stats Bar Component
// ============================================

interface StatsBarProps {
  wordCount: number;
  charCount: number;
  readingTime: number;
  wordGoal?: number;
}

function StatsBar({
  wordCount,
  charCount,
  readingTime,
  wordGoal,
}: StatsBarProps) {
  const progress = wordGoal
    ? Math.min(100, (wordCount / wordGoal) * 100)
    : null;
  const goalMet = wordGoal ? wordCount >= wordGoal : false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", ...SPRING_CONFIG.GENTLE }}
      className="flex items-center justify-between px-4 py-2 bg-neutral-50 border-t border-neutral-200"
    >
      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-neutral-500">
        <div className="flex items-center gap-1.5">
          <FileText className="w-4 h-4" />
          <span>
            <motion.span
              key={wordCount}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-medium text-neutral-700"
            >
              {wordCount}
            </motion.span>
            {" words"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <LetterText className="w-4 h-4" />
          <span>{charCount} chars</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          <span>{readingTime} min read</span>
        </div>
      </div>

      {/* Progress bar (if goal is set) */}
      {wordGoal && (
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-neutral-200 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", ...SPRING_CONFIG.GENTLE }}
              className={`h-full rounded-full ${
                goalMet ? "bg-green-500" : "bg-blue-500"
              }`}
            />
          </div>
          <span
            className={`text-xs font-medium ${goalMet ? "text-green-600" : "text-neutral-500"}`}
          >
            {wordCount}/{wordGoal}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ============================================
// Main Component
// ============================================

export function WritingArea({
  value,
  onChange,
  placeholder = "Start writing...",
  wordGoal,
  disabled = false,
}: WritingAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to get accurate scrollHeight
    textarea.style.height = "auto";
    // Set to scrollHeight + some padding
    textarea.style.height = `${Math.max(200, textarea.scrollHeight)}px`;
  }, []);

  // Adjust height on value change
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Calculate stats
  const wordCount = countWords(value);
  const charCount = countCharacters(value);
  const readingTime = estimateReadingTime(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`
        flex flex-col rounded-xl border overflow-hidden transition-shadow duration-200
        ${isFocused ? "border-blue-500 shadow-lg shadow-blue-500/10" : "border-neutral-200"}
        ${disabled ? "opacity-60" : ""}
      `}
    >
      {/* Text area */}
      <div className="relative bg-white">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full h-full p-6 resize-none focus:outline-none"
          style={{
            fontSize: TYPOGRAPHY.FONT_SIZE,
            lineHeight: TYPOGRAPHY.LINE_HEIGHT,
            minHeight: 200,
          }}
        />
      </div>

      {/* Stats bar */}
      <StatsBar
        wordCount={wordCount}
        charCount={charCount}
        readingTime={readingTime}
        wordGoal={wordGoal}
      />
    </motion.div>
  );
}
