import { useState } from 'react';

import {
  AnimatePresence,
  motion,
} from 'framer-motion';
import {
  ChevronRight,
  Lock,
  X,
} from 'lucide-react';
import { cn } from 'slate-ui';

import {
  QuestionBlock as QuestionBlockType,
} from '../playground/canvas/schema';
import { CanvasBlockProps } from './';
import MarkdownRenderer from './Markdown';
import { BlockMotionProps } from './motion';

const RING_CLASS =
  "focus:outline-none focus:ring-2 ring-offset-2 ring-blue-200";

export function QuestionBlock({
  data,
  onChange,
  onAnswer,
  disabled,
}: CanvasBlockProps<QuestionBlockType> & {
  onAnswer?: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState(data.user_answer || "");
  const [submitted, setSubmitted] = useState(!!data.user_answer);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (submitted || !answer || disabled) return;
    e.preventDefault();
    setSubmitted(true);
    onChange?.({ ...data, user_answer: answer });
    onAnswer?.(answer);
  };

  return (
    <motion.div
      className="w-full flex flex-col gap-2 p-4 bg-white rounded-lg border border-gray-200"
      {...BlockMotionProps}
    >
      <div className="text-lg font-bold text-black">
        <MarkdownRenderer content={data.question} />
      </div>

      <form className="flex items-center gap-2 w-full" onSubmit={handleSubmit}>
        <input
          type="text"
          aria-label="Answer"
          title="Answer"
          disabled={disabled || submitted}
          className={cn(
            "flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg",
            "transition-colors duration-200 text-black",
            RING_CLASS,
            submitted || disabled
              ? "bg-gray-100 text-gray-500 cursor-not-allowed"
              : "bg-white focus:border-blue-300 hover:border-gray-300"
          )}
          placeholder={data.placeholder || "Type your answer here..."}
          value={answer}
          onChange={(e) => !disabled && !submitted && setAnswer(e.target.value)}
        />

        <AnimatePresence mode="wait">
          {!submitted && !disabled && (
            <motion.button
              type="submit"
              disabled={!answer.trim() || submitted || disabled}
              className={cn(
                "flex items-center justify-center",
                "w-10 h-10 rounded-lg",
                "transition-all duration-200",
                RING_CLASS,
                !answer.trim() || submitted || disabled
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600 active:scale-95"
              )}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          )}

          {submitted && (
            <motion.button
              type="button"
              className="flex cursor-pointer items-center justify-center w-10 h-10 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              disabled={disabled}
              onClick={() => {
                setSubmitted(false);
                setAnswer("");
                onChange?.({ ...data, user_answer: "" });
              }}
            >
              <X className="w-5 h-5 text-green-600" />
            </motion.button>
          )}

          {disabled && !submitted && (
            <motion.div
              className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-lg"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Lock className="w-5 h-5 text-red-600" />
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </motion.div>
  );
}
