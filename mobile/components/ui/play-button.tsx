import React from 'react';

import { Play } from 'lucide-react-native';
import { Pressable } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { cn } from './lib/utils';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PlayButtonProps {
  onPress?: () => void;
  disabled?: boolean;
  size?: number;
  className?: string;
}

export function PlayButton({
  onPress,
  disabled = false,
  size = 200,
  className,
}: PlayButtonProps) {
  const pressValue = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const shadowScale = 1 - pressValue.value * 0.5; // 1 -> 0.5 when pressed
    const scale = 1 - pressValue.value * 0.02; // Slight scale down when pressed

    return {
      transform: [{ scale }],
      shadowColor: "#003324",
      shadowOffset: {
        width: 0,
        height: 4 * shadowScale,
      },
      shadowOpacity: 0.3 * shadowScale,
      shadowRadius: 8 * shadowScale,
      elevation: 8 * shadowScale,
      backgroundColor: interpolateColor(
        pressValue.value,
        [0, 1],
        ["#00a071", "#00845e"] // primary-500 -> primary-700 (from tailwind.config.js)
      ),
    };
  });

  const handlePressIn = () => {
    pressValue.value = withTiming(1, {
      duration: 100,
      easing: Easing.out(Easing.ease),
    });
  };

  const handlePressOut = () => {
    pressValue.value = withTiming(0, {
      duration: 150,
      easing: Easing.out(Easing.ease),
    });
  };

  const iconSize = size * 0.4;

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled}
      style={[animatedStyle, { width: size, height: size }]}
      className={cn(
        "rounded-full items-center justify-center shadow-lg shadow-primary-300/80",
        disabled && "opacity-60",
        className
      )}
    >
      <Play size={iconSize} color="white" fill="white" />
    </AnimatedPressable>
  );
}
