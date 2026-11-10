import {
  useEffect,
  useState,
} from 'react';

import { cva } from 'class-variance-authority';
import {
  AnimatePresence,
  HTMLMotionProps,
  motion,
} from 'motion/react';
import { cn } from 'slate-ui';

export const ConnectionStatus = [
  "connected",
  "disconnected",
  "connecting",
] as const;
export type ConnectionStatusType = (typeof ConnectionStatus)[number];

export interface ConnectionProps extends HTMLMotionProps<"div"> {
  status: ConnectionStatusType;
}

const connectionVariants = cva(
  "flex items-center gap-2 justify-center text-muted"
);

const dotVariants = cva(
  "w-3 h-3 border rounded-full transition-colors duration-300",
  {
    variants: {
      status: {
        connected: "bg-primary-500",
        disconnected: "bg-error-500",
        connecting: "bg-warning-500",
      },
    },
  }
);

function DotDotDot({ maxLength = 3 }: { maxLength?: number }) {
  const [dots, setDots] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === maxLength) {
          return 0;
        }
        return prev + 1;
      });
    }, 300);

    return () => clearInterval(interval);
  }, [maxLength]);

  return (
    <span>
      {Array.from({ length: maxLength }, (_, index) => (
        <span
          key={index}
          className={cn(
            index < dots ? "opacity-100" : "opacity-0",
            "transition-opacity duration-100"
          )}
        >
          .
        </span>
      ))}
    </span>
  );
}

export function Connection({ className, status, ...props }: ConnectionProps) {
  if (status === "connected") {
    return null;
  }

  return (
    <motion.div
      className={cn(connectionVariants(), className)}
      {...props}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "backOut" }}
    >
      <div className={cn(dotVariants({ status }))} />
      <AnimatePresence mode="popLayout">
        <motion.span
          className="text font-medium capitalize"
          key={status}
          initial={{ opacity: 0, rotateX: -90, y: -10 }}
          animate={{ opacity: 1, rotateX: 0, y: 0 }}
          exit={{ opacity: 0, rotateX: 90, y: 10 }}
          transition={{ duration: 0.2, ease: "backOut" }}
          style={{ transformPerspective: 1000 }}
        >
          {status}
          {status === "connecting" && <DotDotDot />}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}
