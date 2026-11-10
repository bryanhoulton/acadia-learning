import React, {
  useEffect,
  useState,
} from 'react';

import {
  LocalAudioTrack,
  RemoteAudioTrack,
} from 'livekit-client';
import { LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useMultibandTrackVolume } from '@livekit/react-native';

interface AudioVisualizerProps {
  track: LocalAudioTrack | RemoteAudioTrack;
  enabled: boolean;
  style?: any;
  color?: string;
  inverted?: boolean;
}

const NUM_BARS = 20;
const GAP = 4;
const MAX_OPACITY = 0.7;

function AnimatedBar({
  volume,
  multiplier,
  delay,
  width,
  color,
  inverted,
}: {
  volume: number;
  multiplier: number;
  delay: number;
  width: number;
  color: string;
  inverted: boolean;
}) {
  const height = useSharedValue(10);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const minHeight = 4;
    // Add some randomness to make it more organic
    const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
    const targetHeight = Math.max(
      minHeight,
      volume * multiplier * 60 * randomFactor
    );

    // More responsive timing with easing
    height.value = withTiming(targetHeight, {
      duration: 100,
      // easing: Easing.inOut(Easing.ease),
    });

    // Lerp opacity between 0 and MAX_OPACITY based on volume
    const targetOpacity = Math.min(MAX_OPACITY, volume * 2.5);
    opacity.value = withTiming(targetOpacity, { duration: 100 });
  }, [volume, multiplier, height, opacity]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: height.value,
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View
      style={[
        {
          width,
          backgroundColor: color,
          minHeight: 4,
          // Round only the side away from the screen edge
          ...(inverted
            ? {
                // Agent viz: round bottom, flat top
                borderBottomLeftRadius: 999,
                borderBottomRightRadius: 999,
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
              }
            : {
                // User viz: round top, flat bottom
                borderTopLeftRadius: 999,
                borderTopRightRadius: 999,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
              }),
        },
        animatedStyle,
        inverted && {
          alignSelf: "flex-start",
        },
      ]}
    />
  );
}

export function AudioVisualizer({
  track,
  enabled,
  style,
  color = "#22c55e",
  inverted = false,
}: AudioVisualizerProps) {
  const opacity = useSharedValue(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const bands = useMultibandTrackVolume(track, {
    bands: NUM_BARS,
  });

  useEffect(() => {
    if (enabled && bands.some((band) => band > 0.1)) {
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [enabled, bands, opacity]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setContainerWidth(width);
  };

  // Calculate bar width: (total width - total gap space) / number of bars
  const barWidth =
    containerWidth > 0 ? (containerWidth - GAP * (NUM_BARS - 1)) / NUM_BARS : 0;

  return (
    <Animated.View
      onLayout={handleLayout}
      style={[
        {
          flexDirection: "row",
          alignItems: inverted ? "flex-start" : "flex-end",
          justifyContent: "center",
          gap: GAP,
          height: 32,
        },
        animatedContainerStyle,
        style,
      ]}
    >
      {barWidth > 0 &&
        bands.map((band, index) => (
          <AnimatedBar
            key={index}
            volume={band}
            multiplier={1}
            delay={index * 0.05}
            width={barWidth}
            color={color}
            inverted={inverted}
          />
        ))}
    </Animated.View>
  );
}
