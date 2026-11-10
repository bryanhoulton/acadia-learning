import React from 'react';

import { MathBlock as MathBlockType } from '../../types/blocks';
import { DisplayMathSvg } from './DisplayMathSvg';

interface MathBlockProps {
  data: MathBlockType;
}

export function MathBlock({ data }: MathBlockProps) {
  return <DisplayMathSvg latex={data.latex} />;
}
