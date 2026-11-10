import React from 'react';

import { LoaderCircle } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { useButton } from '../lib/hooks';
import { cn } from '../lib/utils';
import type { ActionIconProps } from './action-icon.types';

const actionIconVariants = {
  primary: {
    base: "bg-primary-500 border-0 shadow-primary-500/30",
    pressed: "bg-primary-600",
  },
  default: {
    base: "bg-white border border-neutral-300",
    pressed: "bg-neutral-100",
  },
  subtle: {
    base: "bg-transparent border-0 shadow-none",
    pressed: "bg-neutral-200",
  },
};

const actionIconSizes = {
  sm: {
    container: "w-9 h-9",
    icon: 16,
  },
  md: {
    container: "w-12 h-12",
    icon: 20,
  },
  lg: {
    container: "w-14 h-14",
    icon: 24,
  },
};

export function ActionIcon({
  variant = "default",
  size = "md",
  loading = false,
  disabled = false,
  icon: Icon,
  onPress,
  children,
  className,
  ...props
}: ActionIconProps & { children?: React.ReactNode }) {
  const { isPressed, handlePressIn, handlePressOut, handlePress } = useButton({
    disabled,
    loading,
    onPress,
  });

  const variantStyles = actionIconVariants[variant];
  const sizeStyles = actionIconSizes[size];
  const iconSize = sizeStyles.icon;
  const iconColor =
    variant === "primary"
      ? "#ffffff"
      : variant === "subtle"
      ? "#404040"
      : "#171717";

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled || loading}
      className={cn(
        "items-center justify-center rounded-full",
        sizeStyles.container,
        variantStyles.base,
        isPressed && variantStyles.pressed,
        (disabled || loading) && "opacity-60",
        className
      )}
      {...props}
    >
      {loading ? (
        <LoaderCircle
          size={iconSize}
          color={iconColor}
          className="animate-spin"
        />
      ) : Icon ? (
        <Icon width={iconSize} height={iconSize} color={iconColor} />
      ) : (
        children
      )}
    </Pressable>
  );
}
