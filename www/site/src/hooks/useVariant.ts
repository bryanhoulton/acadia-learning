/**
 * useVariant Hook
 *
 * Hook for getting the current landing page variant.
 */

import type { LandingPageVariant } from "../types/variants";
import { getDefaultVariant } from "../variants";

/**
 * Hook to get the current landing page variant
 */
export function useVariant(): {
  variant: LandingPageVariant;
  variantId: string;
  loading: boolean;
} {
  const variant = getDefaultVariant();
  return {
    variant,
    variantId: variant.id,
    loading: false,
  };
}
