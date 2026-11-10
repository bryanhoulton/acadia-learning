export type MathCourseName =
  | "Math 6"
  | "Math 7"
  | "Math 8"
  | "Pre-Algebra"
  | "Algebra I"
  | "Geometry"
  | "Algebra II"
  | "Trigonometry"
  | "Precalculus"
  | "Integrated Math I"
  | "Integrated Math II"
  | "Integrated Math III";

export type MathCourse = {
  name: MathCourseName;
  id: number;
};

export const mathCourses: MathCourse[] = [
  // Middle‑school core
  { name: "Math 6", id: 6 },
  { name: "Math 7", id: 7 },
  { name: "Math 8", id: 8 },
  { name: "Pre-Algebra", id: 9 },

  // High‑school core sequence
  { name: "Algebra I", id: 10 },
  { name: "Geometry", id: 11 },
  { name: "Algebra II", id: 12 },
  { name: "Trigonometry", id: 13 },
  { name: "Precalculus", id: 14 },

  { name: "Integrated Math I", id: 21 },
  { name: "Integrated Math II", id: 22 },
  { name: "Integrated Math III", id: 23 },
];
