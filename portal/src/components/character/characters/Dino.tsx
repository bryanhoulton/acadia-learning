import { motion, AnimatePresence } from "motion/react";
import { CharacterState } from "../types";

interface DinoProps {
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

// Simple, friendly dino - round body, three spikes, tiny arms, big eye
const configs = {
  idle: {
    bodyColor: "#4ade80",
    spikeColor: "#22c55e",
    eyeScale: 1,
    pupilX: 0,
    pupilY: 0,
  },
  thinking: {
    bodyColor: "#a78bfa",
    spikeColor: "#8b5cf6",
    eyeScale: 0.9,
    pupilX: -2,
    pupilY: -3,
  },
  talking: {
    bodyColor: "#4ade80",
    spikeColor: "#22c55e",
    eyeScale: 1.05,
    pupilX: 0,
    pupilY: 0,
  },
  listening: {
    bodyColor: "#2dd4bf",
    spikeColor: "#14b8a6",
    eyeScale: 1.2,
    pupilX: 0,
    pupilY: 0,
  },
};

export function Dino({ state, audioLevel }: DinoProps) {
  const config = configs[state];

  const getMouthOpen = () => {
    if (state === "talking") {
      return Math.max(0, Math.min(1, audioLevel)) * 8;
    }
    return 0;
  };

  const mouthOpen = getMouthOpen();

  return (
    <g>
      {/* Main group */}
      <motion.g
        animate={{
          y: state === "idle" ? [0, -3, 0] : 0,
          rotate: state === "thinking" ? 5 : state === "listening" ? -3 : 0,
        }}
        transition={
          state === "idle"
            ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
            : smoothTransition
        }
        style={{ originX: "50px", originY: "50px" }}
      >
        {/* Body - simple round shape */}
        <motion.ellipse
          cx="45"
          cy="55"
          rx="30"
          ry="28"
          fill={config.bodyColor}
          animate={{ fill: config.bodyColor }}
          transition={smoothTransition}
        />

        {/* Three spikes on back */}
        <motion.g
          animate={{ 
            scaleY: state === "listening" ? 1.15 : 1,
          }}
          transition={springTransition}
          style={{ originY: "35px" }}
        >
          <motion.polygon
            points="25,35 30,18 35,35"
            fill={config.spikeColor}
            animate={{ fill: config.spikeColor }}
            transition={smoothTransition}
          />
          <motion.polygon
            points="38,30 45,10 52,30"
            fill={config.spikeColor}
            animate={{ fill: config.spikeColor }}
            transition={smoothTransition}
          />
          <motion.polygon
            points="55,35 60,20 65,35"
            fill={config.spikeColor}
            animate={{ fill: config.spikeColor }}
            transition={smoothTransition}
          />
        </motion.g>

        {/* Head bump */}
        <motion.circle
          cx="70"
          cy="45"
          r="18"
          fill={config.bodyColor}
          animate={{ fill: config.bodyColor }}
          transition={smoothTransition}
        />

        {/* Snout */}
        <motion.ellipse
          cx="85"
          cy="50"
          rx="10"
          ry="8"
          fill={config.bodyColor}
          animate={{ fill: config.bodyColor }}
          transition={smoothTransition}
        />

        {/* Nostril - simple dot */}
        <circle cx="90" cy="47" r="2" fill="#15803d" />

        {/* Eye - big and expressive */}
        <motion.g
          animate={{ scaleY: config.eyeScale }}
          transition={springTransition}
          style={{ originY: "42px" }}
        >
          <circle cx="68" cy="42" r="10" fill="white" />
          <motion.circle
            cx={68 + config.pupilX}
            cy={42 + config.pupilY}
            r="6"
            fill="#15803d"
            animate={{ 
              cx: 68 + config.pupilX,
              cy: 42 + config.pupilY,
            }}
            transition={springTransition}
          />
          <motion.circle
            cx={70 + config.pupilX * 0.3}
            cy={40 + config.pupilY * 0.3}
            r="2.5"
            fill="white"
            animate={{
              cx: 70 + config.pupilX * 0.3,
              cy: 40 + config.pupilY * 0.3,
            }}
            transition={springTransition}
          />
        </motion.g>

        {/* Mouth - simple curve */}
        <motion.path
          d={`M 78 56 Q 86 ${58 + mouthOpen} 92 55`}
          stroke="#15803d"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill={mouthOpen > 3 ? "#15803d" : "none"}
          animate={{ d: `M 78 56 Q 86 ${58 + mouthOpen} 92 55` }}
          transition={{ duration: 0.1, ease: "easeOut" }}
        />

        {/* Tiny arm - just one, simple */}
        <motion.path
          d="M 30 55 Q 22 60 24 68"
          stroke={config.bodyColor}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
          animate={{ 
            stroke: config.bodyColor,
            rotate: state === "talking" ? [0, 10, -5, 0] : 0,
          }}
          transition={
            state === "talking"
              ? { duration: 0.4, repeat: Infinity, ease: "easeInOut" }
              : smoothTransition
          }
          style={{ originX: "30px", originY: "55px" }}
        />

        {/* Feet - two simple ovals */}
        <motion.ellipse
          cx="35"
          cy="82"
          rx="12"
          ry="6"
          fill={config.bodyColor}
          animate={{ fill: config.bodyColor }}
          transition={smoothTransition}
        />
        <motion.ellipse
          cx="58"
          cy="82"
          rx="12"
          ry="6"
          fill={config.bodyColor}
          animate={{ fill: config.bodyColor }}
          transition={smoothTransition}
        />

        {/* Cheek blush for listening */}
        <AnimatePresence>
          {state === "listening" && (
            <motion.ellipse
              cx="60"
              cy="52"
              rx="5"
              ry="3"
              fill="#fca5a5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              transition={smoothTransition}
            />
          )}
        </AnimatePresence>
      </motion.g>

      {/* Thinking bubbles */}
      <AnimatePresence>
        {state === "thinking" && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={smoothTransition}
          >
            {[
              { cx: 88, cy: 28, r: 4 },
              { cx: 96, cy: 18, r: 5 },
              { cx: 105, cy: 8, r: 6 },
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
                  y: [0, -3, 0],
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.2,
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
