import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsEventsService } from "#/api/analytics-service/analytics-events.api";
import { useTrackCreatePrButtonClicked } from "#/hooks/mutation/use-track-create-pr-button-clicked";

describe("useTrackCreatePrButtonClicked", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("calls trackCreatePrButtonClicked with the given provider", async () => {
    const spy = vi
      .spyOn(analyticsEventsService, "trackCreatePrButtonClicked")
      .mockResolvedValue({ status: "ok" });

    const { result } = renderHook(() => useTrackCreatePrButtonClicked(), {
      wrapper,
    });

    result.current.mutate("github");

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("github");
    });
  });

  it("swallows errors so they never bubble up to the click handler", async () => {
    vi.spyOn(
      analyticsEventsService,
      "trackCreatePrButtonClicked",
    ).mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useTrackCreatePrButtonClicked(), {
      wrapper,
    });

    result.current.mutate("github");

    // The mutation must eventually settle into an error state without
    // throwing - the consumer never awaits this and doesn't pass an onError.
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
