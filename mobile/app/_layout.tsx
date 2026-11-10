import "../global.css";
import "react-native-reanimated";

import { useEffect } from "react";

import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useAuthStore, usePurchasesStore } from "@/stores";
import { facebookAnalytics } from "@/utils/facebook-analytics";
import { registerGlobals } from "@livekit/react-native";

// Wrap in try-catch to prevent production crashes
try {
  registerGlobals();
} catch (error) {
  console.error("Failed to register LiveKit globals:", error);
}

export default function RootLayout() {
  const pathname = usePathname();
  const configurePurchases = usePurchasesStore((state) => state.configure);
  const loginUser = usePurchasesStore((state) => state.loginUser);
  const setStripeSubscription = usePurchasesStore((state) => state.setStripeSubscription);
  const isConfigured = usePurchasesStore((state) => state.isConfigured);
  const account = useAuthStore((state) => state.account);

  useEffect(() => {
    // Wrap all initializations in try-catch to prevent crashes
    const initializeApp = async () => {
      try {
        await facebookAnalytics.initialize();
      } catch (error) {
        console.error("Facebook analytics init failed:", error);
      }

      try {
        await configurePurchases();
      } catch (error) {
        console.error("RevenueCat init failed:", error);
      }
    };

    initializeApp();
  }, []);

  // When user logs in, identify them in RevenueCat and set Stripe subscription status
  useEffect(() => {
    if (isConfigured && account?.id) {
      loginUser(account.id);
      // Set Stripe subscription status if account has a Stripe customer ID
      setStripeSubscription(!!account.stripe_customer_id);
    }
  }, [isConfigured, account?.id, account?.stripe_customer_id]);

  useEffect(() => {
    if (pathname) {
      facebookAnalytics.logPageView(pathname);
    }
  }, [pathname]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 200,
          gestureEnabled: true,
          gestureDirection: "horizontal",
          contentStyle: { backgroundColor: "#ffffff" },
        }}
      >
        {/* Splash screen */}
        <Stack.Screen
          name="index"
          options={{
            animation: "fade",
            animationDuration: 150,
          }}
        />

        {/* Welcome/onboarding flow */}
        <Stack.Screen
          name="welcome"
          options={{
            animation: "fade",
            animationDuration: 200,
          }}
        />

        {/* Login screen */}
        <Stack.Screen
          name="login"
          options={{
            animation: "slide_from_right",
            animationDuration: 250,
          }}
        />

        {/* Onboarding */}
        <Stack.Screen
          name="onboarding"
          options={{
            animation: "slide_from_right",
            animationDuration: 250,
          }}
        />

        {/* Paywall */}
        <Stack.Screen
          name="paywall"
          options={{
            animation: "slide_from_bottom",
            animationDuration: 300,
            presentation: "modal",
          }}
        />

        {/* Text Tutor */}
        <Stack.Screen
          name="text-tutor"
          options={{
            animation: "slide_from_right",
            animationDuration: 250,
          }}
        />

        {/* Main tabs */}
        <Stack.Screen
          name="(tabs)"
          options={{
            animation: "fade",
            animationDuration: 200,
          }}
        />

        {/* Profile screens */}
        <Stack.Screen
          name="profile/[id]"
          options={{
            animation: "slide_from_right",
            animationDuration: 250,
          }}
        />

        <Stack.Screen
          name="profile/new"
          options={{
            animation: "slide_from_bottom",
            animationDuration: 300,
            presentation: "modal",
          }}
        />
      </Stack>
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  );
}
