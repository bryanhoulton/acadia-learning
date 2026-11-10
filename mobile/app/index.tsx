import {
  useEffect,
  useState,
} from 'react';

import {
  useRootNavigationState,
  useRouter,
} from 'expo-router';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { getRequiredStep, getRouteForStep } from '@/hooks/use-required-step';
import { Logo } from '@/components/ui/logo';
import { useAuthStore, usePurchasesStore } from '@/stores';

// Snappy spring config
const SPRING_CONFIG = {
  damping: 12,
  stiffness: 200,
  mass: 0.5,
};

export default function IndexScreen() {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const verifyToken = useAuthStore((state) => state.verifyToken);
  const refreshAccount = useAuthStore((state) => state.refreshAccount);
  const [hasChecked, setHasChecked] = useState(false);
  
  const logoScale = useSharedValue(0.8);
  const logoOpacity = useSharedValue(0);

  useEffect(() => {
    // Quick, snappy entrance
    logoOpacity.value = withSpring(1, { damping: 20, stiffness: 300 });
    logoScale.value = withSpring(1, SPRING_CONFIG);
  }, []);

  useEffect(() => {
    if (!navigationState?.key || hasChecked) return;

    const performAuthCheck = async () => {
      try {
        await useAuthStore.persist.rehydrate();
        
        // Shorter wait - just enough to see the logo
        await new Promise((resolve) => setTimeout(resolve, 800));

        const isAuthenticated = await checkAuth();
        if (isAuthenticated) {
          const isTokenValid = await verifyToken();
          if (isTokenValid) {
            await refreshAccount();
            
            // Check premium status
            const { checkPremiumStatus } = usePurchasesStore.getState();
            const isPremium = await checkPremiumStatus();
            
            // Get the account and determine required step
            const account = useAuthStore.getState().account;
            const step = getRequiredStep(account, isPremium, false);
            const route = getRouteForStep(step, false);
            
            router.replace(route as any);
          } else {
            router.replace("/welcome");
          }
        } else {
          router.replace("/welcome");
        }
        setHasChecked(true);
      } catch (error) {
        console.error("Error during auth check:", error);
        router.replace("/welcome");
        setHasChecked(true);
      }
    };

    performAuthCheck();
  }, [
    navigationState?.key,
    hasChecked,
    checkAuth,
    verifyToken,
    refreshAccount,
    router,
  ]);

  const animatedLogoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  return (
    <View className="flex-1 justify-center items-center bg-white">
      <Animated.View style={animatedLogoStyle}>
        <Logo variant="black" width={80} height={80} />
      </Animated.View>
    </View>
  );
}
