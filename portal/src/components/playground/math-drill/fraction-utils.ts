/**
 * Fraction Utilities
 *
 * Mathematical operations for fractions: GCD, simplification, comparison, arithmetic.
 */

import type {
  Fraction,
  Operand,
} from './schema';

// ============================================
// Type Guards
// ============================================

export function isFractionValue(operand: Operand): operand is Fraction {
  return (
    typeof operand === "object" &&
    operand !== null &&
    "numerator" in operand &&
    "denominator" in operand
  );
}

export function isInteger(operand: Operand): operand is number {
  return typeof operand === "number";
}

// ============================================
// Basic Math
// ============================================

/** Greatest Common Divisor using Euclidean algorithm */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

/** Least Common Multiple */
export function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

// ============================================
// Fraction Operations
// ============================================

/** Simplify a fraction to lowest terms */
export function simplifyFraction(fraction: Fraction): Fraction {
  const { whole, numerator, denominator } = fraction;

  // Handle zero numerator
  if (numerator === 0) {
    return { whole: whole || 0, numerator: 0, denominator: 1 };
  }

  const divisor = gcd(Math.abs(numerator), Math.abs(denominator));
  let simplifiedNum = numerator / divisor;
  let simplifiedDenom = denominator / divisor;

  // Ensure denominator is positive
  if (simplifiedDenom < 0) {
    simplifiedNum = -simplifiedNum;
    simplifiedDenom = -simplifiedDenom;
  }

  return {
    whole,
    numerator: simplifiedNum,
    denominator: simplifiedDenom,
  };
}

/** Convert a fraction to an improper fraction (remove whole part) */
export function toImproperFraction(fraction: Fraction): Fraction {
  const { whole = 0, numerator, denominator } = fraction;
  return {
    numerator: whole * denominator + numerator,
    denominator,
  };
}

/** Convert an improper fraction to a mixed number */
export function toMixedNumber(fraction: Fraction): Fraction {
  const { numerator, denominator } = fraction;

  if (Math.abs(numerator) < Math.abs(denominator)) {
    return { whole: 0, numerator, denominator };
  }

  const whole = Math.trunc(numerator / denominator);
  const remainder = numerator % denominator;

  return {
    whole,
    numerator: Math.abs(remainder),
    denominator,
  };
}

/** Convert fraction to decimal */
export function fractionToDecimal(fraction: Fraction): number {
  const improper = toImproperFraction(fraction);
  return improper.numerator / improper.denominator;
}

/** Convert integer to fraction representation */
export function integerToFraction(n: number): Fraction {
  return { numerator: n, denominator: 1 };
}

/** Convert operand to fraction */
export function operandToFraction(operand: Operand): Fraction {
  if (isInteger(operand)) {
    return integerToFraction(operand);
  }
  return operand;
}

// ============================================
// Fraction Arithmetic
// ============================================

/** Add two fractions */
export function addFractions(a: Fraction, b: Fraction): Fraction {
  const aImproper = toImproperFraction(a);
  const bImproper = toImproperFraction(b);

  const commonDenom = lcm(aImproper.denominator, bImproper.denominator);
  const aMultiplier = commonDenom / aImproper.denominator;
  const bMultiplier = commonDenom / bImproper.denominator;

  return simplifyFraction({
    numerator:
      aImproper.numerator * aMultiplier + bImproper.numerator * bMultiplier,
    denominator: commonDenom,
  });
}

/** Subtract two fractions (a - b) */
export function subtractFractions(a: Fraction, b: Fraction): Fraction {
  const bNegated: Fraction = {
    ...b,
    numerator: -toImproperFraction(b).numerator,
    denominator: b.denominator,
  };
  return addFractions(a, bNegated);
}

/** Multiply two fractions */
export function multiplyFractions(a: Fraction, b: Fraction): Fraction {
  const aImproper = toImproperFraction(a);
  const bImproper = toImproperFraction(b);

  return simplifyFraction({
    numerator: aImproper.numerator * bImproper.numerator,
    denominator: aImproper.denominator * bImproper.denominator,
  });
}

/** Divide two fractions (a / b) */
export function divideFractions(a: Fraction, b: Fraction): Fraction {
  const bImproper = toImproperFraction(b);
  // Flip and multiply
  const bReciprocal: Fraction = {
    numerator: bImproper.denominator,
    denominator: bImproper.numerator,
  };
  return multiplyFractions(a, bReciprocal);
}

// ============================================
// Comparison
// ============================================

/** Compare two fractions: returns -1 (a < b), 0 (a = b), 1 (a > b) */
export function compareFractions(a: Fraction, b: Fraction): -1 | 0 | 1 {
  const aDecimal = fractionToDecimal(a);
  const bDecimal = fractionToDecimal(b);

  if (Math.abs(aDecimal - bDecimal) < 1e-10) return 0;
  return aDecimal < bDecimal ? -1 : 1;
}

/** Check if two fractions are equivalent */
export function fractionsEqual(a: Fraction, b: Fraction): boolean {
  const aSimplified = simplifyFraction(toImproperFraction(a));
  const bSimplified = simplifyFraction(toImproperFraction(b));

  return (
    aSimplified.numerator === bSimplified.numerator &&
    aSimplified.denominator === bSimplified.denominator
  );
}

/** Check if two operands are equal (handles both integers and fractions) */
export function operandsEqual(
  a: Operand,
  b: Operand,
  requireSimplified = false
): boolean {
  const aFrac = operandToFraction(a);
  const bFrac = operandToFraction(b);

  if (requireSimplified) {
    // Both must be in simplified form
    const bSimplified = simplifyFraction(toImproperFraction(bFrac));

    // For simplified comparison, check exact match
    const aImp = toImproperFraction(aFrac);
    const bImp = toImproperFraction(bSimplified);

    return (
      aImp.numerator === bImp.numerator && aImp.denominator === bImp.denominator
    );
  }

  // Just check equivalence
  return fractionsEqual(aFrac, bFrac);
}

// ============================================
// Formatting
// ============================================

/** Convert fraction to LaTeX string for KaTeX rendering */
export function fractionToLatex(fraction: Fraction): string {
  const { whole, numerator, denominator } = fraction;

  // Handle whole numbers
  if (denominator === 1) {
    const total = (whole || 0) + numerator;
    return total.toString();
  }

  // Handle pure fractions
  if (!whole || whole === 0) {
    return `\\frac{${numerator}}{${denominator}}`;
  }

  // Mixed number
  return `${whole}\\frac{${numerator}}{${denominator}}`;
}

/** Convert operand to LaTeX string */
export function operandToLatex(operand: Operand): string {
  if (isInteger(operand)) {
    return operand.toString();
  }
  return fractionToLatex(operand);
}

/** Convert operand to display string (non-LaTeX) */
export function operandToString(operand: Operand): string {
  if (isInteger(operand)) {
    return operand.toString();
  }

  const { whole, numerator, denominator } = operand;

  if (denominator === 1) {
    return ((whole || 0) + numerator).toString();
  }

  if (!whole || whole === 0) {
    return `${numerator}/${denominator}`;
  }

  return `${whole} ${numerator}/${denominator}`;
}

// ============================================
// Validation
// ============================================

/** Check if a fraction is valid (non-zero denominator) */
export function isValidFraction(fraction: Fraction): boolean {
  return fraction.denominator !== 0;
}

/** Check if a fraction is simplified */
export function isSimplified(fraction: Fraction): boolean {
  const simplified = simplifyFraction(fraction);
  return (
    simplified.numerator === fraction.numerator &&
    simplified.denominator === fraction.denominator
  );
}

/** Check if a fraction is proper (|numerator| < |denominator|) */
export function isProperFraction(fraction: Fraction): boolean {
  const improper = toImproperFraction(fraction);
  return Math.abs(improper.numerator) < Math.abs(improper.denominator);
}
