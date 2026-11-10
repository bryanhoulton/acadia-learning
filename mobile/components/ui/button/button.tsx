import React from 'react';

import {
  Pressable,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useButton } from '../lib/hooks';
import { cn } from '../lib/utils';
import { Loader } from '../loader';
import type { ButtonProps } from './button.types';

const buttonVariants = {
  primary: {
    base: "bg-black",
    pressed: "bg-neutral-800",
    text: "text-white",
    baseColor: "#000000",
    pressedColor: "#262626",
  },
  secondary: {
    base: "bg-neutral-100",
    pressed: "bg-neutral-200",
    text: "text-black",
    baseColor: "#f5f5f5",
    pressedColor: "#e5e5e5",
  },
  outline: {
    base: "bg-white border-2 border-black",
    pressed: "bg-neutral-100",
    text: "text-black",
    baseColor: "#ffffff",
    pressedColor: "#f5f5f5",
  },
  ghost: {
    base: "bg-transparent",
    pressed: "bg-neutral-100",
    text: "text-black",
    baseColor: "transparent",
    pressedColor: "#f5f5f5",
  },
  default: {
    base: "bg-white border border-neutral-200",
    pressed: "bg-neutral-100",
    text: "text-black",
    baseColor: "#ffffff",
    pressedColor: "#f5f5f5",
  },
  subtle: {
    base: "bg-transparent",
    pressed: "bg-neutral-100",
    text: "text-neutral-600",
    baseColor: "transparent",
    pressedColor: "#f5f5f5",
  },
};

const buttonSizes = {
  sm: {
    container: "h-11 px-4",
    text: "text-sm",
    icon: 16,
  },
  md: {
    container: "h-14 px-5",
    text: "text-base",
    icon: 20,
  },
  lg: {
    container: "h-16 px-6",
    text: "text-lg",
    icon: 24,
  },
  xl: {
    container: "h-[60px] px-8",
    text: "text-lg",
    icon: 24,
  },
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Snappy spring config
const SPRING_CONFIG = {
  damping: 15,
  stiffness: 400,
  mass: 0.5,
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  iconLeft: IconLeft,
  iconRight: IconRight,
  onPress,
  children,
  className,
  ...props
}: ButtonProps) {
  const scale = useSharedValue(1);
  const colorProgress = useSharedValue(0);

  const { handlePressIn, handlePressOut, handlePress } = useButton({
    disabled,
    loading,
    onPress,
  });

  const variantStyles = buttonVariants[variant] || buttonVariants.primary;
  const sizeStyles = buttonSizes[size];
  const iconSize = sizeStyles.icon;
  
  const iconColor =
    variant === "primary"
      ? "#ffffff"
      : variant === "outline" || variant === "secondary" || variant === "default"
      ? "#000000"
      : "#525252";

  const animatedStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(
        colorProgress.value,
        [0, 1],
        [variantStyles.baseColor, variantStyles.pressedColor]
      ),
      transform: [{ scale: scale.value }],
    };
  });

  const handleAnimatedPressIn = () => {
    scale.value = withSpring(0.97, SPRING_CONFIG);
    colorProgress.value = withSpring(1, SPRING_CONFIG);
    handlePressIn();
  };

  const handleAnimatedPressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
    colorProgress.value = withSpring(0, SPRING_CONFIG);
    handlePressOut();
  };

  return (
    <AnimatedPressable
      onPressIn={handleAnimatedPressIn}
      onPressOut={handleAnimatedPressOut}
      onPress={handlePress}
      disabled={disabled || loading}
      style={animatedStyle}
      className={cn(
        "flex-row items-center justify-center rounded-2xl",
        variantStyles.base,
        sizeStyles.container,
        (disabled || loading) && "opacity-50",
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader size={iconSize} color={iconColor} />
      ) : (
        <>
          {IconLeft && (
            <View className="mr-2">
              <IconLeft width={iconSize} height={iconSize} color={iconColor} />
            </View>
          )}
          {children && (
            <Text
              className={cn(
                "font-semibold",
                sizeStyles.text,
                variantStyles.text
              )}
            >
              {children}
            </Text>
          )}
          {IconRight && (
            <View className="ml-2">
              <IconRight width={iconSize} height={iconSize} color={iconColor} />
            </View>
          )}
        </>
      )}
    </AnimatedPressable>
  );
}
