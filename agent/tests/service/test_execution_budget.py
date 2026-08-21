import asyncio
from pathlib import Path

import pytest

from app.execution.budget import (
    BudgetExceeded,
    ExecutionBudgetLedger,
    ExecutionBudgetLimits,
)
from app.tool.base import ToolContext
from app.tool.default_registry import create_default_tool_registry


def test_budget_ledger_enforces_model_and_agent_limits() -> None:
    ledger = ExecutionBudgetLedger(ExecutionBudgetLimits(
        max_model_requests=1,
        max_tool_calls=1,
        max_wall_time_ms=60_000,
        max_active_agents=1,
    ))

    ledger.reserve_model_request()
    with pytest.raises(BudgetExceeded) as model_error:
        ledger.reserve_model_request()
    assert model_error.value.dimension == "model_requests"

    assert ledger.try_acquire_agent() is True
    assert ledger.try_acquire_agent() is False
    ledger.release_agent()
    assert ledger.try_acquire_agent() is True


def test_agent_admission_preserves_wall_time_failure_kind(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    moments = iter((0.0, 0.002, 0.002))
    monkeypatch.setattr(
        "app.execution.budget.time.monotonic",
        lambda: next(moments),
    )
    ledger = ExecutionBudgetLedger(ExecutionBudgetLimits(
        max_model_requests=10,
        max_tool_calls=10,
        max_wall_time_ms=1,
        max_active_agents=1,
    ))

    with pytest.raises(BudgetExceeded) as captured:
        ledger.try_acquire_agent()

    assert captured.value.dimension == "wall_time"


def test_wall_time_is_checked_again_after_a_model_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    moments = iter((0.0, 0.0, 0.0, 0.002, 0.002))
    monkeypatch.setattr(
        "app.execution.budget.time.monotonic",
        lambda: next(moments),
    )
    ledger = ExecutionBudgetLedger(ExecutionBudgetLimits(
        max_model_requests=10,
        max_tool_calls=10,
        max_wall_time_ms=1,
        max_active_agents=1,
    ))

    ledger.reserve_model_request()
    with pytest.raises(BudgetExceeded) as captured:
        ledger.check_wall_time()

    assert captured.value.dimension == "wall_time"


def test_tool_budget_blocks_body_before_second_call(tmp_path: Path) -> None:
    ledger = ExecutionBudgetLedger(ExecutionBudgetLimits(
        max_model_requests=10,
        max_tool_calls=1,
        max_wall_time_ms=60_000,
        max_active_agents=1,
    ))
    registry = create_default_tool_registry()
    context = ToolContext(
        workspace_path=tmp_path.resolve(),
        execution_budget=ledger,
    )

    asyncio.run(registry.execute("list_files", context, {"pattern": "*"}))
    # ToolRegistry is the low-level runtime and does not perform model-call
    # admission; ToolCallExecutor owns that boundary.  The ledger itself still
    # exposes deterministic concurrent admission for its caller.
    ledger.reserve_tool_call()
    with pytest.raises(BudgetExceeded) as error:
        ledger.reserve_tool_call()
    assert error.value.dimension == "tool_calls"
