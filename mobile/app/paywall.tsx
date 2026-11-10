import { useEffect, useState } from "react";

import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, X } from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { PACKAGE_TYPE, PurchasesPackage } from "react-native-purchases";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { LottieIcon } from "@/components/ui/lottie-icon";
import { getRequiredStep, getRouteForStep } from "@/hooks/use-required-step";
import { useAuthStore, usePurchasesStore } from "@/stores";
import { facebookAnalytics } from "@/utils/facebook-analytics";

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 400,
  mass: 0.5,
};

function PlanCard({
  title,
  price,
  period,
  savings,
  selected,
  onPress,
  index = 0,
}: {
  title: string;
  price: string;
  period: string;
  savings?: string;
  selected: boolean;
  onPress: () => void;
  index?: number;
}) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.98, SPRING_CONFIG);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.duration(250).delay(index * 50).springify()}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View
          style={animatedStyle}
          className={`p-5 rounded-2xl border-2 ${
            selected ? "border-black bg-neutral-50" : "border-neutral-200 bg-white"
          }`}
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text
                  className={`text-lg font-semibold ${
                    selected ? "text-black" : "text-neutral-900"
                  }`}
                >
                  {title}
                </Text>
                {savings && (
                  <View className="bg-green-100 px-2 py-0.5 rounded-full">
                    <Text className="text-green-700 text-xs font-semibold">
                      {savings}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-2xl font-bold text-black mt-1">{price}</Text>
              <Text className="text-sm text-neutral-500">{period}</Text>
            </View>
            {selected && (
              <View className="w-6 h-6 bg-black rounded-full items-center justify-center">
                <Check size={14} color="#fff" strokeWidth={3} />
              </View>
            )}
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}


export default function PaywallScreen() {
  const router = useRouter();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const insets = useSafeAreaInsets();
  const [selectedPackage, setSelectedPackage] =
    useState<PurchasesPackage | null>(null);

  const {
    isPremium,
    isConfigured,
    currentOffering,
    purchasePackage,
    restorePurchases,
    isLoading,
    fetchOfferings,
    configure,
  } = usePurchasesStore();
  
  const account = useAuthStore((state) => state.account);
  // Consider it onboarding if explicitly set or if user hasn't texted tutor yet
  const isOnboarding = onboarding === "true" || !account?.has_texted_tutor;

  const navigateToNextStep = () => {
    const step = getRequiredStep(account, true, isOnboarding);
    const route = getRouteForStep(step, isOnboarding);
    router.replace(route as any);
  };

  useEffect(() => {
    // If already premium, navigate to next required step
    if (isPremium) {
      setTimeout(navigateToNextStep, 100);
      return;
    }

    // Ensure RevenueCat is configured
    if (!isConfigured && !isLoading) {
      configure();
      return;
    }

    // Fetch offerings if not loaded
    if (isConfigured && !currentOffering && !isLoading) {
      fetchOfferings();
    }
  }, [isConfigured, isPremium, currentOffering, isLoading]);

  // Auto-select monthly package when offerings load
  useEffect(() => {
    if (currentOffering && !selectedPackage) {
      const monthlyPackage = currentOffering.availablePackages.find(
        (pkg) => pkg.packageType === PACKAGE_TYPE.MONTHLY
      );
      if (monthlyPackage) {
        setSelectedPackage(monthlyPackage);
      } else if (currentOffering.availablePackages.length > 0) {
        setSelectedPackage(currentOffering.availablePackages[0]);
      }
    }
  }, [currentOffering, selectedPackage]);

  const handlePurchase = async () => {
    if (!selectedPackage) return;

    const { success, error } = await purchasePackage(selectedPackage);

    if (success) {
      // Track Facebook trial start event
      facebookAnalytics.logTrialStart(
        selectedPackage.identifier,
        selectedPackage.product.price,
        selectedPackage.product.currencyCode
      );

      setTimeout(navigateToNextStep, 100);
    } else if (error) {
      Alert.alert("Error", error);
    }
    // If cancelled, just stay on the screen
  };

  const handleRestore = async () => {
    const { success, restored, error } = await restorePurchases();

    if (restored) {
      Alert.alert("Success", "Your subscription has been restored!", [
        { text: "OK", onPress: navigateToNextStep },
      ]);
    } else if (error) {
      Alert.alert("Error", error);
    } else {
      Alert.alert(
        "No Subscription Found",
        "We couldn't find any previous subscriptions to restore."
      );
    }
  };

  const handleClose = () => {
    if (__DEV__) {
      router.replace("/(tabs)/home");
    } else {
      router.back();
    }
  };

  // Get packages
  const yearlyPackage = currentOffering?.availablePackages.find(
    (pkg) => pkg.packageType === PACKAGE_TYPE.ANNUAL
  );
  const monthlyPackage = currentOffering?.availablePackages.find(
    (pkg) => pkg.packageType === PACKAGE_TYPE.MONTHLY
  );

  // Calculate savings
  const calculateSavings = () => {
    if (!yearlyPackage || !monthlyPackage) return null;
    const yearlyPrice = yearlyPackage.product.price;
    const monthlyPrice = monthlyPackage.product.price;
    const yearlyMonthlyEquivalent = yearlyPrice / 12;
    const savingsPercent = Math.round(
      ((monthlyPrice - yearlyMonthlyEquivalent) / monthlyPrice) * 100
    );
    return savingsPercent > 0 ? `Save ${savingsPercent}%` : null;
  };

  const savings = calculateSavings();

  // Show loading while configuring
  if (!isConfigured || !currentOffering) {
    return (
      <View
        className="flex-1 bg-white items-center justify-center"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <ActivityIndicator size="large" color="#000" />
        <Text className="text-neutral-500 mt-4">Loading plans...</Text>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-end px-6 py-4">
        {__DEV__ && (
          <Pressable
            onPress={handleClose}
            className="w-10 h-10 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200"
            hitSlop={8}
          >
            <X size={20} color="#737373" />
          </Pressable>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View
          entering={FadeInDown.duration(300).springify()}
          className="items-center mb-8"
        >
          <View className="w-32 h-32 items-center justify-center mb-4">
            <LottieIcon
              uri="https://lottie.host/b48f69f3-1cae-4257-bbc7-bdde8d836937/7BJR6c2eAm.lottie"
              size={120}
              loop
              speed={0.8}
            />
          </View>
          <Text className="text-4xl font-bold text-black text-center">
            Try it free{"\n"}for 7 days
          </Text>
          <Text className="text-lg text-neutral-500 text-center mt-3">
            See your child light up when learning clicks
          </Text>
        </Animated.View>

        {/* Plans */}
        <View className="gap-3 mb-6">
          {monthlyPackage && (
            <PlanCard
              title="Monthly"
              price={monthlyPackage.product.priceString}
              period="per month after trial"
              selected={selectedPackage?.identifier === monthlyPackage.identifier}
              onPress={() => setSelectedPackage(monthlyPackage)}
              index={0}
            />
          )}
          {yearlyPackage && (
            <PlanCard
              title="Yearly"
              price={yearlyPackage.product.priceString}
              period="per year after trial"
              savings={savings || undefined}
              selected={selectedPackage?.identifier === yearlyPackage.identifier}
              onPress={() => setSelectedPackage(yearlyPackage)}
              index={1}
            />
          )}
        </View>

        {/* Spacer */}
        <View className="flex-1" />
      </ScrollView>

      {/* Bottom section */}
      <View className="px-6 pb-4 pt-2 border-t border-neutral-100">
        <Button
          variant="primary"
          size="xl"
          onPress={handlePurchase}
          loading={isLoading}
          disabled={!selectedPackage || isLoading}
        >
          Start 7-Day Free Trial
        </Button>

        <Pressable onPress={handleRestore} className="py-3" hitSlop={12}>
          <Text className="text-neutral-500 text-sm text-center">
            Already subscribed?{" "}
            <Text className="text-black font-semibold">Restore Purchase</Text>
          </Text>
        </Pressable>

        <Text className="text-neutral-400 text-xs text-center">
          Free for 7 days, then {selectedPackage?.product.priceString ?? ""}/{selectedPackage?.packageType === PACKAGE_TYPE.ANNUAL ? "year" : "month"}. Cancel anytime.
        </Text>
      </View>
    </View>
  );
}
