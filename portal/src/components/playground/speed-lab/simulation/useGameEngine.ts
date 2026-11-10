/**
 * useGameEngine - React hook that orchestrates the race simulation
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { CarConfig } from "../schema";
import { Car } from "./Car";
import {
  AI_COMPETITORS,
  CAR_TYPES,
  GAME_CONFIG,
  STARTING_GRID,
  TIRE_MODIFIERS,
  TRACK_DEFINITIONS,
} from "./config";
import { Renderer } from "./Renderer";
import { BezierTrack } from "./Track";
import type { GameState, RacePhase } from "./types";
import { Viewport } from "./Viewport";

interface UseGameEngineOptions {
  /** User's car configuration from BuildStep */
  carConfig: CarConfig;
  /** Vehicle name for display */
  vehicleName: string;
  /** Vehicle icon */
  vehicleIcon: string;
  /** Vehicle default weight in pounds */
  vehicleDefaultWeight: number;
  /** Vehicle base stats */
  vehicleBaseStats?: {
    topSpeed: number;
    acceleration: number;
    handling: number;
  };
  /** Callback when game state updates (for agent) */
  onStateUpdate?: (state: GameState) => void;
  /** Track ID to use */
  trackId?: string;
}

interface UseGameEngineReturn {
  // Refs for canvas elements
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;

  // Game state
  phase: RacePhase;
  gameState: GameState | null;
  countdown: number;

  // Controls
  startRace: () => void;
  resetRace: () => void;

  // Viewport controls
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  toggleFollow: () => void;
  isFollowing: boolean;
}

/** Reference weight for physics calculations (2000 lbs = 1 ton) */
const BASE_WEIGHT = 2000;

/**
 * Map BuildStep's CarConfig to simulation modifiers
 */
function mapCarConfigToModifiers(
  carConfig: CarConfig,
  vehicleDefaultWeight: number
): { weightMod: number; frictionMod: number } {
  // Weight mapping: actual weight / reference weight
  // Light cars (1000 lbs) → 0.5, Medium (2000 lbs) → 1.0, Heavy (3000 lbs) → 1.5
  const adjustedWeight = vehicleDefaultWeight + carConfig.weightAdjustment;
  const weightMod = adjustedWeight / BASE_WEIGHT;

  // Tire mapping: 0 → slick (0.6), 1 → sport (0.8), 2 → grip (1.0)
  const tireKeys = ["slick", "sport", "grip"];
  const tireKey = tireKeys[carConfig.tireType] || "sport";
  const frictionMod = TIRE_MODIFIERS[tireKey];

  return { weightMod, frictionMod };
}

export function useGameEngine(
  options: UseGameEngineOptions
): UseGameEngineReturn {
  const {
    carConfig,
    vehicleName,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    vehicleIcon,
    vehicleDefaultWeight,
    vehicleBaseStats,
    onStateUpdate,
    trackId = "oval",
  } = options;

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Internal refs (not exposed)
  const trackRef = useRef<BezierTrack | null>(null);
  const carsRef = useRef<Car[]>([]);
  const rendererRef = useRef<Renderer | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number>(0);
  const elapsedTimeRef = useRef<number>(0);
  const lastStateUpdateRef = useRef<number>(0);
  const phaseRef = useRef<RacePhase>("ready"); // Ref to avoid stale closure

  // State
  const [phase, setPhase] = useState<RacePhase>("ready");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [countdown, setCountdown] = useState<number>(3);
  const [isFollowing, setIsFollowing] = useState<boolean>(true);

  /**
   * Initialize the track and cars
   */
  const initializeGame = useCallback(() => {
    // Create track
    const trackDef = TRACK_DEFINITIONS[trackId] || TRACK_DEFINITIONS.oval;
    trackRef.current = new BezierTrack(trackDef);

    // Map user config to modifiers
    const { weightMod, frictionMod } = mapCarConfigToModifiers(
      carConfig,
      vehicleDefaultWeight
    );

    // Get base stats - use vehicle stats if provided, otherwise default to sport
    const baseStats = vehicleBaseStats || CAR_TYPES.sport;

    // Create user car
    const userCar = new Car({
      id: "user",
      name: vehicleName,
      color: "#f59e0b",
      isUser: true,
      topSpeed: baseStats.topSpeed,
      acceleration: baseStats.acceleration,
      handling: baseStats.handling,
      weightMod,
      frictionMod,
      skill: 1.0,
    });

    // Create AI competitors using same weight calculation as user car
    const aiCars = AI_COMPETITORS.map((comp) => {
      const aiBaseStats = CAR_TYPES[comp.type] || CAR_TYPES.sport;
      // Calculate weight modifier same as user: weight / BASE_WEIGHT (reference weight)
      const aiWeightMod = comp.weight / BASE_WEIGHT;
      const aiFrictionMod = TIRE_MODIFIERS[comp.tires] || 0.8;

      return new Car({
        ...comp,
        topSpeed: aiBaseStats.topSpeed,
        acceleration: aiBaseStats.acceleration,
        handling: aiBaseStats.handling,
        weightMod: aiWeightMod,
        frictionMod: aiFrictionMod,
        isUser: false,
      });
    });

    carsRef.current = [userCar, ...aiCars];

    // Position cars at start
    carsRef.current.forEach((car, i) => {
      const pos = STARTING_GRID[i] || { offset: -60 - i * 15, lane: 0 };
      car.reset(pos);
    });
  }, [carConfig, vehicleName, vehicleDefaultWeight, vehicleBaseStats, trackId]);

  /**
   * Get current game state snapshot
   */
  const getGameState = useCallback((): GameState => {
    const track = trackRef.current;
    const cars = carsRef.current;
    const userCar = cars.find((c) => c.isUser);

    // Sort cars by position
    const sorted = [...cars].sort((a, b) => a.position - b.position);
    const top3 = sorted.slice(0, 3);

    const raceProgress =
      userCar && track
        ? Math.round(
            ((userCar.lap - 1 + userCar.trackProgress / track.length) /
              GAME_CONFIG.totalLaps) *
              100
          )
        : 0;

    return {
      phase,
      elapsedTime: elapsedTimeRef.current,
      totalLaps: GAME_CONFIG.totalLaps,
      trackName: track?.name || "Unknown",
      cars: cars.map((c) => c.getState()),
      userCar: userCar?.getState() || null,
      top3: top3.map((c) => ({
        name: c.name,
        position: c.position,
        lap: c.lap,
        velocity: Math.round(c.velocity),
        finished: c.finished,
        finishTime: c.finishTime,
      })),
      raceProgress,
    };
  }, [phase]);

  /**
   * Update car positions/rankings
   */
  const updatePositions = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const cars = carsRef.current;
    const sorted = [...cars].sort((a, b) => {
      if (a.finished && b.finished)
        return (a.finishTime || 0) - (b.finishTime || 0);
      if (a.finished) return -1;
      if (b.finished) return 1;

      const aProgress = (a.lap - 1) * track.length + a.trackProgress;
      const bProgress = (b.lap - 1) * track.length + b.trackProgress;
      return bProgress - aProgress;
    });

    sorted.forEach((car, i) => {
      car.position = i + 1;
    });
  }, []);

  /**
   * Render frame
   */
  const render = useCallback(() => {
    const renderer = rendererRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const cars = carsRef.current;

    if (!renderer || !viewport || !track) return;

    renderer.resize(viewport.width, viewport.height);
    renderer.render(viewport.getState(), track, cars);
  }, []);

  /**
   * Game loop - uses phaseRef to avoid stale closure issues
   */
  const gameLoop = useCallback(
    (timestamp: number) => {
      // Use ref to check phase to avoid stale closure
      if (phaseRef.current !== "racing") return;

      const dt = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;
      elapsedTimeRef.current += dt;

      const track = trackRef.current;
      const cars = carsRef.current;
      const viewport = viewportRef.current;

      if (!track) return;

      // Update all cars
      cars.forEach((car) => {
        car.update(dt, track, elapsedTimeRef.current, GAME_CONFIG.totalLaps);
      });

      // Update positions/rankings
      updatePositions();

      // Follow car if enabled
      const userCar = cars.find((c) => c.isUser);

      // Check if race finished (when user's car finishes)
      if (userCar?.finished) {
        phaseRef.current = "finished";
        setPhase("finished");
        const finalState = getGameState();
        setGameState(finalState);
        onStateUpdate?.(finalState);
        return;
      }
      if (viewport && userCar && viewport.isFollowing()) {
        viewport.followCar(userCar, track);
      }

      // Render
      render();

      // Update game state (throttled to every 500ms for agent updates)
      const now = Date.now();
      if (now - lastStateUpdateRef.current > 500) {
        lastStateUpdateRef.current = now;
        const state = getGameState();
        setGameState(state);
        onStateUpdate?.(state);
      }

      // Continue loop
      animationRef.current = requestAnimationFrame(gameLoop);
    },
    [updatePositions, getGameState, onStateUpdate, render]
  );

  /**
   * Start the countdown and race
   */
  const startRace = useCallback(() => {
    if (phaseRef.current !== "ready") return;

    phaseRef.current = "countdown";
    setPhase("countdown");
    setCountdown(3);

    // Countdown sequence
    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      setCountdown(count);

      if (count === 0) {
        clearInterval(countdownInterval);

        // Start racing after brief "GO!" display
        setTimeout(() => {
          phaseRef.current = "racing";
          setPhase("racing");
          elapsedTimeRef.current = 0;
          lastTimestampRef.current = performance.now();
          lastStateUpdateRef.current = Date.now();
          animationRef.current = requestAnimationFrame(gameLoop);
        }, 500);
      }
    }, 800);
  }, [gameLoop]);

  /**
   * Reset the race
   */
  const resetRace = useCallback(() => {
    // Cancel animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Reset state
    phaseRef.current = "ready";
    setPhase("ready");
    setCountdown(3);
    elapsedTimeRef.current = 0;

    // Reinitialize game
    initializeGame();

    // Reset viewport to follow user
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const userCar = carsRef.current.find((c) => c.isUser);
    if (viewport && track && userCar) {
      viewport.setFollowTarget("user", userCar, track);
      setIsFollowing(true);
    }

    // Render initial state
    render();

    // Update game state
    const state = getGameState();
    setGameState(state);
  }, [initializeGame, render, getGameState]);

  /**
   * Viewport controls
   */
  const zoomIn = useCallback(() => {
    viewportRef.current?.zoomIn();
    render();
  }, [render]);

  const zoomOut = useCallback(() => {
    viewportRef.current?.zoomOut();
    render();
  }, [render]);

  const resetView = useCallback(() => {
    viewportRef.current?.reset();
    setIsFollowing(false);
    render();
  }, [render]);

  const toggleFollow = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const userCar = carsRef.current.find((c) => c.isUser);

    if (!viewport) return;

    viewport.toggleFollow();
    setIsFollowing(viewport.isFollowing());

    // Center on car if following
    if (viewport.isFollowing() && userCar && track) {
      viewport.centerOnCar(userCar, track);
    }

    render();
  }, [render]);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    // Create renderer
    rendererRef.current = new Renderer(canvas);

    // Create viewport
    viewportRef.current = new Viewport();
    viewportRef.current.attach(container);
    viewportRef.current.onUpdate = () => {
      setIsFollowing(viewportRef.current?.isFollowing() ?? false);
      if (phase !== "racing") {
        render();
      }
    };

    // Initialize game
    initializeGame();

    // Set initial viewport position
    const track = trackRef.current;
    const userCar = carsRef.current.find((c) => c.isUser);
    if (track && userCar) {
      viewportRef.current.setFollowTarget("user", userCar, track);
    }

    // Initial render
    render();

    // Initial state
    const state = getGameState();
    setGameState(state);

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      viewportRef.current?.detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Setup minimap when ref is available
   */
  useEffect(() => {
    const minimap = minimapRef.current;
    if (minimap && rendererRef.current) {
      rendererRef.current.setMinimapCanvas(minimap);
      render();
    }
  }, [render]);

  /**
   * Re-initialize when config changes (only in ready phase)
   */
  useEffect(() => {
    if (phase === "ready") {
      initializeGame();

      // Update viewport position
      const track = trackRef.current;
      const userCar = carsRef.current.find((c) => c.isUser);
      if (viewportRef.current && track && userCar) {
        viewportRef.current.setFollowTarget("user", userCar, track);
      }

      render();

      const state = getGameState();
      setGameState(state);
    }
  }, [
    carConfig,
    vehicleDefaultWeight,
    trackId,
    phase,
    initializeGame,
    render,
    getGameState,
  ]);

  return {
    canvasRef,
    minimapRef,
    containerRef,
    phase,
    gameState,
    countdown,
    startRace,
    resetRace,
    zoomIn,
    zoomOut,
    resetView,
    toggleFollow,
    isFollowing,
  };
}
