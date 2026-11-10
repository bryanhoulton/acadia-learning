import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { LoaderCircle } from 'lucide-react-native';

export interface LoaderProps {
  size?: number;
  color?: string;
  className?: string;
}

export function Loader({ size = 24, color = '#00a071', className }: LoaderProps) { // primary-500 from tailwind.config.js
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, [spinValue]);

  const rotate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }} className={className}>
      <LoaderCircle size={size} color={color} />
    </Animated.View>
  );
}

