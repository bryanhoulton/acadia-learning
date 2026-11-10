/**
 * Landing Page Variant Types
 */

export interface LandingPageVariant {
  id: string;
  name: string;
  description: string;
  component: React.ComponentType<Record<string, unknown>>;
}
