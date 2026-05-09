import React from "react";
import { useLocation, useNavigate } from "react-router";
import { useOnboardingStatus } from "#/hooks/query/use-onboarding-status";
import { useConfig } from "#/hooks/query/use-config";

/**
 * Forces SaaS users with incomplete onboarding to /onboarding before they can
 * access any protected route. Mirrors EmailVerificationGuard.
 *
 * The originally requested URL is preserved as a ``returnTo`` query
 * parameter on ``/onboarding`` so it can be restored once the user
 * completes the onboarding flow. Without this, post-login deep links
 * (set up by ``root-layout.tsx`` as ``/login?returnTo=...``) get
 * dropped at the onboarding interstitial and the user always lands
 * back on ``/``.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useOnboardingStatus();
  const { data: config } = useConfig();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  React.useEffect(() => {
    if (isLoading) return;
    // Only redirect to onboarding if the feature flag is enabled
    if (
      config?.feature_flags?.enable_onboarding &&
      data?.should_complete_onboarding &&
      pathname !== "/onboarding"
    ) {
      // Preserve the user's originally requested URL (path + query)
      // so OnboardingForm can restore it after the user finishes.
      // Skip the trivial ``/`` case to keep the URL clean — that is
      // already the default landing page after onboarding.
      let destination = "/onboarding";
      if (pathname !== "/") {
        const returnTo = `${pathname}${search}`;
        destination = `/onboarding?returnTo=${encodeURIComponent(returnTo)}`;
      }
      navigate(destination, { replace: true });
    }
  }, [
    config?.feature_flags?.enable_onboarding,
    data?.should_complete_onboarding,
    isLoading,
    pathname,
    search,
    navigate,
  ]);

  return children;
}
