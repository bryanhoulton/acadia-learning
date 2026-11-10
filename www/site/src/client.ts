import createClient, { Middleware } from 'openapi-fetch';

import { paths } from './types/api';

const client = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

const authMiddleware: Middleware = {
  onRequest: async ({ request }) => {
    request.headers.set("Content-Type", "application/json");
    request.headers.set("ngrok-skip-browser-warning", "69420");

    if (typeof window === "undefined") {
      return;
    }

    const accessToken = window.localStorage.getItem("access_token");
    const selectedProfileId = window.localStorage.getItem("selected_profile_id");

    if (accessToken) {
      request.headers.set("Authorization", `Bearer ${accessToken}`);
    }

    if (selectedProfileId) {
      request.headers.set("X-Selected-Profile-Id", selectedProfileId);
    }
  },
  onResponse: async ({ response }) => {
    if (response.status !== 401) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem("access_token");
    window.localStorage.removeItem("refresh_token");
    window.localStorage.removeItem("selected_profile_id");
  },
};

client.use(authMiddleware);

export { client };
