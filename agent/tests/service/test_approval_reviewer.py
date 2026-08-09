import asyncio
from pathlib import Path

from app.dto.response.chat_completion_response import TokenUsageResponse
from app.harness.contracts import ProviderTurn
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.reviewer import (
    ApprovalReviewDecision,
    ApprovalReviewRequest,
    ModelApprovalReviewer,
)
from app.permission.reviewer_policy import ApprovalReviewerPolicyStore


def _settings() -> ModelConnectionSettings:
    return ModelConnectionSettings(
        provider_name="test",
        base_url="https://example.com/v1",
        model="main-model",
        api_key="secret",
    )


def _request(workspace: Path, *, external: bool = False) -> ApprovalReviewRequest:
    return ApprovalReviewRequest(
        tool_name="shell",
        tool_category="shell",
        arguments={"command": "python -m pytest"},
        workspace_path=workspace.resolve(),
        user_request="运行测试",
        assistant_context="我将运行项目测试。",
        permission_layer="mode",
        permission_reason="Shell calls require reviewer evaluation",
        risk_level="MEDIUM",
        reversible=True,
        grants_external_path=external,
    )


def test_model_reviewer_uses_active_settings_and_layered_policy(
    tmp_path: Path,
) -> None:
    home = tmp_path / "home"
    workspace = tmp_path / "workspace"
    (home / ".lumora").mkdir(parents=True)
    (workspace / ".lumora").mkdir(parents=True)
    (home / ".lumora" / "approval-reviewer.md").write_text(
        "Require a human for publishing.",
        encoding="utf-8",
    )
    (workspace / ".lumora" / "approval-reviewer.md").write_text(
        "Allow project tests.",
        encoding="utf-8",
    )
    captured: list[tuple[ModelConnectionSettings, list[dict]]] = []

    async def complete_turn(settings, messages, tools, reasoning_effort):
        captured.append((settings, messages))
        assert tools == ()
        assert reasoning_effort is None
        return ProviderTurn(
            content=(
                '{"decision":"allow_once","riskLevel":"LOW",'
                '"reason":"Project tests are scoped and reversible."}'
            ),
            reasoning="",
            model="reviewer-model",
            usage=TokenUsageResponse(
                promptTokens=10,
                completionTokens=5,
                totalTokens=15,
            ),
            tool_calls=(),
        )

    result = asyncio.run(
        ModelApprovalReviewer(
            complete_turn,
            ApprovalReviewerPolicyStore(home),
        ).review(_settings(), _request(workspace))
    )

    assert result.decision is ApprovalReviewDecision.ALLOW_ONCE
    assert result.risk_level == "LOW"
    assert result.reviewer_model == "reviewer-model"
    assert captured[0][0].base_url == _settings().base_url
    assert captured[0][0].api_key == _settings().api_key
    assert captured[0][0].model == _settings().model
    assert captured[0][0].max_output_tokens == 1_024
    reviewer_input = str(captured[0][1][-1]["content"])
    reviewer_system = str(captured[0][1][0]["content"])
    assert "Require a human for publishing." in reviewer_input
    assert "Allow project tests." in reviewer_input
    assert "normal non-force git push" in reviewer_system
    assert "remote and branch are clear" in reviewer_system


def test_model_reviewer_fails_closed_on_invalid_output(tmp_path: Path) -> None:
    attempts = 0

    async def complete_turn(*_args):
        nonlocal attempts
        attempts += 1
        return ProviderTurn(
            content="当然可以",
            reasoning="",
            model="reviewer-model",
            usage=TokenUsageResponse(
                promptTokens=1,
                completionTokens=1,
                totalTokens=2,
            ),
            tool_calls=(),
        )

    result = asyncio.run(
        ModelApprovalReviewer(complete_turn).review(
            _settings(),
            _request(tmp_path),
        )
    )

    assert result.decision is ApprovalReviewDecision.REQUIRE_HUMAN
    assert result.fallback is True
    assert attempts == 2


def test_model_reviewer_retries_and_accepts_embedded_json(
    tmp_path: Path,
) -> None:
    attempts = 0

    async def complete_turn(*_args):
        nonlocal attempts
        attempts += 1
        content = (
            "暂时无法判断"
            if attempts == 1
            else (
                '审批结果：{"decision":"allow_once","riskLevel":"LOW",'
                '"reason":"工作区内的测试操作范围明确。"}'
            )
        )
        return ProviderTurn(
            content=content,
            reasoning="",
            model="reviewer-model",
            usage=TokenUsageResponse(
                promptTokens=1,
                completionTokens=1,
                totalTokens=2,
            ),
            tool_calls=(),
        )

    result = asyncio.run(
        ModelApprovalReviewer(complete_turn).review(
            _settings(),
            _request(tmp_path),
        )
    )

    assert result.decision is ApprovalReviewDecision.ALLOW_ONCE
    assert result.fallback is False
    assert attempts == 2


def test_model_reviewer_never_auto_approves_external_paths(
    tmp_path: Path,
) -> None:
    called = False

    async def complete_turn(*_args):
        nonlocal called
        called = True
        raise AssertionError("External path decisions must not reach the model")

    result = asyncio.run(
        ModelApprovalReviewer(complete_turn).review(
            _settings(),
            _request(tmp_path, external=True),
        )
    )

    assert result.decision is ApprovalReviewDecision.REQUIRE_HUMAN
    assert result.fallback is False
    assert called is False
