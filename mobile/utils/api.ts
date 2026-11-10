import createClient, { Middleware } from 'openapi-fetch';

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { paths } from '../types/api';

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

// Debug: Log the API URL on startup
console.log("🌐 API URL:", API_URL);

// Create the API client
const client = createClient<paths>({
  baseUrl: API_URL,
});

const AUTH_EXEMPT_PATHS = [
  "/api/lms/accounts/login/",
  "/api/lms/accounts/token/refresh/",
];

const headersMiddleware: Middleware = {
  onRequest: async ({ request, schemaPath }) => {
    if (schemaPath && AUTH_EXEMPT_PATHS.includes(schemaPath)) {
      return;
    }

    const accessToken = await AsyncStorage.getItem("access_token");
    // Read selectedProfileId synchronously from the Zustand store rather than
    // AsyncStorage. AsyncStorage writes are fire-and-forget, so reading from
    // it here races against the user picking a profile and immediately
    // triggering a request (e.g. tapping "Start Session"), which would send a
    // stale profile id and start the session for the wrong student.
    // Lazy require to avoid a circular import with auth.store.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require("@/stores/auth.store");
    const selectedProfileId = useAuthStore.getState().selectedProfileId as
      | string
      | null;

    request.headers.set("Content-Type", "application/json");
    request.headers.set("Authorization", `Bearer ${accessToken || ""}`);
    request.headers.set("X-Selected-Profile-Id", selectedProfileId || "");
    request.headers.set("ngrok-skip-browser-warning", "69420");
  },
  onResponse: async ({ response }) => {
    if (response.status === 401) {
      // Skip refresh logic if this is already a refresh request
      // to avoid infinite loop when refresh token is expired
      const url = response.url;
      if (url.includes("/api/lms/accounts/token/refresh/")) {
        console.error("Refresh token expired or invalid");
        await clearAuthAndRedirect();
        return;
      }

      // If no refresh token, logout and redirect to login
      const refreshToken = await AsyncStorage.getItem("refresh_token");
      if (!refreshToken) {
        console.error("No refresh token");
        await clearAuthAndRedirect();
        return;
      }

      const { data, error } = await client.POST(
        "/api/lms/accounts/token/refresh/",
        {
          body: { refresh: refreshToken },
        }
      );
      if (error) {
        console.error("Failed to refresh token", error);
        await clearAuthAndRedirect();
        return;
      }
      await AsyncStorage.setItem("access_token", data.access);
    }
  },
};

async function clearAuthAndRedirect() {
  await AsyncStorage.removeItem("access_token");
  await AsyncStorage.removeItem("refresh_token");
  await AsyncStorage.removeItem("selected_profile_id");
  // In React Native, you'd typically use navigation here
  // This will need to be integrated with your navigation system
  console.log("Auth cleared - redirect to login");
}

client.use(headersMiddleware);

// Export the client for direct use
export default client;
