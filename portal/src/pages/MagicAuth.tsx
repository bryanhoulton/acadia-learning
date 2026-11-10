import { useEffect, useState } from "react";

import { useActions } from "kea";
import { Loader2, Shield } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Logo } from "../components/Logo";
import { authLogic } from "../logic/authLogic";
import client from "../utils/api";

/**
 * MagicAuth page handles cross-domain authentication via one-time tokens.
 * When a user signs up or logs in on www.acadialearning.org and already has
 * an account, they're redirected here with a magic link token that gets
 * exchanged for JWT tokens, allowing seamless login without re-verification.
 */
function MagicAuth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setTokens } = useActions(authLogic);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("No authentication token provided");
      return;
    }

    const exchangeToken = async () => {
      try {
        const { data, error } = await client.POST(
          "/api/lms/accounts/exchange-magic-link/",
          {
            body: { token },
          },
        );

        if (error || !data) {
          throw new Error("Failed to authenticate. Link may have expired.");
        }

        // Store tokens in localStorage
        localStorage.setItem("access_token", data.access);
        localStorage.setItem("refresh_token", data.refresh);

        // Update auth state via Kea
        setTokens(data.access, data.refresh);

        // Redirect to home/dashboard
        // Using window.location for a full reload to ensure auth state is fresh
        window.location.href = "/";
      } catch (err) {
        console.error("Magic link exchange failed:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Authentication failed. Please try logging in manually.",
        );
      }
    };

    exchangeToken();
  }, [searchParams, setTokens]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex flex-col">
        {/* Logo - top left */}
        <div className="absolute top-4 left-4 sm:top-8 sm:left-8 z-10">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="w-8 h-8" />
            <span className="font-serif text-xl tracking-tight text-neutral-900">
              Acadia
            </span>
          </Link>
        </div>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center px-5 sm:px-8">
          <div className="max-w-md w-full space-y-6">
            <div className="space-y-2">
              <h1 className="text-4xl sm:text-5xl font-serif text-neutral-900 leading-[1.1] tracking-tight">
                Authentication Failed
              </h1>
              <p className="text-base sm:text-lg text-neutral-500 leading-relaxed">
                {error}
              </p>
            </div>

            <button
              onClick={() => navigate("/login")}
              className="h-14 px-8 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors font-medium"
            >
              Go to Login
            </button>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-4 px-5 sm:px-8 shrink-0">
          <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-neutral-400">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              We never sell your data
            </span>
            <span className="text-neutral-300">·</span>
            <a
              href="https://acadialearning.org/privacy"
              className="hover:text-neutral-600 transition-colors"
            >
              Privacy
            </a>
            <span className="text-neutral-300">·</span>
            <a
              href="https://acadialearning.org/terms"
              className="hover:text-neutral-600 transition-colors"
            >
              Terms
            </a>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col">
      {/* Logo - top left */}
      <div className="absolute top-4 left-4 sm:top-8 sm:left-8 z-10">
        <Link to="/" className="flex items-center gap-2">
          <div className="p-1 bg-primary rounded-lg">
            <Logo className="w-6 h-6" />
          </div>
          <span className="font-serif text-xl tracking-tight text-neutral-900">
            Acadia
          </span>
        </Link>
      </div>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-5 sm:px-8">
        <div className="max-w-md w-full space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl font-serif text-neutral-900 leading-[1.1] tracking-tight">
              Signing you in...
            </h1>
            <p className="text-base sm:text-lg text-neutral-500 leading-relaxed flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Please wait a moment
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 px-5 sm:px-8 shrink-0">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-neutral-400">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            We never sell your data
          </span>
          <span className="text-neutral-300">·</span>
          <a
            href="https://acadialearning.org/privacy"
            className="hover:text-neutral-600 transition-colors"
          >
            Privacy
          </a>
          <span className="text-neutral-300">·</span>
          <a
            href="https://acadialearning.org/terms"
            className="hover:text-neutral-600 transition-colors"
          >
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}

export default MagicAuth;
