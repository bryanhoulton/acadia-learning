import createClient, { Middleware } from "openapi-fetch";

import type { paths } from "../types/api";

// Create the API client
const client = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

export const ALLOWED_LOGOUT_PATHS = [
  "/login",
  "/register",
  "/evaluation",
  "/auth/magic",
  "/report-card",
];
function clearToLogout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("selected_profile_id");

  const isAllowedPath = ALLOWED_LOGOUT_PATHS.some(
    (path) =>
      window.location.pathname === path ||
      window.location.pathname.startsWith(path + "/"),
  );
  if (!isAllowedPath) {
    // Include the current path as a redirect parameter so user can be sent back after login
    const currentPath = window.location.pathname + window.location.search;
    const redirectParam = encodeURIComponent(currentPath);
    window.location.href = `/login?redirect=${redirectParam}`;
  }
}

const AUTH_EXEMPT_PATHS = [
  "/api/lms/accounts/login/",
  "/api/lms/accounts/token/refresh/",
  "/api/lms/accounts/exchange-magic-link/",
  "/api/lms/accounts/report-cards/{uuid}/",
];

const headersMiddleware: Middleware = {
  onRequest: async ({ request, schemaPath }) => {
    if (schemaPath && AUTH_EXEMPT_PATHS.includes(schemaPath)) {
      return;
    }

    request.headers.set("Content-Type", "application/json");
    request.headers.set(
      "Authorization",
      `Bearer ${localStorage.getItem("access_token")}`,
    );
    request.headers.set(
      "X-Selected-Profile-Id",
      localStorage.getItem("selected_profile_id") || "",
    );
    request.headers.set("ngrok-skip-browser-warning", "69420");
  },
  onResponse: async ({ response }) => {
    if (response.status === 401) {
      // Skip refresh logic if this is already a refresh request
      // to avoid infinite loop when refresh token is expired
      const url = response.url;
      if (url.includes("/api/lms/accounts/token/refresh/")) {
        console.error("Refresh token expired or invalid");
        clearToLogout();
        return;
      }

      // If no refresh token, logout and redirect to login
      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        console.error("No refresh token");
        clearToLogout();
        return;
      }

      const { data, error } = await client.POST(
        "/api/lms/accounts/token/refresh/",
        {
          body: { refresh: refreshToken },
        },
      );
      if (error) {
        console.error("Failed to refresh token", error);
        clearToLogout();
        return;
      }
      localStorage.setItem("access_token", data.access);
    }
  },
};

client.use(headersMiddleware);

// Export the client for direct use
export default client;
