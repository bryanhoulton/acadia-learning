import { motion, AnimatePresence } from "motion/react";
import { CharacterState } from "../types";

interface BlobProps {
  state: CharacterState;
  audioLevel: number;
}

const springTransition = {
  type: "spring" as const,
  stiffness: 260,
  damping: 20,
};

const smoothTransition = {
  duration: 0.5,
  ease: [0.4, 0, 0.2, 1] as const,
};

// Design philosophy for each state:
// idle: peaceful presence, soft breathing, "I'm here with you"
// thinking: internal focus, eyes up, contemplative, "working on it"
// talking: engaged, expressive, energy outward, "sharing with you"
// listening: wide-eyed attention, leaning in, "I hear you"

const configs = {
  idle: {
    bodyColor: "#818cf8",
    glowColor: "#c7d2fe",
    glowIntensity: 0.4,
    eyeScale: 1,
    eyeY: 0,
    pupilX: 0,
    pupilY: 0,
    pupilSize: 5,
  },
  thinking: {
    bodyColor: "#a78bfa",
    glowColor: "#ddd6fe",
    glowIntensity: 0.6,
    eyeScale: 0.9,
    eyeY: -2,
    pupilX: -2,
    pupilY: -2, // Looking up and to the side - classic "thinking"
    pupilSize: 4,
  },
  talking: {
    bodyColor: "#818cf8",
    glowColor: "#c7d2fe",
    glowIntensity: 0.5,
    eyeScale: 1.05,
    eyeY: 0,
    pupilX: 0,
    pupilY: 0, // Direct eye contact while speaking
    pupilSize: 5,
  },
  listening: {
    bodyColor: "#34d399",
    glowColor: "#a7f3d0",
    glowIntensity: 0.5,
    eyeScale: 1.2, // Wide, attentive eyes
    eyeY: 1,
    pupilX: 0,
    pupilY: 1, // Slightly looking at user, engaged
    pupilSize: 6, // Dilated pupils = interest
  },
};

function getMouthPath(state: CharacterState, audioLevel: number): string {
  if (state === "talking") {
    // Mouth opens with audio, creating speech feeling
    const level = Math.max(0, Math.min(1, audioLevel));
    const openness = 64 + level * 12;
    return `M 42 62 Q 50 ${openness} 58 62`;
  }
  if (state === "listening") {
    // Soft, slightly open - receptive, encouraging
    return "M 42 63 Q 50 68 58 63";
  }
  if (state === "thinking") {
    // Slight purse - concentration
    return "M 44 64 Q 50 66 56 64";
  }
  // Idle: soft, content smile
  return "M 42 62 Q 50 69 58 62";
}

export function Blob({ state, audioLevel }: BlobProps) {
  const config = configs[state];

  return (
    <g>
      <defs>
        <filter id="blob-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Main body group */}
      <motion.g
        animate={{
          // Idle: gentle breathing bob
          // Thinking: slight lean back, internal focus
          // Talking: subtle energy, alive
          // Listening: lean forward slightly, attentive
          y: state === "idle" ? [0, -4, 0] 
            : state === "listening" ? 2 
            : state === "thinking" ? -2 
            : 0,
          scale: state === "listening" ? 1.02 : 1,
        }}
        transition={
          state === "idle"
            ? { duration: 3, repeat: Infinity, ease: "easeInOut" }
            : smoothTransition
        }
        style={{ originX: "50px", originY: "50px" }}
      >
        {/* Glow layer - warmth indicator */}
        <motion.ellipse
          cx="50"
          cy="52"
          rx="38"
          ry="36"
          fill={config.glowColor}
          filter="url(#blob-glow)"
          animate={{ 
            fill: config.glowColor,
            opacity: config.glowIntensity,
          }}
          transition={smoothTransition}
        />

        {/* Main body */}
        <motion.ellipse
          cx="50"
          cy="52"
          rx="35"
          ry="33"
          fill={config.bodyColor}
          animate={{ fill: config.bodyColor }}
          transition={smoothTransition}
        />

        {/* Highlight - gives dimension and life */}
        <ellipse cx="40" cy="38" rx="14" ry="10" fill="white" opacity={0.25} />

        {/* Eyes container */}
        <motion.g
          animate={{
            scaleY: config.eyeScale,
            y: config.eyeY,
          }}
          transition={springTransition}
          style={{ originY: "48px" }}
        >
          {/* Left eye */}
          <motion.ellipse
            cx="38"
            cy="48"
            rx="9"
            ry="10"
            fill="white"
          />
          <motion.circle
            cx={38 + config.pupilX}
            cy={48 + config.pupilY}
            r={config.pupilSize}
            fill="#1e1b4b"
            animate={{ 
              cx: 38 + config.pupilX,
              cy: 48 + config.pupilY,
              r: config.pupilSize,
            }}
            transition={springTransition}
          />
          {/* Eye shine - life indicator */}
          <motion.circle
            cx={40 + config.pupilX * 0.5}
            cy={46 + config.pupilY * 0.5}
            r="2.5"
            fill="white"
            animate={{
              cx: 40 + config.pupilX * 0.5,
              cy: 46 + config.pupilY * 0.5,
            }}
            transition={springTransition}
          />

          {/* Right eye */}
          <motion.ellipse
            cx="62"
            cy="48"
            rx="9"
            ry="10"
            fill="white"
          />
          <motion.circle
            cx={62 + config.pupilX}
            cy={48 + config.pupilY}
            r={config.pupilSize}
            fill="#1e1b4b"
            animate={{ 
              cx: 62 + config.pupilX,
              cy: 48 + config.pupilY,
              r: config.pupilSize,
            }}
            transition={springTransition}
          />
          <motion.circle
            cx={64 + config.pupilX * 0.5}
            cy={46 + config.pupilY * 0.5}
            r="2.5"
            fill="white"
            animate={{
              cx: 64 + config.pupilX * 0.5,
              cy: 46 + config.pupilY * 0.5,
            }}
            transition={springTransition}
          />
        </motion.g>

        {/* Mouth */}
        <motion.path
          d={getMouthPath(state, audioLevel)}
          stroke="#1e1b4b"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill={state === "talking" && audioLevel > 0.3 ? "#1e1b4b" : "none"}
          animate={{ d: getMouthPath(state, audioLevel) }}
          transition={{ duration: 0.1, ease: "easeOut" }}
        />

        {/* Blush - shows warmth/engagement in listening */}
        <AnimatePresence>
          {state === "listening" && (
            <>
              <motion.ellipse
                cx="26" cy="56" rx="7" ry="4" fill="#fca5a5"
                initial={{ opacity: 0 }} 
                animate={{ opacity: 0.5 }} 
                exit={{ opacity: 0 }}
                transition={smoothTransition}
              />
              <motion.ellipse
                cx="74" cy="56" rx="7" ry="4" fill="#fca5a5"
                initial={{ opacity: 0 }} 
                animate={{ opacity: 0.5 }} 
                exit={{ opacity: 0 }}
                transition={smoothTransition}
              />
            </>
          )}
        </AnimatePresence>
      </motion.g>

      {/* Thinking indicator - thought bubbles rising */}
      <AnimatePresence>
        {state === "thinking" && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={smoothTransition}
          >
            {[
              { cx: 80, cy: 30, r: 4, delay: 0 },
              { cx: 88, cy: 20, r: 5, delay: 0.2 },
              { cx: 97, cy: 10, r: 6, delay: 0.4 },
            ].map((bubble, i) => (
              <motion.circle
                key={i}
                cx={bubble.cx}
                cy={bubble.cy}
                r={bubble.r}
                fill="white"
                stroke="#e5e7eb"
                strokeWidth="1"
                animate={{
                  y: [0, -4, 0],
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  delay: bubble.delay,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.g>
        )}
      </AnimatePresence>

    </g>
  );
}
