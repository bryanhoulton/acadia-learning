import React, {
  useEffect,
  useRef,
} from 'react';

import LottieView, { type LottieViewProps } from 'lottie-react-native';
import { View } from 'react-native';

// Animation sources - all black line art style
export const animations = {
  // Core actions
  play: require("@/assets/animations/play.json"),
  check: require("@/assets/animations/check.json"),
  loading: require("@/assets/animations/loading.json"),

  // Onboarding
  wave: require("@/assets/animations/wave.json"),
  brain: require("@/assets/animations/brain.json"),
  sprout: require("@/assets/animations/sprout.json"),
  growth: require("@/assets/animations/growth.json"),

  // Communication
  typing: require("@/assets/animations/typing.json"),

  // Celebration
  confetti: require("@/assets/animations/confetti.json"),
} as const;

export type AnimationName = keyof typeof animations;

interface LottieIconBaseProps {
  size?: number;
  autoPlay?: boolean;
  loop?: boolean;
  speed?: number;
  onAnimationFinish?: () => void;
  style?: LottieViewProps["style"];
}

interface LottieIconNameProps extends LottieIconBaseProps {
  name: AnimationName;
  uri?: never;
}

interface LottieIconUriProps extends LottieIconBaseProps {
  uri: string;
  name?: never;
}

type LottieIconProps = LottieIconNameProps | LottieIconUriProps;

export function LottieIcon({
  name,
  uri,
  size = 64,
  autoPlay = true,
  loop = true,
  speed = 1,
  onAnimationFinish,
  style,
}: LottieIconProps) {
  const lottieRef = useRef<LottieView>(null);

  useEffect(() => {
    if (autoPlay && lottieRef.current) {
      lottieRef.current.play();
    }
  }, [autoPlay]);

  const source = uri ? { uri } : animations[name!];

  return (
    <LottieView
      ref={lottieRef}
      source={source}
      autoPlay={autoPlay}
      loop={loop}
      speed={speed}
      onAnimationFinish={onAnimationFinish}
      style={[{ width: size, height: size }, style]}
    />
  );
}

// Wrapper with background container
interface LottieBoxProps extends LottieIconProps {
  backgroundColor?: string;
  borderRadius?: number;
}

export function LottieBox({
  backgroundColor = "#f5f5f5",
  borderRadius = 24,
  size = 48,
  ...props
}: LottieBoxProps) {
  const boxSize = size * 1.5;

  return (
    <View
      style={{
        width: boxSize,
        height: boxSize,
        backgroundColor,
        borderRadius,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LottieIcon size={size} {...props} />
    </View>
  );
}
