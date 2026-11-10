import React from 'react';

import {
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Line,
  Text as SvgText,
} from 'react-native-svg';

import type {
  NumberLineBlock as NumberLineBlockType,
} from '../../types/blocks';

interface NumberLineBlockProps {
  data: NumberLineBlockType;
}

export function NumberLineBlock({ data }: NumberLineBlockProps) {
  const { min, max, step, marks = [], segments = [], rays = [], title } = data;

  const width = 350;
  const height = 120;
  const padding = 40;
  const lineY = height / 2;
  const range = max - min;

  // Convert value to x coordinate
  const valueToX = (value: number) => {
    return padding + ((value - min) / range) * (width - 2 * padding);
  };

  // Generate tick marks
  const tickStep = step || Math.max(1, Math.ceil(range / 10));
  const ticks = [];
  for (let i = min; i <= max; i += tickStep) {
    ticks.push(i);
  }

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
      {title && (
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: "#111827",
            marginBottom: 8,
          }}
        >
          {title}
        </Text>
      )}

      <Svg width={width} height={height}>
        {/* Main line */}
        <Line
          x1={padding}
          y1={lineY}
          x2={width - padding}
          y2={lineY}
          stroke="#374151"
          strokeWidth="2"
        />

        {/* Arrows */}
        <Line
          x1={width - padding}
          y1={lineY}
          x2={width - padding - 8}
          y2={lineY - 5}
          stroke="#374151"
          strokeWidth="2"
        />
        <Line
          x1={width - padding}
          y1={lineY}
          x2={width - padding - 8}
          y2={lineY + 5}
          stroke="#374151"
          strokeWidth="2"
        />

        {/* Tick marks and labels */}
        {ticks.map((tick) => {
          const x = valueToX(tick);
          return (
            <React.Fragment key={tick}>
              <Line
                x1={x}
                y1={lineY - 6}
                x2={x}
                y2={lineY + 6}
                stroke="#374151"
                strokeWidth="2"
              />
              <SvgText
                x={x}
                y={lineY + 20}
                textAnchor="middle"
                fontSize="12"
                fill="#6b7280"
              >
                {tick}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Segments */}
        {segments.map((segment, index) => {
          const startX = valueToX(segment.start);
          const endX = valueToX(segment.end);
          const color = segment.color || "#3b82f6";

          return (
            <React.Fragment key={`segment-${index}`}>
              <Line
                x1={startX}
                y1={lineY}
                x2={endX}
                y2={lineY}
                stroke={color}
                strokeWidth="4"
              />
              {/* Start dot */}
              <Circle
                cx={startX}
                cy={lineY}
                r="4"
                fill={segment.startType === "open" ? "#ffffff" : color}
                stroke={color}
                strokeWidth="2"
              />
              {/* End dot */}
              <Circle
                cx={endX}
                cy={lineY}
                r="4"
                fill={segment.endType === "open" ? "#ffffff" : color}
                stroke={color}
                strokeWidth="2"
              />
            </React.Fragment>
          );
        })}

        {/* Rays */}
        {rays.map((ray, index) => {
          const startX = valueToX(ray.value);
          const endX = ray.direction === "right" ? width - padding : padding;
          const color = ray.color || "#3b82f6";

          return (
            <React.Fragment key={`ray-${index}`}>
              <Line
                x1={startX}
                y1={lineY}
                x2={endX}
                y2={lineY}
                stroke={color}
                strokeWidth="4"
              />
              <Circle
                cx={startX}
                cy={lineY}
                r="4"
                fill={ray.type === "open" ? "#ffffff" : color}
                stroke={color}
                strokeWidth="2"
              />
            </React.Fragment>
          );
        })}

        {/* Marks */}
        {marks.map((mark, index) => {
          const x = valueToX(mark.value);
          const color = mark.color || "#ef4444";
          const size = mark.size === "lg" ? 8 : mark.size === "sm" ? 4 : 6;

          return (
            <React.Fragment key={`mark-${index}`}>
              <Circle
                cx={x}
                cy={lineY}
                r={size}
                fill={color}
                stroke={color}
                strokeWidth="2"
              />
              {mark.label && (
                <SvgText
                  x={x}
                  y={lineY - 15}
                  textAnchor="middle"
                  fontSize="12"
                  fill={color}
                  fontWeight="600"
                >
                  {mark.label}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
