import { Platform } from "react-native";
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";
import RevenueCatUI from "react-native-purchases-ui";
import { create } from "zustand";

// RevenueCat API Keys
const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS || '';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || ''; // Update with Android key when available

// Entitlement ID configured in RevenueCat dashboard
const ENTITLEMENT_ID = "Acadia Learning Pro";

export interface PurchasesState {
  isConfigured: boolean;
  customerInfo: CustomerInfo | null;
  currentOffering: PurchasesOffering | null;
  isPremium: boolean;
  hasStripeSubscription: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface PurchasesActions {
  configure: (appUserID?: string) => Promise<void>;
  fetchOfferings: () => Promise<void>;
  purchasePackage: (
    pkg: PurchasesPackage
  ) => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{
    success: boolean;
    restored: boolean;
    error?: string;
  }>;
  checkPremiumStatus: () => Promise<boolean>;
  presentPaywall: () => Promise<{ purchased: boolean; error?: string }>;
  presentCustomerCenter: () => Promise<void>;
  logout: () => Promise<void>;
  loginUser: (appUserID: string) => Promise<void>;
  setStripeSubscription: (hasStripe: boolean) => void;
}

export type PurchasesStore = PurchasesState & PurchasesActions;

const initialState: PurchasesState = {
  isConfigured: false,
  customerInfo: null,
  currentOffering: null,
  isPremium: false,
  hasStripeSubscription: false,
  isLoading: false,
  error: null,
};

export const usePurchasesStore = create<PurchasesStore>()((set, get) => ({
  ...initialState,

  configure: async (appUserID?: string) => {
    try {
      // Only configure once
      if (get().isConfigured) {
        return;
      }

      const apiKey =
        Platform.OS === "ios"
          ? REVENUECAT_API_KEY_IOS
          : REVENUECAT_API_KEY_ANDROID;

      if (!apiKey) {
        throw new Error("Configure the RevenueCat public SDK key for this platform.");
      }

      // Set log level - verbose in dev, errors only in production
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);

      await Purchases.configure({
        apiKey,
        appUserID: appUserID || undefined,
      });

      set({ isConfigured: true });

      // Fetch initial customer info and offerings
      await get().checkPremiumStatus();
      await get().fetchOfferings();

      // Listen for customer info updates
      Purchases.addCustomerInfoUpdateListener((info) => {
        const hasRevenueCatPremium =
          info.entitlements.active[ENTITLEMENT_ID] !== undefined;
        const isPremium = hasRevenueCatPremium || get().hasStripeSubscription;
        set({ customerInfo: info, isPremium });
      });
    } catch (error) {
      console.error("Error configuring RevenueCat:", error);
      set({ error: "Failed to configure purchases" });
    }
  },

  loginUser: async (appUserID: string) => {
    try {
      const { customerInfo } = await Purchases.logIn(appUserID);
      const hasRevenueCatPremium =
        customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
      const isPremium = hasRevenueCatPremium || get().hasStripeSubscription;
      set({ customerInfo, isPremium });
    } catch (error) {
      console.error("Error logging in user to RevenueCat:", error);
    }
  },

  fetchOfferings: async () => {
    try {
      set({ isLoading: true, error: null });

      const offerings = await Purchases.getOfferings();

      if (offerings.current) {
        set({ currentOffering: offerings.current });
      }
    } catch (error) {
      console.error("Error fetching offerings:", error);
      set({ error: "Failed to load subscription options" });
    } finally {
      set({ isLoading: false });
    }
  },

  purchasePackage: async (pkg: PurchasesPackage) => {
    try {
      set({ isLoading: true, error: null });

      // This triggers the native iOS/Android subscription sheet
      const { customerInfo } = await Purchases.purchasePackage(pkg);

      const hasRevenueCatPremium =
        customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
      const isPremium = hasRevenueCatPremium || get().hasStripeSubscription;
      set({ customerInfo, isPremium });

      return { success: isPremium };
    } catch (error: any) {
      // Handle user cancellation - this is normal, not an error
      if (error.userCancelled || error.code === "1" || error.message?.includes("cancelled")) {
        return { success: false };
      }

      // Only log actual errors, not cancellations
      console.error("Purchase error:", error);
      set({ error: "Purchase failed" });
      return { success: false, error: error.message || "Purchase failed" };
    } finally {
      set({ isLoading: false });
    }
  },

  restorePurchases: async () => {
    try {
      set({ isLoading: true, error: null });

      const customerInfo = await Purchases.restorePurchases();
      const hasRevenueCatPremium =
        customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
      const isPremium = hasRevenueCatPremium || get().hasStripeSubscription;

      set({ customerInfo, isPremium });

      return { success: true, restored: isPremium };
    } catch (error: any) {
      console.error("Restore error:", error);
      set({ error: "Failed to restore purchases" });
      return { success: false, restored: false, error: error.message };
    } finally {
      set({ isLoading: false });
    }
  },

  checkPremiumStatus: async () => {
    try {
      // Force fetch from network, not cache
      await Purchases.invalidateCustomerInfoCache();
      const customerInfo = await Purchases.getCustomerInfo();
      
      const hasRevenueCatPremium =
        customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
      const isPremium = hasRevenueCatPremium || get().hasStripeSubscription;

      console.log("🔐 Entitlements:", Object.keys(customerInfo.entitlements.active));
      console.log("🔐 Looking for entitlement:", ENTITLEMENT_ID);
      console.log("🔐 Has Stripe subscription:", get().hasStripeSubscription);

      set({ customerInfo, isPremium });
      return isPremium;
    } catch (error) {
      console.error("Error checking premium status:", error);
      return get().hasStripeSubscription;
    }
  },

  presentPaywall: async () => {
    try {
      set({ isLoading: true, error: null });

      // Present the RevenueCat native paywall
      const paywallResult = await RevenueCatUI.presentPaywall();

      // Check if purchase was made
      if (paywallResult === "PURCHASED" || paywallResult === "RESTORED") {
        // Refresh customer info
        await get().checkPremiumStatus();
        return { purchased: true };
      }

      return { purchased: false };
    } catch (error: any) {
      console.error("Paywall error:", error);
      return { purchased: false, error: error.message };
    } finally {
      set({ isLoading: false });
    }
  },

  presentCustomerCenter: async () => {
    try {
      // Present RevenueCat Customer Center for subscription management
      await RevenueCatUI.presentCustomerCenter();

      // Refresh customer info after closing
      await get().checkPremiumStatus();
    } catch (error) {
      console.error("Error presenting Customer Center:", error);
    }
  },

  logout: async () => {
    try {
      await Purchases.logOut();
      set(initialState);
    } catch (error) {
      console.error("Error logging out of RevenueCat:", error);
    }
  },

  setStripeSubscription: (hasStripe: boolean) => {
    set({ hasStripeSubscription: hasStripe, isPremium: hasStripe || get().isPremium });
  },
}));
