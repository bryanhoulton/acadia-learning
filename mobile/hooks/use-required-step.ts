import { useAuthStore, usePurchasesStore } from '@/stores';

export type RequiredStep = 
  | 'profile' 
  | 'paywall' 
  | 'book-session' 
  | 'text-tutor' 
  | 'complete';

/**
 * Determines the next required step for a user to complete.
 * This creates a self-healing UI where incomplete steps are presented.
 * 
 * Required steps (in order):
 * 1. Create student profile
 * 2. Subscribe (paywall) - if not premium
 * 3. Book first session - only during onboarding
 * 4. Text Acadia
 * 
 * @param isOnboarding - Whether this is the initial onboarding flow
 * @returns The next required step, or 'complete' if all steps are done
 */
export function getRequiredStep(
  account: ReturnType<typeof useAuthStore.getState>['account'],
  isPremium: boolean,
  isOnboarding: boolean = false
): RequiredStep {
  // Step 1: Check if user has a student profile
  const hasStudentProfile = account?.profiles?.some(
    (p) => p.profile_type === 'student'
  );
  
  if (!hasStudentProfile) {
    return 'profile';
  }

  // Step 2: Check if user is premium (has subscription)
  if (!isPremium) {
    return 'paywall';
  }

  // Step 3: Book first session (only during onboarding)
  // We check if they've booked by looking at the profile metadata
  if (isOnboarding) {
    const studentProfile = account?.profiles?.find(
      (p) => p.profile_type === 'student'
    );
    
    if (studentProfile?.metadata) {
      try {
        const metadata = JSON.parse(studentProfile.metadata);
        if (!metadata.first_session_date) {
          return 'book-session';
        }
      } catch {
        return 'book-session';
      }
    } else {
      return 'book-session';
    }
  }

  // Step 4: Check if user has texted Acadia
  if (!account?.has_texted_tutor) {
    return 'text-tutor';
  }

  return 'complete';
}

/**
 * Returns the route path for a given required step
 */
export function getRouteForStep(step: RequiredStep, isOnboarding: boolean = false): string {
  switch (step) {
    case 'profile':
      return isOnboarding ? '/profile/new?onboarding=true' : '/profile/new?onboarding=true';
    case 'paywall':
      return '/paywall';
    case 'book-session':
      return '/book-session';
    case 'text-tutor':
      return '/text-tutor';
    case 'complete':
    default:
      return '/(tabs)/home';
  }
}

/**
 * Hook to get the current required step and route
 */
export function useRequiredStep(isOnboarding: boolean = false) {
  const account = useAuthStore((state) => state.account);
  const isPremium = usePurchasesStore((state) => state.isPremium);
  
  const step = getRequiredStep(account, isPremium, isOnboarding);
  const route = getRouteForStep(step, isOnboarding);
  
  return { step, route, isComplete: step === 'complete' };
}
