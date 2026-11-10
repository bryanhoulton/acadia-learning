/**
 * SimulationStep - Full-screen multi-car race simulation
 *
 * Features:
 * - Full-screen canvas with bezier curve tracks
 * - User car races against AI competitors
 * - Live leaderboard and minimap overlays
 * - Countdown sequence (3-2-1-GO!)
 * - Physics based on weight and tire friction from BuildStep
 */

import { useCallback, useEffect } from "react";

import { ArrowLeft, ChevronRight, Play, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button, cn } from "slate-ui";

import { TIRE_OPTIONS, weightToFraction } from "./data";
import type { CarConfig } from "./schema";
import { GAME_CONFIG, useGameEngine } from "./simulation";

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface SimulationStepProps {
  carConfig: CarConfig;
  vehicleName: string;
  vehicleIcon: string;
  vehicleDefaultWeight: number;
  vehicleBaseStats?: {
    topSpeed: number;
    acceleration: number;
    handling: number;
  };
  onComplete: () => void;
  onUserAction: (action: string, data?: Record<string, unknown>) => void;
  onGoBack?: () => void;
  /** If true, stays within parent container instead of going fullscreen */
  contained?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SimulationStep({
  carConfig,
  vehicleName,
  vehicleIcon,
  vehicleDefaultWeight,
  vehicleBaseStats,
  onComplete,
  onUserAction,
  onGoBack,
  contained = false,
}: SimulationStepProps) {
  // Initialize game engine
  const {
    canvasRef,
    minimapRef,
    containerRef,
    phase,
    gameState,
    countdown,
    startRace,
    resetRace,
    resetView,
    toggleFollow,
  } = useGameEngine({
    carConfig,
    vehicleName,
    vehicleIcon,
    vehicleDefaultWeight,
    vehicleBaseStats,
    trackId: "oval",
  });

  // Send race window opened event when simulation step mounts
  useEffect(() => {
    const tireInfo = TIRE_OPTIONS[carConfig.tireType];
    const totalWeight = vehicleDefaultWeight + carConfig.weightAdjustment;
    onUserAction("race_window_opened", {
      vehicleName,
      vehicleIcon,
      totalWeight,
      weightFraction: weightToFraction(totalWeight),
      tireName: tireInfo?.name,
      frictionLabel: tireInfo?.frictionLabel,
      frictionValue: tireInfo?.friction,
      carConfig,
      totalLaps: GAME_CONFIG.totalLaps,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Send race started event
  const handleStartRace = useCallback(() => {
    const tireInfo = TIRE_OPTIONS[carConfig.tireType];
    const totalWeight = vehicleDefaultWeight + carConfig.weightAdjustment;
    onUserAction("race_started", {
      vehicleName,
      vehicleIcon,
      totalWeight,
      weightFraction: weightToFraction(totalWeight),
      tireName: tireInfo?.name,
      frictionValue: tireInfo?.friction,
      carConfig,
      totalLaps: GAME_CONFIG.totalLaps,
    });
    startRace();
  }, [
    onUserAction,
    vehicleName,
    vehicleIcon,
    vehicleDefaultWeight,
    carConfig,
    startRace,
  ]);

  // Send race reset event
  const handleResetRace = useCallback(() => {
    onUserAction("race_reset", { vehicleName });
    resetRace();
  }, [onUserAction, vehicleName, resetRace]);

  // Handle continue after race
  const handleContinue = useCallback(() => {
    if (!gameState?.userCar) return;

    onUserAction("simulation_complete", {
      finalTime: gameState.userCar.finishTime,
      position: gameState.userCar.position,
      carConfig,
    });
    onComplete();
  }, [gameState, carConfig, onUserAction, onComplete]);

  // Send race finished event when race ends
  useEffect(() => {
    if (phase === "finished" && gameState?.userCar) {
      // Build full rankings with times
      const rankings = (gameState.cars || [])
        .sort((a, b) => a.position - b.position)
        .map((car) => ({
          position: car.position,
          name: car.isUser ? "Player" : car.name,
          isUser: car.isUser,
          finishTime: car.finishTime,
          color: car.color,
        }));

      onUserAction("race_finished", {
        vehicleName,
        finalTime: gameState.userCar.finishTime,
        position: gameState.userCar.position,
        totalRacers: gameState.cars?.length || 0,
        rankings,
        top3: gameState.top3,
        carConfig,
      });
    }
  }, [phase, gameState, onUserAction, vehicleName, carConfig]);

  // Get tire info for display
  const tireInfo = TIRE_OPTIONS[carConfig.tireType];
  const totalWeight = vehicleDefaultWeight + carConfig.weightAdjustment;

  return (
    <div
      className={cn(
        "bg-slate-900 overflow-hidden",
        contained ? "h-full w-full relative rounded-xl" : "fixed inset-0"
      )}
    >
      {/* Main Canvas Container */}
      <div ref={containerRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />
      </div>

      {/* Top Center - Header with Race Info */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/90 backdrop-blur-sm rounded-xl px-6 py-3 shadow-lg"
        >
          <div className="text-center">
            <h2 className="text-white font-bold text-lg mb-1">
              {vehicleIcon} {vehicleName}
            </h2>
            {phase === "racing" || phase === "finished" ? (
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <div className="text-3xl font-bold text-amber-400">
                    {gameState?.userCar?.velocity || 0}
                  </div>
                  <div className="text-slate-400 text-xs">MPH</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold text-white">
                    {gameState?.userCar?.lap || 1}/{GAME_CONFIG.totalLaps}
                  </div>
                  <div className="text-slate-400 text-xs">LAP</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold text-white">
                    {formatPosition(gameState?.userCar?.position || 1)}
                  </div>
                  <div className="text-slate-400 text-xs">POSITION</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold text-white">
                    {formatTime(gameState?.elapsedTime || 0)}
                  </div>
                  <div className="text-slate-400 text-xs">TIME</div>
                </div>
              </div>
            ) : (
              <div className="text-slate-400 text-sm">
                {weightToFraction(totalWeight)} •{" "}
                {tireInfo?.name || "Sport Tires"}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Top Right - Leaderboard */}
      <div className="absolute top-4 right-4 z-10">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg min-w-[200px]"
        >
          <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
            🏆 Leaderboard
          </h3>
          <div className="space-y-2">
            {(gameState?.cars || [])
              .sort((a, b) => a.position - b.position)
              .map((car) => (
                <div
                  key={car.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
                    car.isUser
                      ? "bg-amber-500/20 border border-amber-500/30"
                      : "bg-slate-700/50"
                  )}
                >
                  <span
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                      car.position === 1
                        ? "bg-yellow-500 text-yellow-900"
                        : car.position === 2
                          ? "bg-slate-300 text-slate-700"
                          : car.position === 3
                            ? "bg-amber-600 text-amber-100"
                            : "bg-slate-600 text-slate-300"
                    )}
                  >
                    {car.position}
                  </span>
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: car.color }}
                  />
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      car.isUser ? "text-amber-300 font-semibold" : "text-white"
                    )}
                  >
                    {car.isUser ? "YOU" : car.name}
                  </span>
                  <span className="text-slate-400 text-xs">
                    {car.finished
                      ? `${car.finishTime?.toFixed(1)}s`
                      : `${car.velocity}mph`}
                  </span>
                </div>
              ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom Left - Minimap (transparent, clickable to reset view) */}
      <div className="absolute bottom-24 left-4 z-10">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <canvas
            ref={minimapRef}
            width={200}
            height={140}
            className="rounded-lg cursor-pointer hover:ring-2 hover:ring-white/30 transition-all"
            onClick={() => {
              resetView();
              toggleFollow();
            }}
            title="Click to reset view and follow car"
          />
        </motion.div>
      </div>

      {/* Bottom Center - Action Buttons */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          {/* Change Car button - always visible except during countdown */}
          {phase !== "countdown" && onGoBack && (
            <Button
              onClick={onGoBack}
              variant="subtle"
              size="lg"
              className="bg-white/10 backdrop-blur-sm text-white hover:bg-white/20"
            >
              <ArrowLeft size={18} className="mr-2" />
              Change Car
            </Button>
          )}

          {phase === "ready" && (
            <Button
              onClick={handleStartRace}
              size="lg"
              className="bg-green-600 hover:bg-green-500 text-white px-8 font-semibold shadow-lg"
            >
              <Play size={20} className="mr-2" />
              Start Race
            </Button>
          )}

          {phase === "racing" && (
            <Button
              onClick={handleResetRace}
              variant="subtle"
              size="lg"
              className="bg-white/10 backdrop-blur-sm text-white hover:bg-white/20"
            >
              <RotateCcw size={18} className="mr-2" />
              Restart
            </Button>
          )}

          {phase === "finished" && (
            <>
              <Button
                onClick={handleResetRace}
                variant="subtle"
                size="lg"
                className="bg-white/10 backdrop-blur-sm text-white hover:bg-white/20"
              >
                <RotateCcw size={18} className="mr-2" />
                Race Again
              </Button>
              <Button
                onClick={handleContinue}
                size="lg"
                className="bg-amber-500 hover:bg-amber-400 text-amber-900 px-8 font-semibold shadow-lg"
              >
                Continue
                <ChevronRight size={20} className="ml-2" />
              </Button>
            </>
          )}
        </motion.div>
      </div>

      {/* Countdown Overlay */}
      <AnimatePresence>
        {phase === "countdown" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-9xl font-bold text-white drop-shadow-lg"
            >
              {countdown === 0 ? "GO!" : countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Race Finished Overlay */}
      <AnimatePresence>
        {phase === "finished" && gameState?.userCar && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
          >
            <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl text-center">
              <div className="text-6xl mb-4">
                {gameState.userCar.position === 1
                  ? "🏆"
                  : gameState.userCar.position === 2
                    ? "🥈"
                    : gameState.userCar.position === 3
                      ? "🥉"
                      : "🏁"}
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">
                {gameState.userCar.position === 1
                  ? "Winner!"
                  : `${formatPosition(gameState.userCar.position)} Place`}
              </h2>
              <p className="text-slate-400 text-lg mb-4">
                Finished in{" "}
                <span className="text-amber-400 font-semibold">
                  {gameState.userCar.finishTime?.toFixed(2)}s
                </span>
              </p>
              <div className="text-sm text-slate-500">
                {vehicleName} • {weightToFraction(totalWeight)} •{" "}
                {tireInfo?.name}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatPosition(position: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = position % 100;
  return position + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default SimulationStep;
