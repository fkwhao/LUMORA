import asyncio
import os
from pathlib import Path

from app.tool.base import ToolContext
from app.tool.shell_tools import (
    _looks_like_build,
    _shell_command,
    _shell_process,
    _validate_shell,
)


def test_build_commands_receive_long_timeout_classification() -> None:
    assert _looks_like_build("mvn test")
    assert _looks_like_build(".\\mvnw.cmd test")
    assert _looks_like_build("./gradlew build")
    assert not _looks_like_build("git status")


def test_persistent_command_requires_background_mode() -> None:
    command = "mvn spring-boot:run"

    assert "background=true" in str(_validate_shell({"command": command}))
    assert _validate_shell({"command": command, "background": True}) is None


def test_background_process_can_be_observed_and_stopped(tmp_path: Path) -> None:
    asyncio.run(_assert_background_process_lifecycle(tmp_path))


async def _assert_background_process_lifecycle(tmp_path: Path) -> None:
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
    process_id = str(started.metadata["processId"])

    status = await _shell_process(
        context,
        {"processId": process_id, "action": "status"},
    )
    assert status.metadata["processStatus"] == "running"
    assert "exitCode" not in status.metadata

    stopped = await _shell_process(
        context,
        {"processId": process_id, "action": "stop"},
    )
    assert stopped.metadata["processStatus"] == "stopped"
    assert stopped.metadata["exitCode"] is not None
