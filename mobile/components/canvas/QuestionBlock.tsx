import React, { useState } from 'react';

import { View } from 'react-native';

import type { QuestionBlock as QuestionBlockType } from '../../types/blocks';
import { TextInput } from '../ui';
import { Button } from '../ui/button';
import { MarkdownWebView } from './MarkdownWebView';

interface QuestionBlockProps {
  data: QuestionBlockType;
  onChange?: (data: QuestionBlockType) => void;
}

export function QuestionBlock({ data, onChange }: QuestionBlockProps) {
  const [answer, setAnswer] = useState(data.user_answer || "");
  const hasSubmitted = data.user_answer && data.user_answer.trim() !== "";

  const handleSubmit = () => {
    onChange?.({ ...data, user_answer: answer });
  };

  let errorMessage: string | undefined;

  return (
    <View
      style={{
        padding: 16,
        backgroundColor: "#ffffff",
        borderRadius: 8,
        borderWidth: 1,
        gap: 8,
        borderColor: "#e5e7eb",
        flexShrink: 0,
      }}
    >
      {/* Question text */}
      <MarkdownWebView content={data.question} />

      {/* Answer input */}
      <TextInput
        value={answer}
        onChange={setAnswer}
        placeholder={data.placeholder || "Type your answer..."}
        errorMessage={errorMessage}
        disabled={Boolean(hasSubmitted)}
      />

      {/* Submit button */}
      <View style={{ marginTop: 8 }}>
        <Button
          onPress={handleSubmit}
          variant="primary"
          size="md"
          disabled={Boolean(hasSubmitted) || answer === ""}
        >
          Submit Answer
        </Button>
      </View>
    </View>
  );
}
