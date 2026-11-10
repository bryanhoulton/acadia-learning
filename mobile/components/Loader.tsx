import React, { useEffect } from 'react';

import { LoaderCircle } from 'lucide-react-native';
import {
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface LoaderProps {
  /** Size of the loader icon */
  size?: number;
  /** Color of the loader icon */
  color?: string;
  /** Optional text to display below the loader */
  text?: string;
  /** Style for the container */
  containerStyle?: ViewStyle;
  /** Style for the text */
  textStyle?: TextStyle;
  /** Whether to show the loader inline (default: false, shows full screen centered) */
  inline?: boolean;
}

export function Loader({
  size = 40,
  color = "#374151",
  text,
  containerStyle,
  textStyle,
  inline = false,
}: LoaderProps) {
  const rotation = useSharedValue(0);

  // Start rotation animation
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1000,
        easing: Easing.linear,
      }),
      -1, // Repeat infinitely
      false
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  const defaultContainerStyle: ViewStyle = inline
    ? {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }
    : {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#ffffff",
        padding: 24,
      };

  const defaultTextStyle: TextStyle = inline
    ? {
        fontSize: 14,
        color: "#6b7280",
      }
    : {
        marginTop: 16,
        fontSize: 16,
        color: "#6b7280",
      };

  return (
    <View style={[defaultContainerStyle, containerStyle]}>
      <Animated.View style={animatedStyle}>
        <LoaderCircle size={size} color={color} />
      </Animated.View>
      {text && <Text style={[defaultTextStyle, textStyle]}>{text}</Text>}
    </View>
  );
}
