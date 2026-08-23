import asyncio
import os
import subprocess
from pathlib import Path

import pytest

from app.tool.base import ToolContext
from app.tool.shell_tools import (
    _blocked_git_workspace_mutation,
    _looks_like_build,
    _shell_command,
    _validate_shell,
)


def test_build_commands_receive_long_timeout_classification() -> None:
    assert _looks_like_build("mvn test")
    assert _looks_like_build(".\\mvnw.cmd test")
    assert _looks_like_build("./gradlew build")
    assert not _looks_like_build("git status")


@pytest.mark.parametrize(
    "command",
    [
        "git worktree add ../temporary HEAD",
        "git -C . worktree remove ../temporary",
        "git switch feature/test",
        "git checkout main",
        "git symbolic-ref HEAD refs/heads/other",
        "git update-ref HEAD deadbeef",
        "git branch feature/agent",
        "git branch -D old-agent-branch",
        "git commit -am generated",
        "git reset --hard HEAD~1",
        "git merge feature/other",
        "git rebase main",
        "git add -A",
        "cmd /c git branch feature/wrapped",
        "cmd /c \"%GIT_EXE% branch feature/dynamic\"",
        "cmd.exe /d /s /c \"%GIT_EXE% branch feature/dynamic\"",
        "cmd.exe /q /c \"%GIT_EXE% branch feature/dynamic\"",
        "python -c \"import subprocess; subprocess.run(['g'+'it'])\"",
        "node -e \"require('child_process').execSync('g'+'it')\"",
        "powershell -EncodedCommand ZwBpAHQAIABiAHIAYQBuAGMAaAA=",
        "bash -c '$GIT branch feature/dynamic'",
        "& 'C:\\Program Files\\Git\\bin\\git.exe' switch main",
        "Set-Content -LiteralPath .git/HEAD -Value 'refs/heads/other'",
        "python mutate.py",
        "node mutate.js",
        "powershell -File mutate.ps1",
        "bash mutate.sh",
        ".\\mutate-control.cmd",
        "./mutate-control.sh",
    ],
)
def test_workspace_control_git_mutations_are_hard_blocked(
    tmp_path: Path,
    command: str,
) -> None:
    assert _blocked_git_workspace_mutation(command)
    result = asyncio.run(_shell_command(
        ToolContext(tmp_path), {"command": command}
    ))
    assert result.is_error is True
    assert result.metadata["failureKind"] == "workspace_control_required"
    assert result.metadata["toolExecutionState"] == "not_started"


def test_read_only_git_workspace_commands_remain_available() -> None:
    assert not _blocked_git_workspace_mutation("git worktree list")
    assert not _blocked_git_workspace_mutation("git status --short")
    assert not _blocked_git_workspace_mutation("git branch --show-current")
    assert not _blocked_git_workspace_mutation("git log --oneline -5")
    assert not _blocked_git_workspace_mutation("git config --get user.name")
    assert not _blocked_git_workspace_mutation("git remote -v")
    assert not _blocked_git_workspace_mutation(".\\mvnw.cmd test")
    assert not _blocked_git_workspace_mutation("./gradlew test")
    assert not _blocked_git_workspace_mutation("npm.cmd test")


def test_indirect_git_control_change_is_never_reported_as_success(
    tmp_path: Path,
) -> None:
    _git(tmp_path, "init")
    _git(tmp_path, "config", "user.name", "Lumora Test")
    _git(tmp_path, "config", "user.email", "lumora@test.invalid")
    (tmp_path / "base.txt").write_text("base\n", encoding="utf-8")
    _git(tmp_path, "add", "base.txt")
    _git(tmp_path, "commit", "-m", "base")
    command = (
        "$gitName = 'g' + 'it'; "
        "& $gitName branch escaped-control; "
        "& $gitName config user.name Escaped"
        if os.name == "nt"
        else (
            "git_name=g\"\"it; \"$git_name\" branch escaped-control; "
            "\"$git_name\" config user.name Escaped"
        )
    )

    result = asyncio.run(_shell_command(
        ToolContext(tmp_path),
        {"command": command},
    ))

    assert result.is_error is True
    assert result.metadata["failureKind"] == "workspace_control_violation"
    assert "references" in result.metadata["changedGitControlState"]
    assert "repositoryConfig" in result.metadata["changedGitControlState"]


def test_actual_git_directory_metadata_path_is_blocked(tmp_path: Path) -> None:
    _git(tmp_path, "init")
    git_directory = subprocess.run(
        ("git", "-C", str(tmp_path), "rev-parse", "--absolute-git-dir"),
        capture_output=True,
        check=True,
        text=True,
    ).stdout.strip()
    command = f"Set-Content -LiteralPath '{git_directory}/HEAD' -Value invalid"

    result = asyncio.run(_shell_command(
        ToolContext(tmp_path),
        {"command": command},
    ))

    assert result.is_error is True
    assert result.metadata["failureKind"] == "workspace_control_required"
    assert result.metadata["toolExecutionState"] == "not_started"


def test_persistent_command_requires_background_mode() -> None:
    command = "mvn spring-boot:run"

    assert "不支持后台 Shell" in str(_validate_shell({"command": command}))
    assert "不支持后台 Shell" in str(
        _validate_shell({"command": command, "background": True})
    )


def test_background_process_is_rejected_before_start(tmp_path: Path) -> None:
    asyncio.run(_assert_background_process_rejected(tmp_path))


async def _assert_background_process_rejected(tmp_path: Path) -> None:
    command = (
        "Start-Sleep -Seconds 30"
        if os.name == "nt"
        else "sleep 30"
    )
    context = ToolContext(tmp_path)
    started = await _shell_command(
        context,
        {"command": command, "background": True},
    )
    assert started.is_error is True
    assert started.metadata["failureKind"] == "background_write_not_coordinated"
    assert started.metadata["toolExecutionState"] == "not_started"
    assert "processId" not in started.metadata


def _git(workspace: Path, *arguments: str) -> None:
    subprocess.run(
        ("git", "-C", str(workspace), *arguments),
        capture_output=True,
        check=True,
    )
