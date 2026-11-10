import {
  useEffect,
  useState,
} from 'react';

import {
  AnimatePresence,
  motion,
} from 'motion/react';

export type AgentStates =
  | "listening"
  | "thinking"
  | "speaking"
  | "waiting"
  | "away"
  | "connecting";

const faces = {
  thinking: {
    alt: "🤔",
    srcSet: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f914/512.webp",
    src: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f914/512.gif",
  },
  neutral: {
    alt: "😶",
    srcSet: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f636/512.webp",
    src: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f636/512.gif",
  },
  clouds: {
    alt: "😶‍🌫️",
    srcSet:
      "https://fonts.gstatic.com/s/e/notoemoji/latest/1f636_200d_1f32b_fe0f/512.webp",
    src: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f636_200d_1f32b_fe0f/512.gif",
  },
  sneeze: {
    alt: "🤧",
    srcSet: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f927/512.webp",
    src: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f927/512.gif",
  },
  smile: {
    alt: "🙂",
    srcSet: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f642/512.webp",
    src: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f642/512.gif",
  },
  upsideDown: {
    alt: "🙃",
    srcSet: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f643/512.webp",
    src: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f643/512.gif",
  },
  sleep: {
    alt: "😴",
    srcSet: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f634/512.webp",
    src: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f634/512.gif",
  },
  outline: {
    alt: "🫥",
    srcSet: "https://fonts.gstatic.com/s/e/notoemoji/latest/1fae5/512.webp",
    src: "https://fonts.gstatic.com/s/e/notoemoji/latest/1fae5/512.gif",
  },
  raisedEyebrow: {
    alt: "🤨",
    srcSet: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f928/512.webp",
    src: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f928/512.gif",
  },
  eye: {
    alt: "👁",
    srcSet:
      "https://fonts.gstatic.com/s/e/notoemoji/latest/1f441_fe0f/512.webp",
    src: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f441_fe0f/512.gif",
  },
} as const;
type FaceKey = keyof typeof faces;

const states: Record<
  AgentStates,
  {
    base: FaceKey[];
    expressives: FaceKey[];
  }
> = {
  thinking: {
    base: ["thinking"],
    expressives: [],
  },
  listening: {
    base: ["clouds"],
    expressives: [],
  },
  speaking: {
    base: ["smile"],
    expressives: [],
  },
  waiting: {
    base: ["clouds"],
    expressives: ["sneeze", "upsideDown"],
  },
  away: {
    base: ["sleep"],
    expressives: [],
  },
  connecting: {
    base: ["outline"],
    expressives: [],
  },
};

export function Faces({ state }: { state: AgentStates }) {
  const { base } = states[state];
  const [currentFace, setCurrentFace] = useState<FaceKey>(
    () => base[Math.floor(Math.random() * base.length)]
  );

  useEffect(() => {
    // Pick a new random base when state changes
    const currentBase = states[state].base;
    const newBase = currentBase[Math.floor(Math.random() * currentBase.length)];
    setCurrentFace(newBase);
  }, [state]);

  return (
    <AnimatePresence mode="wait">
      <motion.picture
        key={currentFace}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        <source srcSet={faces[currentFace].srcSet} type="image/webp" />
        <img
          src={faces[currentFace].src}
          alt={faces[currentFace].alt}
          width="128"
          height="128"
        />
      </motion.picture>
    </AnimatePresence>
  );
}
