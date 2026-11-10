import {
  useEffect,
  useState,
} from 'react';

import {
  Image,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export type AgentState =
  | "listening"
  | "thinking"
  | "speaking"
  | "waiting"
  | "away"
  | "connecting";

const faces = {
  thinking: {
    alt: "🤔",
    uri: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f914/512.gif",
  },
  neutral: {
    alt: "😶",
    uri: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f636/512.gif",
  },
  clouds: {
    alt: "😶‍🌫️",
    uri: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f636_200d_1f32b_fe0f/512.gif",
  },
  sneeze: {
    alt: "🤧",
    uri: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f927/512.gif",
  },
  smile: {
    alt: "🙂",
    uri: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f642/512.gif",
  },
  upsideDown: {
    alt: "🙃",
    uri: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f643/512.gif",
  },
  sleep: {
    alt: "😴",
    uri: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f634/512.gif",
  },
  outline: {
    alt: "🫥",
    uri: "https://fonts.gstatic.com/s/e/notoemoji/latest/1fae5/512.gif",
  },
  raisedEyebrow: {
    alt: "🤨",
    uri: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f928/512.gif",
  },
  eye: {
    alt: "👁",
    uri: "https://fonts.gstatic.com/s/e/notoemoji/latest/1f441_fe0f/512.gif",
  },
} as const;
type FaceKey = keyof typeof faces;

const states: Record<
  AgentState,
  {
    base: FaceKey[];
    expressives: FaceKey[];
  }
> = {
  thinking: {
    base: ["thinking"],
    expressives: [],
  },
  listening: {
    base: ["clouds"],
    expressives: [],
  },
  speaking: {
    base: ["smile"],
    expressives: [],
  },
  waiting: {
    base: ["clouds"],
    expressives: ["sneeze", "upsideDown"],
  },
  away: {
    base: ["sleep"],
    expressives: [],
  },
  connecting: {
    base: ["outline"],
    expressives: [],
  },
};

export function Faces({
  state,
  size = 128,
}: {
  state: AgentState;
  size?: number;
}) {
  const { base } = states[state];
  const [currentFace, setCurrentFace] = useState<FaceKey>(
    () => base[Math.floor(Math.random() * base.length)]
  );

  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    // Fade out, change face, fade in
    opacity.value = withTiming(0, { duration: 150 }, () => {
      "worklet";
      const newBase = base[Math.floor(Math.random() * base.length)];
      scheduleOnRN(setCurrentFace, newBase);
      scale.value = 0;
      opacity.value = withTiming(1, { duration: 150 });
      scale.value = withTiming(1, { duration: 300 });
    });
  }, [state, base, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[animatedStyle, { width: size, height: size }]}>
        <Image
          source={{ uri: faces[currentFace].uri }}
          style={{ width: size, height: size }}
          accessibilityLabel={faces[currentFace].alt}
        />
      </Animated.View>
    </View>
  );
}
