/**
 * VictoryStep - End of lab summary screen
 * 
 * Shows race results, "what helped" based on tuning choices,
 * suggestions for replay, and fun facts with celebratory visuals.
 */

import { useMemo } from "react";
import { ArrowRight, Lightbulb, RotateCcw, Trophy, Zap, Target, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import type { VehicleStats, StatAdjustments } from "./schema";
import { VEHICLE_ARCHETYPES, SPEED_FACTS, type VehicleArchetype } from "./data";
import { getWhatHelped, getReplaySuggestions } from "./utils";

export interface VictoryStepProps {
  vehicle: VehicleArchetype;
  stats: VehicleStats;
  statAdjustments: StatAdjustments;
  bestTime: number | null;
  onPlayAgain: () => void;
  onLeave: () => void;
  onComplete: () => void;
}

export function VictoryStep({
  vehicle,
  stats,
  statAdjustments,
  bestTime,
  onPlayAgain,
  onLeave,
  onComplete,
}: VictoryStepProps) {
  const whatHelped = useMemo(() => {
    const helps = getWhatHelped(statAdjustments, stats);
    
    if (vehicle.baseStats.handling > 80) {
      helps.push(`${vehicle.name}'s natural handling helped in corners!`);
    }
    
    return helps.slice(0, 3);
  }, [statAdjustments, stats, vehicle]);

  const suggestions = useMemo(() => {
    const suggs = getReplaySuggestions(stats);
    
    const otherVehicle = VEHICLE_ARCHETYPES.find((v) => v.id !== vehicle.id);
    if (otherVehicle) {
      suggs.push(`Race with the ${otherVehicle.name} next time!`);
    }
    
    return suggs.slice(0, 2);
  }, [stats, vehicle]);

  const randomFact = useMemo(() => {
    return SPEED_FACTS[Math.floor(Math.random() * SPEED_FACTS.length)];
  }, []);

  return (
    <div className="min-h-[600px] relative overflow-hidden">
      {/* Celebratory background */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-50 via-white to-orange-50" />
      
      {/* Confetti particles */}
      {Array.from({ length: 20 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: `${10 + Math.random() * 80}%`,
            backgroundColor: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6'][i % 5],
          }}
          initial={{ y: -20, opacity: 0 }}
          animate={{ 
            y: [0, 600], 
            opacity: [1, 1, 0],
            rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)],
          }}
          transition={{ 
            duration: 3 + Math.random() * 2, 
            delay: Math.random() * 2,
            repeat: Infinity,
            ease: "linear"
          }}
        />
      ))}

      {/* Main content */}
      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-16 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
        {/* Trophy and title */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
          className="mb-4"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full shadow-lg mb-3">
            <Trophy className="w-10 h-10 text-white" />
          </div>
        </motion.div>
        
        <motion.h2 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-bold text-gray-900 mb-1"
        >
          Victory Lap!
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-gray-600 mb-4"
        >
          Great racing with your <span className="font-bold text-amber-600">{vehicle.name}</span>!
        </motion.p>
        
        {/* Best time display */}
        {bestTime && (
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5, type: "spring" }}
            className="inline-block mb-6"
          >
            <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-1 shadow-lg">
              <div className="bg-white rounded-xl px-8 py-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Your Best Time</p>
                <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">
                  {bestTime.toFixed(2)}s
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Info cards grid */}
        <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* What Made You Fast */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-xl p-5 border-2 border-green-200 shadow-sm text-left"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="font-bold text-green-800">What Made You Fast</h3>
            </div>
            <ul className="space-y-2">
              {whatHelped.map((help, i) => (
                <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  {help}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Try Next Time */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white rounded-xl p-5 border-2 border-blue-200 shadow-sm text-left"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="font-bold text-blue-800">Try Next Time</h3>
            </div>
            <ul className="space-y-2">
              {suggestions.map((sugg, i) => (
                <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                  <ArrowRight className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  {sugg}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Fun fact */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="max-w-md mx-auto bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200 mb-6"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Lightbulb className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-sm text-amber-800 text-left">
              <span className="font-bold">Fun Fact:</span> {randomFact}
            </p>
          </div>
        </motion.div>

        {/* Action buttons */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="flex flex-wrap justify-center gap-3"
        >
          <button 
            onClick={onPlayAgain}
            className="flex items-center gap-2 px-5 py-3 bg-white border-2 border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <RotateCcw className="w-5 h-5" />
            Play Again
          </button>
          <button 
            onClick={onComplete}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-500 rounded-xl font-bold text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
          >
            Take the Quiz!
            <ArrowRight className="w-5 h-5" />
          </button>
          <button 
            onClick={onLeave}
            className="flex items-center gap-2 px-5 py-3 text-gray-500 hover:text-gray-700 font-medium transition-all"
          >
            Leave Lab
          </button>
        </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
