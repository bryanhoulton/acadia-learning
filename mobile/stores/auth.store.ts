import { create } from 'zustand';
import {
  createJSONStorage,
  persist,
} from 'zustand/middleware';
import { getTimeZone } from 'react-native-localize';

import { components } from '@/types/api';
import client from '@/utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Account = components["schemas"]["Account"];

export interface AuthState {
  phoneNumber: string;
  fullPhoneNumber: string;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  account: Account | null;
  accountCreated: boolean;
  selectedProfileId: string | null;
}

export interface AuthActions {
  setPhoneNumber: (phoneNumber: string, fullPhoneNumber: string) => void;
  setTokens: (access: string, refresh: string, account: Account) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  requestVerificationCode: (allowSignup?: boolean) => Promise<{
    error?: string;
    accountCreated?: boolean;
  }>;
  verifyToken: () => Promise<boolean>;
  refreshAccount: () => Promise<void>;
  setSelectedProfileId: (selectedProfileId: string) => void;
  refreshAuthIfNeeded: () => Promise<boolean>;
  deleteAccount: () => Promise<{ error?: string }>;
}

export type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  phoneNumber: "",
  fullPhoneNumber: "",
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  account: null,
  accountCreated: false,
  selectedProfileId: null,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setPhoneNumber: (phoneNumber: string, fullPhoneNumber: string) => {
        set({ phoneNumber, fullPhoneNumber });
      },

      setTokens: async (access: string, refresh: string, account: Account) => {
        set({
          accessToken: access,
          refreshToken: refresh,
          isAuthenticated: true,
        });
        // Also save to AsyncStorage for API client
        AsyncStorage.setItem("access_token", access);
        AsyncStorage.setItem("refresh_token", refresh);

        // Request the account data
        const { data, error } = await client.GET("/api/lms/accounts/accounts/");
        if (error) {
          console.error("Error requesting account data:", error);
        }
        if (data.length === 0) {
          console.error("No account data found");
          return;
        }
        set({ account: data[0] });
        if (account.profiles.length === 0) {
          console.error("No profiles found");
          return;
        }
        const firstStudent = account.profiles.find(
          (p) => p.profile_type === "student"
        );
        if (!firstStudent) {
          console.error("No student profile found");
          return;
        }
        set({ selectedProfileId: firstStudent.id });
      },

      logout: async () => {
        try {
          await AsyncStorage.removeItem("access_token");
          await AsyncStorage.removeItem("refresh_token");
          await AsyncStorage.removeItem("selected_profile_id");
          set(initialState);
        } catch (error) {
          console.error("Error during logout:", error);
        }
      },

      checkAuth: async () => {
        try {
          const token = await AsyncStorage.getItem("access_token");
          if (token) {
            set({ accessToken: token, isAuthenticated: true });
            return true;
          }
          return false;
        } catch (error) {
          console.error("Error checking auth:", error);
          return false;
        }
      },

      requestVerificationCode: async (allowSignup = true) => {
        try {
          const { fullPhoneNumber } = get();

          if (!fullPhoneNumber) {
            return { error: "Phone number is required" };
          }

          // Get device timezone
          const deviceTimezone = getTimeZone();

          const { error: apiError, data } = await client.POST(
            "/api/lms/accounts/request-verification-code/",
            {
              body: {
                phone_number: fullPhoneNumber,
                allow_signup: allowSignup,
                source: "mobile",
                timezone: deviceTimezone,
              },
            }
          );

          if (apiError) {
            // Check if the error is because account doesn't exist
            const errorMessage = (apiError as any)?.message || (apiError as any)?.error;
            if (!allowSignup && errorMessage?.toLowerCase().includes("account")) {
              return { error: "No account found with this phone number. Please sign up first." };
            }
            return { error: errorMessage || "Failed to send verification code" };
          }

          return { accountCreated: data.account_created };
        } catch (err) {
          console.error("Login error:", err);
          return { error: "Something went wrong. Please try again." };
        }
      },

      verifyToken: async () => {
        try {
          const token = await AsyncStorage.getItem("access_token");
          if (!token) {
            return false;
          }

          // Try to verify token by making an authenticated request
          const { error } = await client.GET("/api/lms/accounts/accounts/");

          if (error) {
            // Handle specific error codes gracefully
            const errorCode = (error as any)?.code;
            if (errorCode === "user_not_found") {
              console.log("User no longer exists, clearing auth");
            } else {
              console.error("Token verification failed:", error);
            }
            await get().logout();
            return false;
          }

          return true;
        } catch (error) {
          console.error("Error verifying token:", error);
          await get().logout();
          return false;
        }
      },

      setSelectedProfileId: (selectedProfileId: string) => {
        set({ selectedProfileId });
      },

      refreshAuthIfNeeded: async () => {
        try {
          const { accessToken, refreshToken } = get();

          if (!accessToken || !refreshToken) {
            return false;
          }

          // Try to verify the current token
          const isValid = await get().verifyToken();
          if (!isValid) {
            // Token is invalid, try to refresh
            const refreshed = await get().checkAuth();
            return refreshed;
          }

          return true;
        } catch (error) {
          console.error("Error refreshing auth:", error);
          return false;
        }
      },

      refreshAccount: async () => {
        try {
          // Fetch the latest account data
          const { data, error } = await client.GET(
            "/api/lms/accounts/accounts/"
          );
          if (error) {
            const errorCode = (error as any)?.code;
            if (errorCode === "user_not_found") {
              console.log("User no longer exists, logging out");
              await get().logout();
              return;
            }
            console.error("Error refreshing account data:", error);
            return;
          }
          if (!data || data.length === 0) {
            console.log("No account data found, logging out");
            await get().logout();
            return;
          }

          const account = data[0];
          set({ account });

          // Update selected profile if needed
          const currentSelectedId = get().selectedProfileId;

          // If no profile is currently selected, or the selected profile doesn't exist anymore
          const currentProfileExists = account.profiles.some(
            (p) => p.id === currentSelectedId
          );

          if (!currentSelectedId || !currentProfileExists) {
            // Find first student profile
            const firstStudent = account.profiles.find(
              (p) => p.profile_type === "student"
            );
            if (firstStudent) {
              set({ selectedProfileId: firstStudent.id });
            }
          }
        } catch (error) {
          console.error("Error refreshing account:", error);
        }
      },

      deleteAccount: async () => {
        try {
          const account = get().account;
          if (!account) {
            return { error: "No account found" };
          }

          const { error: apiError } = await client.DELETE(
            "/api/lms/accounts/accounts/{id}/",
            {
              params: { path: { id: account.id } },
            }
          );

          if (apiError) {
            return { error: "Failed to delete account" };
          }

          // Clear all auth data after successful deletion
          await get().logout();

          return {};
        } catch (err) {
          console.error("Delete account error:", err);
          return { error: "Something went wrong. Please try again." };
        }
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        phoneNumber: state.phoneNumber,
        fullPhoneNumber: state.fullPhoneNumber,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        selectedProfileId: state.selectedProfileId,
        // Note: account is NOT persisted - it's fetched fresh on app open
      }),
      skipHydration: true,
    }
  )
);
