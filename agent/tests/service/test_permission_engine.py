import asyncio
from pathlib import Path

import yaml
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import TokenUsageResponse
from app.harness.agent_loop import AgentLoopRunner
from app.harness.contracts import ProviderToolCall, ProviderTurn
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.broker import ApprovalBroker
from app.permission.config_store import PermissionConfigStore
from app.permission.engine import PermissionEngine
from app.permission.model import (
    ApprovalDecision,
    PermissionDecision,
    PermissionMode,
    PermissionPolicy,
    PermissionRule,
)
from app.prompt.prompt_assembly import PromptAssembly
from app.tool.base import ToolCategory, ToolContext, ToolResult, function_tool
from app.tool.registry import ToolRegistry


def _tool(*, category: ToolCategory, read_only: bool = False):
    return function_tool(
        name="test_tool",
        description="test",
        input_schema={
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "path": {"type": "string"},
            },
            "additionalProperties": False,
        },
        execute=lambda _context, _input: ToolResult("ok"),
        category=category,
        read_only=read_only,
    )


def test_hard_blacklist_only_applies_to_shell(tmp_path: Path) -> None:
    engine = PermissionEngine()
    context = ToolContext(tmp_path.resolve())
    policy = PermissionPolicy(mode=PermissionMode.FULL_ACCESS)
    command = {"command": "rm -rf /"}

    shell_result = engine.evaluate(
        _tool(category=ToolCategory.SHELL), context, command, policy
    )
    file_result = engine.evaluate(
        _tool(category=ToolCategory.FILESYSTEM), context, command, policy
    )

    assert shell_result.decision is PermissionDecision.DENY
    assert shell_result.layer == "blacklist"
    assert file_result.decision is PermissionDecision.ALLOW


def test_hard_blacklist_recognizes_flag_order_and_powershell(
    tmp_path: Path,
) -> None:
    engine = PermissionEngine()
    context = ToolContext(tmp_path.resolve())
    policy = PermissionPolicy(mode=PermissionMode.FULL_ACCESS)
    tool = _tool(category=ToolCategory.SHELL)

    commands = (
        "rm -fr /",
        "rm -r -f /",
        "sudo rm --recursive --force /",
        "sudo -n rm --recursive --force /",
        "env -i rm --recursive --force /",
        "Remove-Item C:\\ -Force -Recurse",
        "Remove-Item C:\\* -Force -Recurse",
    )

    for command in commands:
        result = engine.evaluate(tool, context, {"command": command}, policy)
        assert result.decision is PermissionDecision.DENY, command
        assert result.layer == "blacklist", command


def test_hard_blacklist_does_not_scan_plain_command_arguments(
    tmp_path: Path,
) -> None:
    result = PermissionEngine().evaluate(
        _tool(category=ToolCategory.SHELL),
        ToolContext(tmp_path.resolve()),
        {"command": "echo shutdown rm -rf /"},
        PermissionPolicy(mode=PermissionMode.FULL_ACCESS),
    )

    assert result.decision is PermissionDecision.ALLOW


def test_external_path_requires_confirmation_before_allow_rule(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    context = ToolContext(workspace.resolve())
    policy = PermissionPolicy(
        mode=PermissionMode.FULL_ACCESS,
        rules=(PermissionRule("test_tool", "*", PermissionDecision.ALLOW),),
    )

    result = PermissionEngine().evaluate(
        _tool(category=ToolCategory.FILESYSTEM, read_only=True),
        context,
        {"path": str(tmp_path / "outside.txt")},
        policy,
    )

    assert result.decision is PermissionDecision.ASK
    assert result.layer == "path_sandbox"
    assert result.grants_external_path is True


def test_deny_is_merged_across_layers_and_cannot_be_overridden(
    tmp_path: Path,
) -> None:
    rules = (
        PermissionRule(
            "Bash", "git *", PermissionDecision.DENY, "user", 0
        ),
        PermissionRule(
            "Bash", "git *", PermissionDecision.ALLOW, "local", 0
        ),
    )
    result = PermissionEngine().evaluate(
        _tool(category=ToolCategory.SHELL),
        ToolContext(tmp_path.resolve()),
        {"command": "git status"},
        PermissionPolicy(PermissionMode.REQUEST_APPROVAL, rules),
    )

    assert result.decision is PermissionDecision.DENY
    assert "user" in result.reason


def test_more_specific_layer_and_later_rule_win(tmp_path: Path) -> None:
    context = ToolContext(tmp_path.resolve())
    engine = PermissionEngine()
    tool = _tool(category=ToolCategory.SHELL)
    input_data = {"command": "git status"}
    policy = PermissionPolicy(
        PermissionMode.REQUEST_APPROVAL,
        (
            PermissionRule("Bash", "git *", PermissionDecision.ASK, "user", 0),
            PermissionRule("Bash", "git *", PermissionDecision.ASK, "project", 0),
            PermissionRule("Bash", "git *", PermissionDecision.ASK, "local", 0),
            PermissionRule("Bash", "git *", PermissionDecision.ALLOW, "local", 1),
        ),
    )

    result = engine.evaluate(tool, context, input_data, policy)

    assert result.decision is PermissionDecision.ALLOW
    assert "local" in result.reason


def test_auto_approve_allows_non_destructive_shell(tmp_path: Path) -> None:
    result = PermissionEngine().evaluate(
        _tool(category=ToolCategory.SHELL),
        ToolContext(tmp_path.resolve()),
        {"command": "mvn test"},
        PermissionPolicy(PermissionMode.AUTO_APPROVE),
    )

    assert result.decision is PermissionDecision.ALLOW
    assert result.layer == "mode"


def test_later_rule_can_override_deny_inside_same_layer(
    tmp_path: Path,
) -> None:
    result = PermissionEngine().evaluate(
        _tool(category=ToolCategory.SHELL),
        ToolContext(tmp_path.resolve()),
        {"command": "git status"},
        PermissionPolicy(
            PermissionMode.REQUEST_APPROVAL,
            (
                PermissionRule(
                    "Bash", "git *", PermissionDecision.DENY, "local", 0
                ),
                PermissionRule(
                    "Bash", "git status", PermissionDecision.ALLOW, "local", 1
                ),
            ),
        ),
    )

    assert result.decision is PermissionDecision.ALLOW


def test_config_store_loads_three_layers_and_persists_local_allow(
    tmp_path: Path,
) -> None:
    home = tmp_path / "home"
    workspace = tmp_path / "workspace"
    (home / ".lumora").mkdir(parents=True)
    (workspace / ".lumora").mkdir(parents=True)
    (home / ".lumora" / "permissions.yaml").write_text(
        "version: 1\nrules:\n  - tool: Bash\n    pattern: 'git *'\n    decision: deny\n",
        encoding="utf-8",
    )
    (workspace / ".lumora" / "permissions.yaml").write_text(
        "version: 1\nrules:\n  - tool: Bash\n    pattern: 'git status'\n    decision: ask\n",
        encoding="utf-8",
    )
    store = PermissionConfigStore(home)

    policy = store.load_policy(workspace, PermissionPolicy())
    saved = store.add_local_allow(
        workspace,
        _tool(category=ToolCategory.SHELL),
        {"command": "git status"},
    )
    payload = yaml.safe_load(
        (workspace / ".lumora" / "permissions.local.yaml").read_text(
            encoding="utf-8"
        )
    )

    assert [rule.source for rule in policy.rules] == ["user", "project"]
    assert saved.source == "local"
    assert saved.pattern == "*"
    assert payload["rules"][-1]["decision"] == "allow"
    assert payload["rules"][-1]["pattern"] == "*"
    reloaded = store.load_policy(workspace, PermissionPolicy())
    different_command = PermissionEngine().evaluate(
        _tool(category=ToolCategory.SHELL),
        ToolContext(workspace.resolve()),
        {"command": "mvn test"},
        reloaded,
    )
    assert different_command.decision is PermissionDecision.ALLOW
    assert "/permissions.local.yaml" in (
        workspace / ".lumora" / ".gitignore"
    ).read_text(encoding="utf-8")


def test_agent_loop_pauses_until_human_decides(tmp_path: Path) -> None:
    asyncio.run(_assert_agent_loop_pauses(tmp_path))


async def _assert_agent_loop_pauses(tmp_path: Path) -> None:
    executed = False
    turns = iter(
        (
            ProviderTurn(
                "准备写入。",
                "",
                "test-model",
                TokenUsageResponse(
                    promptTokens=1, completionTokens=1, totalTokens=2
                ),
                (ProviderToolCall("call-1", "write", "{}"),),
            ),
            ProviderTurn(
                "完成。",
                "",
                "test-model",
                TokenUsageResponse(
                    promptTokens=1, completionTokens=1, totalTokens=2
                ),
                (),
            ),
        )
    )

    async def complete_turn(*_args):
        return next(turns)

    async def execute(_context, _input):
        nonlocal executed
        executed = True
        return ToolResult("ok")

    registry = ToolRegistry(
        (
            function_tool(
                name="write",
                description="write",
                input_schema={
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
                execute=execute,
            ),
        )
    )
    broker = ApprovalBroker()
    stream = AgentLoopRunner(complete_turn).stream(
        ModelConnectionSettings("test", "https://example.com", "model", "key"),
        PromptAssembly(()),
        [ChatMessageRequest(role="user", content="write")],
        None,
        registry,
        ToolContext(tmp_path.resolve(), correlation_id="corr"),
        PermissionPolicy(PermissionMode.REQUEST_APPROVAL),
        PermissionEngine(),
        broker,
        PermissionConfigStore(tmp_path / "home"),
    )

    assert (await anext(stream)).type == "progress_message"
    requested = await anext(stream)
    assert requested.type == "tool_approval_requested"
    pending_next = asyncio.create_task(anext(stream))
    await asyncio.sleep(0)
    assert executed is False
    assert pending_next.done() is False
    assert broker.decide(
        requested.approval_id,
        ApprovalDecision.ALLOW_ONCE,
        "corr",
    )
    assert (await pending_next).type == "tool_approval_resolved"
    assert (await anext(stream)).type == "tool_started"
    assert (await anext(stream)).type == "tool_completed"
    assert executed is True
