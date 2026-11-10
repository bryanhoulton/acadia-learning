import React, { useState } from 'react';

import {
  Text,
  View,
} from 'react-native';

import type {
  MultipleChoiceQuestionBlock as MultipleChoiceQuestionBlockType,
} from '../../types/blocks';
import { Button } from '../ui/button';
import { MarkdownWebView } from './MarkdownWebView';

interface MultipleChoiceBlockProps {
  data: MultipleChoiceQuestionBlockType;
  onChange?: (data: MultipleChoiceQuestionBlockType) => void;
}

export function MultipleChoiceBlock({
  data,
  onChange,
}: MultipleChoiceBlockProps) {
  const [selectedAnswer, setSelectedAnswer] = useState(data.user_answer || "");
  const hasSubmitted = data.user_answer && data.user_answer.trim() !== "";
  const showFeedback = hasSubmitted; // Only show feedback AFTER submission
  const isCorrect = selectedAnswer === data.correct_answer;

  const handleSubmit = () => {
    onChange?.({ ...data, user_answer: selectedAnswer });
  };

  return (
    <View
      style={{
        padding: 16,
        backgroundColor: "#ffffff",
        borderRadius: 8,
        gap: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
      }}
    >
      {/* Question */}
      <MarkdownWebView content={data.question} />

      {/* Options */}
      <View style={{ gap: 8 }}>
        {data.options.map((option, index) => {
          const isSelected = selectedAnswer === option;
          const isCorrectOption = option === data.correct_answer;
          const showCorrect = showFeedback && isCorrectOption;
          const showIncorrect = showFeedback && isSelected && !isCorrect;

          // Only show colored feedback after submission, otherwise just show selection state
          const borderColor = hasSubmitted
            ? showCorrect
              ? "#22c55e"
              : showIncorrect
              ? "#ef4444"
              : isSelected
              ? "#3b82f6"
              : "#d1d5db"
            : isSelected
            ? "#3b82f6"
            : "#d1d5db";

          const backgroundColor = hasSubmitted
            ? showCorrect
              ? "#dcfce7"
              : showIncorrect
              ? "#fee2e2"
              : isSelected
              ? "#dbeafe"
              : "#ffffff"
            : isSelected
            ? "#dbeafe"
            : "#ffffff";

          // Radio button color: only show feedback colors after submission
          const radioBorderColor = hasSubmitted
            ? showCorrect
              ? "#22c55e"
              : showIncorrect
              ? "#ef4444"
              : isSelected
              ? "#3b82f6"
              : "#9ca3af"
            : isSelected
            ? "#3b82f6"
            : "#9ca3af";

          return (
            <Button
              key={index}
              onPress={() => !hasSubmitted && setSelectedAnswer(option)}
              variant="subtle"
              style={{
                padding: 12,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: borderColor,
                backgroundColor: backgroundColor,
                width: "100%",
                opacity: hasSubmitted ? 0.6 : 1,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                {/* Radio button */}
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: radioBorderColor,
                    backgroundColor: isSelected ? "#3b82f6" : "#ffffff",
                    marginRight: 12,
                  }}
                >
                  {isSelected && (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: "#ffffff",
                        alignSelf: "center",
                        marginTop: 3,
                      }}
                    />
                  )}
                </View>

                {/* Option text */}
                <Text style={{ fontSize: 16, flex: 1 }}>{option}</Text>

                {/* Feedback icon - only show after submission */}
                {showCorrect && (
                  <Text style={{ fontSize: 18, color: "#22c55e" }}>✓</Text>
                )}
                {showIncorrect && (
                  <Text style={{ fontSize: 18, color: "#ef4444" }}>✗</Text>
                )}
              </View>
            </Button>
          );
        })}
      </View>

      {/* Submit button */}
      <View style={{ marginTop: 12 }}>
        <Button
          onPress={handleSubmit}
          variant="primary"
          size="md"
          disabled={Boolean(hasSubmitted) || selectedAnswer === ""}
        >
          Submit Answer
        </Button>
      </View>
    </View>
  );
}
