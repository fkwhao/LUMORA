import asyncio
import json
from pathlib import Path

import pytest
import yaml

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.response.chat_completion_response import TokenUsageResponse
from app.execution.tool_call_executor import ToolCallExecutor
from app.execution.tool_result_processor import ToolResultProcessor
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
from app.permission.reviewer import (
    ApprovalReviewDecision,
    ApprovalReviewRequest,
    ApprovalReviewResult,
)
from app.prompt.prompt_assembly import PromptAssembly
from app.tool.base import ToolCategory, ToolContext, ToolResult, function_tool
from app.tool.filesystem_tools import filesystem_tools
from app.tool.registry import ToolRegistry


def _tool(
    *,
    category: ToolCategory,
    read_only: bool = False,
    destructive: bool = False,
):
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
        destructive=destructive,
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


@pytest.mark.parametrize(
    "command",
    (
        "pwd",
        "Get-ChildItem -Force",
        "rg TODO src",
        "git status --short",
        "git diff --check",
        "git log -5 --oneline",
        "git branch --show-current",
        "python --version",
        "python -m pytest tests",
        "pytest tests",
        "pnpm test",
        "npm run lint",
        ".\\mvnw.cmd test",
        "./gradlew test",
        "cargo check",
        "go test ./...",
        "dotnet build",
        "ruff format --check .",
        "mypy app",
    ),
)
def test_auto_approve_fast_paths_known_safe_shell_commands(
    tmp_path: Path,
    command: str,
) -> None:
    result = PermissionEngine().evaluate(
        _tool(category=ToolCategory.SHELL),
        ToolContext(tmp_path.resolve()),
        {"command": command},
        PermissionPolicy(PermissionMode.AUTO_APPROVE),
    )

    assert result.decision is PermissionDecision.ALLOW, command
    assert result.layer == "shell_classifier", command


@pytest.mark.parametrize(
    "command",
    (
        "git push origin main",
        "git commit -m test",
        "pnpm install",
        "npm run deploy",
        "python scripts/release.py",
        "New-Item generated.txt",
        "docker compose up",
        "find . -exec Remove-Item {}",
        "rg --pre processor TODO",
        "git diff --output changes.txt",
        "mvn test deploy:deploy",
        "gradle test publish",
        "pytest --basetemp . tests",
        "ruff check --fix .",
        "mypy --install-types app",
        "go test -exec helper ./...",
        "unknown-command --flag",
    ),
)
def test_auto_approve_routes_unknown_or_mutating_shell_through_reviewer(
    tmp_path: Path,
    command: str,
) -> None:
    result = PermissionEngine().evaluate(
        _tool(category=ToolCategory.SHELL),
        ToolContext(tmp_path.resolve()),
        {"command": command},
        PermissionPolicy(PermissionMode.AUTO_APPROVE),
    )

    assert result.decision is PermissionDecision.ASK, command
    assert result.layer == "mode", command


@pytest.mark.parametrize(
    "command",
    (
        "git status; git push origin main",
        "git status && Remove-Item generated.txt",
        "Get-ChildItem | Remove-Item",
        "pytest > results.txt",
        "Get-Content $(Resolve-Path secret.txt)",
        'powershell -Command "Get-ChildItem"',
    ),
)
def test_auto_approve_never_fast_paths_shell_composition(
    tmp_path: Path,
    command: str,
) -> None:
    result = PermissionEngine().evaluate(
        _tool(category=ToolCategory.SHELL),
        ToolContext(tmp_path.resolve()),
        {"command": command},
        PermissionPolicy(PermissionMode.AUTO_APPROVE),
    )

    assert result.decision is PermissionDecision.ASK, command
    assert result.layer == "mode", command


def test_auto_approve_read_command_must_stay_inside_workspace(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    engine = PermissionEngine()
    tool = _tool(category=ToolCategory.SHELL)
    policy = PermissionPolicy(PermissionMode.AUTO_APPROVE)

    inside = engine.evaluate(
        tool,
        ToolContext(workspace.resolve()),
        {"command": f'Get-Content "{workspace / "inside.txt"}"'},
        policy,
    )
    outside = engine.evaluate(
        tool,
        ToolContext(workspace.resolve()),
        {"command": f'Get-Content "{tmp_path / "outside.txt"}"'},
        policy,
    )
    provider_path = engine.evaluate(
        tool,
        ToolContext(workspace.resolve()),
        {"command": "Get-Content Env:API_KEY"},
        policy,
    )

    assert inside.decision is PermissionDecision.ALLOW
    assert outside.decision is PermissionDecision.ASK
    assert provider_path.decision is PermissionDecision.ASK


def test_explicit_shell_rule_precedes_auto_approve_classifier(
    tmp_path: Path,
) -> None:
    engine = PermissionEngine()
    tool = _tool(category=ToolCategory.SHELL)
    context = ToolContext(tmp_path.resolve())

    force_review = engine.evaluate(
        tool,
        context,
        {"command": "git status"},
        PermissionPolicy(
            PermissionMode.AUTO_APPROVE,
            (PermissionRule("Bash", "git status", PermissionDecision.ASK),),
        ),
    )
    custom_allow = engine.evaluate(
        tool,
        context,
        {"command": "company-check"},
        PermissionPolicy(
            PermissionMode.AUTO_APPROVE,
            (PermissionRule("Bash", "company-check", PermissionDecision.ALLOW),),
        ),
    )

    assert force_review.decision is PermissionDecision.ASK
    assert force_review.layer == "rule"
    assert custom_allow.decision is PermissionDecision.ALLOW
    assert custom_allow.layer == "rule"


def test_executor_skips_reviewer_for_safe_shell_fast_path(tmp_path: Path) -> None:
    asyncio.run(_assert_safe_shell_fast_path_skips_reviewer(tmp_path))


async def _assert_safe_shell_fast_path_skips_reviewer(tmp_path: Path) -> None:
    executed = False

    async def execute(_context, _input):
        nonlocal executed
        executed = True
        return ToolResult("checks passed")

    class NeverReviewer:
        async def review(self, _settings, _request):
            raise AssertionError("Safe shell commands must not call the reviewer")

    registry = ToolRegistry(
        (
            function_tool(
                name="shell",
                description="run shell",
                input_schema={
                    "type": "object",
                    "properties": {"command": {"type": "string"}},
                    "required": ["command"],
                    "additionalProperties": False,
                },
                execute=execute,
                category=ToolCategory.SHELL,
            ),
        )
    )
    executor = ToolCallExecutor(
        registry,
        PermissionEngine(),
        ApprovalBroker(),
        PermissionConfigStore(tmp_path / "home"),
        ToolResultProcessor(),
        NeverReviewer(),
    )

    pairs = [
        pair
        async for pair in executor.execute(
            ProviderToolCall("call-safe-shell", "shell", '{"command":"mvn test"}'),
            ToolContext(tmp_path.resolve(), correlation_id="corr"),
            "main-model",
            ModelConnectionSettings(
                "test", "https://example.com", "main-model", "key"
            ),
            PermissionPolicy(PermissionMode.AUTO_APPROVE),
            0,
            "运行测试",
        )
    ]

    assert executed is True
    assert [event.type for event, _result in pairs] == [
        "tool_started",
        "tool_completed",
    ]
    assert pairs[-1][0].metadata["permissionLayer"] == "shell_classifier"


def test_auto_approve_allows_new_workspace_file_without_human_handoff(
    tmp_path: Path,
) -> None:
    write_file = next(tool for tool in filesystem_tools() if tool.name == "write_file")

    result = PermissionEngine().evaluate(
        write_file,
        ToolContext(tmp_path.resolve()),
        {"path": "src/main.py", "content": "print('ok')\n"},
        PermissionPolicy(PermissionMode.AUTO_APPROVE),
    )

    assert result.decision is PermissionDecision.ALLOW
    assert result.risk_level == "LOW"
    assert result.reversible is True


def test_executor_creates_new_workspace_file_without_reviewer_or_human(
    tmp_path: Path,
) -> None:
    asyncio.run(_assert_new_workspace_file_uses_low_risk_fast_path(tmp_path))


async def _assert_new_workspace_file_uses_low_risk_fast_path(
    tmp_path: Path,
) -> None:
    class NeverReviewer:
        async def review(self, _settings, _request):
            raise AssertionError("New workspace files must use the safe fast path")

    executor = ToolCallExecutor(
        ToolRegistry(filesystem_tools()),
        PermissionEngine(),
        ApprovalBroker(),
        PermissionConfigStore(tmp_path / "home"),
        ToolResultProcessor(),
        NeverReviewer(),
    )
    pairs = [
        pair
        async for pair in executor.execute(
            ProviderToolCall(
                "call-new-file",
                "write_file",
                '{"path":"src/main.py","content":"print(1)\\n"}',
            ),
            ToolContext(tmp_path.resolve(), correlation_id="corr"),
            "main-model",
            ModelConnectionSettings(
                "test", "https://example.com", "main-model", "key"
            ),
            PermissionPolicy(PermissionMode.AUTO_APPROVE),
            0,
            "创建项目文件",
        )
    ]

    events = [event for event, _result in pairs]
    assert [event.type for event in events] == ["tool_started", "tool_completed"]
    assert events[-1].metadata["workspacePath"] == str(tmp_path.resolve())
    assert (tmp_path / "src" / "main.py").read_text(encoding="utf-8") == (
        "print(1)\n"
    )


def test_auto_approve_reviews_existing_workspace_file_as_bounded_risk(
    tmp_path: Path,
) -> None:
    target = tmp_path / "settings.py"
    target.write_text("OLD = True\n", encoding="utf-8")
    tools = {tool.name: tool for tool in filesystem_tools()}

    overwrite = PermissionEngine().evaluate(
        tools["write_file"],
        ToolContext(tmp_path.resolve()),
        {"path": str(target), "content": "NEW = True\n"},
        PermissionPolicy(PermissionMode.AUTO_APPROVE),
    )
    patch = PermissionEngine().evaluate(
        tools["apply_patch"],
        ToolContext(tmp_path.resolve()),
        {"path": str(target), "oldText": "OLD", "newText": "NEW"},
        PermissionPolicy(PermissionMode.AUTO_APPROVE),
    )

    assert overwrite.decision is PermissionDecision.ASK
    assert overwrite.risk_level == "MEDIUM"
    assert overwrite.reversible is False
    assert patch.decision is PermissionDecision.ASK
    assert patch.risk_level == "MEDIUM"
    assert patch.reversible is True


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
    assert saved.pattern == "git status"
    assert payload["rules"][-1]["decision"] == "allow"
    assert payload["rules"][-1]["pattern"] == "git status"
    reloaded = store.load_policy(workspace, PermissionPolicy())
    different_command = PermissionEngine().evaluate(
        _tool(category=ToolCategory.SHELL),
        ToolContext(workspace.resolve()),
        {"command": "mvn test"},
        reloaded,
    )
    assert different_command.decision is PermissionDecision.ASK
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
    class NeverReviewer:
        async def review(self, _settings, _request):
            raise AssertionError("An explicit ask rule must bypass auto review")

    stream = AgentLoopRunner(
        complete_turn,
        approval_reviewer=NeverReviewer(),
    ).stream(
        ModelConnectionSettings("test", "https://example.com", "model", "key"),
        PromptAssembly(()),
        [ChatMessageRequest(role="user", content="write")],
        None,
        registry,
        ToolContext(tmp_path.resolve(), correlation_id="corr"),
        PermissionPolicy(
            PermissionMode.REQUEST_APPROVAL,
            (
                PermissionRule(
                    "write",
                    "*",
                    PermissionDecision.ASK,
                ),
            ),
        ),
        PermissionEngine(),
        broker,
        PermissionConfigStore(tmp_path / "home"),
    )

    assert (await anext(stream)).type == "progress_message"
    usage = await anext(stream)
    assert usage.type == "usage"
    assert usage.active_context_tokens > 0
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


def test_auto_mode_blocks_explicit_ask_without_human_request(
    tmp_path: Path,
) -> None:
    asyncio.run(_assert_auto_mode_blocks_ask_non_interactively(tmp_path))


async def _assert_auto_mode_blocks_ask_non_interactively(
    tmp_path: Path,
) -> None:
    executed = False

    async def execute(_context, _input):
        nonlocal executed
        executed = True
        return ToolResult("unexpected")

    class NeverReviewer:
        async def review(self, _settings, _request):
            raise AssertionError("Explicit ask rules do not reach the reviewer")

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
    executor = ToolCallExecutor(
        registry,
        PermissionEngine(),
        ApprovalBroker(),
        PermissionConfigStore(tmp_path / "home"),
        ToolResultProcessor(),
        NeverReviewer(),
    )
    pairs = [
        pair
        async for pair in executor.execute(
            ProviderToolCall("call-ask", "write", "{}"),
            ToolContext(tmp_path.resolve(), correlation_id="corr"),
            "main-model",
            ModelConnectionSettings(
                "test", "https://example.com", "main-model", "key"
            ),
            PermissionPolicy(
                PermissionMode.AUTO_APPROVE,
                (PermissionRule("write", "*", PermissionDecision.ASK),),
            ),
            0,
            "写入内容",
        )
    ]

    assert [event.type for event, _result in pairs] == ["tool_failed"]
    assert pairs[0][0].metadata["failureKind"] == "automatic_approval_blocked"
    assert json.loads(pairs[0][1])["retryable"] is False
    assert executed is False


def test_auto_approval_reviewer_can_allow_one_shell_call(
    tmp_path: Path,
) -> None:
    asyncio.run(_assert_auto_reviewer_allows_once(tmp_path))


async def _assert_auto_reviewer_allows_once(tmp_path: Path) -> None:
    executed = False
    reviewed: list[ApprovalReviewRequest] = []
    turns = iter(
        (
            ProviderTurn(
                "我来创建文件。",
                "",
                "test-model",
                TokenUsageResponse(
                    promptTokens=1, completionTokens=1, totalTokens=2
                ),
                (
                    ProviderToolCall(
                        "call-1",
                        "shell",
                        '{"command":"New-Item one.txt,two.txt"}',
                    ),
                ),
            ),
            ProviderTurn(
                "创建完成。",
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

    class AllowReviewer:
        async def review(self, _settings, request):
            reviewed.append(request)
            return ApprovalReviewResult(
                ApprovalReviewDecision.ALLOW_ONCE,
                "The requested files stay inside the workspace.",
                "LOW",
                reviewer_model="reviewer-model",
            )

    registry = ToolRegistry(
        (
            function_tool(
                name="shell",
                description="shell",
                input_schema={
                    "type": "object",
                    "properties": {"command": {"type": "string"}},
                    "required": ["command"],
                    "additionalProperties": False,
                },
                execute=execute,
                category=ToolCategory.SHELL,
            ),
        )
    )
    events = [
        event
        async for event in AgentLoopRunner(
            complete_turn,
            approval_reviewer=AllowReviewer(),
        ).stream(
            ModelConnectionSettings(
                "test", "https://example.com", "model", "key"
            ),
            PromptAssembly(()),
            [ChatMessageRequest(role="user", content="请创建两个文件")],
            None,
            registry,
            ToolContext(tmp_path.resolve(), correlation_id="corr"),
            PermissionPolicy(PermissionMode.AUTO_APPROVE),
            PermissionEngine(),
            ApprovalBroker(),
            PermissionConfigStore(tmp_path / "home"),
        )
    ]

    event_types = [event.type for event in events]
    assert "tool_approval_requested" not in event_types
    assert event_types.index("approval_review_started") < event_types.index(
        "approval_review_completed"
    )
    assert event_types.index("approval_review_completed") < event_types.index(
        "tool_started"
    )
    assert "tool_started" in event_types
    assert "tool_completed" in event_types
    assert executed is True
    assert reviewed[0].user_request == "请创建两个文件"
    completed = next(event for event in events if event.type == "tool_completed")
    review_completed = next(
        event for event in events if event.type == "approval_review_completed"
    )
    assert review_completed.output == (
        "The requested files stay inside the workspace."
    )
    assert review_completed.duration_ms >= 1
    assert completed.metadata["approvalReviewDecision"] == "allow_once"
    assert completed.metadata["approvalReviewerModel"] == "reviewer-model"


def test_auto_approval_reviewer_can_deny_shell_call(tmp_path: Path) -> None:
    asyncio.run(_assert_auto_reviewer_denies(tmp_path))


async def _assert_auto_reviewer_denies(tmp_path: Path) -> None:
    executed = False
    review_count = 0

    async def execute(_context, _input):
        nonlocal executed
        executed = True
        return ToolResult("unexpected")

    class DenyReviewer:
        async def review(self, _settings, _request):
            nonlocal review_count
            review_count += 1
            return ApprovalReviewResult(
                ApprovalReviewDecision.DENY,
                "The command is unrelated to the user request.",
                "HIGH",
                reviewer_model="reviewer-model",
            )

    registry = ToolRegistry(
        (
            function_tool(
                name="shell",
                description="shell",
                input_schema={
                    "type": "object",
                    "properties": {"command": {"type": "string"}},
                    "required": ["command"],
                },
                execute=execute,
                category=ToolCategory.SHELL,
            ),
        )
    )
    executor = ToolCallExecutor(
        registry,
        PermissionEngine(),
        ApprovalBroker(),
        PermissionConfigStore(tmp_path / "home"),
        ToolResultProcessor(),
        DenyReviewer(),
    )
    event_results: list[tuple] = []
    for call_id in ("call-1", "call-2"):
        event_results.extend(
            [
                pair
                async for pair in executor.execute(
                    ProviderToolCall(
                        call_id,
                        "shell",
                        '{"command":"whoami"}',
                    ),
                    ToolContext(tmp_path.resolve(), correlation_id="corr"),
                    "main-model",
                    ModelConnectionSettings(
                        "test",
                        "https://example.com",
                        "main-model",
                        "key",
                    ),
                    PermissionPolicy(PermissionMode.AUTO_APPROVE),
                    0,
                    "创建项目文件",
                )
            ]
        )

    events = [event for event, _result in event_results]
    assert [event.type for event in events] == [
        "approval_review_started",
        "approval_review_completed",
        "tool_failed",
    ]
    denied_reviews = [
        event for event in events if event.type == "approval_review_completed"
    ]
    assert denied_reviews[0].output == (
        "The command is unrelated to the user request."
    )
    assert denied_reviews[0].metadata["approvalReviewDecision"] == "deny"
    assert denied_reviews[0].metadata["failureKind"] == "approval_review_blocked"
    first_result = json.loads(event_results[1][1])
    assert first_result["retryable"] is False
    assert "智能审批未通过" in first_result["content"]
    repeated_result = json.loads(event_results[2][1])
    assert repeated_result["errorCode"] == "approval_retry_blocked"
    assert review_count == 1
    assert not (tmp_path / ".lumora" / "permissions.local.yaml").exists()
    assert executed is False


def test_auto_reviewer_require_human_never_opens_human_approval(
    tmp_path: Path,
) -> None:
    asyncio.run(_assert_require_human_is_non_interactive(tmp_path))


async def _assert_require_human_is_non_interactive(tmp_path: Path) -> None:
    executed = False

    async def execute(_context, _input):
        nonlocal executed
        executed = True
        return ToolResult("unexpected")

    class RequireHumanReviewer:
        async def review(self, _settings, _request):
            return ApprovalReviewResult(
                ApprovalReviewDecision.REQUIRE_HUMAN,
                "The destination needs human confirmation.",
                "HIGH",
                reviewer_model="reviewer-model",
                fallback=True,
            )

    registry = ToolRegistry(
        (
            function_tool(
                name="shell",
                description="shell",
                input_schema={
                    "type": "object",
                    "properties": {"command": {"type": "string"}},
                    "required": ["command"],
                    "additionalProperties": False,
                },
                execute=execute,
                category=ToolCategory.SHELL,
            ),
        )
    )
    pairs = [
        pair
        async for pair in ToolCallExecutor(
            registry,
            PermissionEngine(),
            ApprovalBroker(),
            PermissionConfigStore(tmp_path / "home"),
            ToolResultProcessor(),
            RequireHumanReviewer(),
        ).execute(
            ProviderToolCall("call-human", "shell", '{"command":"deploy"}'),
            ToolContext(tmp_path.resolve(), correlation_id="corr"),
            "main-model",
            ModelConnectionSettings(
                "test", "https://example.com", "main-model", "key"
            ),
            PermissionPolicy(PermissionMode.AUTO_APPROVE),
            0,
            "部署测试环境",
        )
    ]

    assert [event.type for event, _result in pairs] == [
        "approval_review_started",
        "approval_review_completed",
    ]
    completed = pairs[-1][0]
    assert completed.decision == "deny"
    assert completed.metadata["approvalReviewDecision"] == "require_human"
    assert completed.metadata["failureKind"] == "approval_reviewer_unavailable"
    assert json.loads(pairs[-1][1])["retryable"] is False
    assert all(event.type != "tool_approval_requested" for event, _ in pairs)
    assert executed is False


def test_agent_loop_skips_same_rejected_call_across_turns(
    tmp_path: Path,
) -> None:
    asyncio.run(_assert_rejected_call_is_not_reviewed_twice(tmp_path))


async def _assert_rejected_call_is_not_reviewed_twice(tmp_path: Path) -> None:
    review_count = 0
    executed = False
    turns = iter(
        (
            ProviderTurn(
                "先尝试执行。",
                "",
                "test-model",
                TokenUsageResponse(
                    promptTokens=1, completionTokens=1, totalTokens=2
                ),
                (
                    ProviderToolCall(
                        "call-first", "shell", '{"command":"whoami"}'
                    ),
                ),
            ),
            ProviderTurn(
                "再次尝试。",
                "",
                "test-model",
                TokenUsageResponse(
                    promptTokens=1, completionTokens=1, totalTokens=2
                ),
                (
                    ProviderToolCall(
                        "call-repeat", "shell", '{"command":"whoami"}'
                    ),
                ),
            ),
            ProviderTurn(
                "该调用未执行，改为说明手动步骤。",
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
        return ToolResult("unexpected")

    class DenyReviewer:
        async def review(self, _settings, _request):
            nonlocal review_count
            review_count += 1
            return ApprovalReviewResult(
                ApprovalReviewDecision.DENY,
                "The call is outside the requested scope.",
                "HIGH",
            )

    registry = ToolRegistry(
        (
            function_tool(
                name="shell",
                description="shell",
                input_schema={
                    "type": "object",
                    "properties": {"command": {"type": "string"}},
                    "required": ["command"],
                    "additionalProperties": False,
                },
                execute=execute,
                category=ToolCategory.SHELL,
            ),
        )
    )
    events = [
        event
        async for event in AgentLoopRunner(
            complete_turn,
            approval_reviewer=DenyReviewer(),
        ).stream(
            ModelConnectionSettings(
                "test", "https://example.com", "main-model", "key"
            ),
            PromptAssembly(()),
            [ChatMessageRequest(role="user", content="完成当前任务")],
            None,
            registry,
            ToolContext(tmp_path.resolve(), correlation_id="corr"),
            PermissionPolicy(PermissionMode.AUTO_APPROVE),
            PermissionEngine(),
            ApprovalBroker(),
            PermissionConfigStore(tmp_path / "home"),
        )
    ]

    assert review_count == 1
    assert executed is False
    assert sum(event.type == "approval_review_started" for event in events) == 1
    assert any(
        event.metadata.get("failureKind") == "approval_retry_blocked"
        for event in events
    )
    assert all(event.type != "tool_approval_requested" for event in events)
