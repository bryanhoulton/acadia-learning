/**
 * ProblemDisplay
 *
 * Renders the math problem with KaTeX, showing operands and operation.
 */

import { useMemo } from 'react';

import katex from 'katex';

import { operandToLatex } from '../fraction-utils';
import type { Problem } from '../schema';
import { getOperationLatex } from '../utils';

interface ProblemDisplayProps {
  /** The problem to display */
  problem: Problem;
  /** Whether to show the answer (for reveal) */
  showAnswer?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function ProblemDisplay({
  problem,
  showAnswer = false,
  className = "",
}: ProblemDisplayProps) {
  const html = useMemo(() => {
    const op1 = operandToLatex(problem.operand1);
    const op2 = operandToLatex(problem.operand2);
    const opSymbol = getOperationLatex(problem.operation);

    let latex: string;
    if (showAnswer) {
      const answer = operandToLatex(problem.correctAnswer);
      latex = `${op1} \\; ${opSymbol} \\; ${op2} \\; = \\; ${answer}`;
    } else {
      latex = `${op1} \\; ${opSymbol} \\; ${op2} \\; = \\; ?`;
    }

    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
    });
  }, [problem, showAnswer]);

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ transform: "scale(3)" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
