import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import {
  Text,
  View,
  Linking,
  Alert,
  Pressable,
  Image,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { getRequiredStep, getRouteForStep } from '@/hooks/use-required-step';
import { useAuthStore, usePurchasesStore } from '@/stores';

// Key for dev bypass
export const DEV_TEXTED_TUTOR_BYPASS_KEY = "dev_texted_tutor_bypass";

const ACADIA_PHONE = "+14155838050";
const SMS_BODY = "Hi! I just signed up and I'm ready to get started.";
const SMS_LINK = `sms:${ACADIA_PHONE}&body=${encodeURIComponent(SMS_BODY)}`;

export default function TextTutorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const refreshAccount = useAuthStore((state) => state.refreshAccount);

  const navigateToNextStep = async () => {
    await refreshAccount();
    const { isPremium } = usePurchasesStore.getState();
    const account = useAuthStore.getState().account;
    const step = getRequiredStep(account, isPremium, false);
    const route = getRouteForStep(step, false);
    router.replace(route as any);
  };

  const handleOpenMessages = async () => {
    try {
      const canOpen = await Linking.canOpenURL(SMS_LINK);
      if (canOpen) {
        await Linking.openURL(SMS_LINK);
        // After opening messages, refresh account and navigate
        // The user will need to actually send the message for has_texted_tutor to be true
        setTimeout(navigateToNextStep, 500);
      } else {
        Alert.alert(
          "Can't Open Messages",
          "Unable to open the Messages app. Please text us at " + ACADIA_PHONE,
        );
      }
    } catch (error) {
      console.error("Error opening SMS:", error);
      Alert.alert(
        "Error",
        "Something went wrong. Please try again.",
      );
    }
  };

  const handleDevSkip = async () => {
    // Set a local bypass flag for dev testing
    await AsyncStorage.setItem(DEV_TEXTED_TUTOR_BYPASS_KEY, "true");
    await navigateToNextStep();
  };

  return (
    <View 
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Dev skip button */}
      {__DEV__ && (
        <View className="flex-row justify-end px-6 py-4">
          <Pressable onPress={handleDevSkip} hitSlop={12}>
            <Text className="text-orange-500 text-base font-medium">Skip (Dev)</Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      <View className="flex-1 px-6 justify-center items-center">
        {/* Hero Image */}
        <Animated.View 
          entering={FadeIn.duration(400)}
          className="mb-8"
        >
          <Image 
            source={require('@/assets/images/onboarding-hero.png')} 
            style={{ width: 200, height: 200, borderRadius: 24 }}
            resizeMode="cover"
          />
        </Animated.View>

        {/* Text */}
        <Animated.Text 
          entering={FadeInDown.duration(300).delay(100).springify()}
          className="text-4xl font-bold text-black text-center mb-4"
        >
          Meet Acadia
        </Animated.Text>
        
        <Animated.Text 
          entering={FadeInDown.duration(300).delay(150).springify()}
          className="text-lg text-neutral-500 text-center px-4 leading-relaxed"
        >
          Send a quick message to introduce yourself and Acadia will help set everything up.
        </Animated.Text>
      </View>

      {/* Bottom CTA */}
      <Animated.View 
        entering={FadeInDown.duration(300).delay(200).springify()}
        className="px-6 pb-4"
      >
        <Button
          variant="primary"
          size="xl"
          onPress={handleOpenMessages}
          iconLeft={MessageCircle}
        >
          Say Hello
        </Button>
        
        <Text className="text-sm text-neutral-400 text-center mt-4">
          It only takes a minute to get started
        </Text>
      </Animated.View>
    </View>
  );
}
