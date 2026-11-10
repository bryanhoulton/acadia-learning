import React, { memo } from 'react';

import { View } from 'react-native';
import { MathJaxSvg } from 'react-native-mathjax-html-to-svg';

interface DisplayMathSvgProps {
  latex: string;
  fontSize?: number;
  color?: string;
}

export const DisplayMathSvg = memo(
  ({ latex, fontSize = 18, color = "#000000" }: DisplayMathSvgProps) => {
    return (
      <View
        style={{
          alignItems: "center",
          marginVertical: 12,
          paddingVertical: 8,
          backgroundColor: "#f9fafb",
          borderRadius: 4,
          paddingHorizontal: 8,
        }}
      >
        <MathJaxSvg fontSize={fontSize} color={color} fontCache={true}>
          {`$$${latex}$$`}
        </MathJaxSvg>
      </View>
    );
  }
);

DisplayMathSvg.displayName = "DisplayMathSvg";
