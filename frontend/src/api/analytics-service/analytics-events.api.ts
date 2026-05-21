import { openHands } from "../open-hands-axios";
import { Provider } from "#/types/settings";

export type AnalyticsEventResponse = {
  status: string;
};

export const analyticsEventsService = {
  /**
   * Notify the server that the user clicked the "Pull Request" button in the
   * conversation UI. The server-side handler fires the PostHog
   * `create pr button clicked` event (analytics moved server-side in #14006).
   */
  trackCreatePrButtonClicked: async (
    gitProvider: Provider | null,
  ): Promise<AnalyticsEventResponse> => {
    const { data } = await openHands.post<AnalyticsEventResponse>(
      "/api/analytics/events/create-pr-button-clicked",
      { git_provider: gitProvider },
    );
    return data;
  },
};
