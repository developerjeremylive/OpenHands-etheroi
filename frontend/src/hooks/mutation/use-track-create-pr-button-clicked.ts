import { useMutation } from "@tanstack/react-query";
import { analyticsEventsService } from "#/api/analytics-service/analytics-events.api";
import { Provider } from "#/types/settings";

/**
 * Mutation hook that notifies the server when the user clicks the
 * "Pull Request" button. The server fires the PostHog
 * `create pr button clicked` event (analytics moved server-side in #14006).
 *
 * Tracking is fire-and-forget: errors are swallowed so a telemetry outage
 * never blocks the user's primary action of submitting the prompt.
 */
export const useTrackCreatePrButtonClicked = () =>
  useMutation({
    mutationFn: (gitProvider: Provider | null) =>
      analyticsEventsService.trackCreatePrButtonClicked(gitProvider),
    // Intentionally swallow errors - analytics must not block the UX.
    onError: () => {},
  });
