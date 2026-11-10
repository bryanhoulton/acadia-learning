import { useEffect, useRef } from 'react';

import { useActions, useValues } from 'kea';
import { useLocation, useNavigate } from 'react-router-dom';

import { authLogic } from '../logic/authLogic';
import LoadingState from './LoadingState';

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { isAccountLoading, account, user, hasAttemptedFetch } = useValues(authLogic);
  const { setUserId } = useActions(authLogic);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const navigate = useNavigate();
  const location = useLocation();

  // If we've attempted to fetch and not loading and no account, redirect to login
  // Only redirect after we've actually tried to fetch, not on initial mount
  useEffect(() => {
    if (hasAttemptedFetch && !isAccountLoading && !account) {
      // Include the current path as a redirect parameter so user can be sent back after login
      const currentPath = location.pathname + location.search;
      const redirectParam = encodeURIComponent(currentPath);
      navigate(`/login?redirect=${redirectParam}`, { replace: true });
    }
  }, [hasAttemptedFetch, isAccountLoading, account, navigate, location]);

  // Show loading state if account is loading OR if we have profiles but no user selected yet
  // This ensures we don't render before the user selection logic completes
  // Only wait for user if there are actually profiles that should be selected
  const hasProfiles = account && account.profiles && account.profiles.length > 0;
  const isWaitingForUser = hasProfiles && !user;

  // Safety valve: if we're waiting for a user for more than 3 seconds, force-select one
  useEffect(() => {
    if (isWaitingForUser && account) {
      timeoutRef.current = setTimeout(() => {
        console.error('User selection timed out, forcing selection of first profile');
        const firstProfile = account.profiles[0];
        if (firstProfile) {
          setUserId(firstProfile.id);
        }
      }, 3000);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isWaitingForUser, account, setUserId]);

  // Show loading if: still loading, waiting for user, or no account (about to redirect)
  if (isAccountLoading || isWaitingForUser || !account) {
    return (
      <div className="h-screen flex min-w-full items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  return children;
}
