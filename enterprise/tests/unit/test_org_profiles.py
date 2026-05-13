"""Unit tests for organization LLM profiles router."""

import uuid
from unittest.mock import MagicMock

import pytest
from server.routes.org_profiles import (
    ProfileListResponse,
    ProfileMutationResponse,
    RenameProfileRequest,
    SaveProfileRequest,
    _load_profiles,
)
from storage.org import Org

from openhands.app_server.settings.llm_profiles import LLMProfiles
from openhands.sdk.llm import LLM


@pytest.fixture
def sample_org():
    """Create a sample org for testing."""
    org = MagicMock(spec=Org)
    org.id = uuid.uuid4()
    org.llm_profiles = None
    org.agent_settings = {'llm': {'model': 'gpt-4', 'api_key': 'test-key'}}
    return org


@pytest.fixture
def org_with_profiles():
    """Create an org with existing profiles."""
    org = MagicMock(spec=Org)
    org.id = uuid.uuid4()
    org.llm_profiles = {
        'profiles': {
            'my-profile': {'model': 'claude-3', 'api_key': 'claude-key'},
            'backup': {'model': 'gpt-4o', 'api_key': 'openai-key'},
        },
        'active': 'my-profile',
    }
    org.agent_settings = {'llm': {'model': 'gpt-4', 'api_key': 'test-key'}}
    return org


class TestLoadProfiles:
    """Test the _load_profiles helper function."""

    def test_load_profiles_empty(self, sample_org):
        """Test loading profiles when org has none."""
        profiles = _load_profiles(sample_org)
        assert isinstance(profiles, LLMProfiles)
        assert profiles.active is None
        assert len(profiles.summaries()) == 0

    def test_load_profiles_with_data(self, org_with_profiles):
        """Test loading profiles when org has existing profiles."""
        profiles = _load_profiles(org_with_profiles)
        assert isinstance(profiles, LLMProfiles)
        assert profiles.active == 'my-profile'
        summaries = profiles.summaries()
        assert len(summaries) == 2
        names = [s['name'] for s in summaries]
        assert 'my-profile' in names
        assert 'backup' in names

    def test_load_profiles_invalid_data(self, sample_org):
        """Test loading profiles when org has invalid data."""
        sample_org.llm_profiles = {'invalid': 'data'}
        profiles = _load_profiles(sample_org)
        # Should return empty profiles on parse error
        assert isinstance(profiles, LLMProfiles)


class TestProfileListResponse:
    """Test ProfileListResponse model."""

    def test_empty_list(self):
        """Test empty profile list response."""
        response = ProfileListResponse(profiles=[], active_profile=None)
        assert response.profiles == []
        assert response.active_profile is None

    def test_with_profiles(self):
        """Test profile list response with data."""
        from server.routes.org_profiles import ProfileInfo

        profiles = [
            ProfileInfo(name='test', model='gpt-4', base_url=None, api_key_set=True),
        ]
        response = ProfileListResponse(profiles=profiles, active_profile='test')
        assert len(response.profiles) == 1
        assert response.active_profile == 'test'


class TestProfileMutationResponse:
    """Test ProfileMutationResponse model."""

    def test_create_response(self):
        """Test creating a mutation response."""
        response = ProfileMutationResponse(
            name='new-profile', message="Profile 'new-profile' saved"
        )
        assert response.name == 'new-profile'
        assert 'saved' in response.message


class TestSaveProfileRequest:
    """Test SaveProfileRequest model."""

    def test_default_values(self):
        """Test default values for save request."""
        request = SaveProfileRequest()
        assert request.include_secrets is True
        assert request.llm is None

    def test_with_llm(self):
        """Test save request with LLM config."""
        request = SaveProfileRequest(include_secrets=False, llm=LLM(model='gpt-4'))
        assert request.include_secrets is False
        assert request.llm is not None
        assert request.llm.model == 'gpt-4'


class TestRenameProfileRequest:
    """Test RenameProfileRequest model."""

    def test_valid_name(self):
        """Test valid rename request."""
        request = RenameProfileRequest(new_name='new-name')
        assert request.new_name == 'new-name'

    def test_name_validation(self):
        """Test name length validation."""
        # Should accept reasonable names
        request = RenameProfileRequest(new_name='a' * 100)
        assert len(request.new_name) == 100

        # Should reject empty names (min_length=1)
        with pytest.raises(ValueError):
            RenameProfileRequest(new_name='')

        # Should reject too-long names (max_length=100)
        with pytest.raises(ValueError):
            RenameProfileRequest(new_name='a' * 101)
