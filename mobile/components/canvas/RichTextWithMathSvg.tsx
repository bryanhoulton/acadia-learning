import React from 'react';

import {
  Text,
  View,
} from 'react-native';

import { InlineMathSvg } from './InlineMathSvg';

interface RichTextWithMathSvgProps {
  children: string;
  fontSize?: number;
  color?: string;
}

export function RichTextWithMathSvg({
  children,
  fontSize = 16,
  color = "#000000",
}: RichTextWithMathSvgProps) {
  const parts = children.split(/(\$[^$]+\$)/g); // capture $...$
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline" }}
    >
      {parts.map((p, i) =>
        p.startsWith("$") && p.endsWith("$") ? (
          <InlineMathSvg
            key={i}
            latex={p.slice(1, -1)}
            fontSize={fontSize}
            color={color}
          />
        ) : (
          <Text key={i} style={{ fontSize, lineHeight: fontSize + 6, color }}>
            {p}
          </Text>
        )
      )}
    </View>
  );
}
