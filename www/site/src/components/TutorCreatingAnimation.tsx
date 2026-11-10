import { useEffect, useState } from "react";

import { motion } from "framer-motion";

interface TutorCreatingAnimationProps {
  onComplete: () => void;
}

// Animated ellipsis component
function AnimatedEllipsis() {
  return (
    <span className="inline-flex w-6">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
}

// ============================================
// Orbiting Dots Animation
// ============================================

function OrbitingDotsAnimation({ isComplete }: { isComplete?: boolean }) {
  const [showCheck, setShowCheck] = useState(false);

  // Delay showing checkmark until dots have stopped
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => setShowCheck(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowCheck(false);
    }
  }, [isComplete]);

  // Outer ring dots - 4 dots at 0°, 90°, 180°, 270°
  const outerDots = [
    { angle: 0, color: "#3b82f6" },
    { angle: 90, color: "#f59e0b" },
    { angle: 180, color: "#8b5cf6" },
    { angle: 270, color: "#ef4444" },
  ];

  // Inner ring dots - 3 dots at 120° intervals
  const innerDots = [
    { angle: 0, color: "#00a071" },
    { angle: 120, color: "#06b6d4" },
    { angle: 240, color: "#ec4899" },
  ];

  return (
    <div className="relative w-full h-full">
      {/* Center spinner / checkmark */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Spinner - fades out when complete */}
        <motion.div
          className="absolute w-20 h-20 rounded-full border-4 border-primary-200 border-t-primary-500"
          animate={{
            rotate: isComplete ? 720 : [0, 360],
            opacity: isComplete ? 0 : 1,
            scale: isComplete ? 0.8 : 1,
          }}
          transition={{
            rotate: isComplete
              ? { duration: 0.6, ease: "easeOut" }
              : { duration: 1, repeat: Infinity, ease: "linear" },
            opacity: { duration: 0.3, delay: isComplete ? 0.5 : 0 },
            scale: { duration: 0.3, delay: isComplete ? 0.5 : 0 },
          }}
        />

        {/* Checkmark circle - appears when complete */}
        <motion.div
          className="absolute w-20 h-20 rounded-full bg-primary-500 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{
            opacity: showCheck ? 1 : 0,
            scale: showCheck ? 1 : 0.5,
          }}
          transition={{
            duration: 0.4,
            type: "spring",
            bounce: 0.4,
          }}
        >
          {/* Animated checkmark SVG */}
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <motion.path
              d="M10 20 L17 27 L30 13"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: showCheck ? 1 : 0 }}
              transition={{
                duration: 0.4,
                delay: showCheck ? 0.2 : 0,
                ease: "easeOut",
              }}
            />
          </svg>
        </motion.div>
      </div>

      {/* Orbiting dots - outer ring */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="relative w-full h-full"
          animate={{
            rotate: isComplete ? 360 : [0, 360],
          }}
          transition={
            isComplete
              ? { duration: 1.2, ease: [0.32, 0, 0.67, 0] } // Custom ease-out curve that slows to stop
              : { duration: 8, repeat: Infinity, ease: "linear" }
          }
        >
          {outerDots.map((dot, i) => {
            const radians = (dot.angle * Math.PI) / 180;
            const x = Math.cos(radians) * 70;
            const y = Math.sin(radians) * 70;
            return (
              <motion.div
                key={i}
                className="absolute w-3.5 h-3.5 rounded-full shadow-lg"
                style={{
                  backgroundColor: dot.color,
                  left: "50%",
                  top: "50%",
                  marginLeft: -7,
                  marginTop: -7,
                  x,
                  y,
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: isComplete ? 0 : 1,
                  scale: isComplete ? 0 : 1,
                }}
                transition={{
                  opacity: {
                    duration: 0.3,
                    delay: isComplete ? 0.8 + i * 0.05 : i * 0.1,
                  },
                  scale: {
                    duration: 0.3,
                    delay: isComplete ? 0.8 + i * 0.05 : i * 0.1,
                  },
                }}
              />
            );
          })}
        </motion.div>
      </div>

      {/* Orbiting dots - inner ring (slower, opposite feel) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="relative w-full h-full"
          animate={{
            rotate: isComplete ? -240 : [0, -360],
          }}
          transition={
            isComplete
              ? { duration: 1.2, ease: [0.32, 0, 0.67, 0] }
              : { duration: 6, repeat: Infinity, ease: "linear" }
          }
        >
          {innerDots.map((dot, i) => {
            const radians = (dot.angle * Math.PI) / 180;
            const x = Math.cos(radians) * 45;
            const y = Math.sin(radians) * 45;
            return (
              <motion.div
                key={i}
                className="absolute w-2.5 h-2.5 rounded-full shadow-lg"
                style={{
                  backgroundColor: dot.color,
                  left: "50%",
                  top: "50%",
                  marginLeft: -5,
                  marginTop: -5,
                  x,
                  y,
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: isComplete ? 0 : 1,
                  scale: isComplete ? 0 : 1,
                }}
                transition={{
                  opacity: {
                    duration: 0.3,
                    delay: isComplete ? 0.8 + i * 0.05 : 0.3 + i * 0.1,
                  },
                  scale: {
                    duration: 0.3,
                    delay: isComplete ? 0.8 + i * 0.05 : 0.3 + i * 0.1,
                  },
                }}
              />
            );
          })}
        </motion.div>
      </div>

      {/* Outer ring */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: isComplete ? 0 : 1,
          scale: isComplete ? 0.9 : 1,
        }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-44 h-44 rounded-full border-2 border-dashed border-primary-200" />
      </motion.div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function TutorCreatingAnimation({
  onComplete,
}: TutorCreatingAnimationProps) {
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);

  // Mark animation as complete (triggers slowdown)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimationComplete(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  // Auto-transition after checkmark is shown
  useEffect(() => {
    if (isAnimationComplete) {
      const timer = setTimeout(() => {
        onComplete();
      }, 2000); // Wait for checkmark to draw, then transition
      return () => clearTimeout(timer);
    }
  }, [isAnimationComplete, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center">
      {/* Animation Container */}
      <div className="relative w-48 h-48 sm:w-56 sm:h-56">
        <OrbitingDotsAnimation isComplete={isAnimationComplete} />
      </div>

      {/* Progress text */}
      <div className="text-center pt-8">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="text-2xl sm:text-3xl font-serif text-neutral-900"
        >
          Creating your tutor
          <AnimatedEllipsis />
        </motion.h2>
      </div>
    </div>
  );
}
