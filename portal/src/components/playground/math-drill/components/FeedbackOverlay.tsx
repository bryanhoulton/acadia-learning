import { Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

interface FeedbackOverlayProps {
  feedback: "none" | "correct" | "incorrect";
  onAnimationComplete?: () => void;
}

export function FeedbackOverlay({
  feedback,
  onAnimationComplete,
}: FeedbackOverlayProps) {
  return (
    <AnimatePresence onExitComplete={onAnimationComplete}>
      {feedback === "correct" && (
        <motion.div
          key="correct"
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="bg-green-500 rounded-full p-6"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <Check className="w-16 h-16 text-white" strokeWidth={3} />
          </motion.div>

          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-3 h-3 rounded-full"
              style={{
                backgroundColor: ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899"][
                  i % 4
                ],
              }}
              initial={{ x: 0, y: 0, scale: 0 }}
              animate={{
                x: Math.cos((i * Math.PI * 2) / 12) * 100,
                y: Math.sin((i * Math.PI * 2) / 12) * 100,
                scale: [0, 1, 0],
              }}
              transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
            />
          ))}
        </motion.div>
      )}

      {feedback === "incorrect" && (
        <motion.div
          key="incorrect"
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="bg-red-500 rounded-full p-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1, x: [0, -10, 10, -10, 10, 0] }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              scale: { type: "spring", stiffness: 300, damping: 20 },
              x: { duration: 0.4, delay: 0.1 },
            }}
          >
            <X className="w-16 h-16 text-white" strokeWidth={3} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
