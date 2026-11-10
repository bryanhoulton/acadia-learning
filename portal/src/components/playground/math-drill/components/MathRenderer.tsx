/**
 * MathRenderer
 *
 * Renders mathematical expressions using KaTeX.
 * Handles integers, fractions, and mixed numbers.
 */

import { useMemo } from 'react';

import katex from 'katex';

import { operandToLatex } from '../fraction-utils';
import type { Operand } from '../schema';

interface MathRendererProps {
  /** The operand to render */
  operand: Operand;
  /** Additional CSS classes */
  className?: string;
  /** Font size scale (default: 1) */
  scale?: number;
}

export function MathRenderer({
  operand,
  className = "",
  scale = 1,
}: MathRendererProps) {
  const html = useMemo(() => {
    const latex = operandToLatex(operand);
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
    });
  }, [operand]);

  return (
    <span
      className={className}
      style={{ fontSize: `${scale}em` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface MathExpressionProps {
  /** LaTeX expression to render */
  latex: string;
  /** Additional CSS classes */
  className?: string;
  /** Use display mode (centered, larger) */
  displayMode?: boolean;
  /** Font size scale */
  scale?: number;
}

export function MathExpression({
  latex,
  className = "",
  displayMode = false,
  scale = 1,
}: MathExpressionProps) {
  const html = useMemo(() => {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode,
    });
  }, [latex, displayMode]);

  return (
    <span
      className={className}
      style={{ fontSize: `${scale}em` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
