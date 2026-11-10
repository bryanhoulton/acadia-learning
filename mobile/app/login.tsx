import { useState } from 'react';

import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
} from 'lucide-react-native';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  Pressable,
} from 'react-native';
import { getTimeZone } from 'react-native-localize';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { PhoneInput } from '@/components/ui/phone-input';
import { VerificationCodeInput } from '@/components/ui/verification-code-input';
import { getRequiredStep, getRouteForStep } from '@/hooks/use-required-step';
import { useAuthStore, usePurchasesStore } from '@/stores';
import client from '@/utils/api';

export default function LoginScreen() {
  const router = useRouter();
  const { signup } = useLocalSearchParams<{ signup?: string }>();
  const allowSignup = signup === "true";
  
  const insets = useSafeAreaInsets();
  const phoneNumber = useAuthStore((state) => state.phoneNumber);
  const fullPhoneNumber = useAuthStore((state) => state.fullPhoneNumber);
  const setPhoneNumber = useAuthStore((state) => state.setPhoneNumber);
  const setTokens = useAuthStore((state) => state.setTokens);
  const requestVerificationCode = useAuthStore(
    (state) => state.requestVerificationCode
  );

  const [stage, setStage] = useState<"phone" | "verify">("phone");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isNewAccount, setIsNewAccount] = useState(false);

  const handleRequestCode = async () => {
    if (!phoneNumber) {
      setError("Please enter a phone number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error: apiError, accountCreated } =
        await requestVerificationCode(allowSignup);

      if (apiError) {
        setError(apiError);
        setLoading(false);
        return;
      }

      setIsNewAccount(accountCreated || false);
      setStage("verify");
      setCode("");
    } catch (err) {
      console.error("Login error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: apiError } = await client.POST(
        "/api/lms/accounts/verify-code/",
        {
          body: {
            phone_number: fullPhoneNumber,
            code,
          },
        }
      );

      if (apiError || !data) {
        setError("Invalid code. Please try again.");
        setLoading(false);
        return;
      }

      await setTokens(data.access, data.refresh, data.account);

      // Sync with RevenueCat using account ID
      const { loginUser, checkPremiumStatus, isConfigured, configure, setStripeSubscription } = usePurchasesStore.getState();
      
      console.log("🔐 RevenueCat configured:", isConfigured);
      console.log("🔐 Account ID:", data.account.id);
      console.log("🔐 Stripe customer ID:", data.account.stripe_customer_id);
      
      // Set Stripe subscription status if account has a Stripe customer ID
      if (data.account.stripe_customer_id) {
        setStripeSubscription(true);
      }
      
      // Ensure RevenueCat is configured before proceeding
      if (!isConfigured) {
        console.log("🔐 Configuring RevenueCat...");
        await configure();
      }
      
      try {
        await loginUser(data.account.id);
        console.log("🔐 RevenueCat login successful");
      } catch (e) {
        console.log("🔐 RevenueCat login error:", e);
      }
      
      const isPremium = await checkPremiumStatus();
      console.log("🔐 isPremium:", isPremium);

      // Use self-healing navigation - determine next required step
      // isOnboarding is true for new signups (allowSignup flow)
      const step = getRequiredStep(data.account, isPremium, allowSignup);
      const route = getRouteForStep(step, allowSignup);
      
      console.log("🔐 Required step:", step);
      console.log("🔐 Navigating to:", route);

      router.replace(route as any);
    } catch (err) {
      console.error("Verification error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError("");

    try {
      const deviceTimezone = getTimeZone();

      const { error: apiError } = await client.POST(
        "/api/lms/accounts/request-verification-code/",
        {
          body: {
            phone_number: fullPhoneNumber,
            allow_signup: true,
            source: "mobile",
            timezone: deviceTimezone,
          },
        }
      );

      if (apiError) {
        setError("Failed to resend code");
      }
    } catch (err) {
      console.error("Resend error:", err);
      setError("Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (stage === "verify") {
      setStage("phone");
      setCode("");
      setError("");
    } else {
      // Navigate to welcome since we came here via replace
      router.replace("/welcome");
    }
  };

  const handlePhoneChange = (value: string, fullNumber: string) => {
    setPhoneNumber(value, fullNumber);
    setError("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        className="bg-white"
      >
        <View 
          className="flex-1 bg-white px-6"
          style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
        >
          {/* Header */}
          <View className="flex-row items-center">
            <Pressable
              onPress={handleBack}
              className="w-10 h-10 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200"
              hitSlop={8}
            >
              <ArrowLeft size={20} color="#000" />
            </Pressable>
          </View>

          {/* Content */}
          <View className="flex-1 justify-center py-8">
            {stage === "phone" && (
              <Animated.View 
                entering={FadeInDown.duration(300).springify()}
                className="gap-6"
              >
                <View className="gap-2">
                  <Text className="text-4xl font-bold text-black">
                    {allowSignup ? "What's your\nphone number?" : "Welcome back!"}
                  </Text>
                  <Text className="text-lg text-neutral-500">
                    {allowSignup 
                      ? "We'll send you a code to verify" 
                      : "Enter your phone number to log in"}
                  </Text>
                </View>

                <PhoneInput
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  placeholder="(555) 123-4567"
                  variant="default"
                  size="lg"
                  error={!!error}
                  errorMessage={error}
                />
              </Animated.View>
            )}

            {stage === "verify" && (
              <Animated.View 
                entering={FadeInDown.duration(300).springify()}
                className="gap-6"
              >
                <View className="gap-2">
                  <Text className="text-4xl font-bold text-black">
                    Enter code
                  </Text>
                  <Text className="text-lg text-neutral-500">
                    Sent to {fullPhoneNumber}
                  </Text>
                </View>

                <VerificationCodeInput
                  value={code}
                  onChange={setCode}
                  length={6}
                  error={!!error}
                  autoFocus
                />

                {error && (
                  <Text className="text-sm text-red-500">{error}</Text>
                )}

                <Pressable onPress={handleResend} disabled={loading}>
                  <Text className="text-base text-black font-medium underline">
                    Resend code
                  </Text>
                </Pressable>
              </Animated.View>
            )}
          </View>

          {/* Bottom Button */}
          <View className="pb-4">
            <Button
              variant="primary"
              size="xl"
              onPress={stage === "phone" ? handleRequestCode : handleVerify}
              loading={loading}
              disabled={
                loading ||
                (stage === "phone" && !phoneNumber) ||
                (stage === "verify" && code.length !== 6)
              }
            >
              Continue
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
