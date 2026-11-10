import {
  useCallback,
  useState,
} from 'react';

import {
  ArrowRight,
  Check,
} from 'lucide-react';
import {
  Button,
  cn,
  RadioGroup,
} from 'slate-ui';

import {
  MultipleChoiceBlock as MultipleChoiceBlockType,
} from '../playground/canvas/schema';
import { CanvasBlockProps } from './';
import MarkdownRenderer from './Markdown';

export function MultipleChoiceBlock({
  data,
  onChange,
  onAnswer,
  disabled,
}: CanvasBlockProps<MultipleChoiceBlockType> & {
  onAnswer?: (answer: string) => void;
}) {
  const [userAnswer, setUserAnswer] = useState<string | null>(
    data.user_answer || null
  );
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleAnswerChange = useCallback(
    (value: string | null) => {
      setUserAnswer(value);
      setSelectedOption(value);
    },
    [setUserAnswer, setSelectedOption]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (selectedOption === null) return;
      onChange?.({ ...data, user_answer: selectedOption || undefined });
      if (selectedOption) {
        onAnswer?.(selectedOption);
      }
    },
    [onChange, onAnswer, data, selectedOption]
  );

  const fullWidth = data.options.some((option) => option.length > 100);
  const showSubmitButton = selectedOption !== null && !data.user_answer;

  return (
    <form
      className="w-full flex flex-col gap-2 p-4 bg-white rounded-lg border border-gray-200"
      onSubmit={handleSubmit}
    >
      <h3 className="text-lg font-bold">
        <MarkdownRenderer content={data.question} />
      </h3>

      <div
        className={cn(
          "grid gap-2 w-full",
          fullWidth ? "grid-cols-1" : "grid-cols-2"
        )}
      >
        <RadioGroup
          items={data.options.slice(0, 2).map((option) => ({
            id: option,
            name:
              option.startsWith("$") && option.endsWith("$") ? (
                <MarkdownRenderer content={option} />
              ) : (
                option
              ),
          }))}
          value={userAnswer || null}
          className="w-full h-full"
          styles={{
            item: {
              height: "100%",
            },
          }}
          onChange={handleAnswerChange}
          disabled={disabled}
        />
        <RadioGroup
          items={data.options.slice(2).map((option) => ({
            id: option,
            name:
              option.startsWith("$") && option.endsWith("$") ? (
                <MarkdownRenderer content={option} />
              ) : (
                option
              ),
          }))}
          className="w-full h-full"
          value={userAnswer || null}
          onChange={handleAnswerChange}
          disabled={disabled}
        />
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          iconRight={data.user_answer ? Check : ArrowRight}
          disabled={disabled || !showSubmitButton}
        >
          {data.user_answer ? "Submitted" : "Submit"}
        </Button>
      </div>
    </form>
  );
}
