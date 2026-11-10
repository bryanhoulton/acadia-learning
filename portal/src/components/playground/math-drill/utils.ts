/**
 * Math Drill Utilities
 *
 * Problem generation, distractor generation, and answer checking.
 */

import {
  addFractions,
  divideFractions,
  multiplyFractions,
  operandsEqual,
  simplifyFraction,
  subtractFractions,
  toImproperFraction,
} from './fraction-utils';
import type {
  Config,
  Fraction,
  FractionConfig,
  NumberType,
  Operand,
  Operation,
  Problem,
} from './schema';
import { isFraction } from './schema';

// ============================================
// Random Helpers
// ============================================

/** Generate random integer in range [min, max] inclusive */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick a random element from an array */
export function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Shuffle array in place (Fisher-Yates) */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Generate unique ID */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ============================================
// Integer Problem Generation
// ============================================

interface IntegerProblemResult {
  operand1: number;
  operand2: number;
  answer: number;
}

function generateIntegerAddition(
  min: number,
  max: number
): IntegerProblemResult {
  const operand1 = randomInt(min, max);
  const operand2 = randomInt(min, max);
  return { operand1, operand2, answer: operand1 + operand2 };
}

function generateIntegerSubtraction(
  min: number,
  max: number
): IntegerProblemResult {
  // Ensure non-negative result for elementary
  const operand1 = randomInt(min, max);
  const operand2 = randomInt(min, Math.min(operand1, max));
  return { operand1, operand2, answer: operand1 - operand2 };
}

function generateIntegerMultiplication(
  min: number,
  max: number
): IntegerProblemResult {
  const operand1 = randomInt(min, max);
  const operand2 = randomInt(min, max);
  return { operand1, operand2, answer: operand1 * operand2 };
}

function generateIntegerDivision(
  min: number,
  max: number
): IntegerProblemResult {
  // Generate division that results in whole number
  // Start with the answer and multiplier
  const answer = randomInt(Math.max(1, min), max);
  const operand2 = randomInt(Math.max(1, min), Math.min(12, max)); // divisor
  const operand1 = answer * operand2; // dividend
  return { operand1, operand2, answer };
}

function generateIntegerProblem(
  operation: Operation,
  range: { min: number; max: number }
): IntegerProblemResult {
  switch (operation) {
    case "addition":
      return generateIntegerAddition(range.min, range.max);
    case "subtraction":
      return generateIntegerSubtraction(range.min, range.max);
    case "multiplication":
      return generateIntegerMultiplication(range.min, range.max);
    case "division":
      return generateIntegerDivision(range.min, range.max);
  }
}

// ============================================
// Fraction Problem Generation
// ============================================

interface FractionProblemResult {
  operand1: Fraction;
  operand2: Fraction;
  answer: Fraction;
}

/** Generate a random proper fraction */
function randomProperFraction(maxDenom: number): Fraction {
  const denominator = randomInt(2, maxDenom);
  const numerator = randomInt(1, denominator - 1);
  return { numerator, denominator };
}

/** Generate a random fraction (can be improper) */
function randomFraction(maxDenom: number, allowImproper: boolean): Fraction {
  const denominator = randomInt(2, maxDenom);
  const maxNum = allowImproper ? denominator * 2 : denominator - 1;
  const numerator = randomInt(1, Math.max(1, maxNum));
  return { numerator, denominator };
}

function generateFractionAddition(
  maxDenom: number,
  sameDenom: boolean,
  allowImproper: boolean
): FractionProblemResult {
  if (sameDenom) {
    const denominator = randomInt(2, maxDenom);
    // Ensure sum is proper if not allowing improper
    const maxSum = allowImproper ? denominator * 2 - 1 : denominator - 1;
    const num1 = randomInt(1, Math.max(1, maxSum - 1));
    const num2 = randomInt(1, Math.max(1, maxSum - num1));

    const operand1: Fraction = { numerator: num1, denominator };
    const operand2: Fraction = { numerator: num2, denominator };
    const answer = simplifyFraction(addFractions(operand1, operand2));

    return { operand1, operand2, answer };
  } else {
    // Different denominators - pick related ones (one divides the other)
    const denom1 = randomInt(2, Math.floor(maxDenom / 2));
    const denom2 =
      denom1 * randomInt(2, Math.min(3, Math.floor(maxDenom / denom1)));

    const operand1 = randomFraction(denom1, false);
    operand1.denominator = denom1;
    const operand2 = randomFraction(denom2, false);
    operand2.denominator = denom2;

    const answer = simplifyFraction(addFractions(operand1, operand2));
    return { operand1, operand2, answer };
  }
}

function generateFractionSubtraction(
  maxDenom: number,
  sameDenom: boolean,
  allowImproper: boolean
): FractionProblemResult {
  if (sameDenom) {
    const denominator = randomInt(2, maxDenom);
    // Ensure positive result
    const num1 = randomInt(
      2,
      allowImproper ? denominator * 2 - 1 : denominator - 1
    );
    const num2 = randomInt(1, num1 - 1);

    const operand1: Fraction = { numerator: num1, denominator };
    const operand2: Fraction = { numerator: num2, denominator };
    const answer = simplifyFraction(subtractFractions(operand1, operand2));

    return { operand1, operand2, answer };
  } else {
    // Different denominators
    const denom1 = randomInt(2, Math.floor(maxDenom / 2));
    const denom2 =
      denom1 * randomInt(2, Math.min(3, Math.floor(maxDenom / denom1)));

    // Generate fractions ensuring positive result
    let operand1 = randomFraction(denom1, allowImproper);
    operand1.denominator = denom1;
    let operand2 = randomFraction(denom2, false);
    operand2.denominator = denom2;

    // Ensure operand1 > operand2
    const val1 = toImproperFraction(operand1).numerator / operand1.denominator;
    const val2 = toImproperFraction(operand2).numerator / operand2.denominator;
    if (val1 < val2) {
      [operand1, operand2] = [operand2, operand1];
    }

    const answer = simplifyFraction(subtractFractions(operand1, operand2));
    return { operand1, operand2, answer };
  }
}

function generateFractionMultiplication(
  maxDenom: number,
  allowImproper: boolean
): FractionProblemResult {
  // Keep numbers small to avoid large products
  const operand1 = randomFraction(Math.min(maxDenom, 6), allowImproper);
  const operand2 = randomFraction(Math.min(maxDenom, 6), false);

  const answer = simplifyFraction(multiplyFractions(operand1, operand2));
  return { operand1, operand2, answer };
}

function generateFractionDivision(
  maxDenom: number,
  allowImproper: boolean
): FractionProblemResult {
  // Keep numbers small
  const operand1 = randomFraction(Math.min(maxDenom, 6), allowImproper);
  const operand2 = randomProperFraction(Math.min(maxDenom, 4)); // divisor should be simple

  const answer = simplifyFraction(divideFractions(operand1, operand2));
  return { operand1, operand2, answer };
}

function generateFractionProblem(
  operation: Operation,
  config: FractionConfig
): FractionProblemResult {
  const { maxDenominator, sameDenominator, allowImproper } = config;

  switch (operation) {
    case "addition":
      return generateFractionAddition(
        maxDenominator,
        sameDenominator,
        allowImproper
      );
    case "subtraction":
      return generateFractionSubtraction(
        maxDenominator,
        sameDenominator,
        allowImproper
      );
    case "multiplication":
      return generateFractionMultiplication(maxDenominator, allowImproper);
    case "division":
      return generateFractionDivision(maxDenominator, allowImproper);
  }
}

// ============================================
// Mixed Number Generation
// ============================================

function generateMixedNumberProblem(
  operation: Operation,
  config: FractionConfig
): FractionProblemResult {
  // Generate fraction problem then add whole parts
  const result = generateFractionProblem(operation, config);

  // Add small whole numbers
  const whole1 = randomInt(1, 3);
  const whole2 =
    operation === "subtraction" ? randomInt(0, whole1 - 1) : randomInt(1, 2);

  result.operand1 = { ...result.operand1, whole: whole1 };
  result.operand2 = { ...result.operand2, whole: whole2 };

  // Recalculate answer
  switch (operation) {
    case "addition":
      result.answer = simplifyFraction(
        addFractions(result.operand1, result.operand2)
      );
      break;
    case "subtraction":
      result.answer = simplifyFraction(
        subtractFractions(result.operand1, result.operand2)
      );
      break;
    case "multiplication":
      result.answer = simplifyFraction(
        multiplyFractions(result.operand1, result.operand2)
      );
      break;
    case "division":
      result.answer = simplifyFraction(
        divideFractions(result.operand1, result.operand2)
      );
      break;
  }

  return result;
}

// ============================================
// Main Problem Generator
// ============================================

export function generateProblem(config: Config): Problem {
  const operation = randomChoice(config.operations);
  const numberType = randomChoice(config.numberTypes);

  let operand1: Operand;
  let operand2: Operand;
  let correctAnswer: Operand;

  if (numberType === "integer") {
    const result = generateIntegerProblem(operation, config.operandRange);
    operand1 = result.operand1;
    operand2 = result.operand2;
    correctAnswer = result.answer;
  } else if (numberType === "fraction") {
    const fractionConfig = config.fractionConfig ?? {
      maxDenominator: 12,
      allowImproper: false,
      requireSimplified: true,
      sameDenominator: true,
    };
    const result = generateFractionProblem(operation, fractionConfig);
    operand1 = result.operand1;
    operand2 = result.operand2;
    correctAnswer = result.answer;
  } else {
    // mixed number
    const fractionConfig = config.fractionConfig ?? {
      maxDenominator: 8,
      allowImproper: false,
      requireSimplified: true,
      sameDenominator: true,
    };
    const result = generateMixedNumberProblem(operation, fractionConfig);
    operand1 = result.operand1;
    operand2 = result.operand2;
    correctAnswer = result.answer;
  }

  const problem: Problem = {
    id: generateId(),
    operand1,
    operand2,
    operation,
    correctAnswer,
  };

  // Generate options if multiple choice
  if (config.inputType === "multiple-choice") {
    problem.options = generateOptions(
      correctAnswer,
      config.multipleChoiceConfig?.numOptions ?? 4,
      config.multipleChoiceConfig?.distractorStrategy ?? "near-miss",
      numberType
    );
  }

  return problem;
}

// ============================================
// Distractor Generation
// ============================================

function generateIntegerDistractors(
  correct: number,
  count: number,
  strategy: "random" | "near-miss"
): number[] {
  const distractors: number[] = [];
  const used = new Set<number>([correct]);

  if (strategy === "near-miss") {
    // Generate numbers close to the correct answer
    const offsets = [-2, -1, 1, 2, -3, 3, -10, 10];
    for (const offset of offsets) {
      const val = correct + offset;
      if (val >= 0 && !used.has(val)) {
        distractors.push(val);
        used.add(val);
        if (distractors.length >= count) break;
      }
    }
  }

  // Fill remaining with random if needed
  while (distractors.length < count) {
    const val = randomInt(Math.max(0, correct - 20), correct + 20);
    if (!used.has(val) && val >= 0) {
      distractors.push(val);
      used.add(val);
    }
  }

  return distractors.slice(0, count);
}

function generateFractionDistractors(
  correct: Fraction,
  count: number,
  strategy: "random" | "near-miss"
): Fraction[] {
  const distractors: Fraction[] = [];
  const { numerator, denominator, whole } = correct;

  if (strategy === "near-miss") {
    // Common mistakes: wrong numerator, unsimplified, etc.
    const candidates: Fraction[] = [
      { numerator: numerator + 1, denominator, whole },
      { numerator: numerator - 1, denominator, whole },
      { numerator, denominator: denominator + 1, whole },
      { numerator: numerator * 2, denominator: denominator * 2, whole }, // unsimplified
      { numerator: denominator, denominator: numerator, whole }, // flipped
    ];

    for (const candidate of candidates) {
      if (
        candidate.numerator > 0 &&
        candidate.denominator > 0 &&
        !operandsEqual(candidate, correct)
      ) {
        distractors.push(candidate);
        if (distractors.length >= count) break;
      }
    }
  }

  // Fill with random fractions
  while (distractors.length < count) {
    const randFrac: Fraction = {
      numerator: randomInt(1, Math.max(numerator + 3, 5)),
      denominator: randomInt(2, Math.max(denominator + 2, 6)),
      whole,
    };
    if (!operandsEqual(randFrac, correct)) {
      // Check not already in distractors
      const isDupe = distractors.some((d) => operandsEqual(d, randFrac));
      if (!isDupe) {
        distractors.push(randFrac);
      }
    }
  }

  return distractors.slice(0, count);
}

function generateOptions(
  correct: Operand,
  numOptions: number,
  strategy: "random" | "near-miss",
  _numberType: NumberType
): Operand[] {
  // _numberType kept for potential future use in type-specific option generation
  void _numberType;
  const distractorCount = numOptions - 1;

  let distractors: Operand[];
  if (isFraction(correct)) {
    distractors = generateFractionDistractors(
      correct,
      distractorCount,
      strategy
    );
  } else {
    distractors = generateIntegerDistractors(
      correct,
      distractorCount,
      strategy
    );
  }

  // Combine correct answer with distractors and shuffle
  return shuffle([correct, ...distractors]);
}

// ============================================
// Answer Checking
// ============================================

export function checkAnswer(
  problem: Problem,
  userAnswer: Operand,
  requireSimplified: boolean
): boolean {
  return operandsEqual(problem.correctAnswer, userAnswer, requireSimplified);
}

// ============================================
// Operation Symbols
// ============================================

export function getOperationSymbol(operation: Operation): string {
  switch (operation) {
    case "addition":
      return "+";
    case "subtraction":
      return "-";
    case "multiplication":
      return "\\times";
    case "division":
      return "\\div";
  }
}

export function getOperationLatex(operation: Operation): string {
  return getOperationSymbol(operation);
}
