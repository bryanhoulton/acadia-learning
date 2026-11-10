import React, { memo } from 'react';

import { MathJaxSvg } from 'react-native-mathjax-html-to-svg';

interface InlineMathSvgProps {
  latex: string;
  fontSize?: number;
  color?: string;
}

export const InlineMathSvg = memo(
  ({ latex, fontSize = 16, color = "#000000" }: InlineMathSvgProps) => {
    return (
      <MathJaxSvg
        fontSize={fontSize}
        color={color}
        fontCache={true}
        style={{ transform: [{ translateY: 6 }] }}
      >
        {`\\(${latex}\\)`}
      </MathJaxSvg>
    );
  }
);

InlineMathSvg.displayName = "InlineMathSvg";
