import React from 'react';

import {
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Path,
  Rect,
} from 'react-native-svg';

import type { FractionBlock as FractionBlockType } from '../../types/blocks';

interface FractionBlockProps {
  data: FractionBlockType;
}

export function FractionBlock({ data }: FractionBlockProps) {
  const { fractions, diagram_type = "pie", show_label = true } = data;

  const renderPieDiagram = (
    numerator: number,
    denominator: number,
    fillColor: string
  ) => {
    const size = 100;
    const center = size / 2;
    const radius = size / 2 - 5;

    // Handle improper fractions
    const wholes = Math.floor(numerator / denominator);
    const remainder = numerator % denominator;
    const circles = wholes + (remainder > 0 ? 1 : 0);

    return (
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
        }}
      >
        {Array.from({ length: circles }).map((_, circleIndex) => {
          const isLastCircle = circleIndex === circles - 1;
          const fillCount =
            isLastCircle && remainder > 0 ? remainder : denominator;

          return (
            <Svg key={circleIndex} width={size} height={size}>
              {/* Circle outline */}
              <Circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="#d1d5db"
                strokeWidth="2"
              />

              {/* Filled sections */}
              {Array.from({ length: fillCount }).map((_, i) => {
                const startAngle = (i * 360) / denominator;
                const endAngle = ((i + 1) * 360) / denominator;

                const startRad = (startAngle - 90) * (Math.PI / 180);
                const endRad = (endAngle - 90) * (Math.PI / 180);

                const x1 = center + radius * Math.cos(startRad);
                const y1 = center + radius * Math.sin(startRad);
                const x2 = center + radius * Math.cos(endRad);
                const y2 = center + radius * Math.sin(endRad);

                const largeArc = endAngle - startAngle > 180 ? 1 : 0;

                const pathData = [
                  `M ${center} ${center}`,
                  `L ${x1} ${y1}`,
                  `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
                  "Z",
                ].join(" ");

                return (
                  <Path
                    key={i}
                    d={pathData}
                    fill={fillColor}
                    stroke="#ffffff"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Division lines */}
              {Array.from({ length: denominator }).map((_, i) => {
                const angle = (i * 360) / denominator - 90;
                const rad = angle * (Math.PI / 180);
                const x = center + radius * Math.cos(rad);
                const y = center + radius * Math.sin(rad);

                return (
                  <Path
                    key={`line-${i}`}
                    d={`M ${center} ${center} L ${x} ${y}`}
                    stroke="#d1d5db"
                    strokeWidth="1"
                  />
                );
              })}
            </Svg>
          );
        })}
      </View>
    );
  };

  const renderGridDiagram = (
    numerator: number,
    denominator: number,
    fillColor: string
  ) => {
    const cellSize = 30;
    const cols = Math.ceil(Math.sqrt(denominator));
    const rows = Math.ceil(denominator / cols);
    const width = cols * cellSize;
    const height = rows * cellSize;

    // Handle improper fractions
    const wholes = Math.floor(numerator / denominator);
    const remainder = numerator % denominator;
    const grids = wholes + (remainder > 0 ? 1 : 0);

    return (
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
        }}
      >
        {Array.from({ length: grids }).map((_, gridIndex) => {
          const isLastGrid = gridIndex === grids - 1;
          const fillCount =
            isLastGrid && remainder > 0 ? remainder : denominator;

          return (
            <Svg key={gridIndex} width={width} height={height}>
              {Array.from({ length: denominator }).map((_, i) => {
                const row = Math.floor(i / cols);
                const col = i % cols;
                const isFilled = i < fillCount;

                return (
                  <Rect
                    key={i}
                    x={col * cellSize}
                    y={row * cellSize}
                    width={cellSize}
                    height={cellSize}
                    fill={isFilled ? fillColor : "#ffffff"}
                    stroke="#d1d5db"
                    strokeWidth="1"
                  />
                );
              })}
            </Svg>
          );
        })}
      </View>
    );
  };

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
      <View style={{ gap: 16 }}>
        {fractions.map((fraction, index) => {
          const fillColor = fraction.fillColor || "#3b82f6";

          return (
            <View key={index}>
              {show_label && (
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "600",
                    color: "#111827",
                    marginBottom: 8,
                    textAlign: "center",
                  }}
                >
                  {fraction.numerator}/{fraction.denominator}
                </Text>
              )}

              {diagram_type === "pie"
                ? renderPieDiagram(
                    fraction.numerator,
                    fraction.denominator,
                    fillColor
                  )
                : renderGridDiagram(
                    fraction.numerator,
                    fraction.denominator,
                    fillColor
                  )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
