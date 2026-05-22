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
 * webhook managers) so it uses the page's own scroll and can never overflow the
 * viewport. Jira DC is single-server, so there's exactly one connection /
 * service account / webhook to manage.
 *
 * A connected install shows a compact read-only summary by default; the form
 * (single-column, sequential) only appears on Edit or during first-time setup.
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
  const [isEditing, setIsEditing] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removeAdminApiKey, setRemoveAdminApiKey] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Seed (or re-seed, e.g. on Cancel) form state from the current integration.
  const seedForm = React.useCallback(() => {
    if (existingWorkspace) {
      setWorkspace(existingWorkspace.name);
      setServiceAccountEmail(existingWorkspace.svc_acc_email ?? "");
      setHasSavedApiKey(true);
      setIsActive(existingWorkspace.status === "active");
    } else {
      setWorkspace(jiraDcOAuthHost ?? "");
      setHasSavedApiKey(false);
      setIsActive(true);
    }
    setServiceAccountApiKey("");
    setAdminApiKey("");
    setManualMode(false);
    setEmailError(null);
    setApiKeyError(null);
  }, [existingWorkspace, jiraDcOAuthHost]);

  React.useEffect(() => {
    seedForm();
  }, [seedForm]);

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

  const cancelEdit = () => {
    seedForm();
    setIsEditing(false);
  };

  const confirmRemove = () => {
    unlinkMutation.mutate(removeAdminApiKey.trim() || undefined);
  };

  // PAT required to create a new workspace; optional on edit (blank keeps the
  // stored token). Auto mode on a new workspace needs the one-time admin PAT.
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
  const showForm = !existingWorkspace || isEditing;

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

      <div className="border border-neutral-700 rounded-lg p-6 max-w-2xl">
        {/* eslint-disable-next-line no-nested-ternary */}
        {showForm ? (
          <div className="flex flex-col gap-6">
            {/* Server */}
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

            {/* Webhook (inbound) */}
            <div className="flex flex-col gap-3 border-t border-neutral-800 pt-5">
              <div>
                {sectionLabel(
                  I18nKey.PROJECT_MANAGEMENT$JIRA_DC_WEBHOOK_SECTION_LABEL,
                )}
                <p className="text-xs text-tertiary-alt mt-1">
                  {t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_WEBHOOK_SECTION_HELP)}
                </p>
              </div>
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

            {/* Service account (outbound) */}
            <div className="flex flex-col gap-3 border-t border-neutral-800 pt-5">
              <div>
                {sectionLabel(
                  I18nKey.PROJECT_MANAGEMENT$JIRA_DC_SERVICE_ACCOUNT_SECTION_LABEL,
                )}
                <p className="text-xs text-tertiary-alt mt-1">
                  {t(
                    I18nKey.PROJECT_MANAGEMENT$JIRA_DC_SERVICE_ACCOUNT_SECTION_HELP,
                  )}
                </p>
              </div>
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

            {/* Active — only meaningful for an already-connected integration */}
            {existingWorkspace && (
              <div className="border-t border-neutral-800 pt-5">
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

            <div className="flex items-center gap-3 pt-1">
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
              {existingWorkspace && (
                <BrandButton
                  variant="secondary"
                  onClick={cancelEdit}
                  testId="jira-dc-cancel-edit-button"
                  type="button"
                  isDisabled={isBusy}
                >
                  {t(I18nKey.FEEDBACK$CANCEL_LABEL)}
                </BrandButton>
              )}
            </div>
          </div>
        ) : showRemoveConfirm ? (
          // Remove confirmation (admin only): optional PAT also revokes the
          // Jira webhook.
          <div className="flex flex-col gap-3">
            <p className="text-sm text-tertiary-alt">
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
                {t(I18nKey.PROJECT_MANAGEMENT$REMOVE_INTEGRATION_BUTTON_LABEL)}
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
          // Resting state — compact read-only summary of the connected install.
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex gap-2">
                <span className="text-gray-400 w-24 shrink-0">
                  {t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_SERVER_SECTION_LABEL)}
                </span>
                <span className="text-gray-200 break-all">{workspace}</span>
              </div>
              {existingWorkspace?.svc_acc_email && (
                <div className="flex gap-2">
                  <span className="text-gray-400 w-24 shrink-0">
                    {t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_SUMMARY_POSTS_AS)}
                  </span>
                  <span className="text-gray-200 break-all">
                    {existingWorkspace.svc_acc_email}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isWorkspaceEditable ? (
                <>
                  <BrandButton
                    variant="primary"
                    onClick={() => setIsEditing(true)}
                    testId="jira-dc-edit-button"
                    type="button"
                    isDisabled={isBusy}
                  >
                    {t(I18nKey.PROJECT_MANAGEMENT$JIRA_DC_EDIT_BUTTON_LABEL)}
                  </BrandButton>
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
                </>
              ) : (
                <BrandButton
                  variant="secondary"
                  onClick={() => unlinkMutation.mutate(undefined)}
                  testId="jira-dc-disconnect-button"
                  type="button"
                  isDisabled={isBusy}
                >
                  {t(I18nKey.PROJECT_MANAGEMENT$DISCONNECT_BUTTON_LABEL)}
                </BrandButton>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
