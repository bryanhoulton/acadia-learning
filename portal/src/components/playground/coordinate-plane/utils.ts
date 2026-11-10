/**
 * Coordinate Plane Utilities
 * Math parsing, evaluation, and coordinate transformations
 */

// ============================================
// Coordinate Transformations
// ============================================

export interface ViewBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
}

/** Convert math coordinates to SVG pixel coordinates */
export function mathToPixel(
  x: number,
  y: number,
  view: ViewBox,
): { px: number; py: number } {
  const xRange = view.xMax - view.xMin;
  const yRange = view.yMax - view.yMin;
  const px = ((x - view.xMin) / xRange) * view.width;
  const py = ((view.yMax - y) / yRange) * view.height; // Y is inverted
  return { px, py };
}

/** Convert SVG pixel coordinates to math coordinates */
export function pixelToMath(
  px: number,
  py: number,
  view: ViewBox,
): { x: number; y: number } {
  const xRange = view.xMax - view.xMin;
  const yRange = view.yMax - view.yMin;
  const x = (px / view.width) * xRange + view.xMin;
  const y = view.yMax - (py / view.height) * yRange; // Y is inverted
  return { x, y };
}

/** Snap a value to the nearest grid point */
export function snapToGrid(value: number, gridSize: number = 1): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Snap coordinates to grid */
export function snapCoordinates(
  x: number,
  y: number,
  gridSize: number = 1,
): { x: number; y: number } {
  return {
    x: snapToGrid(x, gridSize),
    y: snapToGrid(y, gridSize),
  };
}

// ============================================
// Function Parsing & Evaluation
// ============================================

export type ParsedFunction = {
  type: "explicit" | "implicit" | "parametric";
  evaluate: (x: number) => number | null;
  derivative?: (x: number) => number | null;
  original: string;
};

/**
 * Parse a function string like "y = 2x + 1" or "y = x^2 - 4"
 * Returns an evaluator function
 */
export function parseFunction(equation: string): ParsedFunction | null {
  try {
    // Normalize the equation
    let expr = equation.trim().toLowerCase();

    // Handle "y = ..." format
    if (expr.startsWith("y") && expr.includes("=")) {
      expr = expr.split("=")[1].trim();
    }
    // Handle "f(x) = ..." format
    else if (expr.includes("f(x)") && expr.includes("=")) {
      expr = expr.split("=")[1].trim();
    }

    // Build evaluator function
    const evaluate = buildEvaluator(expr);
    const derivative = buildDerivativeEvaluator(expr);

    return {
      type: "explicit",
      evaluate,
      derivative,
      original: equation,
    };
  } catch {
    return null;
  }
}

/**
 * Build an evaluator function from a math expression
 */
function buildEvaluator(expr: string): (x: number) => number | null {
  // Tokenize and convert to JavaScript-evaluable expression
  const jsExpr = mathToJs(expr);

  return (x: number): number | null => {
    try {
      // Create a safe evaluation context
      const result = evaluateExpression(jsExpr, x);
      if (!isFinite(result)) return null;
      return result;
    } catch {
      return null;
    }
  };
}

/**
 * Build a numerical derivative evaluator
 */
function buildDerivativeEvaluator(expr: string): (x: number) => number | null {
  const jsExpr = mathToJs(expr);
  const h = 0.0001; // Small delta for numerical differentiation

  return (x: number): number | null => {
    try {
      const y1 = evaluateExpression(jsExpr, x - h);
      const y2 = evaluateExpression(jsExpr, x + h);
      if (!isFinite(y1) || !isFinite(y2)) return null;
      return (y2 - y1) / (2 * h);
    } catch {
      return null;
    }
  };
}

/**
 * Convert math notation to JavaScript expression
 */
function mathToJs(expr: string): string {
  let result = expr;

  // Handle implicit multiplication: 2x -> 2*x, (x)(y) -> (x)*(y)
  result = result.replace(/(\d)([x])/g, "$1*$2");
  result = result.replace(/([x])(\d)/g, "$1*$2");
  result = result.replace(/(\))(\()/g, "$1*$2");
  result = result.replace(/(\d)(\()/g, "$1*$2");
  result = result.replace(/(\))(\d)/g, "$1*$2");
  result = result.replace(/(\))(x)/g, "$1*$2");
  result = result.replace(/(x)(\()/g, "$1*$2");

  // Handle exponents: x^2 -> Math.pow(x, 2), 2^x -> Math.pow(2, x)
  // First handle parenthesized expressions as base or exponent
  result = result.replace(/\(([^)]+)\)\^(\([^)]+\))/g, "Math.pow(($1), $2)");
  result = result.replace(/\(([^)]+)\)\^([x\d.]+)/g, "Math.pow(($1), $2)");
  result = result.replace(/([x\d.]+)\^\(([^)]+)\)/g, "Math.pow($1, ($2))");
  // Then handle simple cases like x^2 or 2^x
  result = result.replace(/([x\d.]+)\^([x\d.]+)/g, "Math.pow($1, $2)");

  // Handle common functions
  result = result.replace(/\bsqrt\(/g, "Math.sqrt(");
  result = result.replace(/\babs\(/g, "Math.abs(");
  result = result.replace(/\bsin\(/g, "Math.sin(");
  result = result.replace(/\bcos\(/g, "Math.cos(");
  result = result.replace(/\btan\(/g, "Math.tan(");
  result = result.replace(/\bln\(/g, "Math.log(");
  result = result.replace(/\blog\(/g, "Math.log10(");
  result = result.replace(/\bexp\(/g, "Math.exp(");
  result = result.replace(/\bpi\b/g, "Math.PI");
  result = result.replace(/\be\b/g, "Math.E");

  return result;
}

/**
 * Safely evaluate a JavaScript math expression
 */
function evaluateExpression(jsExpr: string, x: number): number {
  // Create a function that evaluates the expression with x
  const fn = new Function("x", `return ${jsExpr};`);
  return fn(x);
}

// ============================================
// Curve Sampling
// ============================================

export interface CurvePoint {
  x: number;
  y: number;
  valid: boolean;
}

/**
 * Sample a function across a range to generate curve points
 * Uses adaptive sampling for better curve quality
 */
export function sampleFunction(
  fn: ParsedFunction,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  baseSamples: number = 200,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  const step = (xMax - xMin) / baseSamples;

  for (let i = 0; i <= baseSamples; i++) {
    const x = xMin + i * step;
    const y = fn.evaluate(x);

    points.push({
      x,
      y: y ?? 0,
      valid: y !== null && y >= yMin - 10 && y <= yMax + 10,
    });
  }

  return points;
}

/**
 * Convert sampled points to SVG path data
 * Handles discontinuities gracefully
 */
export function pointsToPath(points: CurvePoint[], view: ViewBox): string {
  const segments: string[] = [];
  let currentSegment: string[] = [];
  let inSegment = false;

  for (const point of points) {
    if (point.valid) {
      const { px, py } = mathToPixel(point.x, point.y, view);

      if (!inSegment) {
        currentSegment = [`M ${px} ${py}`];
        inSegment = true;
      } else {
        currentSegment.push(`L ${px} ${py}`);
      }
    } else {
      if (inSegment && currentSegment.length > 1) {
        segments.push(currentSegment.join(" "));
      }
      currentSegment = [];
      inSegment = false;
    }
  }

  // Don't forget the last segment
  if (inSegment && currentSegment.length > 1) {
    segments.push(currentSegment.join(" "));
  }

  return segments.join(" ");
}

// ============================================
// Intersection & Special Points
// ============================================

export interface SpecialPoint {
  x: number;
  y: number;
  type: "x-intercept" | "y-intercept" | "intersection" | "vertex";
  label?: string;
}

/**
 * Find x-intercepts (where y = 0) using numerical methods
 */
export function findXIntercepts(
  fn: ParsedFunction,
  xMin: number,
  xMax: number,
): SpecialPoint[] {
  const intercepts: SpecialPoint[] = [];
  const samples = 100;
  const step = (xMax - xMin) / samples;

  let prevY = fn.evaluate(xMin);

  for (let i = 1; i <= samples; i++) {
    const x = xMin + i * step;
    const y = fn.evaluate(x);

    if (prevY !== null && y !== null) {
      // Sign change indicates a root
      if (prevY * y < 0) {
        // Bisection to find more precise root
        const root = bisectionRoot(fn, x - step, x);
        if (root !== null) {
          intercepts.push({
            x: Math.round(root * 1000) / 1000,
            y: 0,
            type: "x-intercept",
          });
        }
      }
      // Check for exact zero
      else if (Math.abs(y) < 0.0001) {
        intercepts.push({
          x: Math.round(x * 1000) / 1000,
          y: 0,
          type: "x-intercept",
        });
      }
    }

    prevY = y;
  }

  return intercepts;
}

/**
 * Find y-intercept (where x = 0)
 */
export function findYIntercept(fn: ParsedFunction): SpecialPoint | null {
  const y = fn.evaluate(0);
  if (y === null) return null;

  return {
    x: 0,
    y: Math.round(y * 1000) / 1000,
    type: "y-intercept",
  };
}

/**
 * Find intersections between two functions
 */
export function findIntersections(
  fn1: ParsedFunction,
  fn2: ParsedFunction,
  xMin: number,
  xMax: number,
): SpecialPoint[] {
  const intersections: SpecialPoint[] = [];
  const samples = 100;
  const step = (xMax - xMin) / samples;

  // Create a difference function
  const diff = (x: number) => {
    const y1 = fn1.evaluate(x);
    const y2 = fn2.evaluate(x);
    if (y1 === null || y2 === null) return null;
    return y1 - y2;
  };

  let prevDiff = diff(xMin);

  for (let i = 1; i <= samples; i++) {
    const x = xMin + i * step;
    const d = diff(x);

    if (prevDiff !== null && d !== null) {
      if (prevDiff * d < 0) {
        // Sign change - bisect to find intersection
        const root = bisectionRootCustom(diff, x - step, x);
        if (root !== null) {
          const y = fn1.evaluate(root);
          if (y !== null) {
            intersections.push({
              x: Math.round(root * 1000) / 1000,
              y: Math.round(y * 1000) / 1000,
              type: "intersection",
            });
          }
        }
      }
    }

    prevDiff = d;
  }

  return intersections;
}

/**
 * Bisection method to find root
 */
function bisectionRoot(
  fn: ParsedFunction,
  a: number,
  b: number,
  tolerance: number = 0.0001,
): number | null {
  let left = a;
  let right = b;

  for (let i = 0; i < 50; i++) {
    const mid = (left + right) / 2;
    const yMid = fn.evaluate(mid);
    const yLeft = fn.evaluate(left);

    if (yMid === null || yLeft === null) return null;
    if (Math.abs(yMid) < tolerance) return mid;

    if (yLeft * yMid < 0) {
      right = mid;
    } else {
      left = mid;
    }
  }

  return (left + right) / 2;
}

function bisectionRootCustom(
  fn: (x: number) => number | null,
  a: number,
  b: number,
  tolerance: number = 0.0001,
): number | null {
  let left = a;
  let right = b;

  for (let i = 0; i < 50; i++) {
    const mid = (left + right) / 2;
    const yMid = fn(mid);
    const yLeft = fn(left);

    if (yMid === null || yLeft === null) return null;
    if (Math.abs(yMid) < tolerance) return mid;

    if (yLeft * yMid < 0) {
      right = mid;
    } else {
      left = mid;
    }
  }

  return (left + right) / 2;
}

// ============================================
// Region/Inequality Helpers
// ============================================

export type InequalityType = ">" | ">=" | "<" | "<=" | "=";

export interface ParsedInequality {
  fn: ParsedFunction;
  type: InequalityType;
}

/**
 * Parse an inequality like "y > 2x + 1"
 */
export function parseInequality(inequality: string): ParsedInequality | null {
  const match = inequality.match(/y\s*([<>=]+)\s*(.+)/i);
  if (!match) return null;

  const [, op, expr] = match;
  const fn = parseFunction(`y = ${expr}`);
  if (!fn) return null;

  let type: InequalityType;
  switch (op) {
    case ">":
      type = ">";
      break;
    case ">=":
    case "≥":
      type = ">=";
      break;
    case "<":
      type = "<";
      break;
    case "<=":
    case "≤":
      type = "<=";
      break;
    default:
      type = "=";
  }

  return { fn, type };
}

/**
 * Check if a point satisfies an inequality
 */
export function satisfiesInequality(
  x: number,
  y: number,
  ineq: ParsedInequality,
): boolean {
  const boundY = ineq.fn.evaluate(x);
  if (boundY === null) return false;

  switch (ineq.type) {
    case ">":
      return y > boundY;
    case ">=":
      return y >= boundY;
    case "<":
      return y < boundY;
    case "<=":
      return y <= boundY;
    default:
      return Math.abs(y - boundY) < 0.01;
  }
}

// ============================================
// Label Generation
// ============================================

const POINT_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Generate next available point label
 */
export function generatePointLabel(existingLabels: string[]): string {
  for (const label of POINT_LABELS) {
    if (!existingLabels.includes(label)) {
      return label;
    }
  }
  // Fallback to numbered labels
  let i = 1;
  while (existingLabels.includes(`P${i}`)) {
    i++;
  }
  return `P${i}`;
}

/**
 * Format coordinate for display
 */
export function formatCoordinate(value: number): string {
  // Round to avoid floating point display issues
  const rounded = Math.round(value * 100) / 100;
  // Remove unnecessary decimals
  return rounded === Math.floor(rounded)
    ? rounded.toString()
    : rounded.toFixed(2).replace(/\.?0+$/, "");
}
