import "./index.css";

import { lazy, StrictMode, Suspense, useEffect } from "react";

import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  useLocation,
  useNavigate,
} from "react-router-dom";

import App from "./App.tsx";

const NotFound = lazy(() =>
  import("./pages/NotFound").then((m) => ({ default: m.NotFound })),
);

// Redirect component that preserves query params (UTMs)
function RedirectWithParams({ to }: { to: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    navigate({ pathname: to, search: location.search }, { replace: true });
  }, [navigate, location.search, to]);

  return <div className="min-h-screen bg-[#fafaf9]" />;
}

const PrivacyPolicy = lazy(() =>
  import("./variants/variant-minimal/PrivacyPolicy").then((m) => ({
    default: m.MinimalPrivacyPolicy,
  })),
);
const TermsOfService = lazy(() =>
  import("./variants/variant-minimal/TermsOfService").then((m) => ({
    default: m.MinimalTermsOfService,
  })),
);
const COPPAPage = lazy(() =>
  import("./variants/variant-minimal/COPPA").then((m) => ({
    default: m.COPPA,
  })),
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/evaluation",
    element: <RedirectWithParams to="/" />,
  },
  {
    path: "/privacy",
    element: (
      <Suspense fallback={<div className="min-h-screen bg-[#fafaf9]" />}>
        <PrivacyPolicy />
      </Suspense>
    ),
  },
  {
    path: "/terms",
    element: (
      <Suspense fallback={<div className="min-h-screen bg-[#fafaf9]" />}>
        <TermsOfService />
      </Suspense>
    ),
  },
  {
    path: "/coppa",
    element: (
      <Suspense fallback={<div className="min-h-screen bg-[#fafaf9]" />}>
        <COPPAPage />
      </Suspense>
    ),
  },
  // Redirect old /m/ routes to main routes
  {
    path: "/m/privacy",
    element: <RedirectWithParams to="/privacy" />,
  },
  {
    path: "/m/terms",
    element: <RedirectWithParams to="/terms" />,
  },
  // Catch-all 404 route - must be last
  {
    path: "*",
    element: (
      <Suspense fallback={<div className="min-h-screen bg-[#fafaf9]" />}>
        <NotFound />
      </Suspense>
    ),
  },
]);

// Initialize PostHog as early as possible to load feature flags
if (typeof window !== "undefined") {
  import("posthog-js").then(({ default: posthog }) => {
    posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
      defaults: "2025-05-24",
      loaded: (ph: any) => {
        // Make PostHog globally available for debugging
        (window as any).posthog = ph;
      },
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
