import { useEffect, useState } from "react";

const SIGNUP_METADATA_KEY = "acadia_signup_metadata";

export interface SignupMetadata {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  fbp?: string;
  fbc?: string;
  gclid?: string;
  referrer?: string;
  landing_page?: string;
  [key: string]: string | undefined;
}

/**
 * Hook to capture and persist signup metadata from the URL.
 * Captures UTM params, Facebook pixel IDs, Google click IDs, and more.
 * Data is stored in sessionStorage so it persists across page navigation.
 *
 * Usage:
 * ```tsx
 * const signupMetadata = useSignupMetadata();
 * // Pass to API: { signup_metadata: signupMetadata }
 * ```
 */
export function useSignupMetadata(): SignupMetadata {
  const [metadata, setMetadata] = useState<SignupMetadata>({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Try to get existing metadata from storage first
    const stored = sessionStorage.getItem(SIGNUP_METADATA_KEY);
    let existingMetadata: SignupMetadata = {};

    if (stored) {
      try {
        existingMetadata = JSON.parse(stored);
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Check URL for tracking params
    const urlParams = new URLSearchParams(window.location.search);
    const newMetadata: SignupMetadata = {};

    // UTM params
    const trackingKeys = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid", // Google click ID
    ];

    for (const key of trackingKeys) {
      const value = urlParams.get(key);
      if (value) {
        newMetadata[key] = value;
      }
    }

    // Facebook Click ID (fbc) - from fbclid URL param or _fbc cookie
    // Format: fb.1.<timestamp>.<fbclid>
    const fbclid = urlParams.get("fbclid");
    if (fbclid) {
      newMetadata.fbc = `fb.1.${Date.now()}.${fbclid}`;
    } else {
      const fbcMatch = document.cookie.match(/_fbc=([^;]+)/);
      if (fbcMatch?.[1]) {
        newMetadata.fbc = fbcMatch[1];
      }
    }

    // Facebook Browser ID (fbp) - from _fbp cookie
    const fbpMatch = document.cookie.match(/_fbp=([^;]+)/);
    if (fbpMatch?.[1]) {
      newMetadata.fbp = fbpMatch[1];
    }

    // Capture referrer on first visit
    if (!existingMetadata.referrer && document.referrer) {
      newMetadata.referrer = document.referrer;
    }

    // Capture landing page on first visit
    if (!existingMetadata.landing_page) {
      newMetadata.landing_page = window.location.pathname;
    }

    // Merge: new params override stored params
    const mergedMetadata = { ...existingMetadata, ...newMetadata };

    // Only update storage if we have new data
    if (Object.keys(newMetadata).length > 0) {
      sessionStorage.setItem(
        SIGNUP_METADATA_KEY,
        JSON.stringify(mergedMetadata)
      );
    }

    setMetadata(mergedMetadata);
  }, []);

  return metadata;
}

/**
 * Get signup metadata synchronously (for use outside of React components).
 */
export function getStoredSignupMetadata(): SignupMetadata {
  if (typeof window === "undefined") return {};

  const stored = sessionStorage.getItem(SIGNUP_METADATA_KEY);
  if (!stored) return {};

  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

// Backwards compatibility alias
export const useUtmParams = useSignupMetadata;
export type UtmParams = SignupMetadata;
