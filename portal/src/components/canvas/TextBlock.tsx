import {
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { motion } from 'framer-motion';

import { TextBlock as TextBlockType } from '../playground/canvas/schema';
import { CanvasBlockProps } from './';
import MarkdownRenderer from './Markdown';
import { BlockMotionProps } from './motion';

const SIZE_MAP: Record<string, number> = {
  small: 1,
  medium: 2,
  large: 5,
};

function parseSize(size: number | string | undefined): number {
  if (size === undefined) return 1;
  if (typeof size === "number") return size;
  return SIZE_MAP[size] ?? 1;
}

export function TextBlock({ data }: CanvasBlockProps<TextBlockType>) {
  // Handle both 'text' and 'value' properties for backwards compatibility
  const rawText =
    (data as { text?: string; value?: string }).value ?? data.text ?? "";
  const content = rawText.split("\\((").join("$$").split(")\\)").join("$$");
  const size = parseSize((data as { size?: number | string }).size);

  const contentRef = useRef<HTMLDivElement>(null);
  const [scaledHeight, setScaledHeight] = useState<number | undefined>(
    undefined
  );

  useLayoutEffect(() => {
    if (contentRef.current && size > 1) {
      const height = contentRef.current.offsetHeight;
      setScaledHeight(height * size);
    } else {
      setScaledHeight(undefined);
    }
  }, [content, size]);

  return (
    <motion.div className="max-w-full w-full" {...BlockMotionProps}>
      <div
        style={{
          height: scaledHeight,
          position: "relative",
        }}
      >
        <div
          ref={contentRef}
          className="break-words text-center"
          style={{
            transform: `scale(${size})`,
            transformOrigin: "center top",
            width: size > 1 ? `${100 / size}%` : undefined,
            marginLeft: size > 1 ? "auto" : undefined,
            marginRight: size > 1 ? "auto" : undefined,
          }}
        >
          <MarkdownRenderer content={content} />
        </div>
      </div>
    </motion.div>
  );
}
