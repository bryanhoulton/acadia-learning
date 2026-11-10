import React from 'react';

import {
  Text,
  View,
} from 'react-native';

import type { TimelineBlock as TimelineBlockType } from '../../types/blocks';

interface TimelineBlockProps {
  data: TimelineBlockType;
}

export function TimelineBlock({ data }: TimelineBlockProps) {
  const color = data.color || "#3b82f6";

  return (
    <View
      style={{
        padding: 16,
        backgroundColor: "#ffffff",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
      }}
    >
      {/* Title */}
      {data.title && (
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            color: "#111827",
            marginBottom: 16,
          }}
        >
          {data.title}
        </Text>
      )}

      {/* Timeline items */}
      {data.items.map((item, index) => {
        const isLast = index === data.items.length - 1;
        const filled = item.filled !== false;

        return (
          <View key={index} style={{ flexDirection: "row" }}>
            {/* Timeline line and dot */}
            <View style={{ alignItems: "center", marginRight: 12 }}>
              {/* Dot */}
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: filled ? color : "#ffffff",
                  borderWidth: 2,
                  borderColor: color,
                }}
              />

              {/* Connecting line */}
              {!isLast && (
                <View
                  style={{
                    flex: 1,
                    width: 2,
                    backgroundColor: color,
                    minHeight: 40,
                  }}
                />
              )}
            </View>

            {/* Content */}
            <View
              style={{
                flex: 1,
                paddingBottom: isLast ? 0 : 16,
              }}
            >
              {/* Date */}
              <Text
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  fontWeight: "500",
                  marginBottom: 4,
                }}
              >
                {item.date}
              </Text>

              {/* Title */}
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: "#111827",
                  marginBottom: 4,
                }}
              >
                {item.title}
              </Text>

              {/* Description */}
              {item.description && (
                <Text
                  style={{
                    fontSize: 14,
                    color: "#6b7280",
                    lineHeight: 20,
                  }}
                >
                  {item.description}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
