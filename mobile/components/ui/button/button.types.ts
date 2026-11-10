import type { PressableProps } from 'react-native';

import type {
  Size,
  Variant,
} from '../lib/types';

export type ButtonVariant = Variant;
export type ButtonSize = Size;

export interface ButtonProps extends Omit<PressableProps, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  iconLeft?: React.ComponentType<{
    width?: number;
    height?: number;
    color?: string;
  }>;
  iconRight?: React.ComponentType<{
    width?: number;
    height?: number;
    color?: string;
  }>;
  onPress?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export interface UseButtonProps {
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
}

export interface UseButtonReturn {
  pressed: boolean;
  handlePressIn: () => void;
  handlePressOut: () => void;
  handlePress: () => void;
}
