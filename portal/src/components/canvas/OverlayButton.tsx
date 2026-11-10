import {
  type HTMLMotionProps,
  motion,
} from 'framer-motion';
import { cn } from 'slate-ui';

export type OverlayButtonProps = HTMLMotionProps<"button">;

export function OverlayButton({
  className,
  children,
  ...props
}: OverlayButtonProps) {
  return (
    <motion.button
      className={cn(
        "bg-white rounded-full px-3 py-2 shadow-lg border border-neutral-200",
        "flex items-center gap-2 text-sm text-neutral-600 cursor-pointer",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.1 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
