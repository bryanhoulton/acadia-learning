import React from 'react';

import { View } from 'react-native';

import { TextBlock as TextBlockType } from '../../types/blocks';
import { MarkdownWebView } from './MarkdownWebView';

interface TextBlockProps {
  data: TextBlockType;
}

export function TextBlock({ data }: TextBlockProps) {
  return (
    <View style={{ width: "100%" }}>
      <MarkdownWebView content={data.text} />
    </View>
  );
}
