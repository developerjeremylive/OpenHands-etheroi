import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders } from "test-utils";
import { createRoutesStub } from "react-router";
import { screen, waitFor } from "@testing-library/react";
import SettingsService from "#/api/settings-service/settings-service.api";
import { SettingsForm } from "#/components/shared/modals/settings/settings-form";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { getAgentSettingValue } from "#/utils/sdk-settings-schema";

describe("SettingsForm", () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const RouteStub = createRoutesStub([
    {
      Component: () => (
        <SettingsForm settings={DEFAULT_SETTINGS} onClose={onCloseMock} />
      ),
      path: "/",
    },
  ]);

  it("should save the user settings and close the modal when the form is submitted", async () => {
    const saveSettingsSpy = vi.spyOn(SettingsService, "saveSettings");
    const user = userEvent.setup();
    renderWithProviders(<RouteStub />);

    const saveButton = screen.getByRole("button", { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_settings: expect.objectContaining({
            llm: expect.objectContaining({
              model: getAgentSettingValue(DEFAULT_SETTINGS, "llm.model"),
            }),
          }),
        }),
      );
    });
  });
});
