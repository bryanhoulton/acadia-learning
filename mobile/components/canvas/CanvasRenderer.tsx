import React from 'react';

import {
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Block } from '../../types/blocks';
import { FractionBlock } from './FractionBlock';
import { GraphBlock } from './GraphBlock';
import { MathBlock } from './MathBlock';
import { MultipleChoiceBlock } from './MultipleChoiceBlock';
import { NumberLineBlock } from './NumberLineBlock';
import { QuestionBlock } from './QuestionBlock';
import { TableBlock } from './TableBlock';
import { TextBlock } from './TextBlock';
import { TimelineBlock } from './TimelineBlock';

interface CanvasRendererProps {
  blocks: Block[];
  onBlocksChange?: (blocks: Block[]) => void;
}

export function CanvasRenderer({
  blocks,
  onBlocksChange,
}: CanvasRendererProps) {
  const handleBlockChange = (updatedBlock: Block) => {
    const updatedBlocks = blocks.map((b) =>
      b.index === updatedBlock.index ? updatedBlock : b
    );
    onBlocksChange?.(updatedBlocks);
  };

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        flex: 1,
      }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: 8,
        }}
      >
        {blocks.map((block, index) => {
          const key = `${block.index}-${index}`;
          const blockType = block.data.type;

          switch (blockType) {
            case "text":
              return <TextBlock key={key} data={block.data} />;
            case "math":
              return <MathBlock key={key} data={block.data} />;
            case "question":
              return (
                <QuestionBlock
                  key={key}
                  data={block.data}
                  onChange={(data) => handleBlockChange({ ...block, data })}
                />
              );
            case "multiple_choice":
              return (
                <MultipleChoiceBlock
                  key={key}
                  data={block.data}
                  onChange={(data) => handleBlockChange({ ...block, data })}
                />
              );
            case "graph":
              return <GraphBlock key={key} data={block.data} />;
            case "table":
              return <TableBlock key={key} data={block.data} />;
            case "timeline":
              return <TimelineBlock key={key} data={block.data} />;
            case "number_line":
              return <NumberLineBlock key={key} data={block.data} />;
            case "fraction":
              return <FractionBlock key={key} data={block.data} />;
            default:
              return (
                <View key={key} style={{ padding: 8, backgroundColor: "#fee" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 14 }}>
                    Unsupported block type: {blockType}
                  </Text>
                </View>
              );
          }
        })}
      </ScrollView>
    </View>
  );
}
