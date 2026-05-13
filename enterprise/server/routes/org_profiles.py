"""Organization LLM profiles router.

Provides CRUD operations for org-level LLM profiles. Profiles are stored on
the organization and can be activated by members.

Permission model:
- CRUD (create, update, delete, rename): Requires EDIT_ORG_SETTINGS (owner/admin)
- Activate: Requires VIEW_ORG_SETTINGS (any member)
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field
from server.routes.org_models import OrgNotFoundError
from sqlalchemy import select
from storage.org import Org
from storage.org_member import OrgMember
from storage.org_service import OrgService
from storage.session import a_session_maker

from openhands.app_server.settings.llm_profiles import (
    LLMProfiles,
    ProfileAlreadyExistsError,
    ProfileLimitExceededError,
    ProfileNotFoundError,
    StrictLLM,
)
from openhands.app_server.utils.logger import openhands_logger as logger
from openhands.sdk.llm import LLM

from ..auth.authorization import Permission, require_permission

router = APIRouter(tags=['Organization Profiles'])


# ── Request/Response Models ────────────────────────────────────────────────


class ProfileInfo(BaseModel):
    """Summary info for a profile (no secrets)."""

    name: str
    model: str | None
    base_url: str | None
    api_key_set: bool


class ProfileListResponse(BaseModel):
    """Response for listing profiles."""

    profiles: list[ProfileInfo]
    active_profile: str | None


class ProfileDetailResponse(BaseModel):
    """Response for getting a single profile's details."""

    name: str
    llm: dict[str, Any]


class ProfileMutationResponse(BaseModel):
    """Response for profile mutations (save, delete, rename)."""

    name: str
    message: str


class ActivateProfileResponse(BaseModel):
    """Response for activating a profile."""

    name: str
    message: str
    llm: dict[str, Any]


class SaveProfileRequest(BaseModel):
    """Request body for saving a profile."""

    include_secrets: bool = True
    llm: StrictLLM | None = None


class RenameProfileRequest(BaseModel):
    """Request body for renaming a profile."""

    new_name: str = Field(..., min_length=1, max_length=100)


# ── Helper Functions ────────────────────────────────────────────────────────


def _load_profiles(org: Org) -> LLMProfiles:
    """Load LLMProfiles from org row, defaulting to empty if not set."""
    if org.llm_profiles is None:
        return LLMProfiles()
    try:
        return LLMProfiles.model_validate(org.llm_profiles)
    except Exception as exc:
        logger.warning('Failed to load org profiles for %s: %s', org.id, exc)
        return LLMProfiles()


async def _get_org(org_id: UUID, user_id: str) -> Org:
    """Get org, raising 404 if not found."""
    try:
        return await OrgService.get_org_by_id(org_id=org_id, user_id=user_id)
    except OrgNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


async def _save_org_profiles(org_id: UUID, profiles: LLMProfiles) -> None:
    """Persist profiles to org row."""
    async with a_session_maker() as session:
        result = await session.execute(select(Org).filter(Org.id == org_id))
        org = result.scalars().first()
        if org is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f'Organization {org_id} not found',
            )
        org.llm_profiles = profiles.model_dump(
            mode='json', context={'expose_secrets': True}
        )
        await session.commit()


async def _activate_profile_for_member(
    org_id: UUID, user_id: str, profile_name: str, llm: LLM
) -> None:
    """Update member's agent_settings_diff with the activated profile's LLM config."""
    async with a_session_maker() as session:
        result = await session.execute(
            select(OrgMember).filter(
                OrgMember.org_id == org_id, OrgMember.user_id == user_id
            )
        )
        member = result.scalars().first()
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='Organization membership not found',
            )

        llm_dump = llm.model_dump(mode='json', context={'expose_secrets': True})
        member_diff = dict(member.agent_settings_diff or {})
        member_diff['llm'] = llm_dump
        member.agent_settings_diff = member_diff
        await session.commit()


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get('/{org_id}/profiles', response_model=ProfileListResponse)
async def list_profiles(
    org_id: UUID,
    user_id: str = Depends(require_permission(Permission.VIEW_ORG_SETTINGS)),
) -> ProfileListResponse:
    """List all LLM profiles for this organization."""
    org = await _get_org(org_id, user_id)
    profiles = _load_profiles(org)
    return ProfileListResponse(
        profiles=[ProfileInfo(**p) for p in profiles.summaries()],
        active_profile=profiles.active,
    )


@router.get('/{org_id}/profiles/{name}', response_model=ProfileDetailResponse)
async def get_profile(
    org_id: UUID,
    name: str = Path(..., min_length=1),
    user_id: str = Depends(require_permission(Permission.VIEW_ORG_SETTINGS)),
) -> ProfileDetailResponse:
    """Get details of a specific profile."""
    org = await _get_org(org_id, user_id)
    profiles = _load_profiles(org)
    llm = profiles.get(name)
    if llm is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile '{name}' not found",
        )
    return ProfileDetailResponse(
        name=name,
        llm=llm.model_dump(mode='json', context={'expose_secrets': False}),
    )


@router.post('/{org_id}/profiles/{name}', response_model=ProfileMutationResponse)
async def save_profile(
    org_id: UUID,
    name: str = Path(..., min_length=1, max_length=100),
    request: SaveProfileRequest = SaveProfileRequest(),
    user_id: str = Depends(require_permission(Permission.EDIT_ORG_SETTINGS)),
) -> ProfileMutationResponse:
    """Create or update an LLM profile.

    If ``llm`` is omitted, saves a copy of the current org LLM defaults.
    """
    org = await _get_org(org_id, user_id)
    profiles = _load_profiles(org)

    try:
        if request.llm is not None:
            profiles.save(name, request.llm, include_secrets=request.include_secrets)
        else:
            # Snapshot current org LLM settings
            from openhands.sdk.settings import AgentSettings

            agent_settings = AgentSettings.model_validate(org.agent_settings or {})
            profiles.save(
                name, agent_settings.llm, include_secrets=request.include_secrets
            )

        await _save_org_profiles(org_id, profiles)
    except ProfileLimitExceededError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return ProfileMutationResponse(name=name, message=f"Profile '{name}' saved")


@router.delete('/{org_id}/profiles/{name}', response_model=ProfileMutationResponse)
async def delete_profile(
    org_id: UUID,
    name: str = Path(..., min_length=1),
    user_id: str = Depends(require_permission(Permission.EDIT_ORG_SETTINGS)),
) -> ProfileMutationResponse:
    """Delete an LLM profile."""
    org = await _get_org(org_id, user_id)
    profiles = _load_profiles(org)

    if not profiles.delete(name):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile '{name}' not found",
        )

    await _save_org_profiles(org_id, profiles)
    return ProfileMutationResponse(name=name, message=f"Profile '{name}' deleted")


@router.post(
    '/{org_id}/profiles/{name}/activate', response_model=ActivateProfileResponse
)
async def activate_profile(
    org_id: UUID,
    name: str = Path(..., min_length=1),
    user_id: str = Depends(require_permission(Permission.VIEW_ORG_SETTINGS)),
) -> ActivateProfileResponse:
    """Activate a profile for the current user.

    Updates the user's org member settings diff with the profile's LLM config.
    Any member can activate a profile (VIEW_ORG_SETTINGS permission).
    """
    org = await _get_org(org_id, user_id)
    profiles = _load_profiles(org)

    llm = profiles.get(name)
    if llm is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile '{name}' not found",
        )

    # Update org's active profile marker
    profiles.active = name
    await _save_org_profiles(org_id, profiles)

    # Update member's personal LLM override
    await _activate_profile_for_member(org_id, user_id, name, llm)

    return ActivateProfileResponse(
        name=name,
        message=f"Profile '{name}' activated",
        llm=llm.model_dump(mode='json', context={'expose_secrets': False}),
    )


@router.post('/{org_id}/profiles/{name}/rename', response_model=ProfileMutationResponse)
async def rename_profile(
    org_id: UUID,
    name: str = Path(..., min_length=1),
    request: RenameProfileRequest = Body(...),
    user_id: str = Depends(require_permission(Permission.EDIT_ORG_SETTINGS)),
) -> ProfileMutationResponse:
    """Rename an LLM profile."""
    org = await _get_org(org_id, user_id)
    profiles = _load_profiles(org)

    try:
        profiles.rename(name, request.new_name)
        await _save_org_profiles(org_id, profiles)
    except ProfileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ProfileAlreadyExistsError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return ProfileMutationResponse(
        name=request.new_name,
        message=f"Profile renamed from '{name}' to '{request.new_name}'",
    )
