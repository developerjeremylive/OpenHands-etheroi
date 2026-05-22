import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { Typography } from "#/ui/typography";
import { cn } from "#/utils/utils";
import { useConfig } from "#/hooks/query/use-config";
import { useIntegrationStatus } from "#/hooks/query/use-integration-status";
import { useConfigureIntegration } from "#/hooks/mutation/use-configure-integration";
import { useUnlinkIntegration } from "#/hooks/mutation/use-unlink-integration";
import { CopyableValue, generateWebhookSecret } from "./configure-modal";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * On-page Jira Data Center configuration. Unlike the modal used by Jira Cloud /
 * Linear, this renders inline on the Settings page (like the GitLab / Bitbucket
 * webhook managers) so it lays out horizontally and uses the page's own scroll
 * — it can never overflow the viewport. Jira DC is single-server, so there's
 * exactly one connection / service account / webhook to manage here.
 */
export function JiraDcIntegrationPanel() {
  const { t } = useTranslation();
  const { data: config } = useConfig();
  // OAuth installs already know the host; pre-fill + lock it.
  const jiraDcOAuthHost = config?.jira_dc_oauth_host ?? null;

  const { data: integrationData } = useIntegrationStatus("jira-dc");
  const existingWorkspace = integrationData?.workspace;
  const isWorkspaceEditable = existingWorkspace?.editable ?? false;
  const isActiveIntegration = integrationData?.status === "active";

  const configureMutation = useConfigureIntegration("jira-dc", {
    onSettled: () => {},
  });
  const unlinkMutation = useUnlinkIntegration("jira-dc", {
    onSettled: () => {},
  });
  const isBusy = configureMutation.isPending || unlinkMutation.isPending;

  const eventsUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/integration/jira-dc/events`
      : "/integration/jira-dc/events";

  const [workspace, setWorkspace] = useState("");
  const [serviceAccountEmail, setServiceAccountEmail] = useState("");
  const [serviceAccountApiKey, setServiceAccountApiKey] = useState("");
  const [adminApiKey, setAdminApiKey] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualSecret, setManualSecret] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removeAdminApiKey, setRemoveAdminApiKey] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Seed form state from the current integration / config.
  React.useEffect(() => {
    if (existingWorkspace) {
      setWorkspace(existingWorkspace.name);
      if (isWorkspaceEditable) {
        setServiceAccountEmail(existingWorkspace.svc_acc_email ?? "");
        setHasSavedApiKey(true);
        setIsActive(existingWorkspace.status === "active");
      }
    } else {
      setWorkspace(jiraDcOAuthHost ?? "");
      setIsActive(true);
    }
  }, [existingWorkspace, isWorkspaceEditable, jiraDcOAuthHost]);

  const handleEmailChange = (value: string) => {
    setServiceAccountEmail(value);
    setEmailError(
      value && !EMAIL_RE.test(value)
        ? t(I18nKey.PROJECT_MANAGEMENT$SVC_ACC_EMAIL_VALIDATION_ERROR)
        : null,
    );
  };

  const handleApiKeyChange = (value: string) => {
    setServiceAccountApiKey(value);
    setApiKeyError(
      /\s/.test(value)
        ? t(I18nKey.PROJECT_MANAGEMENT$SVC_ACC_API_KEY_VALIDATION_ERROR)
        : null,
    );
  };

  const enableManualMode = () => {
    setManualSecret((prev) => prev || generateWebhookSecret());
    setAdminApiKey("");
    setManualMode(true);
  };

  const handleSubmit = () => {
    // Manual mode sends the generated secret the admin is copying into Jira;
    // auto mode sends a blank secret (server-generated) + the one-time admin PAT.
    configureMutation.mutate({
      workspace,
      webhookSecret: manualMode ? manualSecret : "",
      serviceAccountEmail,
      serviceAccountApiKey,
      adminApiKey: manualMode ? "" : adminApiKey.trim(),
      isActive,
    });
  };

  const confirmRemove = () => {
    unlinkMutation.mutate(removeAdminApiKey.trim() || undefined);
  };

  // The PAT is required to create a new workspace, optional when editing
  // (blank keeps the stored token). Auto mode on a new workspace needs the
  // one-time admin PAT; editing or manual mode does not.
  const apiKeyRequired = !existingWorkspace;
  const webhookSatisfied =
    !!existingWorkspace || manualMode || adminApiKey.trim() !== "";
  const isSubmitDisabled =
    !workspace.trim() ||
    !serviceAccountEmail.trim() ||
    (apiKeyRequired && !serviceAccountApiKey.trim()) ||
    emailError !== null ||
    apiKeyError !== null ||
    !webhookSatisfied ||
    isBusy;

  const hostLocked = !!existingWorkspace || !!jiraDcOAuthHost;
  const showAdminRemove = !!existingWorkspace && isWorkspaceEditable;
  const showSelfDisconnect = !!existingWorkspace && !isWorkspaceEditable;

  const apiKeyPlaceholderKey = hasSavedApiKey
    ? I18nKey.PROJECT_MANAGEMENT$JIRA_DC_SVC_ACC_API_SAVED_PLACEHOLDER
    : I18nKey.PROJECT_MANAGEMENT$JIRA_DC_SVC_ACC_API_PLACEHOLDER;

  let statusLabel: string;
  let statusDotClass: string;
  if (isActiveIntegration) {
    statusLabel = t(I18nKey.PROJECT_MANAGEMENT$ACTIVE_TOGGLE_LABEL);
    statusDotClass = "bg-green-500";
  } else if (existingWorkspace) {
    statusLabel = t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_STATUS_INACTIVE);
    statusDotClass = "bg-yellow-500";
  } else {
    statusLabel = t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_STATUS_NOT_CONNECTED);
    statusDotClass = "bg-neutral-500";
  }

  const sectionLabel = (key: I18nKey) => (
    <span className="text-sm font-medium text-white">{t(key)}</span>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="jira-dc-panel">
      <div className="flex items-center justify-between gap-4">
        <Typography.H3 className="text-lg font-medium text-white">
          {t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_PLATFORM_NAME)}
        </Typography.H3>
        <span className="flex items-center gap-2 text-sm text-gray-300">
          <span className={cn("w-2 h-2 rounded-full", statusDotClass)} />
          {statusLabel}
        </span>
      </div>
      <Typography.Text className="text-sm text-gray-400">
        {t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_PANEL_SUBTITLE)}
      </Typography.Text>

      {showSelfDisconnect ? (
        // Non-admin: the shared workspace is configured by someone else; this
        // user can only unlink their own connection.
        <div className="border border-neutral-700 rounded-lg p-6 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-gray-300">
              {t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_HOST_LABEL)}: {workspace}
            </span>
            {existingWorkspace?.svc_acc_email && (
              <span className="text-gray-400 text-xs">
                {existingWorkspace.svc_acc_email}
              </span>
            )}
          </div>
          <BrandButton
            variant="secondary"
            onClick={() => unlinkMutation.mutate(undefined)}
            testId="jira-dc-disconnect-button"
            type="button"
            isDisabled={isBusy}
          >
            {t(I18nKey.PROJECT_MANAGEMENT$DISCONNECT_BUTTON_LABEL)}
          </BrandButton>
        </div>
      ) : (
        <>
          <div className="border border-neutral-700 rounded-lg p-6 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
            {/* Column 1 — connection + inbound webhook */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                {sectionLabel(
                  I18nKey.PROJECT_MANAGEMENT$JIRA_DC_SERVER_SECTION_LABEL,
                )}
                <SettingsInput
                  testId="jira-dc-host-input"
                  label={t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_HOST_LABEL)}
                  placeholder={t(
                    I18nKey.PROJECT_MANAGEMENT$JIRA_DC_WORKSPACE_NAME_PLACEHOLDER,
                  )}
                  value={workspace}
                  onChange={setWorkspace}
                  className="w-full"
                  type="text"
                  isDisabled={hostLocked}
                />
                {!hostLocked && (
                  <p className="text-xs text-tertiary-alt">
                    {t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_HOST_HELP)}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {sectionLabel(
                  I18nKey.PROJECT_MANAGEMENT$JIRA_DC_WEBHOOK_SECTION_LABEL,
                )}
                <div className="flex w-fit overflow-hidden rounded-sm border border-[#717888] text-sm">
                  <button
                    type="button"
                    data-testid="webhook-mode-auto"
                    onClick={() => setManualMode(false)}
                    className={`px-3 py-1.5 ${
                      !manualMode
                        ? "bg-[#717888] text-white"
                        : "bg-transparent text-tertiary-alt"
                    }`}
                  >
                    {t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_WEBHOOK_MODE_AUTO)}
                  </button>
                  <button
                    type="button"
                    data-testid="webhook-mode-manual"
                    onClick={enableManualMode}
                    className={`px-3 py-1.5 ${
                      manualMode
                        ? "bg-[#717888] text-white"
                        : "bg-transparent text-tertiary-alt"
                    }`}
                  >
                    {t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_WEBHOOK_MODE_MANUAL)}
                  </button>
                </div>
                {!manualMode ? (
                  <div>
                    <SettingsInput
                      testId="admin-api-key-input"
                      label={t(
                        I18nKey.PROJECT_MANAGEMENT$JIRA_DC_ADMIN_TOKEN_LABEL,
                      )}
                      placeholder={t(
                        I18nKey.PROJECT_MANAGEMENT$JIRA_DC_ADMIN_TOKEN_PLACEHOLDER,
                      )}
                      value={adminApiKey}
                      onChange={setAdminApiKey}
                      className="w-full"
                      type="password"
                      showOptionalTag={!!existingWorkspace}
                    />
                    <p className="text-xs text-tertiary-alt mt-1">
                      {t(
                        existingWorkspace
                          ? I18nKey.PROJECT_MANAGEMENT$JIRA_DC_EXISTING_ADMIN_TOKEN_HELP
                          : I18nKey.PROJECT_MANAGEMENT$JIRA_DC_ADMIN_TOKEN_HELP,
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-tertiary-alt">
                      {t(
                        existingWorkspace
                          ? I18nKey.PROJECT_MANAGEMENT$JIRA_DC_MANUAL_UPDATE_INSTRUCTIONS
                          : I18nKey.PROJECT_MANAGEMENT$JIRA_DC_MANUAL_INSTRUCTIONS,
                      )}
                    </p>
                    <CopyableValue
                      testId="webhook-url-value"
                      label={t(
                        I18nKey.PROJECT_MANAGEMENT$JIRA_DC_WEBHOOK_URL_LABEL,
                      )}
                      value={eventsUrl}
                    />
                    <CopyableValue
                      testId="webhook-secret-value"
                      label={t(I18nKey.PROJECT_MANAGEMENT$WEBHOOK_SECRET_LABEL)}
                      value={manualSecret}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Column 2 — outbound service account + active */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                {sectionLabel(
                  I18nKey.PROJECT_MANAGEMENT$JIRA_DC_SERVICE_ACCOUNT_SECTION_LABEL,
                )}
                <p className="text-xs text-tertiary-alt">
                  {t(
                    I18nKey.PROJECT_MANAGEMENT$JIRA_DC_SERVICE_ACCOUNT_SECTION_HELP,
                  )}
                </p>
                <div>
                  <SettingsInput
                    testId="jira-dc-svc-email-input"
                    label={t(
                      I18nKey.PROJECT_MANAGEMENT$SERVICE_ACCOUNT_EMAIL_LABEL,
                    )}
                    placeholder={t(
                      I18nKey.PROJECT_MANAGEMENT$SERVICE_ACCOUNT_EMAIL_PLACEHOLDER,
                    )}
                    value={serviceAccountEmail}
                    onChange={handleEmailChange}
                    className="w-full"
                    type="email"
                  />
                  {emailError && (
                    <p className="text-red-500 text-sm mt-2">{emailError}</p>
                  )}
                </div>
                <div>
                  <SettingsInput
                    testId="jira-dc-svc-pat-input"
                    label={t(
                      I18nKey.PROJECT_MANAGEMENT$JIRA_DC_SERVICE_ACCOUNT_API_LABEL,
                    )}
                    placeholder={t(apiKeyPlaceholderKey)}
                    value={serviceAccountApiKey}
                    onChange={handleApiKeyChange}
                    className="w-full"
                    type="password"
                    showOptionalTag={hasSavedApiKey}
                  />
                  {apiKeyError && (
                    <p className="text-red-500 text-sm mt-2">{apiKeyError}</p>
                  )}
                </div>
              </div>

              {/* Active is a management control for an already-connected
                  integration (pause it). On first-time setup there's nothing to
                  pause — connecting implies active — so it's hidden until edit. */}
              {existingWorkspace && (
                <div>
                  <SettingsSwitch
                    testId="active-toggle"
                    onToggle={setIsActive}
                    isToggled={isActive}
                  >
                    {t(I18nKey.PROJECT_MANAGEMENT$ACTIVE_TOGGLE_LABEL)}
                  </SettingsSwitch>
                  <p className="text-xs text-tertiary-alt mt-1">
                    {t(I18nKey.PROJECT_MANAGEMENT$ACTIVE_TOGGLE_HELP)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <BrandButton
              variant="primary"
              onClick={handleSubmit}
              testId="jira-dc-submit-button"
              type="button"
              isDisabled={isSubmitDisabled}
            >
              {existingWorkspace
                ? t(I18nKey.PROJECT_MANAGEMENT$UPDATE_BUTTON_LABEL)
                : t(I18nKey.PROJECT_MANAGEMENT$CONNECT_BUTTON_LABEL)}
            </BrandButton>

            {showAdminRemove &&
              (showRemoveConfirm ? (
                <div className="flex flex-col gap-2 w-full max-w-md">
                  <p className="text-xs text-tertiary-alt">
                    {t(
                      removeAdminApiKey.trim()
                        ? I18nKey.PROJECT_MANAGEMENT$JIRA_DC_REMOVE_WITH_REVOKE_CONFIRM
                        : I18nKey.PROJECT_MANAGEMENT$JIRA_DC_REMOVE_WITHOUT_REVOKE_CONFIRM,
                    )}
                  </p>
                  <SettingsInput
                    testId="remove-admin-api-key-input"
                    label={t(
                      I18nKey.PROJECT_MANAGEMENT$JIRA_DC_REMOVE_ADMIN_TOKEN_LABEL,
                    )}
                    placeholder={t(
                      I18nKey.PROJECT_MANAGEMENT$JIRA_DC_ADMIN_TOKEN_PLACEHOLDER,
                    )}
                    value={removeAdminApiKey}
                    onChange={setRemoveAdminApiKey}
                    className="w-full"
                    type="password"
                    showOptionalTag
                  />
                  <div className="flex items-center gap-2">
                    <BrandButton
                      variant="danger"
                      onClick={confirmRemove}
                      testId="confirm-remove-integration-button"
                      type="button"
                      isDisabled={isBusy}
                    >
                      {t(
                        I18nKey.PROJECT_MANAGEMENT$REMOVE_INTEGRATION_BUTTON_LABEL,
                      )}
                    </BrandButton>
                    <BrandButton
                      variant="secondary"
                      onClick={() => {
                        setShowRemoveConfirm(false);
                        setRemoveAdminApiKey("");
                      }}
                      testId="cancel-remove-integration-button"
                      type="button"
                    >
                      {t(I18nKey.FEEDBACK$CANCEL_LABEL)}
                    </BrandButton>
                  </div>
                </div>
              ) : (
                <BrandButton
                  variant="danger"
                  onClick={() => setShowRemoveConfirm(true)}
                  testId="remove-integration-button"
                  type="button"
                  isDisabled={isBusy}
                >
                  {t(
                    I18nKey.PROJECT_MANAGEMENT$REMOVE_INTEGRATION_BUTTON_LABEL,
                  )}
                </BrandButton>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
