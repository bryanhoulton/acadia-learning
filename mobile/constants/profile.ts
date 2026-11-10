import { SelectOption } from '@/components/ui/select';

export const GRADE_OPTIONS: SelectOption<string>[] = [
  { label: "Kindergarten", value: "Kindergarten" },
  { label: "1st Grade", value: "1st Grade" },
  { label: "2nd Grade", value: "2nd Grade" },
  { label: "3rd Grade", value: "3rd Grade" },
  { label: "4th Grade", value: "4th Grade" },
  { label: "5th Grade", value: "5th Grade" },
  { label: "6th Grade", value: "6th Grade" },
  { label: "7th Grade", value: "7th Grade" },
  { label: "8th Grade", value: "8th Grade" },
  { label: "9th Grade", value: "9th Grade" },
  { label: "10th Grade", value: "10th Grade" },
  { label: "11th Grade", value: "11th Grade" },
  { label: "12th Grade", value: "12th Grade" },
  { label: "College", value: "College" },
];

export const MATH_LEVEL_OPTIONS: SelectOption<string>[] = [
  { label: "Basic Arithmetic", value: "Basic Arithmetic" },
  { label: "Pre-Algebra", value: "Pre-Algebra" },
  { label: "Algebra 1", value: "Algebra 1" },
  { label: "Geometry", value: "Geometry" },
  { label: "Algebra 2", value: "Algebra 2" },
  { label: "Pre-Calculus", value: "Pre-Calculus" },
  { label: "Calculus", value: "Calculus" },
  { label: "Statistics", value: "Statistics" },
];

export interface ProfileMetadata {
  grade?: string;
  math_level?: string;
}

export function parseMetadata(metadata?: string | null): ProfileMetadata {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}
