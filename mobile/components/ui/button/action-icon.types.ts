import type { PressableProps } from 'react-native';

import type { Size, Variant } from '../lib/types';

export type ActionIconVariant = Variant;
export type ActionIconSize = Size;

export interface ActionIconProps extends PressableProps {
  variant?: ActionIconVariant;
  size?: ActionIconSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentType<{
    width?: number;
    height?: number;
    color?: string;
  }>;
  onPress?: () => void;
  className?: string;
}
