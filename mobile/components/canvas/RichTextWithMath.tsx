import React from 'react';

import {
  Text,
  View,
} from 'react-native';

import { InlineMath } from './InlineMath';

interface RichTextWithMathProps {
  children: string;
  fontSize?: number;
}

export function RichTextWithMath({
  children,
  fontSize = 16,
}: RichTextWithMathProps) {
  const parts = children.split(/(\$[^$]+\$)/g); // capture $...$
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline" }}
    >
      {parts.map((p, i) =>
        p.startsWith("$") && p.endsWith("$") ? (
          <InlineMath key={i} latex={p.slice(1, -1)} fontSize={fontSize} />
        ) : (
          <Text key={i} style={{ fontSize, lineHeight: fontSize + 6 }}>
            {p}
          </Text>
        )
      )}
    </View>
  );
}
