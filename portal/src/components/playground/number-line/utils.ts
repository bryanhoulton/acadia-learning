/**
 * Number Line Utilities
 *
 * Pure functions and hooks for number line calculations.
 */

import { useMemo } from "react";

import { PADDING_X, SVG_WIDTH } from "./constants";

/**
 * Creates scale and inverse functions for mapping between
 * number line values and SVG x-coordinates.
 */
export function useNumberLineScale(min: number, max: number) {
  return useMemo(() => {
    const range = max - min;
    const lineWidth = SVG_WIDTH - 2 * PADDING_X;

    const scale = (value: number): number =>
      PADDING_X + ((value - min) / range) * lineWidth;

    const invert = (x: number): number =>
      min + ((x - PADDING_X) / lineWidth) * range;

    return { scale, invert, min, max };
  }, [min, max]);
}

/**
 * Returns the next available label (A, B, C, ...) that isn't already used.
 */
export function getNextLabel(existingLabels: (string | undefined)[]): string {
  const usedLabels = new Set(existingLabels.filter(Boolean));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (const letter of alphabet) {
    if (!usedLabels.has(letter)) {
      return letter;
    }
  }

  // Fallback if all 26 letters are used
  return `P${usedLabels.size + 1}`;
}

/**
 * Snaps a value to the nearest tick interval within bounds.
 * When snapToTicks is disabled, still snaps to minIncrement to avoid infinite decimals.
 */
export function snapToTick(
  value: number,
  tickInterval: number,
  min: number,
  max: number,
  enabled: boolean,
  minIncrement?: number
): number {
  // Use tick interval when snapping to ticks, otherwise use minIncrement (defaulting to tickInterval)
  const interval = enabled ? tickInterval : (minIncrement ?? tickInterval);

  const snapped = Math.round(value / interval) * interval;
  // Round to avoid floating point precision issues
  const rounded = Math.round(snapped * 1000000) / 1000000;
  return Math.max(min, Math.min(max, rounded));
}

/**
 * Generates an array of tick values for a given range and interval.
 */
export function generateTicks(
  min: number,
  max: number,
  tickInterval: number
): number[] {
  const result: number[] = [];

  for (let v = min; v <= max; v += tickInterval) {
    // Round to avoid floating point precision issues
    const rounded = Math.round(v * 1000) / 1000;
    result.push(rounded);
  }

  return result;
}

/** Minimum pixels between ticks to avoid crowding */
const MIN_TICK_SPACING_PX = 25;

/** Maximum ticks to show (safety limit) */
const MAX_TICKS = 50;

/** "Nice" tick intervals to choose from */
const NICE_INTERVALS = [
  0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000,
  2000, 2500, 5000,
];

/**
 * Calculates an optimal tick interval based on range and available width.
 * Chooses a "nice" interval that results in readable, non-crowded ticks.
 *
 * @param min - Minimum value of the range
 * @param max - Maximum value of the range
 * @param configuredInterval - The interval specified in config (used as a starting point)
 * @returns The optimal tick interval to use
 */
export function calculateOptimalTickInterval(
  min: number,
  max: number,
  configuredInterval: number
): number {
  const range = max - min;
  const lineWidth = SVG_WIDTH - 2 * PADDING_X;

  // Calculate how many ticks would fit with the configured interval
  const configuredTickCount = Math.floor(range / configuredInterval) + 1;
  const configuredSpacing = lineWidth / configuredTickCount;

  // If configured interval produces good spacing, use it
  if (
    configuredSpacing >= MIN_TICK_SPACING_PX &&
    configuredTickCount <= MAX_TICKS
  ) {
    return configuredInterval;
  }

  // Otherwise, find a "nice" interval that fits
  const maxTicks = Math.floor(lineWidth / MIN_TICK_SPACING_PX);
  const minInterval = range / maxTicks;

  // Find the smallest nice interval that's >= minInterval
  for (const interval of NICE_INTERVALS) {
    if (interval >= minInterval) {
      return interval;
    }
  }

  // Fallback: just divide range into ~20 ticks
  return range / 20;
}

/**
 * Calculates the optimal label interval (every Nth tick gets a label).
 * Ensures labels don't overlap by spacing them out if needed.
 */
export function calculateOptimalLabelInterval(
  min: number,
  max: number,
  tickInterval: number,
  configuredLabelInterval: number
): number {
  const range = max - min;
  const lineWidth = SVG_WIDTH - 2 * PADDING_X;
  const tickCount = Math.floor(range / tickInterval) + 1;

  // Minimum pixels between labels (labels are wider than ticks)
  const minLabelSpacing = 40;
  const maxLabels = Math.floor(lineWidth / minLabelSpacing);

  // How many labels would we have with configured interval?
  const configuredLabelCount = Math.floor(
    tickCount / (configuredLabelInterval / tickInterval)
  );

  if (configuredLabelCount <= maxLabels) {
    return configuredLabelInterval;
  }

  // Need to space labels out more - find a multiple of tickInterval
  const labelEveryN = Math.ceil(tickCount / maxLabels);
  return tickInterval * labelEveryN;
}

/**
 * Converts screen coordinates to SVG coordinates.
 * Returns null if conversion fails.
 */
export function screenToSvgCoords(
  clientX: number,
  clientY: number,
  svgElement: SVGSVGElement | null
): { x: number; y: number } | null {
  if (!svgElement) return null;

  const pt = svgElement.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;

  const ctm = svgElement.getScreenCTM();
  if (!ctm) return null;

  const svgPt = pt.matrixTransform(ctm.inverse());
  return { x: svgPt.x, y: svgPt.y };
}
