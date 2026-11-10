import { kea } from 'kea';
import posthog from 'posthog-js';
import { toast } from 'sonner';

import {
  Account,
  AccountRequest,
  UserProfileRequest,
} from '../types';
import client from '../utils/api';
import type { authLogicType } from './authLogicType';

export const authLogic = kea<authLogicType>({
  path: ["src", "logic", "authLogic"],

  actions: {
    initTokens: true,
    setTokens: (accessToken: string | null, refreshToken: string | null) => ({
      accessToken,
      refreshToken,
    }),
    fetchAccount: true,
    updateAccount: (account: AccountRequest) => ({ account }),
    setAccount: (account: Account | null) => ({ account }),
    setUserId: (id: string | null) => ({ id }),
    refreshToken: true,

    createProfile: (profile: UserProfileRequest) => ({ profile }),
    updateProfile: (profile: UserProfileRequest & { id: string }) => ({
      profile,
    }),
    deleteProfile: (id: string) => ({ id }),
    setIsProfileRequestLoading: (isLoading: boolean) => ({ isLoading }),
    logout: () => true,
  },

  reducers: {
    accessToken: [
      null as string | null,
      {
        setAccessToken: (_, tokens) => tokens.accessToken,
      },
    ],
    refreshToken: [
      null as string | null,
      {
        setRefreshToken: (_, tokens) => tokens.refreshToken,
      },
    ],
    account: [
      null as Account | null,
      {
        setAccount: (_, { account }) => account,
        updateAccount: (prev, { account }) => {
          if (!prev) return null;
          return {
            ...prev,
            ...account,
          };
        },
        updateProfile: (prev, { profile }) => {
          if (!prev) {
            console.error("No account found");
            return null;
          }
          return {
            ...prev,
            profiles: prev.profiles.map((p) =>
              p.id === profile.id ? { ...p, ...profile } : p
            ),
          };
        },
      },
    ],
    userId: [
      window.localStorage.getItem("selected_profile_id"),
      {
        setUserId: (_, { id }) => {
          if (id) {
            window.localStorage.setItem("selected_profile_id", id);
          } else {
            window.localStorage.removeItem("selected_profile_id");
          }

          return id;
        },
      },
    ],
    isAccountLoading: [
      false,
      {
        setAccount: () => false,
        fetchAccount: () => true,
        logout: () => false, // Ensure loading state is reset on logout
      },
    ],
    hasAttemptedFetch: [
      false,
      {
        fetchAccount: () => true,
        initTokens: () => true, // Mark as attempted when we check for tokens
        logout: () => false, // Reset on logout
      },
    ],
    isProfileRequestLoading: [
      false,
      {
        setIsProfileRequestLoading: (_, { isLoading }) => isLoading,
      },
    ],
  },

  listeners: ({ actions, values }) => ({
    fetchAccount: async () => {
      try {
        // Add timeout protection to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Request timeout")), 10000); // 10 second timeout
        });

        const apiPromise = client.GET("/api/lms/accounts/accounts/");
        const result = await Promise.race([apiPromise, timeoutPromise]);
        const { data, error } = result as Awaited<typeof apiPromise>;

        if (error) {
          console.error("Failed to fetch account", error);
          actions.setAccount(null);
          return;
        }
        if (data.length === 0 || data[0].profiles.length === 0) {
          actions.logout();
          return;
        }
        actions.setAccount(data[0]);
      } catch (error) {
        console.error("Unexpected error fetching account", error);
        actions.setAccount(null);
      }
    },
    updateAccount: async ({ account }, breakpoint) => {
      await breakpoint(500);
      if (!values.account) {
        toast.error("No account found");
        return;
      }
      const { error } = await client.PATCH("/api/lms/accounts/accounts/{id}/", {
        params: { path: { id: values.account.id } },
        body: account,
      });
      if (error) {
        toast.error("Failed to update account");
      }
      toast.success("Account updated");
    },
    refreshToken: async () => {
      if (!values.refreshToken) {
        console.error("No refresh token");
        return;
      }
      const { data, error } = await client.POST(
        "/api/lms/accounts/token/refresh/",
        { body: { refresh: values.refreshToken } }
      );
      if (error) {
        toast.error("Failed to refresh token");
      }
      actions.setTokens(data.access, values.refreshToken);
    },
    setAccount: async ({ account }) => {
      if (!account) {
        return;
      }
      posthog.identify(account.account_phone);

      // Determine which user should be selected
      let selectedUserId = values.userId; // Start with any already-selected userId

      // Validate that the selected userId is actually valid
      if (selectedUserId) {
        const profileExists = account.profiles.some(
          (profile) => profile.id === selectedUserId
        );
        if (!profileExists) {
          // Invalid profile ID, reset to null so we can pick a default
          selectedUserId = null;
          // Also clear it from the store to prevent issues
          actions.setUserId(null);
        }
      }

      // If no userId is selected, pick a default
      if (!selectedUserId) {
        // First, try to find a student profile
        const student = account.profiles.find(
          (profile) => profile.profile_type === "student"
        );
        if (student) {
          selectedUserId = student.id;
        }
        // If no student profile, and there's only one profile, use that
        else if (account.profiles.length === 1) {
          selectedUserId = account.profiles[0].id;
        }
        // Otherwise, default to the first profile
        else if (account.profiles.length > 0) {
          selectedUserId = account.profiles[0].id;
        }
        
        // Set the userId if we determined one
        if (selectedUserId) {
          actions.setUserId(selectedUserId);
        }
      }
    },

    // Profile actions
    createProfile: async ({ profile }) => {
      if (!values.account || !values.account.profiles) {
        toast.error("No account found");
        return;
      }
      actions.setIsProfileRequestLoading(true);
      const { data, error } = await client.POST("/api/lms/accounts/profiles/", {
        body: profile,
      });
      actions.setIsProfileRequestLoading(false);
      if (error) {
        toast.error("Failed to add profile");
        return;
      }
      actions.setAccount({
        ...values.account,
        profiles: [...values.account.profiles, data],
      });
      actions.setUserId(data.id);
    },
    updateProfile: async ({ profile }, breakpoint) => {
      await breakpoint(200);
      const { error } = await client.PUT("/api/lms/accounts/profiles/{id}/", {
        params: { path: { id: profile.id } },
        body: profile,
      });

      if (error) {
        console.error("Profile update error:", error);
        actions.setIsProfileRequestLoading(false);
        return;
      }
    },
    deleteProfile: async ({ id }) => {
      const { error } = await client.DELETE(
        "/api/lms/accounts/profiles/{id}/",
        {
          params: { path: { id } },
        }
      );
      if (error) {
        toast.error("Failed to delete profile");
        return;
      }
      actions.fetchAccount();
    },

    // Token actions
    initTokens: async () => {
      const accessToken = window.localStorage.getItem("access_token");
      const refreshToken = window.localStorage.getItem("refresh_token");
      if (accessToken) {
        actions.setTokens(accessToken, refreshToken);
      }
      // If no token, hasAttemptedFetch is already set to true by the reducer
      // and account remains null, so AuthShell will redirect to login
    },
    setTokens: async ({ accessToken, refreshToken }) => {
      window.localStorage.setItem("access_token", accessToken || "");
      window.localStorage.setItem("refresh_token", refreshToken || "");
      // Only fetch account if we have a token and don't already have an account
      if (accessToken && !values.account) {
        actions.fetchAccount();
      }
    },
    logout: async () => {
      window.localStorage.removeItem("access_token");
      window.localStorage.removeItem("refresh_token");
      actions.setAccount(null);
      actions.setUserId(null);
      // Redirect to login
      window.location.href = "/login";
    },
  }),

  selectors: {
    students: [
      (s) => [s.account],
      (account) =>
        account?.profiles.filter(
          (profile) => profile.profile_type === "student"
        ) || [],
    ],

    user: [
      (s) => [s.userId, s.account],
      (userId, account) => {
        return (
          account?.profiles.find((profile) => profile.id === userId) || null
        );
      },
    ],

    parent: [
      (s) => [s.account],
      (account) =>
        account?.profiles.find(
          (profile) => profile.profile_type === "parent"
        ) || null,
    ],
  },

  events: ({ actions }) => ({
    afterMount: [actions.initTokens],
  }),
});
