"""Event name constants for PostHog analytics.

Naming convention: PostHog recommended object-action, lowercase with spaces.
"""

# Phase 1 events
USER_LOGGED_IN = 'user logged in'

# Phase 2 events
USER_SIGNED_UP = 'user signed up'
CONVERSATION_CREATED = 'conversation created'
CONVERSATION_FINISHED = 'conversation finished'
CONVERSATION_ERRORED = 'conversation errored'
CREDIT_PURCHASED = 'credit purchased'
CREDIT_LIMIT_REACHED = 'credit limit reached'

# Phase 4 events
USER_ACTIVATED = 'user activated'
GIT_PROVIDER_CONNECTED = 'git provider connected'
ONBOARDING_COMPLETED = 'onboarding completed'
SETTINGS_SAVED = 'settings saved'
MCP_CONFIG_UPDATED = 'mcp config updated'
TRAJECTORY_DOWNLOADED = 'trajectory downloaded'
TEAM_MEMBERS_INVITED = 'team members invited'

# Enterprise lead-gen events
SAAS_SELFHOSTED_INQUIRY = 'saas selfhosted inquiry'
ENTERPRISE_LEAD_FORM_SUBMITTED = 'enterprise lead form submitted'

# UI interaction events
DOWNLOAD_VIA_VSCODE_BUTTON_CLICKED = 'download via vscode button clicked'
SETTINGS_SAVED = 'settings saved'
LOGIN_BUTTON_CLICKED = 'login button clicked'
PUSH_BUTTON_CLICKED = 'push button clicked'
PULL_BUTTON_CLICKED = 'pull button clicked'
CREATE_PR_BUTTON_CLICKED = 'create pr button clicked'
EXP_ADD_TEAM_MEMBERS = 'exp add team members'
MCP_CONFIG_UPDATED = 'mcp config updated'
DOWNLOAD_TRAJECTORY_BUTTON_CLICKED = 'download trajectory button clicked'
EXCEPTION_CAPTURED = 'exception captured'

# Error tracking (replaces frontend captureException)
ERROR_CAPTURED = 'error captured'
