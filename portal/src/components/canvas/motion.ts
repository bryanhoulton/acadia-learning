import type { MotionProps } from 'framer-motion';

export const BlockMotionProps: MotionProps = {
  layout: true,
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: {
    layout: { duration: 0.3, ease: "easeInOut" },
    opacity: { duration: 0.2 },
    scale: { duration: 0.2 },
  },
};
