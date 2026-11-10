import React from 'react';

import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import {
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FractionBlock } from '@/components/canvas/FractionBlock';
import { GraphBlock } from '@/components/canvas/GraphBlock';
import { MathBlock } from '@/components/canvas/MathBlock';
import { MultipleChoiceBlock } from '@/components/canvas/MultipleChoiceBlock';
import { NumberLineBlock } from '@/components/canvas/NumberLineBlock';
import { QuestionBlock } from '@/components/canvas/QuestionBlock';
import { TableBlock } from '@/components/canvas/TableBlock';
import { TextBlock } from '@/components/canvas/TextBlock';
import { TimelineBlock } from '@/components/canvas/TimelineBlock';
import { ActionIcon } from '@/components/ui';
import type {
  FractionBlock as FractionBlockType,
  GraphBlock as GraphBlockType,
  MathBlock as MathBlockType,
  MultipleChoiceQuestionBlock,
  NumberLineBlock as NumberLineBlockType,
  QuestionBlock as QuestionBlockType,
  TableBlock as TableBlockType,
  TextBlock as TextBlockType,
  TimelineBlock as TimelineBlockType,
} from '@/types/blocks';

// Sample data for each block type
const SAMPLE_TEXT_BLOCK: TextBlockType = {
  type: 'text',
  text: '## Welcome to Blocks Showcase\n\nThis page displays all available **block types** used in the canvas. Each block can render:\n\n- Markdown formatting\n- Inline math: $E = mc^2$\n- Lists and more!',
};

const SAMPLE_MATH_BLOCK: MathBlockType = {
  type: 'math',
  latex: '\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
};

const SAMPLE_QUESTION_BLOCK: QuestionBlockType = {
  type: 'question',
  question: 'What is the value of $x$ if $2x + 5 = 15$?',
  placeholder: 'Enter your answer...',
  correct_answer: '5',
  user_answer: '',
};

const SAMPLE_MULTIPLE_CHOICE_BLOCK: MultipleChoiceQuestionBlock = {
  type: 'multiple_choice',
  question: 'Which of the following is a prime number?',
  options: ['4', '9', '11', '15'],
  correct_answer: '11',
  user_answer: '',
};

const SAMPLE_GRAPH_BLOCK: GraphBlockType = {
  type: 'graph',
  equations: [
    { equation: 'y = x^2', color: '#3b82f6' },
    { equation: 'y = 2x + 1', color: '#ef4444' },
  ],
  points: [
    { x: 0, y: 0, label: 'Origin', color: '#22c55e' },
    { x: 2, y: 4, label: null, color: '#f59e0b' },
  ],
  viewport_left: -5,
  viewport_right: 5,
  viewport_top: 10,
  viewport_bottom: -2,
};

const SAMPLE_TABLE_BLOCK: TableBlockType = {
  type: 'table',
  headers: ['Day', 'Temperature (°F)', 'Weather'],
  rows: [
    ['Monday', '72', 'Sunny'],
    ['Tuesday', '68', 'Cloudy'],
    ['Wednesday', '75', 'Sunny'],
    ['Thursday', '65', 'Rainy'],
  ],
};

const SAMPLE_TIMELINE_BLOCK: TimelineBlockType = {
  type: 'timeline',
  title: 'American Revolution',
  color: '#3b82f6',
  items: [
    { title: 'Boston Tea Party', date: '1773', description: 'Colonists protested British taxation', filled: true },
    { title: 'Declaration of Independence', date: '1776', description: 'Founding document signed', filled: true },
    { title: 'Battle of Yorktown', date: '1781', description: 'Decisive victory', filled: false },
    { title: 'Treaty of Paris', date: '1783', description: 'War officially ended', filled: false },
  ],
};

const SAMPLE_NUMBER_LINE_BLOCK: NumberLineBlockType = {
  type: 'number_line',
  min: -5,
  max: 5,
  step: 1,
  title: 'Integer Number Line',
  marks: [
    { value: -3, label: 'A', color: '#ef4444', size: 'md' },
    { value: 0, label: 'Origin', color: '#22c55e', size: 'lg' },
    { value: 2.5, label: 'B', color: '#3b82f6', size: 'md' },
  ],
  segments: [
    { start: -2, end: 1, color: '#f59e0b', startType: 'open', endType: 'closed' },
  ],
  rays: [
    { value: 3, direction: 'right', color: '#8b5cf6', type: 'closed' },
  ],
};

const SAMPLE_FRACTION_GRID: FractionBlockType = {
  type: 'fraction',
  fractions: [
    { numerator: 3, denominator: 4, fillColor: '#3b82f6' },
    { numerator: 2, denominator: 3, fillColor: '#22c55e' },
  ],
  diagram_type: 'grid',
  show_label: true,
};

const SAMPLE_FRACTION_PIE: FractionBlockType = {
  type: 'fraction',
  fractions: [
    { numerator: 5, denominator: 8, fillColor: '#f59e0b' },
  ],
  diagram_type: 'pie',
  show_label: true,
};

export default function BlocksShowcaseScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-4 pb-4 bg-white border-b border-neutral-200">
        <View className="flex-row items-center gap-3 mb-2">
          <ActionIcon
            onPress={() => router.back()}
            variant="subtle"
            size="sm"
            icon={ArrowLeft}
          />
          <Text className="text-2xl font-bold text-neutral-900">
            Canvas Blocks
          </Text>
        </View>
        <Text className="text-sm text-neutral-600 ml-12">
          All block types rendered on the canvas
        </Text>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 bg-neutral-50">
        <View className="p-4 gap-6">
          {/* Text Block */}
          <BlockSection title="Text Block" description="Renders Markdown with inline LaTeX">
            <TextBlock data={SAMPLE_TEXT_BLOCK} />
          </BlockSection>

          {/* Math Block */}
          <BlockSection title="Math Block" description="Full LaTeX equation display">
            <MathBlock data={SAMPLE_MATH_BLOCK} />
          </BlockSection>

          {/* Question Block */}
          <BlockSection title="Question Block" description="Free-form text input question">
            <QuestionBlock
              data={SAMPLE_QUESTION_BLOCK}
              onChange={() => {}}
            />
          </BlockSection>

          {/* Multiple Choice Block */}
          <BlockSection title="Multiple Choice Block" description="Selection-based question">
            <MultipleChoiceBlock
              data={SAMPLE_MULTIPLE_CHOICE_BLOCK}
              onChange={() => {}}
            />
          </BlockSection>

          {/* Graph Block */}
          <BlockSection title="Graph Block" description="Interactive coordinate plane with equations">
            <GraphBlock data={SAMPLE_GRAPH_BLOCK} />
          </BlockSection>

          {/* Table Block */}
          <BlockSection title="Table Block" description="Tabular data display">
            <TableBlock data={SAMPLE_TABLE_BLOCK} />
          </BlockSection>

          {/* Timeline Block */}
          <BlockSection title="Timeline Block" description="Chronological events display">
            <TimelineBlock data={SAMPLE_TIMELINE_BLOCK} />
          </BlockSection>

          {/* Number Line Block */}
          <BlockSection title="Number Line Block" description="Number line with marks, segments, and rays">
            <NumberLineBlock data={SAMPLE_NUMBER_LINE_BLOCK} />
          </BlockSection>

          {/* Fraction Block - Grid */}
          <BlockSection title="Fraction Block (Grid)" description="Visual fraction representation as grid">
            <FractionBlock data={SAMPLE_FRACTION_GRID} />
          </BlockSection>

          {/* Fraction Block - Pie */}
          <BlockSection title="Fraction Block (Pie)" description="Visual fraction representation as pie chart">
            <FractionBlock data={SAMPLE_FRACTION_PIE} />
          </BlockSection>

          {/* Bottom Padding */}
          <View style={{ paddingBottom: insets.bottom + 32 }} />
        </View>
      </ScrollView>
    </View>
  );
}

// Helper Components
function BlockSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <View className="px-2">
        <Text className="text-lg font-bold text-neutral-900">{title}</Text>
        <Text className="text-xs text-neutral-500">{description}</Text>
      </View>
      <View className="bg-white rounded-xl p-4 border border-neutral-200 overflow-hidden">
        {children}
      </View>
    </View>
  );
}
