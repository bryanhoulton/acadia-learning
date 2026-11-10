import type { LucideIcon } from 'lucide-react-native';

export type Size = "sm" | "md" | "lg" | "xl";
export type Variant = "primary" | "secondary" | "outline" | "ghost" | "default" | "subtle";

export type IconComponent = LucideIcon;

export interface BaseComponentProps {
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  className?: string;
}
