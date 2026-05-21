"""Tests for client-initiated analytics events router.

Covers ``POST /api/analytics/events/create-pr-button-clicked``:
- Returns 200 OK and ``status='ok'`` on the happy path
- Fires ``track_create_pr_button_clicked`` with the supplied git provider
- Silently no-ops when there is no authenticated user
- Silently no-ops when analytics is disabled (``get_analytics_service`` returns
  ``None``)
- Swallows analytics exceptions so a telemetry outage never breaks the click
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from server.routes.analytics_events import (
    CreatePrButtonClickedPayload,
    create_pr_button_clicked,
)


@pytest.mark.asyncio
async def test_returns_ok_on_happy_path():
    """Endpoint returns status='ok' when analytics is wired and fires."""
    mock_analytics = MagicMock()
    mock_ctx = MagicMock(org_id='org-123')

    with (
        patch(
            'server.routes.analytics_events.get_analytics_service',
            return_value=mock_analytics,
        ),
        patch(
            'server.routes.analytics_events.resolve_analytics_context',
            new_callable=AsyncMock,
            return_value=mock_ctx,
        ),
    ):
        result = await create_pr_button_clicked(
            body=CreatePrButtonClickedPayload(git_provider='github'),
            user_id='user-123',
        )

    assert result.status == 'ok'
    mock_analytics.track_create_pr_button_clicked.assert_called_once_with(
        ctx=mock_ctx,
        git_provider='github',
    )


@pytest.mark.asyncio
async def test_skips_tracking_when_unauthenticated():
    """No user_id means no tracking - but endpoint still returns ok."""
    mock_analytics = MagicMock()

    with (
        patch(
            'server.routes.analytics_events.get_analytics_service',
            return_value=mock_analytics,
        ),
        patch(
            'server.routes.analytics_events.resolve_analytics_context',
            new_callable=AsyncMock,
        ) as mock_resolve,
    ):
        result = await create_pr_button_clicked(
            body=CreatePrButtonClickedPayload(git_provider='gitlab'),
            user_id=None,
        )

    assert result.status == 'ok'
    mock_analytics.track_create_pr_button_clicked.assert_not_called()
    mock_resolve.assert_not_called()


@pytest.mark.asyncio
async def test_skips_tracking_when_analytics_disabled():
    """When get_analytics_service returns None, endpoint still returns ok."""
    with (
        patch(
            'server.routes.analytics_events.get_analytics_service',
            return_value=None,
        ),
        patch(
            'server.routes.analytics_events.resolve_analytics_context',
            new_callable=AsyncMock,
        ) as mock_resolve,
    ):
        result = await create_pr_button_clicked(
            body=CreatePrButtonClickedPayload(git_provider='github'),
            user_id='user-123',
        )

    assert result.status == 'ok'
    mock_resolve.assert_not_called()


@pytest.mark.asyncio
async def test_swallows_analytics_exceptions():
    """Telemetry failures must not bubble up to the user."""
    mock_analytics = MagicMock()
    mock_analytics.track_create_pr_button_clicked.side_effect = RuntimeError(
        'posthog down'
    )

    with (
        patch(
            'server.routes.analytics_events.get_analytics_service',
            return_value=mock_analytics,
        ),
        patch(
            'server.routes.analytics_events.resolve_analytics_context',
            new_callable=AsyncMock,
            return_value=MagicMock(org_id=None),
        ),
    ):
        result = await create_pr_button_clicked(
            body=CreatePrButtonClickedPayload(git_provider='github'),
            user_id='user-123',
        )

    assert result.status == 'ok'


@pytest.mark.asyncio
async def test_accepts_missing_git_provider():
    """git_provider is optional; null payloads still fire the event."""
    mock_analytics = MagicMock()

    with (
        patch(
            'server.routes.analytics_events.get_analytics_service',
            return_value=mock_analytics,
        ),
        patch(
            'server.routes.analytics_events.resolve_analytics_context',
            new_callable=AsyncMock,
            return_value=MagicMock(org_id=None),
        ),
    ):
        result = await create_pr_button_clicked(
            body=CreatePrButtonClickedPayload(),
            user_id='user-123',
        )

    assert result.status == 'ok'
    mock_analytics.track_create_pr_button_clicked.assert_called_once_with(
        ctx=mock_analytics.track_create_pr_button_clicked.call_args.kwargs['ctx'],
        git_provider=None,
    )


def test_payload_rejects_unknown_git_provider():
    """The pydantic model must reject git providers we don't recognise so
    arbitrary client-controlled strings never become PostHog properties."""
    with pytest.raises(ValueError):
        CreatePrButtonClickedPayload(git_provider='attacker-provided')
