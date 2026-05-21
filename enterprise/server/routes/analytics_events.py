"""Client-initiated analytics events.

Endpoints in this module exist because the corresponding user actions happen
purely in the browser (no other backend endpoint is hit), so the frontend has
to explicitly notify the server in order for the event to be captured by the
server-side PostHog SDK.

Each endpoint:
- Authenticates via the standard ``get_user_id`` dependency.
- Validates a small typed body so we never forward arbitrary client-controlled
  property names into PostHog.
- Swallows analytics exceptions to ensure telemetry failures never bubble up
  to the user.
"""

import logging
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from openhands.analytics import get_analytics_service, resolve_analytics_context
from openhands.app_server.user_auth import get_user_id

analytics_events_router = APIRouter(prefix='/api/analytics/events', tags=['Analytics'])

logger = logging.getLogger(__name__)


class CreatePrButtonClickedPayload(BaseModel):
    """Payload for the ``create pr button clicked`` event.

    ``git_provider`` is restricted to the provider names used elsewhere in the
    frontend's ``Provider`` union so we never forward arbitrary strings to
    PostHog as property values.
    """

    git_provider: Literal['github', 'gitlab', 'bitbucket', 'bitbucket-dc'] | None = None


class AnalyticsEventResponse(BaseModel):
    status: str


@analytics_events_router.post(
    '/create-pr-button-clicked', response_model=AnalyticsEventResponse
)
async def create_pr_button_clicked(
    body: CreatePrButtonClickedPayload,
    user_id: str | None = Depends(get_user_id),
) -> AnalyticsEventResponse:
    """Fire the ``create pr button clicked`` PostHog event.

    The frontend hits this endpoint when a user clicks the Pull Request button
    in the conversation UI. Returning success is independent of whether
    analytics actually captured (unauthenticated callers and analytics outages
    both yield a 200 ``status=ok``); we never want the click handler to be
    blocked by telemetry.
    """
    try:
        analytics = get_analytics_service()
        if analytics and user_id:
            ctx = await resolve_analytics_context(user_id)
            analytics.track_create_pr_button_clicked(
                ctx=ctx,
                git_provider=body.git_provider,
            )
    except Exception:
        logger.exception('analytics:create_pr_button_clicked:failed')

    return AnalyticsEventResponse(status='ok')
