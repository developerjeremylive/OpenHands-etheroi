import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";

import AgentSettingsScreen from "#/routes/agent-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import OptionService from "#/api/option-service/option-service.api";
import { SecretsService } from "#/api/secrets-service";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { useSelectedOrganizationStore } from "#/stores/selected-organization-store";

beforeEach(() => {
  useSelectedOrganizationStore.setState({ organizationId: "test-org-id" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderAgentSettings = () =>
  render(
    <MemoryRouter>
      <AgentSettingsScreen />
    </MemoryRouter>,
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>
          {children}
        </QueryClientProvider>
      ),
    },
  );

const baseConfig = {
  app_mode: "oss" as const,
  posthog_client_key: null,
  feature_flags: {
    enable_billing: false,
    hide_llm_settings: false,
    enable_jira: false,
    enable_jira_dc: false,
    enable_linear: false,
    hide_users_page: false,
    hide_billing_page: false,
    hide_integrations_page: false,
    enable_acp: true,
    enable_onboarding: false,
  },
  providers_configured: [],
  maintenance_start_time: null,
  auth_url: null,
  recaptcha_site_key: null,
  faulty_models: [],
  error_message: null,
  updated_at: "2026-01-01T00:00:00Z",
  github_app_slug: null,
};

describe("AgentSettingsScreen — minimal generic ACP UX", () => {
  it("hydrates the form from saved ACP settings", async () => {
    vi.spyOn(OptionService, "getConfig").mockResolvedValue(baseConfig);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...MOCK_DEFAULT_USER_SETTINGS,
      agent_settings: {
        agent_kind: "acp",
        acp_server: "custom",
        acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
        acp_args: [],
        acp_env: { ANTHROPIC_API_KEY: "sk-test" },
        acp_model: "claude-opus-4",
      },
    });

    renderAgentSettings();

    await waitFor(() => {
      expect(
        (screen.getByTestId("agent-command-input") as HTMLTextAreaElement)
          .value,
      ).toBe("npx -y @agentclientprotocol/claude-agent-acp");
    });
    expect(
      (screen.getByTestId("agent-model-input") as HTMLInputElement).value,
    ).toBe("claude-opus-4");
  });

  it("clears acp_* fields when switching back to OpenHands", async () => {
    vi.spyOn(OptionService, "getConfig").mockResolvedValue(baseConfig);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...MOCK_DEFAULT_USER_SETTINGS,
      agent_settings: {
        agent_kind: "acp",
        acp_server: "custom",
        acp_command: ["claude-agent-acp"],
        acp_args: [],
        acp_env: { ANTHROPIC_API_KEY: "sk-test" },
        acp_model: "claude-opus-4",
      },
    });
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderAgentSettings();

    await waitFor(() => {
      expect(
        (screen.getByTestId("agent-command-input") as HTMLTextAreaElement)
          .value,
      ).toBe("claude-agent-acp");
    });

    const dropdown = screen.getByTestId("agent-type-selector");
    await userEvent.click(dropdown);
    const ohOption = await screen.findByRole("option", {
      name: "SETTINGS$AGENT_TYPE_OPENHANDS",
    });
    await userEvent.click(ohOption);

    await userEvent.click(screen.getByTestId("agent-save-button"));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    expect(saveSpy.mock.calls[0][0]).toMatchObject({
      agent_settings_diff: {
        agent_kind: "openhands",
        acp_command: null,
        acp_args: null,
        acp_env: null,
        acp_model: null,
      },
    });
  });
});

describe("AgentSettingsScreen — Claude Max credentials", () => {
  const acpClaudeCodeSettings = {
    ...MOCK_DEFAULT_USER_SETTINGS,
    agent_settings: {
      agent_kind: "acp",
      acp_server: "custom",
      acp_command: ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
      acp_args: [],
      acp_env: {},
      acp_model: null,
    },
  };

  beforeEach(() => {
    vi.spyOn(OptionService, "getConfig").mockResolvedValue(baseConfig);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      acpClaudeCodeSettings,
    );
    // Default: no FILE: secrets saved
    vi.spyOn(SecretsService, "searchSecrets").mockResolvedValue({
      items: [],
      next_page_id: null,
    });
  });

  it("shows credentials field only for the Claude Code preset", async () => {
    renderAgentSettings();

    await waitFor(() => {
      expect(
        screen.getByTestId("claude-credentials-input"),
      ).toBeInTheDocument();
    });
  });

  it("hides credentials field for non-Claude-Code presets", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
      ...MOCK_DEFAULT_USER_SETTINGS,
      agent_settings: {
        agent_kind: "acp",
        acp_server: "custom",
        acp_command: ["npx", "-y", "@zed-industries/codex-acp"],
        acp_args: [],
        acp_env: {},
        acp_model: null,
      },
    });

    renderAgentSettings();

    await waitFor(() => {
      expect(screen.getByTestId("agent-command-input")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("claude-credentials-input"),
    ).not.toBeInTheDocument();
  });

  it("shows saved badge when FILE: credential secret exists", async () => {
    vi.spyOn(SecretsService, "searchSecrets").mockResolvedValue({
      items: [
        {
          name: "FILE:~/.claude/credentials.json",
          description: "Claude Max credentials",
        },
      ],
      next_page_id: null,
    });

    renderAgentSettings();

    await waitFor(() => {
      expect(
        screen.getByTestId("claude-credentials-saved-badge"),
      ).toBeInTheDocument();
    });
  });

  it("calls upsertSecret and saveSettings when credentials are entered", async () => {
    const upsertSpy = vi
      .spyOn(SecretsService, "upsertSecret")
      .mockResolvedValue(true);
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderAgentSettings();

    await waitFor(() => {
      expect(screen.getByTestId("claude-credentials-input")).toBeInTheDocument();
    });

    const credentialsInput = screen.getByTestId("claude-credentials-input");
    // fireEvent.change avoids userEvent's special-character interpretation of {}
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(credentialsInput, {
      target: { value: '{"access_token":"tok"}' },
    });
    await userEvent.click(screen.getByTestId("agent-save-button"));

    await waitFor(() => {
      expect(upsertSpy).toHaveBeenCalledWith(
        "FILE:~/.claude/credentials.json",
        '{"access_token":"tok"}',
        expect.any(String),
      );
    });
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects credentials that are not valid JSON", async () => {
    const upsertSpy = vi
      .spyOn(SecretsService, "upsertSecret")
      .mockResolvedValue(true);

    renderAgentSettings();

    await waitFor(() => {
      expect(screen.getByTestId("claude-credentials-input")).toBeInTheDocument();
    });

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByTestId("claude-credentials-input"), {
      target: { value: "not-json" },
    });
    await userEvent.click(screen.getByTestId("agent-save-button"));

    await waitFor(() => {
      expect(upsertSpy).not.toHaveBeenCalled();
    });
  });

  it("does not call upsertSecret when credentials field is empty", async () => {
    const upsertSpy = vi
      .spyOn(SecretsService, "upsertSecret")
      .mockResolvedValue(true);
    vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);

    renderAgentSettings();

    await waitFor(() => {
      expect(screen.getByTestId("agent-command-input")).toBeInTheDocument();
    });

    // Mark as dirty without touching credentials
    await userEvent.clear(screen.getByTestId("agent-model-input"));
    await userEvent.click(screen.getByTestId("agent-save-button"));

    await waitFor(() => {
      expect(upsertSpy).not.toHaveBeenCalled();
    });
  });
});
