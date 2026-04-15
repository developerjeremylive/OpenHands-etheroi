import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { OpenHandsLogoButton } from "#/components/shared/buttons/openhands-logo-button";
import { useConfig } from "#/hooks/query/use-config";
import { I18nKey } from "#/i18n/declaration";
import CreditsScreen from "./credits";

vi.mock("#/hooks/query/use-config", () => ({
  useConfig: vi.fn(),
}));

const mockUseConfig = vi.mocked(useConfig);

const renderCreditsRoute = () =>
  render(
    <MemoryRouter initialEntries={["/credits"]}>
      <Routes>
        <Route path="/credits" element={<CreditsScreen />} />
      </Routes>
    </MemoryRouter>,
  );

describe("CreditsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("__OPENHANDS_WEB_VERSION__", "1.6.0");
    vi.stubGlobal("__OPENHANDS_ENTERPRISE_VERSION__", "0.0.1");
    vi.stubGlobal("__OPENHANDS_SDK_VERSION__", "1.16.1");
  });

  it("renders the credits route in OSS mode without SaaS-only content", () => {
    mockUseConfig.mockReturnValue({
      data: { app_mode: "oss" },
    } as never);

    renderCreditsRoute();

    expect(screen.getByTestId("credits-screen")).toBeInTheDocument();
    expect(
      screen.getByText(I18nKey.CREDITS$RELEASE_INFORMATION),
    ).toBeInTheDocument();
    expect(screen.getByText("1.6.0")).toBeInTheDocument();
    expect(screen.getByText("1.16.1")).toBeInTheDocument();
    expect(
      screen.queryByText(I18nKey.CREDITS$OPENHANDS_ENTERPRISE_EDITION),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(I18nKey.CREDITS$COPYRIGHT_ALLHANDS_2026),
    ).not.toBeInTheDocument();
  });

  it("renders the credits route in SaaS mode with enterprise release and copyright info", () => {
    mockUseConfig.mockReturnValue({
      data: { app_mode: "saas" },
    } as never);

    renderCreditsRoute();

    expect(
      screen.getByText(I18nKey.CREDITS$OPENHANDS_ENTERPRISE_EDITION),
    ).toBeInTheDocument();
    expect(screen.getByText("0.0.1")).toBeInTheDocument();
    expect(
      screen.getByText(I18nKey.CREDITS$COPYRIGHT_ALLHANDS_2026),
    ).toBeInTheDocument();
  });

  it("navigates to the credits route from the OpenHands logo", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<OpenHandsLogoButton />} />
          <Route
            path="/credits"
            element={<div data-testid="credits-destination" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", {
      name: I18nKey.BRANDING$OPENHANDS_LOGO,
    });

    expect(link).toHaveAttribute("href", "/credits");

    await user.click(link);

    expect(screen.getByTestId("credits-destination")).toBeInTheDocument();
  });
});
