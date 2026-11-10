/**
 * WelcomeStep - Introduction to the Speed Lab experience
 *
 * Introduces students to what they'll learn:
 * - How weight affects car speed (fractions/multiplication)
 * - How friction and tire selection work (decimals/fractions)
 * - Basic physics concepts in a fun, car-themed context
 */

import { ChevronRight, CircleDot, Scale, Zap } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "slate-ui";

export interface WelcomeStepProps {
  onComplete: () => void;
  onUserAction: (action: string, data?: Record<string, unknown>) => void;
}

export function WelcomeStep({ onComplete, onUserAction }: WelcomeStepProps) {
  const handleStart = () => {
    onUserAction("welcome_complete");
    onComplete();
  };

  return (
    <div className="flex-grow flex flex-col items-center justify-center px-6 py-8 max-w-3xl mx-auto">
      {/* Hero section */}
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-6xl mb-4">🏎️</div>
        <h1 className="text-4xl font-bold text-gray-800 mb-3">
          Welcome to the Speed Lab!
        </h1>
        <p className="text-xl text-gray-600">
          Today we'll learn about{" "}
          <span className="font-bold text-purple-600">fast cars</span> and use{" "}
          <span className="font-bold text-amber-600">math</span> to make them
          even faster!
        </p>
      </motion.div>

      {/* Learning objectives */}
      <motion.div
        className="w-full grid gap-4 mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-2xl p-5 border-2 border-purple-200">
          <div className="flex items-start gap-4">
            <div className="bg-purple-500 rounded-xl p-3 text-white">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-purple-800 mb-1">
                Weight & Fractions
              </h3>
              <p className="text-purple-700">
                Learn how a car's weight affects speed. A car that's{" "}
                <span className="font-bold">¾ of a ton</span> accelerates faster
                than one that's <span className="font-bold">1½ tons</span>!
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-50 to-amber-100 rounded-2xl p-5 border-2 border-amber-200">
          <div className="flex items-start gap-4">
            <div className="bg-amber-500 rounded-xl p-3 text-white">
              <CircleDot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-amber-800 mb-1">
                Friction & Tires
              </h3>
              <p className="text-amber-700">
                Discover how tires grip the road. Grip tires have{" "}
                <span className="font-bold">⅘ friction</span>, while slick tires
                only have <span className="font-bold">⅗ friction</span>!
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-2xl p-5 border-2 border-blue-200">
          <div className="flex items-start gap-4">
            <div className="bg-blue-500 rounded-xl p-3 text-white">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-blue-800 mb-1">
                Speed Test
              </h3>
              <p className="text-blue-700">
                Build your dream car and watch a simulation to see how your
                choices affect
                <span className="font-bold"> acceleration</span> and{" "}
                <span className="font-bold">top speed</span>!
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Start button */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="relative"
      >
        <Button
          size="lg"
          onClick={handleStart}
          className="text-white font-bold text-xl px-10 py-6 rounded-xl shadow-lg transition-all transform bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 hover:shadow-xl hover:scale-[1.02]"
        >
          Let's Build a Fast Car!
          <ChevronRight className="w-6 h-6 ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}
