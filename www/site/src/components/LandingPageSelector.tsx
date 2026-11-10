import { Suspense } from "react";

import { useVariant } from "../hooks/useVariant";

export function LandingPageSelector() {
  const { variant, loading } = useVariant();

  if (loading) {
    return <div className="min-h-screen bg-[#fafaf9]" />;
  }

  const VariantComponent = variant.component;
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fafaf9]" />}>
      <VariantComponent />
    </Suspense>
  );
}
