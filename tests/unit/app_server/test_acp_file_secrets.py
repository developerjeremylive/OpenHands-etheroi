"""Tests for FILE:-prefixed secret injection in ACP conversations.

Verifies that secrets named ``FILE:<path>`` are written as files to a
per-conversation temp directory and that the appropriate env var
(e.g. ``CLAUDE_CONFIG_DIR``) is injected, while the secret is removed
from the regular secrets dict so it is not exported as a plain env var.
"""

import os
import stat
import tempfile
from uuid import UUID

import pytest

from openhands.app_server.app_conversation.live_status_app_conversation_service import (
    LiveStatusAppConversationService,
)
from openhands.sdk.secret import StaticSecret
from pydantic import SecretStr

_inject = LiveStatusAppConversationService._inject_file_secrets

CONV_ID = UUID("12345678-1234-5678-1234-567812345678")


def _static(value: str) -> StaticSecret:
    return StaticSecret(value=SecretStr(value))


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------


def test_claude_credentials_written_and_env_injected(tmp_path, monkeypatch):
    """FILE:~/.claude/credentials.json → file written, CLAUDE_CONFIG_DIR set."""
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))

    creds = '{"access_token": "tok", "refresh_token": "ref"}'
    secrets = {
        "FILE:~/.claude/credentials.json": _static(creds),
        "ANTHROPIC_API_KEY": _static("sk-test"),
    }

    remaining, extra_env = _inject(secrets, CONV_ID)

    # FILE: secret removed from regular secrets
    assert "FILE:~/.claude/credentials.json" not in remaining
    assert "ANTHROPIC_API_KEY" in remaining

    # CLAUDE_CONFIG_DIR injected
    assert "CLAUDE_CONFIG_DIR" in extra_env
    config_dir = extra_env["CLAUDE_CONFIG_DIR"]

    # File written at the expected location
    creds_file = os.path.join(config_dir, "credentials.json")
    assert os.path.isfile(creds_file), f"credentials.json missing at {creds_file}"
    assert open(creds_file).read() == creds

    # Permissions are owner-only (0o600)
    mode = stat.S_IMODE(os.stat(creds_file).st_mode)
    assert mode == 0o600, f"expected 0o600, got {oct(mode)}"


def test_temp_dir_is_conversation_scoped(tmp_path, monkeypatch):
    """Each conversation_id gets its own temp dir."""
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))

    conv_a = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    conv_b = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

    secrets = {"FILE:~/.claude/credentials.json": _static("{}")}

    _, env_a = _inject(dict(secrets), conv_a)
    _, env_b = _inject(dict(secrets), conv_b)

    assert env_a["CLAUDE_CONFIG_DIR"] != env_b["CLAUDE_CONFIG_DIR"]
    assert conv_a.hex in env_a["CLAUDE_CONFIG_DIR"]
    assert conv_b.hex in env_b["CLAUDE_CONFIG_DIR"]


def test_no_file_secrets_returns_unchanged(tmp_path, monkeypatch):
    """When no FILE: secrets exist, secrets dict and extra_env are both unchanged."""
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))

    secrets = {"ANTHROPIC_API_KEY": _static("sk-test"), "OTHER": _static("val")}
    remaining, extra_env = _inject(dict(secrets), CONV_ID)

    assert remaining == secrets
    assert extra_env == {}


# ---------------------------------------------------------------------------
# Edge-case / guard tests
# ---------------------------------------------------------------------------


def test_empty_value_skipped(tmp_path, monkeypatch):
    """FILE: secret with empty value is skipped gracefully."""
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))

    secrets = {"FILE:~/.claude/credentials.json": _static("")}
    remaining, extra_env = _inject(secrets, CONV_ID)

    assert remaining == {}
    assert extra_env == {}


def test_unknown_file_path_skipped(tmp_path, monkeypatch):
    """FILE: secret with unrecognised path is logged and skipped."""
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))

    secrets = {"FILE:~/.some-other-tool/token": _static("value")}
    out_secrets, extra_env = _inject(secrets, CONV_ID)

    assert out_secrets == {}
    assert extra_env == {}


def test_multiple_claude_files_share_config_dir(tmp_path, monkeypatch):
    """Multiple ~/.claude/* secrets share the same CLAUDE_CONFIG_DIR."""
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))

    secrets = {
        "FILE:~/.claude/credentials.json": _static('{"a":1}'),
        "FILE:~/.claude/settings.json": _static('{"b":2}'),
    }
    _, extra_env = _inject(secrets, CONV_ID)

    assert "CLAUDE_CONFIG_DIR" in extra_env
    config_dir = extra_env["CLAUDE_CONFIG_DIR"]

    assert os.path.isfile(os.path.join(config_dir, "credentials.json"))
    assert os.path.isfile(os.path.join(config_dir, "settings.json"))
    # Both files sit under the same directory — env var appears once.
    assert list(extra_env.keys()) == ["CLAUDE_CONFIG_DIR"]


# ---------------------------------------------------------------------------
# Security: path traversal tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "malicious_name",
    [
        "FILE:~/.claude/../../etc/passwd",
        "FILE:~/.claude/../../../tmp/evil",
        "FILE:~/.claude/./../../etc/shadow",
    ],
)
def test_path_traversal_rejected(tmp_path, monkeypatch, malicious_name):
    """FILE: secrets containing path traversal sequences are silently rejected."""
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))

    secrets = {malicious_name: _static("malicious content")}
    _, extra_env = _inject(secrets, CONV_ID)

    # No env var should be set and no file written outside the temp base
    assert extra_env == {}
    for dirpath, _, filenames in os.walk(str(tmp_path)):
        for fname in filenames:
            full = os.path.join(dirpath, fname)
            assert "etc" not in full, f"Traversal escaped to {full}"
            assert "evil" not in full, f"Traversal escaped to {full}"


def test_absolute_path_in_relative_rejected(tmp_path, monkeypatch):
    """A FILE: secret whose path after stripping the prefix is absolute is rejected."""
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))

    # Crafted so that after stripping "~/.claude/" we get "/etc/passwd"
    secrets = {"FILE:~/.claude//etc/passwd": _static("malicious")}
    _, extra_env = _inject(secrets, CONV_ID)

    assert extra_env == {}
    assert not os.path.exists("/etc/passwd" + ".injected")  # sanity


# ---------------------------------------------------------------------------
# Cleanup tests
# ---------------------------------------------------------------------------


def test_cleanup_removes_temp_dir(tmp_path, monkeypatch):
    """_cleanup_acp_temp_dir removes the directory created by _inject_file_secrets."""
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))

    secrets = {"FILE:~/.claude/credentials.json": _static("{}")}
    _inject(secrets, CONV_ID)

    base_tmp = os.path.join(str(tmp_path), f"oh-acp-{CONV_ID.hex}")
    assert os.path.isdir(base_tmp)

    LiveStatusAppConversationService._cleanup_acp_temp_dir(CONV_ID)
    assert not os.path.exists(base_tmp)


def test_cleanup_is_noop_when_no_dir(tmp_path, monkeypatch):
    """_cleanup_acp_temp_dir is safe to call when no temp dir exists."""
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path))
    # Should not raise
    LiveStatusAppConversationService._cleanup_acp_temp_dir(CONV_ID)
