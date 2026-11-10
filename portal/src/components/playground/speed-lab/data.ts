/**
 * Speed Lab Data Models
 *
 * Contains all the static data for the Speed Lab experience:
 * - Vehicle archetypes
 * - Stat adjustment system
 * - Quiz questions
 * - Speed facts
 */

import type { CarConfig, StatAdjustments, VehicleStats } from "./schema";

// Re-export types from schema for convenience
export type { CarConfig, StatAdjustments };

// ============================================================================
// CAR CONFIGURATION DEFAULTS
// ============================================================================

/** Default car configuration */
export const DEFAULT_CAR_CONFIG: CarConfig = {
  weightAdjustment: 0, // No change from vehicle default
  tireType: 1, // Sport tires (medium friction)
};

/** Weight adjustment options */
export const WEIGHT_ADJUSTMENT_OPTIONS = [
  {
    value: -500,
    label: "−500 lbs",
    description: "Lighter (faster!)",
    icon: "🪶",
  },
  { value: 0, label: "Default", description: "Stock weight", icon: "⚖️" },
  {
    value: 500,
    label: "+500 lbs",
    description: "Heavier (slower)",
    icon: "🏋️",
  },
];

/** Helper to convert weight to fraction of ton */
export function weightToFraction(weightLbs: number): string {
  const tons = weightLbs / 2000;
  if (tons === 0.25) return "¼ ton";
  if (tons === 0.5) return "½ ton";
  if (tons === 0.75) return "¾ ton";
  if (tons === 1) return "1 ton";
  if (tons === 1.25) return "1¼ tons";
  if (tons === 1.5) return "1½ tons";
  if (tons === 1.75) return "1¾ tons";
  return `${tons} tons`;
}

/** Tire options with friction coefficients */
export const TIRE_OPTIONS = [
  {
    value: 0,
    name: "Slick Tires",
    icon: "🔵",
    friction: 0.6,
    frictionLabel: "Low (⅗)",
    description: "Smooth surface, slides easily",
    mathNote: "Friction coefficient: 0.6 (or 3/5)",
  },
  {
    value: 1,
    name: "Sport Tires",
    icon: "🟢",
    friction: 0.8,
    frictionLabel: "Medium (⅘)",
    description: "Good balance of grip and speed",
    mathNote: "Friction coefficient: 0.8 (or 4/5)",
  },
  {
    value: 2,
    name: "Grip Tires",
    icon: "🔴",
    friction: 1.0,
    frictionLabel: "High (1)",
    description: "Maximum grip, sticky rubber",
    mathNote: "Friction coefficient: 1.0 (or 5/5)",
  },
];

/** Default stat adjustments */
export const DEFAULT_STAT_ADJUSTMENTS: StatAdjustments = {
  topSpeed: 0,
  acceleration: 0,
  handling: 0,
};

// ============================================================================
// VEHICLE ARCHETYPES
// ============================================================================

export interface VehicleArchetype {
  id: string;
  name: string;
  icon: string;
  description: string;
  baseStats: VehicleStats;
  /** Default weight in pounds */
  defaultWeight: number;
  funFact: string;
  whyCool: string;
  /** Path to the LDraw model file (relative to /models/ldraw/officialLibrary/) */
  modelPath: string;
  /** Default body color for this vehicle */
  defaultColor: string;
}

export const VEHICLE_ARCHETYPES: VehicleArchetype[] = [
  // === NEW PACKED MODELS ===
  {
    id: "racingcar",
    name: "Racing Car",
    icon: "🏎️",
    description: "A sleek racing machine built for speed!",
    baseStats: { topSpeed: 190, acceleration: 175, handling: 80 },
    defaultWeight: 1500, // Light race car - ¾ ton
    funFact:
      "Race cars can experience forces up to 5G in tight corners – more than astronauts at launch!",
    whyCool: "It's designed to go as fast as possible around a track!",
    modelPath: "models/packed/30030-1-Racing-Car_Packed.mpd",
    defaultColor: "#C91A09",
  },
  {
    id: "blackracer",
    name: "Black Racer",
    icon: "🖤",
    description: "A stealthy speedster that dominates the track!",
    baseStats: { topSpeed: 185, acceleration: 185, handling: 75 },
    defaultWeight: 1500, // Light race car - ¾ ton
    funFact:
      "The first speeding ticket ever was given in 1896 to a driver going just 8 mph in a 2 mph zone!",
    whyCool: "It looks fast even when it's standing still!",
    modelPath: "models/packed/1631-1-Black-Racer_Packed.mpd",
    defaultColor: "#05131D",
  },
  {
    id: "dragster",
    name: "Dragster",
    icon: "🔥",
    description: "Built for straight-line speed and explosive acceleration!",
    baseStats: { topSpeed: 210, acceleration: 200, handling: 50 },
    defaultWeight: 1000, // Super light dragster - ½ ton
    funFact:
      "Top Fuel dragsters can accelerate from 0 to 100 mph in less than 1 second!",
    whyCool: "Nothing accelerates faster than a dragster!",
    modelPath: "models/packed/1528-1-Dragster_Packed.mpd",
    defaultColor: "#F2CD37",
  },
  {
    id: "buggyracer",
    name: "Buggy Racer",
    icon: "🏜️",
    description: "An off-road buggy ready for any terrain!",
    baseStats: { topSpeed: 165, acceleration: 165, handling: 85 },
    defaultWeight: 2000, // Medium buggy - 1 ton
    funFact:
      "Off-road buggies have suspension that can travel over 2 feet up and down to absorb huge bumps!",
    whyCool: "It can race on sand, dirt, and rough terrain!",
    modelPath: "models/packed/30036-1-Buggy-Racer_Packed.mpd",
    defaultColor: "#0055BF",
  },
  {
    id: "rallycar",
    name: "Rally Car",
    icon: "🌲",
    description: "A rally champion built for handling and speed!",
    baseStats: { topSpeed: 175, acceleration: 170, handling: 95 },
    defaultWeight: 2000, // Medium rally car - 1 ton
    funFact: "Rally drivers have co-drivers who read directions at 100+ mph!",
    whyCool: "It can drift around corners at incredible speeds!",
    modelPath: "models/packed/1496-1-Rally-Car_Packed.mpd",
    defaultColor: "#FFFFFF",
  },
  {
    id: "streetmaniac",
    name: "Street Maniac",
    icon: "🌃",
    description: "A street racing legend with serious style!",
    baseStats: { topSpeed: 185, acceleration: 175, handling: 78 },
    defaultWeight: 2000, // Street car - 1 ton
    funFact:
      "A car's spoiler doesn't just look cool – at high speeds it pushes the car down with the force of an adult elephant!",
    whyCool: "It's got the looks and the speed to turn heads!",
    modelPath: "models/packed/8644-1-Street-Maniac_Packed.mpd",
    defaultColor: "#C91A09",
  },
  {
    id: "adventurerscar",
    name: "Adventurers Car",
    icon: "🗺️",
    description: "An expedition vehicle ready for any adventure!",
    baseStats: { topSpeed: 155, acceleration: 155, handling: 80 },
    defaultWeight: 2500, // Heavier expedition vehicle - 1¼ tons
    funFact:
      "The world's longest road trip covered 462,000 miles across 215 countries and took 26 years to complete!",
    whyCool: "It can take you anywhere your imagination goes!",
    modelPath: "models/packed/2541-1-Adventurers-Car_Packed.mpd",
    defaultColor: "#958A73",
  },
  // === ORIGINAL MODELS ===
  {
    id: "racecar",
    name: "Classic Racer",
    icon: "🚗",
    description: "A classic LEGO race car with timeless design!",
    baseStats: { topSpeed: 180, acceleration: 185, handling: 85 },
    defaultWeight: 1500, // Classic racer - ¾ ton
    funFact:
      "The average F1 car has over 80,000 parts and takes about 80,000 hours to build!",
    whyCool: "It's the classic LEGO car that started it all!",
    modelPath: "models/ldraw/officialLibrary/models/car.ldr_Packed.mpd",
    defaultColor: "#C91A09",
  },
  {
    id: "lunarrover",
    name: "Lunar Rover",
    icon: "🌙",
    description:
      "An all-terrain vehicle designed to explore the Moon's surface!",
    baseStats: { topSpeed: 100, acceleration: 130, handling: 80 },
    defaultWeight: 500, // Super light moon rover - ¼ ton
    funFact:
      "The real Lunar Rover could only go 8 mph, but it's still parked on the Moon today!",
    whyCool: "It drove on the Moon – the only car that's been to space!",
    modelPath:
      "models/ldraw/officialLibrary/models/1621-1-LunarMPVVehicle.mpd_Packed.mpd",
    defaultColor: "#FFFFFF",
  },
  {
    id: "radartruck",
    name: "Radar Truck",
    icon: "📡",
    description:
      "A specialized truck with radar equipment for tracking and communication.",
    baseStats: { topSpeed: 130, acceleration: 110, handling: 60 },
    defaultWeight: 3000, // Heavy truck - 1½ tons
    funFact: "Radar can detect a bumblebee from over 50 miles away!",
    whyCool: "It can 'see' things even when it's dark or foggy!",
    modelPath:
      "models/ldraw/officialLibrary/models/889-1-RadarTruck.mpd_Packed.mpd",
    defaultColor: "#257A3E",
  },
];

// ============================================================================
// SPEED FACTS
// ============================================================================

export const SPEED_FACTS = [
  "A Formula 1 car weighs about 1,750 lbs – that's less than 1 ton (⅞ of a ton to be exact)!",
  "Race car tires lose about ⅓ of their grip when worn out. That's why pit stops matter!",
  "Friction coefficient of 1.0 means perfect grip. Most road tires are around 0.7 (or ⁷⁄₁₀).",
  "A lighter car uses less fuel. Dropping ¼ of the weight can improve fuel economy by 10%!",
  "F1 cars create downforce equal to 3½ times their weight at top speed!",
  "Sticky racing tires can cost $400 each, and they only last about 100 miles!",
  "Electric cars have instant torque – they reach full power in 0 seconds, not ½ second like gas cars!",
  "A NASCAR tire spins about 3,000 times per mile. In a 500-mile race, that's 1.5 million rotations!",
  "Heavier cars need more force to stop. A 3,000 lb car needs twice the braking force of a 1,500 lb car!",
  "Drag racers go from 0 to 100 mph in under 1 second – that's faster than falling!",
  "The friction between tire and road creates heat. Race tires work best at 200°F – that's boiling water temperature!",
  "Rally cars weigh about 2,700 lbs (1⅓ tons) and can accelerate faster than most sports cars!",
];

// ============================================================================
// LDRAW COLOR PALETTE - For part customization
// ============================================================================

export interface LDrawColor {
  code: number;
  name: string;
  hex: string;
}

export const LDRAW_COLORS: LDrawColor[] = [
  { code: 4, name: "Red", hex: "#C91A09" },
  { code: 1, name: "Blue", hex: "#0055BF" },
  { code: 2, name: "Green", hex: "#257A3E" },
  { code: 14, name: "Yellow", hex: "#F2CD37" },
  { code: 25, name: "Orange", hex: "#FE8A18" },
  { code: 15, name: "White", hex: "#FFFFFF" },
  { code: 0, name: "Black", hex: "#05131D" },
  { code: 7, name: "Light Grey", hex: "#9BA19D" },
  { code: 71, name: "Light Bluish Grey", hex: "#A0A5A9" },
  { code: 72, name: "Dark Bluish Grey", hex: "#6C6E68" },
  { code: 8, name: "Dark Grey", hex: "#6D6E5C" },
  { code: 27, name: "Lime", hex: "#BBE90B" },
  { code: 10, name: "Bright Green", hex: "#4B9F4A" },
  { code: 22, name: "Purple", hex: "#81007B" },
  { code: 70, name: "Reddish Brown", hex: "#582A12" },
  { code: 272, name: "Dark Blue", hex: "#0D325B" },
  { code: 288, name: "Dark Green", hex: "#184632" },
  { code: 320, name: "Dark Red", hex: "#720E0F" },
  { code: 19, name: "Tan", hex: "#E4CD9E" },
  { code: 28, name: "Dark Tan", hex: "#958A73" },
  { code: 5, name: "Dark Pink", hex: "#C870A0" },
  { code: 9, name: "Light Blue", hex: "#B4D2E3" },
  { code: 6, name: "Brown", hex: "#583927" },
  { code: 484, name: "Dark Orange", hex: "#A95500" },
];

// Color palette order for UI display
export const COLOR_PALETTE_ORDER = [
  4, 1, 2, 14, 25, 15, 0, 7, 71, 72, 8, 27, 10, 22, 70, 272, 288, 320, 19, 28,
  5, 9, 6, 484,
];
