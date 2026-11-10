import {
  AnimatePresence,
  motion,
} from 'motion/react';

import {
  AgentStates,
  Faces,
} from './Faces';

type AgentAvatarProps = {
  state: AgentStates;
  volume: number;
  volumeBands: number[];
  hasLeftCall?: boolean;
};

function LeftCallNote() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="flex flex-col items-center justify-center max-w-sm text-center px-6"
    >
      <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <span className="text-3xl">👋</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Session Ended
      </h3>
      <p className="text-sm text-gray-600 leading-relaxed">
        Your tutor intentionally left the call. Usually this is due to
        inactivity or you have completed the session. Please reconnect using the
        button below to talk to them again.
      </p>
    </motion.div>
  );
}

export function AgentAvatar({
  state,
  volume,
  volumeBands,
  hasLeftCall,
}: AgentAvatarProps) {
  // Show special note when agent intentionally left
  if (hasLeftCall) {
    return (
      <div className="relative flex items-center justify-center w-[280px] h-[280px]">
        <LeftCallNote />
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center w-[280px] h-[280px]">
      {/* Solid background circle when speaking */}
      <motion.div
        className="absolute rounded-full bg-green-50"
        animate={{
          scale: volume > 0.1 ? 1 : 0,
          opacity: volume > 0.1 ? 1 : 0,
        }}
        transition={{
          duration: 0.3,
          ease: "easeOut",
        }}
        style={{
          width: "180px",
          height: "180px",
        }}
      />

      {/* Face with enhanced scaling */}
      <motion.div style={{ scale: 1 + volume * 0.4 }} className="relative z-0">
        <Faces state={state} />
      </motion.div>

      {/* Volume bars indicator - when speaking */}
      <AnimatePresence>
        {volume > 0.1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute -bottom-4 flex items-end gap-1 h-8"
          >
            {volumeBands.map((band, i) => (
              <motion.div
                key={i}
                className="w-2 bg-green-500 rounded-full"
                style={{
                  height: `${Math.max(10, band * 100)}%`,
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thinking indicator - animated dots */}
      <AnimatePresence>
        {state === "thinking" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute -bottom-6 flex items-center gap-1"
          >
            {[0, 0.15, 0.3].map((delay, i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-blue-500 rounded-full"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting badge */}
      <AnimatePresence>
        {(state === "waiting" || state === "listening") && volume <= 0.1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute -bottom-8 bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs font-medium"
          >
            {state === "listening" ? "Listening..." : "Waiting..."}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
