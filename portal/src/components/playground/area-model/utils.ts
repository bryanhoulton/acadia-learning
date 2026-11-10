/**
 * Area Model Utility Functions
 *
 * Pure functions for calculating shading, fractions, and cell states.
 * These utilities have no side effects and can be tested in isolation.
 */

import type {
  AreaModelColorKey,
  AreaShape,
  FractionDisplayFormat,
  ShadedCell,
} from './schema';

// ============================================
// Cell Shading Calculations
// ============================================

export interface CellShadingResult {
  color: AreaModelColorKey | null;
  opacity: number;
}

/**
 * Determines the shading state of a cell based on shadedCells and shadingLayers.
 *
 * Priority order:
 * 1. Direct shadedCells (user-applied shading)
 * 2. ShadingLayers (teacher-defined layer shading)
 * 3. Overlap detection (when multiple layers cover same cell)
 */
export function getCellShading(
  row: number,
  col: number,
  shape: AreaShape,
  showOverlap: boolean,
  overlapColor: AreaModelColorKey
): CellShadingResult {
  // Check direct shadedCells first (user-applied)
  const shadedCell = shape.shadedCells?.find(
    (cell) => cell.row === row && cell.col === col
  );
  if (shadedCell) {
    return { color: shadedCell.color, opacity: 1 };
  }

  // Check shading layers (teacher-defined)
  if (!shape.shadingLayers?.length) {
    return { color: null, opacity: 0 };
  }

  const matchingLayers = shape.shadingLayers.filter((layer) => {
    const rowMatch =
      layer.rows === null ||
      layer.rows === undefined ||
      layer.rows.includes(row);
    const colMatch =
      layer.cols === null ||
      layer.cols === undefined ||
      layer.cols.includes(col);
    return rowMatch && colMatch;
  });

  if (matchingLayers.length === 0) {
    return { color: null, opacity: 0 };
  }

  // Multiple layers overlap - show overlap color
  if (matchingLayers.length > 1 && showOverlap) {
    return { color: overlapColor, opacity: 1 };
  }

  // Single layer or no overlap highlighting
  const topLayer = matchingLayers[matchingLayers.length - 1];
  return { color: topLayer.color, opacity: topLayer.opacity ?? 0.7 };
}

/**
 * Determines if a segment (for circle/bar shapes) is shaded.
 */
export function getSegmentShading(
  segment: number,
  shape: AreaShape
): CellShadingResult {
  // Check direct shadedCells
  const shadedCell = shape.shadedCells?.find((cell) => cell.col === segment);
  if (shadedCell) {
    return { color: shadedCell.color, opacity: 1 };
  }

  // Check layers
  const matchingLayers = shape.shadingLayers?.filter(
    (layer) => layer.segments?.includes(segment) ?? false
  );

  if (!matchingLayers?.length) {
    return { color: null, opacity: 0 };
  }

  const topLayer = matchingLayers[matchingLayers.length - 1];
  return { color: topLayer.color, opacity: topLayer.opacity ?? 0.7 };
}

// ============================================
// Fraction Calculations
// ============================================

/**
 * Counts the number of shaded cells in a shape.
 * Considers both directly shaded cells and cells covered by shading layers.
 * Counts unique positions only (no duplicates).
 */
export function countShadedCells(shape: AreaShape): {
  shaded: number;
  total: number;
} {
  const { horizontal: rows, vertical: cols } = shape.partitions;
  const totalCells = rows * cols;

  // Use a Set to count unique cell positions
  const shadedSet = new Set<string>();

  // Count directly shaded cells (by unique position)
  shape.shadedCells?.forEach((cell) => {
    shadedSet.add(`${cell.row}-${cell.col}`);
  });

  // Also count cells covered by layers (for teacher-defined shading)
  shape.shadingLayers?.forEach((layer) => {
    const layerRows = layer.rows ?? Array.from({ length: rows }, (_, i) => i);
    const layerCols = layer.cols ?? Array.from({ length: cols }, (_, i) => i);
    layerRows.forEach((r) => {
      layerCols.forEach((c) => {
        shadedSet.add(`${r}-${c}`);
      });
    });
  });

  return { shaded: shadedSet.size, total: totalCells };
}

/**
 * Calculates the fraction string for a shape based on shaded cells.
 * Returns format: "numerator/denominator" (e.g., "3/8")
 *
 * @deprecated Use formatFraction with countShadedCells for more control
 */
export function calculateFraction(shape: AreaShape): string {
  const { shaded, total } = countShadedCells(shape);
  return `${shaded}/${total}`;
}

/**
 * Simplifies a fraction to lowest terms.
 * @param numerator
 * @param denominator
 * @returns [simplifiedNumerator, simplifiedDenominator]
 */
export function simplifyFraction(
  numerator: number,
  denominator: number
): [number, number] {
  if (denominator === 0) return [0, 1];
  if (numerator === 0) return [0, denominator];
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(Math.abs(numerator), Math.abs(denominator));
  return [numerator / divisor, denominator / divisor];
}

/**
 * Formats a fraction according to the specified display format.
 *
 * @param numerator - The numerator of the fraction
 * @param denominator - The denominator of the fraction
 * @param format - How to display the fraction
 * @returns Formatted string representation
 *
 * @example
 * formatFraction(5, 4, "improper") // "5/4"
 * formatFraction(5, 4, "mixed")    // "1 1/4"
 * formatFraction(3, 4, "decimal")  // "0.75"
 * formatFraction(3, 4, "percent")  // "75%"
 */
export function formatFraction(
  numerator: number,
  denominator: number,
  format: FractionDisplayFormat = "improper"
): string {
  if (denominator === 0) return "—";

  switch (format) {
    case "mixed": {
      if (numerator < denominator) {
        // Proper fraction, no whole number part
        return `${numerator}/${denominator}`;
      }
      const whole = Math.floor(numerator / denominator);
      const remainder = numerator % denominator;
      if (remainder === 0) {
        return `${whole}`;
      }
      return `${whole} ${remainder}/${denominator}`;
    }

    case "decimal": {
      const value = numerator / denominator;
      // Show up to 3 decimal places, but trim trailing zeros
      return value.toFixed(3).replace(/\.?0+$/, "");
    }

    case "percent": {
      const percent = (numerator / denominator) * 100;
      // Show whole number if it's exact, otherwise 1 decimal
      return percent === Math.floor(percent)
        ? `${percent}%`
        : `${percent.toFixed(1)}%`;
    }

    case "improper":
    default:
      return `${numerator}/${denominator}`;
  }
}

/**
 * Formats a shape's shaded fraction according to the specified display format.
 * This is the main function to use for displaying fraction labels.
 */
export function formatShapeFraction(
  shape: AreaShape,
  format: FractionDisplayFormat = "improper"
): string {
  const { shaded, total } = countShadedCells(shape);
  return formatFraction(shaded, total, format);
}

// ============================================
// Geometry Calculations
// ============================================

/**
 * Generates SVG path data for a pie slice segment.
 * Used by CircleShape for fraction visualization.
 */
export function getPieSlicePath(
  index: number,
  totalSegments: number,
  centerX: number,
  centerY: number,
  radius: number
): string {
  const startAngle = (360 / totalSegments) * index - 90;
  const endAngle = (360 / totalSegments) * (index + 1) - 90;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;

  const x1 = centerX + radius * Math.cos(startRad);
  const y1 = centerY + radius * Math.sin(startRad);
  const x2 = centerX + radius * Math.cos(endRad);
  const y2 = centerY + radius * Math.sin(endRad);

  const largeArc = 360 / totalSegments > 180 ? 1 : 0;

  return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

// ============================================
// State Helpers
// ============================================

/**
 * Creates a new ShadedCell object.
 */
export function createShadedCell(
  row: number,
  col: number,
  color: AreaModelColorKey
): ShadedCell {
  return { row, col, color };
}

/**
 * Checks if a cell is shaded in the given array.
 */
export function isCellShaded(
  cells: ShadedCell[] | undefined,
  row: number,
  col: number
): boolean {
  return cells?.some((c) => c.row === row && c.col === col) ?? false;
}

/**
 * Gets the color of a shaded cell, or null if not shaded.
 */
export function getCellColor(
  cells: ShadedCell[] | undefined,
  row: number,
  col: number
): AreaModelColorKey | null {
  const cell = cells?.find((c) => c.row === row && c.col === col);
  return cell?.color ?? null;
}

/**
 * Removes a cell from the shaded cells array.
 */
export function removeShadedCell(
  cells: ShadedCell[],
  row: number,
  col: number
): ShadedCell[] {
  return cells.filter((c) => !(c.row === row && c.col === col));
}

/**
 * Adds a cell to the shaded cells array (immutably).
 * If a cell already exists at that position, it replaces it with the new color.
 */
export function addShadedCell(
  cells: ShadedCell[] | undefined,
  row: number,
  col: number,
  color: AreaModelColorKey
): ShadedCell[] {
  // Remove any existing cell at this position first
  const filtered = (cells || []).filter(
    (c) => !(c.row === row && c.col === col)
  );
  return [...filtered, createShadedCell(row, col, color)];
}

/**
 * Toggles a cell's shading state.
 * If shaded, removes it. If not shaded, adds it with the given color.
 */
export function toggleCell(
  cells: ShadedCell[] | undefined,
  row: number,
  col: number,
  color: AreaModelColorKey
): ShadedCell[] {
  if (isCellShaded(cells, row, col)) {
    return removeShadedCell(cells || [], row, col);
  }
  return addShadedCell(cells, row, col, color);
}

// ============================================
// Validation
// ============================================

/**
 * Validates that partitions are within reasonable bounds.
 */
export function validatePartitions(
  horizontal: number,
  vertical: number
): boolean {
  return (
    horizontal >= 1 && horizontal <= 100 && vertical >= 1 && vertical <= 100
  );
}

/**
 * Clamps a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
