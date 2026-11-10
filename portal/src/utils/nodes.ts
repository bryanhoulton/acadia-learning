import { SlateVariant } from 'slate-ui';

import type { components } from '../types/api';

// Use SkillLevelEnum (the current API schema name for strength levels)
type StrengthEnum = components["schemas"]["SkillLevelEnum"];

export function getProgressVariant(strength: StrengthEnum): SlateVariant {
  if (strength === "mastered") return "info";
  if (strength === "reinforcing") return "success";
  if (strength === "learning") return "warning";
  return "subtle";
}

export function getConfidenceLabel(numEvidence: number) {
  if (numEvidence >= 8) return "High";
  if (numEvidence >= 4) return "Medium";
  if (numEvidence >= 1) return "Low";
  return "Very Low";
}

const STRENGTH_MAP: Record<StrengthEnum, number> = {
  automatic: 4,
  mastered: 3,
  reinforcing: 2,
  learning: 1,
  untouched: 0,
};
export const INVERSE_STRENGTH_MAP: Record<number, StrengthEnum> =
  Object.fromEntries(
    Object.entries(STRENGTH_MAP).map(([key, value]) => [
      value,
      key as StrengthEnum,
    ])
  );

export function compareStrength(
  strength1: StrengthEnum,
  strength2: StrengthEnum
) {
  const strength1Value = STRENGTH_MAP[strength1];
  const strength2Value = STRENGTH_MAP[strength2];
  return strength1Value - strength2Value;
}

export function averageStrengthNumber(
  strengths: (StrengthEnum | undefined | null)[]
): number {
  if (strengths.length === 0) return 0;
  const total = strengths.reduce(
    (acc, strength) => acc + STRENGTH_MAP[strength ?? "untouched"],
    0
  );
  return total / strengths.length;
}

export function averageStrength(
  strengths: (StrengthEnum | undefined | null)[]
): StrengthEnum {
  if (strengths.length === 0) return "untouched";
  const avg = averageStrengthNumber(strengths);
  return INVERSE_STRENGTH_MAP[Math.ceil(avg)];
}

export function sortByStrength<
  K extends keyof T,
  T extends { [key in K]: StrengthEnum },
>(groups: T[], key: K): T[] {
  return groups.sort((a, b) => compareStrength(b[key], a[key]));
}
