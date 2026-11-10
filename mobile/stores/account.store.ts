import { create } from 'zustand';
import {
  createJSONStorage,
  persist,
} from 'zustand/middleware';

import { PatchedUserProfileRequest } from '@/types';
import client from '@/utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuthStore } from './auth.store';

export interface AccountState {
  zipCode: string;
  timezone: string | null;
}

export interface AccountActions {
  setZipCode: (zipCode: string) => void;
  setTimezone: (timezone: string | null) => void;
  createStudentProfile: (
    name: string,
    metadata?: string
  ) => Promise<{ error?: string }>;
  updateAccountInfo: (
    zipCode: string,
    timezone: string | null
  ) => Promise<{ error?: string }>;
  updateTimezone: (timezone: string) => Promise<{ error?: string }>;
  updateProfile: (
    profileId: string,
    data: PatchedUserProfileRequest
  ) => Promise<{ error?: string }>;
  deleteProfile: (profileId: string) => Promise<{ error?: string }>;
}

export type AccountStore = AccountState & AccountActions;

const initialState: AccountState = {
  zipCode: "",
  timezone: null,
};

export const useAccountStore = create<AccountStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setZipCode: (zipCode: string) => {
        set({ zipCode });
      },

      setTimezone: (timezone: string | null) => {
        set({ timezone });
      },

      createStudentProfile: async (name: string, metadata?: string) => {
        try {
          const { data, error: apiError } = await client.POST(
            "/api/lms/accounts/profiles/",
            {
              body: {
                name,
                profile_type: "student",
                metadata: metadata || "",
              },
            }
          );

          if (apiError || !data) {
            return { error: "Failed to create student profile" };
          }

          return {};
        } catch (err) {
          console.error("Create profile error:", err);
          return { error: "Something went wrong. Please try again." };
        }
      },

      updateAccountInfo: async (zipCode: string, timezone: string | null) => {
        try {
          // Get the account ID from auth store
          const accountId = useAuthStore.getState().account?.id;

          if (!accountId) {
            return { error: "Account not found" };
          }

          const { error: apiError, data } = await client.PATCH(
            "/api/lms/accounts/accounts/{id}/",
            {
              params: { path: { id: accountId } },
              body: {
                zip_code: zipCode,
              },
            }
          );

          if (apiError || !data) {
            return { error: "Failed to update account" };
          }

          set({ zipCode, timezone: data.timezone || null });
          return {};
        } catch (err) {
          console.error("Update account error:", err);
          return { error: "Something went wrong. Please try again." };
        }
      },

      updateTimezone: async (timezone: string) => {
        try {
          // Get the account ID from auth store
          const accountId = useAuthStore.getState().account?.id;

          if (!accountId) {
            return { error: "Account not found" };
          }

          const { error: apiError, data } = await client.PATCH(
            "/api/lms/accounts/accounts/{id}/",
            {
              params: { path: { id: accountId } },
              body: {
                timezone,
              },
            }
          );

          if (apiError || !data) {
            return { error: "Failed to update timezone" };
          }

          set({ timezone: data.timezone || null });

          // Refresh the account in auth store to get the updated data
          await useAuthStore.getState().refreshAccount();

          return {};
        } catch (err) {
          console.error("Update timezone error:", err);
          return { error: "Something went wrong. Please try again." };
        }
      },

      updateProfile: async (
        profileId: string,
        data: PatchedUserProfileRequest
      ) => {
        try {
          const { error: apiError } = await client.PATCH(
            "/api/lms/accounts/profiles/{id}/",
            {
              params: { path: { id: profileId } },
              body: data,
            }
          );

          if (apiError) {
            return { error: "Failed to update profile" };
          }

          return {};
        } catch (err) {
          console.error("Update profile error:", err);
          return { error: "Something went wrong. Please try again." };
        }
      },

      deleteProfile: async (profileId: string) => {
        try {
          // Check if this is the last student profile
          const account = useAuthStore.getState().account;
          const studentProfiles = account?.profiles?.filter(
            (p) => p.profile_type === "student"
          );

          if (studentProfiles && studentProfiles.length <= 1) {
            return {
              error:
                "Cannot delete the last student profile. At least one student profile is required.",
            };
          }

          const { error: apiError } = await client.DELETE(
            "/api/lms/accounts/profiles/{id}/",
            {
              params: { path: { id: profileId } },
            }
          );

          if (apiError) {
            return { error: "Failed to delete profile" };
          }

          return {};
        } catch (err) {
          console.error("Delete profile error:", err);
          return { error: "Something went wrong. Please try again." };
        }
      },
    }),
    {
      name: "account-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        zipCode: state.zipCode,
        timezone: state.timezone,
      }),
      skipHydration: true,
    }
  )
);
