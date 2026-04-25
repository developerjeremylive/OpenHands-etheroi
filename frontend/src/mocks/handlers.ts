import { API_KEYS_HANDLERS } from "#/mocks/api-keys-handlers";
import { BILLING_HANDLERS } from "#/mocks/billing-handlers";
import { FILE_SERVICE_HANDLERS } from "#/mocks/file-service-handlers";
import { TASK_SUGGESTIONS_HANDLERS } from "#/mocks/task-suggestions-handlers";
import { SECRETS_HANDLERS } from "#/mocks/secrets-handlers";
import { ORG_HANDLERS } from "#/mocks/org-handlers";
import { GIT_REPOSITORY_HANDLERS } from "#/mocks/git-repository-handlers";
import {
  SETTINGS_HANDLERS,
  MOCK_DEFAULT_USER_SETTINGS,
  resetTestHandlersMockSettings,
} from "#/mocks/settings-handlers";
import { CONVERSATION_HANDLERS } from "#/mocks/conversation-handlers";
import { AUTH_HANDLERS } from "#/mocks/auth-handlers";
import { FEEDBACK_HANDLERS } from "#/mocks/feedback-handlers";
import { ANALYTICS_HANDLERS } from "#/mocks/analytics-handlers";
import { EXTRA_HANDLERS } from "#/mocks/extra-handlers";

export const handlers = [
  ...ORG_HANDLERS,
  ...API_KEYS_HANDLERS,
  ...BILLING_HANDLERS,
  ...FILE_SERVICE_HANDLERS,
  ...TASK_SUGGESTIONS_HANDLERS,
  ...SECRETS_HANDLERS,
  ...GIT_REPOSITORY_HANDLERS,
  ...SETTINGS_HANDLERS,
  ...CONVERSATION_HANDLERS,
  ...AUTH_HANDLERS,
  ...FEEDBACK_HANDLERS,
  ...ANALYTICS_HANDLERS,
  ...EXTRA_HANDLERS,
];

export { MOCK_DEFAULT_USER_SETTINGS, resetTestHandlersMockSettings };
