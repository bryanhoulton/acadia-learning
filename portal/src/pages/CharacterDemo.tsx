import { useState, useEffect } from "react";
import { Character, CharacterState, CharacterVariant } from "../components/character";
import { Button } from "slate-ui";
import { motion } from "motion/react";

const VARIANTS: { id: CharacterVariant; label: string }[] = [
  { id: "blob", label: "Blob" },
  { id: "robot", label: "Robot" },
  { id: "dino", label: "Dino" },
];

const STATES: { id: CharacterState; label: string; description: string }[] = [
  { id: "idle", label: "Idle", description: "Default resting state with gentle breathing animation" },
  { id: "thinking", label: "Thinking", description: "Looking thoughtful with thought bubbles" },
  { id: "talking", label: "Talking", description: "Mouth syncs to audio level" },
  { id: "listening", label: "Listening", description: "Attentive posture with wider eyes" },
];

export function CharacterDemo() {
  const [currentState, setCurrentState] = useState<CharacterState>("idle");
  const [currentVariant, setCurrentVariant] = useState<CharacterVariant>("blob");
  const [characterSize, setCharacterSize] = useState(200);
  const [audioLevel, setAudioLevel] = useState(0);
  const [simulateAudio, setSimulateAudio] = useState(false);

  // Simulate audio levels when enabled
  useEffect(() => {
    if (!simulateAudio || currentState !== "talking") {
      setAudioLevel(0);
      return;
    }

    const interval = setInterval(() => {
      // Simulate speech-like audio patterns
      const base = Math.random() * 0.5;
      const burst = Math.random() > 0.7 ? Math.random() * 0.5 : 0;
      setAudioLevel(Math.min(1, base + burst));
    }, 80);

    return () => clearInterval(interval);
  }, [simulateAudio, currentState]);

  const currentStateInfo = STATES.find((s) => s.id === currentState);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-white mb-4">
            Character Animation Demo
          </h1>
          <p className="text-slate-400 text-lg">
            Click on different states to see smooth transitions between animations
          </p>
        </motion.div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Character display */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800/50 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px] border border-slate-700"
          >
            <Character state={currentState} variant={currentVariant} size={characterSize} audioLevel={audioLevel} />
            
            <motion.div
              key={currentState}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 text-center"
            >
              <span className="text-2xl font-semibold text-white capitalize">
                {currentState}
              </span>
              <p className="text-slate-400 mt-2 text-sm max-w-xs">
                {currentStateInfo?.description}
              </p>
            </motion.div>
          </motion.div>

          {/* Controls */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            {/* Variant selector */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4">
                Character Type
              </h2>
              <div className="flex gap-3">
                {VARIANTS.map((variant) => (
                  <motion.button
                    key={variant.id}
                    onClick={() => setCurrentVariant(variant.id)}
                    className={`
                      flex-1 px-4 py-3 rounded-xl font-medium transition-all
                      ${
                        currentVariant === variant.id
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                          : "bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white"
                      }
                    `}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {variant.label}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* State buttons */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4">
                Character States
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {STATES.map((state) => (
                  <motion.button
                    key={state.id}
                    onClick={() => setCurrentState(state.id)}
                    className={`
                      px-4 py-3 rounded-xl font-medium text-left transition-all
                      ${
                        currentState === state.id
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                          : "bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white"
                      }
                    `}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {state.label}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Size control */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4">
                Character Size
              </h2>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="100"
                  max="400"
                  value={characterSize}
                  onChange={(e) => setCharacterSize(Number(e.target.value))}
                  className="flex-1 accent-indigo-600"
                />
                <span className="text-slate-400 w-16 text-right">
                  {characterSize}px
                </span>
              </div>
            </div>

            {/* Audio level control */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4">
                Audio Level (for Talking)
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Simulate Audio</span>
                  <button
                    onClick={() => {
                      const newValue = !simulateAudio;
                      setSimulateAudio(newValue);
                      if (newValue) {
                        setCurrentState("talking");
                      }
                    }}
                    className={`
                      w-12 h-6 rounded-full transition-colors relative
                      ${simulateAudio ? "bg-indigo-600" : "bg-slate-600"}
                    `}
                  >
                    <span
                      className={`
                        absolute top-1 w-4 h-4 rounded-full bg-white transition-transform
                        ${simulateAudio ? "left-7" : "left-1"}
                      `}
                    />
                  </button>
                </div>
                {!simulateAudio && (
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={audioLevel * 100}
                      onChange={(e) => setAudioLevel(Number(e.target.value) / 100)}
                      className="flex-1 accent-indigo-600"
                    />
                    <span className="text-slate-400 w-12 text-right">
                      {Math.round(audioLevel * 100)}%
                    </span>
                  </div>
                )}
                {simulateAudio && (
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-indigo-500"
                      animate={{ width: `${audioLevel * 100}%` }}
                      transition={{ duration: 0.05 }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Quick transitions */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4">
                Test Transitions
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                Click these to see common state transitions:
              </p>
              <div className="space-y-2">
                <Button
                  variant="subtle"
                  className="w-full justify-start"
                  onClick={() => {
                    setCurrentState("listening");
                    setTimeout(() => setCurrentState("thinking"), 1500);
                    setTimeout(() => setCurrentState("talking"), 3000);
                  }}
                >
                  Listen → Think → Talk
                </Button>
                <Button
                  variant="subtle"
                  className="w-full justify-start"
                  onClick={() => {
                    setCurrentState("idle");
                    setTimeout(() => setCurrentState("listening"), 1500);
                    setTimeout(() => setCurrentState("talking"), 3000);
                  }}
                >
                  Idle → Listen → Talk
                </Button>
                <Button
                  variant="subtle"
                  className="w-full justify-start"
                  onClick={() => {
                    setCurrentState("idle");
                    setTimeout(() => setCurrentState("thinking"), 1500);
                    setTimeout(() => setCurrentState("talking"), 3000);
                  }}
                >
                  Idle → Think → Talk
                </Button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* All variants preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-12 bg-slate-800/50 rounded-2xl p-8 border border-slate-700"
        >
          <h2 className="text-xl font-semibold text-white mb-6 text-center">
            All Characters
          </h2>
          <div className="flex flex-wrap justify-center gap-8">
            {VARIANTS.map((variant) => (
              <motion.div
                key={variant.id}
                className={`
                  flex flex-col items-center p-4 rounded-xl cursor-pointer transition-all
                  ${
                    currentVariant === variant.id
                      ? "bg-indigo-600/20 ring-2 ring-indigo-500"
                      : "bg-slate-700/30 hover:bg-slate-700/50"
                  }
                `}
                onClick={() => setCurrentVariant(variant.id)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Character state={currentState} variant={variant.id} size={100} audioLevel={audioLevel} />
                <span className="text-sm text-slate-300 mt-2 capitalize">
                  {variant.label}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
