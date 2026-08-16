from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from enum import StrEnum
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from app.dto.response.chat_completion_response import TokenUsageResponse
from app.harness.contracts import TurnCompleter
from app.model.model_connection_settings import ModelConnectionSettings
from app.permission.reviewer_policy import ApprovalReviewerPolicyStore
from app.prompt.prompt_loader import PromptLoader
from app.provider.token_usage import add_token_usage

_REVIEW_TIMEOUT_SECONDS = 45
_REVIEW_ATTEMPTS = 2
_REVIEW_RETRY_DELAY_SECONDS = 0.35
_REVIEW_MAX_OUTPUT_TOKENS = 1_024
_MAX_REASON_CHARS = 2_000
_JSON_FENCE = re.compile(
    r"^\s*```(?:json)?\s*(?P<body>\{.*\})\s*```\s*$",
    re.DOTALL | re.IGNORECASE,
)
_LOGGER = logging.getLogger(__name__)
_DECISION_ALIASES = {
    "allow_once": "allow_once",
    "allowonce": "allow_once",
    "allow": "allow_once",
    "approve": "allow_once",
    "approved": "allow_once",
    "permit": "allow_once",
    "deny": "deny",
    "denied": "deny",
    "reject": "deny",
    "rejected": "deny",
    "block": "deny",
    "blocked": "deny",
    "require_human": "require_human",
    "requirehuman": "require_human",
    "human": "require_human",
    "ask_human": "require_human",
    "needs_human": "require_human",
}

class ApprovalReviewDecision(StrEnum):
    ALLOW_ONCE = "allow_once"
    DENY = "deny"
    REQUIRE_HUMAN = "require_human"


@dataclass(frozen=True, slots=True)
class ApprovalReviewRequest:
    tool_name: str
    tool_category: str
    arguments: Mapping[str, Any]
    workspace_path: Path | None
    user_request: str
    assistant_context: str
    permission_layer: str
    permission_reason: str
    risk_level: str
    reversible: bool
    grants_external_path: bool = False


@dataclass(frozen=True, slots=True)
class ApprovalReviewResult:
    decision: ApprovalReviewDecision
    reason: str
    risk_level: str
    reviewer_model: str = ""
    fallback: bool = False
    usage: TokenUsageResponse = field(default_factory=TokenUsageResponse)


@runtime_checkable
class ApprovalReviewer(Protocol):
    async def review(
        self,
        settings: ModelConnectionSettings,
        request: ApprovalReviewRequest,
    ) -> ApprovalReviewResult: ...


class ModelApprovalReviewer:
    """Use the active routed model connection as a constrained reviewer."""

    def __init__(
        self,
        complete_turn: TurnCompleter,
        policy_store: ApprovalReviewerPolicyStore | None = None,
        timeout_seconds: int = _REVIEW_TIMEOUT_SECONDS,
        prompt_loader: PromptLoader | None = None,
    ) -> None:
        self._complete_turn = complete_turn
        self._policy_store = policy_store or ApprovalReviewerPolicyStore()
        self._timeout_seconds = timeout_seconds
        self._system_prompt = (prompt_loader or PromptLoader()).load_specialized(
            "approval_reviewer"
        )

    async def review(
        self,
        settings: ModelConnectionSettings,
        request: ApprovalReviewRequest,
    ) -> ApprovalReviewResult:
        if request.grants_external_path:
            return ApprovalReviewResult(
                ApprovalReviewDecision.REQUIRE_HUMAN,
                "External paths cannot be approved automatically.",
                "HIGH",
            )

        try:
            custom_policy = self._policy_store.load(
                request.workspace_path,
            ).render()
            payload = {
                "userRequest": request.user_request[-20_000:],
                "mainAgentContext": request.assistant_context[-10_000:],
                "tool": request.tool_name,
                "category": request.tool_category,
                "arguments": dict(request.arguments),
                "workspace": (
                    str(request.workspace_path)
                    if request.workspace_path is not None
                    else ""
                ),
                "permissionEvaluation": {
                    "layer": request.permission_layer,
                    "reason": request.permission_reason,
                    "riskLevel": request.risk_level,
                    "reversible": request.reversible,
                },
                "customPolicy": custom_policy,
            }
            messages = [
                {"role": "system", "content": self._system_prompt},
                {
                    "role": "user",
                    "content": json.dumps(
                        payload,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                },
            ]
        except Exception:  # noqa: BLE001 - policy loading also fails closed
            return ApprovalReviewResult(
                ApprovalReviewDecision.REQUIRE_HUMAN,
                "自动审批策略读取失败，本次调用未执行。",
                request.risk_level,
                fallback=True,
            )

        last_error: Exception | None = None
        usage_parts: list[TokenUsageResponse] = []
        for attempt in range(_REVIEW_ATTEMPTS):
            try:
                attempt_messages = messages
                if attempt > 0:
                    attempt_messages = [
                        *messages,
                        {
                            "role": "user",
                            "content": (
                                "The previous response did not satisfy the "
                                "required JSON contract. Return only one JSON "
                                "object. Use exactly one decision value from "
                                "allow_once, deny, require_human; one riskLevel "
                                "from LOW, MEDIUM, HIGH, CRITICAL; and a "
                                "non-empty reason."
                            ),
                        },
                    ]
                turn = await asyncio.wait_for(
                    self._complete_turn(
                        replace(
                            settings,
                            max_output_tokens=_REVIEW_MAX_OUTPUT_TOKENS,
                        ),
                        attempt_messages,
                        (),
                        None,
                    ),
                    timeout=self._timeout_seconds,
                )
                usage_parts.append(turn.usage)
                if turn.tool_calls:
                    raise ValueError("Approval reviewer attempted a tool call")
                decision, risk_level, reason = _parse_review(
                    turn.content,
                    request.risk_level,
                )
                return ApprovalReviewResult(
                    decision,
                    reason,
                    risk_level,
                    reviewer_model=turn.model,
                    usage=add_token_usage(usage_parts),
                )
            except Exception as error:  # noqa: BLE001 - model boundary
                last_error = error
                if attempt + 1 < _REVIEW_ATTEMPTS:
                    await asyncio.sleep(_REVIEW_RETRY_DELAY_SECONDS)

        _LOGGER.warning(
            "Approval reviewer failed after %s attempts: %s",
            _REVIEW_ATTEMPTS,
            _review_error_summary(last_error),
        )
        return ApprovalReviewResult(
            ApprovalReviewDecision.REQUIRE_HUMAN,
            "自动审批调用连续失败或返回无效结果，本次调用未执行。",
            request.risk_level,
            fallback=True,
            usage=add_token_usage(usage_parts),
        )


def _parse_review(
    content: str,
    fallback_risk_level: str,
) -> tuple[ApprovalReviewDecision, str, str]:
    text = content.strip()
    fenced = _JSON_FENCE.fullmatch(text)
    if fenced is not None:
        text = fenced.group("body")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        payload = _first_json_object(text)
    if not isinstance(payload, dict):
        raise TypeError("Approval review response must be an object")
    raw_decision = str(payload.get("decision") or "")
    decision_key = re.sub(
        r"[\s-]+",
        "_",
        raw_decision.strip().casefold(),
    )
    normalized_decision = _DECISION_ALIASES.get(decision_key)
    if normalized_decision is None:
        raise ValueError("Approval review decision is invalid")
    decision = ApprovalReviewDecision(normalized_decision)
    raw_risk_level = payload.get("riskLevel", payload.get("risk_level"))
    risk_level = str(raw_risk_level or fallback_risk_level).upper()
    if risk_level not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
        raise ValueError("Approval review risk level is invalid")
    reason = str(
        payload.get("reason") or payload.get("explanation") or ""
    ).strip()
    if not reason or len(reason) > _MAX_REASON_CHARS:
        raise ValueError("Approval review reason is invalid")
    return decision, risk_level, reason


def _first_json_object(text: str) -> Any:
    decoder = json.JSONDecoder()
    for index, character in enumerate(text):
        if character != "{":
            continue
        try:
            payload, _end = decoder.raw_decode(text[index:])
            return payload
        except json.JSONDecodeError:
            continue
    raise ValueError("Approval review response did not contain a JSON object")


def _review_error_summary(error: Exception | None) -> str:
    if error is None:
        return "unknown"
    error_type = type(error).__name__
    message = str(error)
    if message.startswith("Approval review"):
        return f"{error_type}: {message}"
    return error_type
