import { useState, useEffect } from 'react';

import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import {
  Dimensions,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import {
  type AnimationName,
  LottieIcon,
} from '@/components/ui/lottie-icon';

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Snappy spring config
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 300,
  mass: 0.8,
};

interface SlideProps {
  animation?: AnimationName;
  animationUri?: string;
  showLogo?: boolean;
  title: string;
  subtitle: string;
}

const slides: SlideProps[] = [
  {
    showLogo: true,
    title: "Acadia Learning",
    subtitle:
      "A personal AI tutor that adapts to your child's unique learning style",
  },
  {
    animationUri:
      "https://lottie.host/bc35a9d0-a8b5-4323-8c54-743211e9c628/AYhEOWc8aN.lottie",
    title: "Live Sessions",
    subtitle: "Get tutored by Acadia in real-time voice calls with a whiteboard.",
  },
  {
    animationUri:
      "https://lottie.host/a734e95a-0087-46b3-acfc-57c23b3747c9/dBhULn9QEc.lottie",
    title: "Fast Results",
    subtitle: "See grades improve and confidence soar in weeks, not months",
  },
];

function Slide({ animation, animationUri, showLogo, title, subtitle }: SlideProps) {

  return (
    <View
      className="items-center justify-center px-8"
      style={{ width: SCREEN_WIDTH }}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        className="w-48 h-48 items-center justify-center mb-8"
      >
        {showLogo ? (
          <Image 
            source={require('@/assets/images/onboarding-hero.png')} 
            style={{ width: 200, height: 200, borderRadius: 24 }}
            resizeMode="cover"
          />
        ) : animationUri ? (
          <LottieIcon uri={animationUri} size={150} loop speed={0.8} />
        ) : (
          <LottieIcon name={animation!} size={150} loop speed={0.8} />
        )}
      </Animated.View>
      <Animated.Text
        entering={FadeIn.duration(200).delay(50)}
        className="text-4xl font-bold text-black text-center mb-4"
      >
        {title}
      </Animated.Text>
      <Animated.Text
        entering={FadeIn.duration(200).delay(100)}
        className="text-lg text-neutral-500 text-center leading-relaxed"
      >
        {subtitle}
      </Animated.Text>
    </View>
  );
}

// Constants for the indicator
const DOT_SIZE = 8;
const ACTIVE_WIDTH = 24;
const DOT_GAP = 8;

// Individual background dot that fades when the pill passes over it
function BackgroundDot({
  index,
  currentIndex,
}: {
  index: number;
  currentIndex: number;
}) {
  const isActive = index === currentIndex;
  const opacity = useSharedValue(isActive ? 0 : 1);
  const scale = useSharedValue(isActive ? 0.6 : 1);
  
  useEffect(() => {
    if (isActive) {
      // Shrink and fade out when active pill arrives
      opacity.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      scale.value = withTiming(0.6, { duration: 200, easing: Easing.out(Easing.cubic) });
    } else {
      // Grow and fade in when active pill leaves
      opacity.value = withSpring(1, { damping: 15, stiffness: 200 });
      scale.value = withSpring(1, { damping: 12, stiffness: 180 });
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: '#d4d4d4',
        },
        animatedStyle,
      ]}
    />
  );
}

function PageIndicator({
  currentIndex,
  total,
}: {
  currentIndex: number;
  total: number;
}) {
  // Calculate the X position of the traveling pill
  // Each dot takes DOT_SIZE width + DOT_GAP spacing
  // The pill is centered on the active dot's position
  const pillX = useSharedValue(currentIndex * (DOT_SIZE + DOT_GAP));
  const pillScale = useSharedValue(1);
  
  useEffect(() => {
    // Animate the pill to the new position with a bouncy spring
    pillX.value = withSpring(currentIndex * (DOT_SIZE + DOT_GAP), {
      damping: 14,
      stiffness: 150,
      mass: 0.8,
    });
    
    // Add a subtle "squish" effect during movement
    pillScale.value = withSpring(1.1, { damping: 8, stiffness: 300 });
    setTimeout(() => {
      pillScale.value = withSpring(1, { damping: 12, stiffness: 200 });
    }, 100);
  }, [currentIndex]);

  const pillStyle = useAnimatedStyle(() => {
    // Calculate stretch based on velocity (simulated by how far we've traveled)
    const stretch = interpolate(
      pillScale.value,
      [1, 1.1],
      [1, 1.05]
    );
    
    return {
      position: 'absolute',
      left: pillX.value,
      width: ACTIVE_WIDTH,
      height: DOT_SIZE,
      borderRadius: DOT_SIZE / 2,
      backgroundColor: '#000',
      transform: [
        { scaleX: stretch },
        { scaleY: interpolate(stretch, [1, 1.05], [1, 0.95]) },
      ],
    };
  });

  // Calculate total width for proper centering
  const totalWidth = total * DOT_SIZE + (total - 1) * DOT_GAP + (ACTIVE_WIDTH - DOT_SIZE);

  return (
    <View 
      style={{ 
        width: totalWidth, 
        height: DOT_SIZE,
        position: 'relative',
      }}
    >
      {/* Background dots layer */}
      <View 
        style={{ 
          flexDirection: 'row', 
          gap: DOT_GAP,
          position: 'absolute',
          left: 0,
          top: 0,
          width: total * DOT_SIZE + (total - 1) * DOT_GAP,
        }}
      >
        {Array.from({ length: total }).map((_, index) => (
          <BackgroundDot
            key={index}
            index={index}
            currentIndex={currentIndex}
          />
        ))}
      </View>
      
      {/* Traveling active pill */}
      <Animated.View style={pillStyle} />
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const translateX = useSharedValue(0);
  const indexShared = useSharedValue(0);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      const nextIndex = currentIndex + 1;
      translateX.value = withSpring(-nextIndex * SCREEN_WIDTH, SPRING_CONFIG);
      indexShared.value = nextIndex;
      setCurrentIndex(nextIndex);
    } else {
      // Go to signup flow for new users
      router.replace("/login?signup=true");
    }
  };

  const panGesture = Gesture.Pan()
    .onEnd((event) => {
      'worklet';
      const SWIPE_THRESHOLD = 50;
      
      if (event.velocityX < -500 || event.translationX < -SWIPE_THRESHOLD) {
        // Swipe left - go next
        if (indexShared.value < slides.length - 1) {
          const nextIndex = indexShared.value + 1;
          indexShared.value = nextIndex;
          translateX.value = withSpring(-nextIndex * SCREEN_WIDTH, SPRING_CONFIG);
          runOnJS(goToSlide)(nextIndex);
        }
      } else if (event.velocityX > 500 || event.translationX > SWIPE_THRESHOLD) {
        // Swipe right - go prev
        if (indexShared.value > 0) {
          const prevIndex = indexShared.value - 1;
          indexShared.value = prevIndex;
          translateX.value = withSpring(-prevIndex * SCREEN_WIDTH, SPRING_CONFIG);
          runOnJS(goToSlide)(prevIndex);
        }
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Header spacer */}
      <View className="h-14" />

      {/* Slides */}
      <GestureDetector gesture={panGesture}>
        <View className="flex-1 justify-center">
          <Animated.View className="flex-row" style={animatedStyle}>
            {slides.map((slide, index) => (
              <Slide key={index} {...slide} />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Bottom section */}
      <View className="px-6 pb-4 gap-4">
        <View className="items-center">
          <PageIndicator currentIndex={currentIndex} total={slides.length + 1} />
        </View>

        <Button
          variant="primary"
          size="xl"
          onPress={handleNext}
          iconRight={ArrowRight}
        >
          {currentIndex === slides.length - 1 ? "Get Started" : "Next"}
        </Button>

        {/* Login option for returning users */}
        <Pressable 
          onPress={() => router.replace("/login")} 
          className="py-2"
          hitSlop={12}
        >
          <Text className="text-neutral-500 text-base text-center">
            Already have an account? <Text className="text-black font-semibold">Log in</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
