/**
 * Canvas Playground Component
 *
 * Wrapper component that adapts BlockRenderer to the standard playground interface.
 * Canvas is the block-based playground that renders various content blocks
 * (text, math, questions, graphs, etc.)
 */

import type { PlaygroundComponentProps } from '../types';
import BlockRenderer from './BlockRenderer';
import type {
  Config,
  State,
} from './schema';

type Props = PlaygroundComponentProps<Config, State, null> & {
  /** Whether question inputs are disabled */
  questionsDisabled?: boolean;
};

export function Canvas({
  state,
  onChange,
  onEvent,
  questionsDisabled = false,
}: Props) {
  return (
    <BlockRenderer
      content={state}
      onBlocksChange={onChange}
      onQuestionAnswer={(question, answer) => {
        onEvent?.({
          type: "question_answered",
          question,
          answer,
        });
      }}
      questionsDisabled={questionsDisabled}
    />
  );
}
