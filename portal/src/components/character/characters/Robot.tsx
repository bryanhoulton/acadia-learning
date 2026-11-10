import { motion, AnimatePresence } from "motion/react";
import { CharacterState } from "../types";

interface RobotProps {
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

const configs = {
  idle: {
    screenColor: "#1e293b",
    accentColor: "#60a5fa",
    eyeBrightness: 0.8,
    antennaActive: false,
  },
  thinking: {
    screenColor: "#1e1b4b",
    accentColor: "#a78bfa",
    eyeBrightness: 1,
    antennaActive: true,
  },
  talking: {
    screenColor: "#1e293b",
    accentColor: "#60a5fa",
    eyeBrightness: 1,
    antennaActive: false,
  },
  listening: {
    screenColor: "#052e16",
    accentColor: "#4ade80",
    eyeBrightness: 1,
    antennaActive: true,
  },
};

// Pixel size for the face grid
const PX = 3;

// Pixel art eye patterns for different states
const getEyePattern = (state: CharacterState): boolean[][] => {
  // Each pattern is a 4x5 grid (width x height)
  switch (state) {
    case "listening":
      // Wide eyes - taller
      return [
        [true, true, true, true],
        [true, true, true, true],
        [true, true, true, true],
        [true, true, true, true],
        [true, true, true, true],
      ];
    case "thinking":
      // Eyes looking up
      return [
        [true, true, true, true],
        [true, true, true, true],
        [false, false, false, false],
        [false, false, false, false],
        [false, false, false, false],
      ];
    default:
      // Normal eyes
      return [
        [false, true, true, false],
        [true, true, true, true],
        [true, true, true, true],
        [true, true, true, true],
        [false, true, true, false],
      ];
  }
};

// Pixel art mouth patterns
const getMouthPattern = (state: CharacterState, audioLevel: number): boolean[][] => {
  // 8 pixels wide, variable height
  if (state === "talking") {
    const level = Math.max(0, Math.min(1, audioLevel));
    if (level > 0.6) {
      // Wide open
      return [
        [false, true, true, true, true, true, true, false],
        [true, true, true, true, true, true, true, true],
        [true, true, true, true, true, true, true, true],
        [false, true, true, true, true, true, true, false],
      ];
    } else if (level > 0.3) {
      // Medium open
      return [
        [false, true, true, true, true, true, true, false],
        [true, true, true, true, true, true, true, true],
        [false, true, true, true, true, true, true, false],
      ];
    } else {
      // Slightly open
      return [
        [false, true, true, true, true, true, true, false],
        [false, false, true, true, true, true, false, false],
      ];
    }
  }
  
  if (state === "listening") {
    // Small smile - attentive
    return [
      [true, false, false, false, false, false, false, true],
      [false, true, true, true, true, true, true, false],
    ];
  }
  
  if (state === "thinking") {
    // Flat line - concentrating
    return [
      [false, true, true, true, true, true, true, false],
    ];
  }
  
  // Idle - neutral happy
  return [
    [false, true, true, true, true, true, true, false],
    [false, false, true, true, true, true, false, false],
  ];
};

// Render a pixel grid
function PixelGrid({ 
  pattern, 
  startX, 
  startY, 
  color, 
  pixelSize = PX 
}: { 
  pattern: boolean[][];
  startX: number;
  startY: number;
  color: string;
  pixelSize?: number;
}) {
  const pixels: { x: number; y: number }[] = [];
  
  pattern.forEach((row, rowIndex) => {
    row.forEach((filled, colIndex) => {
      if (filled) {
        pixels.push({
          x: startX + colIndex * pixelSize,
          y: startY + rowIndex * pixelSize,
        });
      }
    });
  });

  return (
    <>
      {pixels.map((pixel, i) => (
        <rect
          key={i}
          x={pixel.x}
          y={pixel.y}
          width={pixelSize}
          height={pixelSize}
          fill={color}
        />
      ))}
    </>
  );
}

export function Robot({ state, audioLevel }: RobotProps) {
  const config = configs[state];
  const eyePattern = getEyePattern(state);
  const mouthPattern = getMouthPattern(state, audioLevel);

  return (
    <g>
      <defs>
        <filter id="robot-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Main body group */}
      <motion.g
        animate={{
          y: state === "idle" ? [0, -2, 0] 
            : state === "listening" ? 1 
            : 0,
        }}
        transition={
          state === "idle"
            ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
            : smoothTransition
        }
        style={{ originX: "50px", originY: "50px" }}
      >
        {/* Antenna */}
        <line x1="50" y1="20" x2="50" y2="8" stroke="#64748b" strokeWidth="3" strokeLinecap="round" />
        <motion.circle
          cx="50"
          cy="6"
          r="4"
          fill={config.accentColor}
          filter={config.antennaActive ? "url(#robot-glow)" : undefined}
          animate={{
            fill: config.accentColor,
            scale: config.antennaActive ? [1, 1.4, 1] : 1,
            opacity: config.antennaActive ? [0.7, 1, 0.7] : 1,
          }}
          transition={
            config.antennaActive
              ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
              : smoothTransition
          }
        />

        {/* Head - main housing */}
        <rect x="22" y="18" width="56" height="48" rx="6" fill="#64748b" stroke="#475569" strokeWidth="2" />

        {/* Screen bezel */}
        <rect x="26" y="22" width="48" height="40" rx="3" fill="#334155" />

        {/* Screen */}
        <motion.rect
          x="28"
          y="24"
          width="44"
          height="36"
          rx="2"
          fill={config.screenColor}
          animate={{ fill: config.screenColor }}
          transition={smoothTransition}
        />

        {/* Pixel face */}
        <motion.g
          filter="url(#robot-glow)"
          animate={{ opacity: config.eyeBrightness }}
          transition={smoothTransition}
        >
          {/* Left eye */}
          <motion.g
            animate={{
              y: state === "thinking" ? -1 : state === "listening" ? 1 : 0,
            }}
            transition={springTransition}
          >
            <PixelGrid
              pattern={eyePattern}
              startX={32}
              startY={30}
              color={config.accentColor}
            />
          </motion.g>

          {/* Right eye */}
          <motion.g
            animate={{
              y: state === "thinking" ? -1 : state === "listening" ? 1 : 0,
            }}
            transition={springTransition}
          >
            <PixelGrid
              pattern={eyePattern}
              startX={56}
              startY={30}
              color={config.accentColor}
            />
          </motion.g>

          {/* Mouth */}
          <PixelGrid
            pattern={mouthPattern}
            startX={38}
            startY={50}
            color={config.accentColor}
          />
        </motion.g>

        {/* Side panels */}
        <rect x="14" y="32" width="6" height="20" rx="2" fill="#64748b" stroke="#475569" strokeWidth="1" />
        <rect x="80" y="32" width="6" height="20" rx="2" fill="#64748b" stroke="#475569" strokeWidth="1" />

        {/* Side panel lights - active when listening */}
        <AnimatePresence>
          {state === "listening" && (
            <>
              <motion.rect
                x="15" y="35" width="4" height="4"
                fill={config.accentColor}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.rect
                x="15" y="42" width="4" height="4"
                fill={config.accentColor}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
              />
              <motion.rect
                x="81" y="35" width="4" height="4"
                fill={config.accentColor}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.rect
                x="81" y="42" width="4" height="4"
                fill={config.accentColor}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
              />
            </>
          )}
        </AnimatePresence>

        {/* Bolts */}
        <circle cx="26" cy="43" r="2" fill="#475569" />
        <circle cx="74" cy="43" r="2" fill="#475569" />

        {/* Body/chest */}
        <rect x="32" y="68" width="36" height="22" rx="4" fill="#64748b" stroke="#475569" strokeWidth="2" />

        {/* Chest pixel light */}
        <motion.g>
          <rect x="46" y="76" width={PX} height={PX} fill={config.accentColor} />
          <rect x={46 + PX} y="76" width={PX} height={PX} fill={config.accentColor} />
          <rect x="46" y={76 + PX} width={PX} height={PX} fill={config.accentColor} />
          <rect x={46 + PX} y={76 + PX} width={PX} height={PX} fill={config.accentColor} />
        </motion.g>
      </motion.g>

      {/* Thinking indicator - pixel gears */}
      <AnimatePresence>
        {state === "thinking" && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={smoothTransition}
          >
            <motion.g
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              style={{ originX: "88px", originY: "18px" }}
            >
              <text x="82" y="22" fontSize="14" fill={config.accentColor}>⚙</text>
            </motion.g>
            <motion.g
              animate={{ rotate: -360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              style={{ originX: "96px", originY: "28px" }}
            >
              <text x="92" y="31" fontSize="10" fill={config.accentColor}>⚙</text>
            </motion.g>
          </motion.g>
        )}
      </AnimatePresence>

    </g>
  );
}
