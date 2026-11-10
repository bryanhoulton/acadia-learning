import { components } from "./api";

// Types from API schema
export type Account = components["schemas"]["Account"];
export type AccountRequest = components["schemas"]["AccountRequest"];
export type UserProfile = components["schemas"]["UserProfile"];
export type UserProfileRequest = components["schemas"]["UserProfileRequest"];
export type Goal = components["schemas"]["Goal"];
export type ReportCard = components["schemas"]["ReportCard"];

// Alias for backward compatibility
export type StrengthEnum = components["schemas"]["SkillLevelEnum"];
