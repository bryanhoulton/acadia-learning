import React from 'react';

import {
  ScrollView,
  Text,
  View,
} from 'react-native';

import type { TableBlock as TableBlockType } from '../../types/blocks';

interface TableBlockProps {
  data: TableBlockType;
}

export function TableBlock({ data }: TableBlockProps) {
  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        overflow: "hidden",
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Headers */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "#f3f4f6",
              borderBottomWidth: 2,
              borderBottomColor: "#d1d5db",
            }}
          >
            {data.headers.map((header, index) => (
              <View
                key={index}
                style={{
                  padding: 12,
                  minWidth: 120,
                  borderRightWidth: index < data.headers.length - 1 ? 1 : 0,
                  borderRightColor: "#e5e7eb",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#374151",
                  }}
                >
                  {header}
                </Text>
              </View>
            ))}
          </View>

          {/* Rows */}
          {data.rows.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={{
                flexDirection: "row",
                borderBottomWidth: rowIndex < data.rows.length - 1 ? 1 : 0,
                borderBottomColor: "#e5e7eb",
              }}
            >
              {row.map((cell, cellIndex) => (
                <View
                  key={cellIndex}
                  style={{
                    padding: 12,
                    minWidth: 120,
                    borderRightWidth: cellIndex < row.length - 1 ? 1 : 0,
                    borderRightColor: "#e5e7eb",
                  }}
                >
                  <Text style={{ fontSize: 14, color: "#374151" }}>{cell}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
