import {
  useEffect,
  useRef,
} from 'react';

import {
  Expression,
  GraphingCalculator,
} from 'desmos-react';
import { motion } from 'framer-motion';

import type { GraphBlock as GraphBlockType } from '../playground/canvas/schema';
import { CanvasBlockProps } from './';
import { BlockMotionProps } from './motion';

export function GraphBlock({ data }: CanvasBlockProps<GraphBlockType>) {
  const graphingCalculatorRef = useRef<Desmos.Calculator>(null);

  useEffect(() => {
    if (graphingCalculatorRef.current) {
      graphingCalculatorRef.current.setMathBounds({
        left: data.viewport_left,
        right: data.viewport_right,
        top: data.viewport_top,
        bottom: data.viewport_bottom,
      });
    }
  }, [data]);

  return (
    <motion.div
      className="w-full bg-white rounded-lg border border-gray-200 overflow-hidden"
      {...BlockMotionProps}
    >
      <GraphingCalculator
        attributes={{
          className: "calculator",
          style: {
            width: "100%",
            height: "400px",
          },
        }}
        ref={graphingCalculatorRef}
        fontSize={18}
        keypad={false}
        border={false}
        expressions={false}
      >
        {data.equations?.map((equation, index) => (
          <Expression
            key={index}
            id={`equation-${index}`}
            latex={equation.equation}
            color={equation.color}
          />
        ))}
        {data.points?.map((point, index) => (
          <Point
            key={index}
            x={point.x}
            y={point.y}
            color={point.color}
            label={point.label}
          />
        ))}
      </GraphingCalculator>
    </motion.div>
  );
}

function Point({
  x,
  y,
  color,
  label,
}: {
  x: number;
  y: number;
  color: string;
  label?: string | null;
}) {
  return (
    <Expression
      id={`point-${x}-${y}`}
      latex={`(${x},${y})`}
      label={label || `(${x},${y})`}
      showLabel
      color={color}
    />
  );
}
