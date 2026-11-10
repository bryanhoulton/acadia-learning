import { useCallback } from "react";

import { useRouter } from "expo-router";

import { usePurchasesStore } from "@/stores";

/**
 * Hook for checking premium status and presenting paywall
 *
 * @example
 * const { isPremium, requirePremium, presentPaywall } = usePremium();
 *
 * // Check if user has premium
 * if (isPremium) {
 *   // Show premium feature
 * }
 *
 * // Gate a feature behind premium
 * const handlePremiumAction = () => {
 *   requirePremium(() => {
 *     // This only runs if user is premium or just purchased
 *   });
 * };
 */
export function usePremium() {
  const router = useRouter();
  const isPremium = usePurchasesStore((state) => state.isPremium);
  const isLoading = usePurchasesStore((state) => state.isLoading);
  const presentPaywallAction = usePurchasesStore((state) => state.presentPaywall);
  const customerInfo = usePurchasesStore((state) => state.customerInfo);

  /**
   * Present the RevenueCat paywall
   * Returns true if user purchased/restored, false otherwise
   */
  const presentPaywall = useCallback(async (): Promise<boolean> => {
    const { purchased } = await presentPaywallAction();
    return purchased;
  }, [presentPaywallAction]);

  /**
   * Navigate to the paywall screen (alternative to presenting inline)
   */
  const navigateToPaywall = useCallback(() => {
    router.push("/paywall");
  }, [router]);

  /**
   * Gate an action behind premium status
   * If user is premium, callback executes immediately
   * If not, shows paywall and executes callback only if user subscribes
   */
  const requirePremium = useCallback(
    async (callback: () => void | Promise<void>) => {
      if (isPremium) {
        await callback();
        return;
      }

      const purchased = await presentPaywall();
      if (purchased) {
        await callback();
      }
    },
    [isPremium, presentPaywall]
  );

  /**
   * Get subscription info for display
   */
  const getSubscriptionInfo = useCallback(() => {
    if (!customerInfo) {
      return null;
    }

    const entitlement = customerInfo.entitlements.active["Acadia Learning Pro"];
    if (!entitlement) {
      return null;
    }

    return {
      isActive: true,
      productId: entitlement.productIdentifier,
      expirationDate: entitlement.expirationDate
        ? new Date(entitlement.expirationDate)
        : null,
      willRenew: entitlement.willRenew,
      isSandbox: entitlement.isSandbox,
    };
  }, [customerInfo]);

  return {
    isPremium,
    isLoading,
    presentPaywall,
    navigateToPaywall,
    requirePremium,
    getSubscriptionInfo,
    customerInfo,
  };
}
