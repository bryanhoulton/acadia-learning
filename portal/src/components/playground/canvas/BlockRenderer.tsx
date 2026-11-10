import { useCallback } from 'react';

import { AnimatePresence } from 'framer-motion';
import { Feather } from 'lucide-react';
import {
  cn,
  EmptyState,
} from 'slate-ui';
import {
  EmptyStateProps,
} from 'slate-ui/dist/cjs/components/EmptyState/EmptyState.types';

import { FractionBlock } from '../../canvas/FractionBlock';
import { GraphBlock } from '../../canvas/GraphBlock';
import { MathBlock } from '../../canvas/MathBlock';
import { MultipleChoiceBlock } from '../../canvas/MultipleChoiceBlock';
import { NumberLineBlock } from '../../canvas/NumberLineBlock';
import { QuestionBlock } from '../../canvas/QuestionBlock';
import { TableBlock } from '../../canvas/TableBlock';
import { TextBlock } from '../../canvas/TextBlock';
import { TimelineBlock } from '../../canvas/TimelineBlock';
import type {
  Block,
  State,
} from './schema';

interface BlockRendererProps {
  content: State | null;
  onBlocksChange?: (blocks: State) => void;
  onQuestionAnswer?: (question: string, answer: string) => void;
  questionsDisabled?: boolean;
  className?: string;
  emptyState?: EmptyStateProps;
}

function getBlockKey(block: Block): string {
  if (!block.data) {
    return `unknown-${block.index}`;
  }
  switch (block.data.type) {
    case "question":
    case "multiple_choice":
      return block.data.question;
    default:
      return JSON.stringify(block.data);
  }
}

function BlockRenderer({
  content,
  onBlocksChange,
  onQuestionAnswer,
  questionsDisabled = false,
  className = "",
  emptyState = {
    icon: Feather,
    title: "Canvas is empty",
  },
}: BlockRendererProps) {
  const onBlockChange = useCallback(
    (block: State["blocks"][number]) => {
      onBlocksChange?.({
        ...content,
        blocks:
          content?.blocks.map((b) => (b.index === block.index ? block : b)) ??
          [],
      });
    },
    [content, onBlocksChange]
  );

  return (
    <div
      className={cn(
        "flex flex-col grow min-h-0 h-full text-primary-900 overflow-y-auto",
        (!content || content.blocks?.length === 0) && "justify-center",
        className
      )}
    >
      <div className="flex flex-col gap-4 py-4 px-4 my-auto w-full max-w-full overflow-x-hidden">
        <AnimatePresence>
          {content?.blocks.map((block) => {
            const key = getBlockKey(block);
            switch (block.data.type) {
              case "text":
                return <TextBlock data={block.data} key={key} />;
              case "math":
                return <MathBlock data={block.data} key={key} />;
              case "multiple_choice": {
                const { question } = block.data;
                return (
                  <MultipleChoiceBlock
                    data={block.data}
                    onChange={(data) => onBlockChange({ ...block, data })}
                    onAnswer={(answer) => onQuestionAnswer?.(question, answer)}
                    disabled={questionsDisabled}
                    key={key}
                  />
                );
              }
              case "question": {
                const { question } = block.data;
                return (
                  <QuestionBlock
                    data={block.data}
                    onChange={(data) => onBlockChange({ ...block, data })}
                    onAnswer={(answer) => onQuestionAnswer?.(question, answer)}
                    disabled={questionsDisabled}
                    key={key}
                  />
                );
              }
              case "graph":
                return <GraphBlock data={block.data} key={key} />;
              case "table":
                return <TableBlock data={block.data} key={key} />;
              case "timeline":
                return <TimelineBlock data={block.data} key={key} />;
              case "fraction":
                return <FractionBlock data={block.data} key={key} />;
              case "number_line":
                return <NumberLineBlock data={block.data} key={key} />;
            }
          })}
        </AnimatePresence>
      </div>

      {(!content || content.blocks.length === 0) && (
        <EmptyState className="h-full" {...emptyState} />
      )}
    </div>
  );
}

export default BlockRenderer;
