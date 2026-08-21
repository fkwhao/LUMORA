import threading
import time
from dataclasses import asdict, dataclass


@dataclass(frozen=True, slots=True)
class ExecutionBudgetLimits:
    """Hard limits shared by a root Run and all of its descendant Agents."""

    max_model_requests: int = 256
    max_tool_calls: int = 1_024
    max_wall_time_ms: int = 7_200_000
    max_active_agents: int = 10

    def __post_init__(self) -> None:
        for name, value in asdict(self).items():
            if value < 1:
                raise ValueError(f"执行预算 {name} 必须大于 0")


@dataclass(frozen=True, slots=True)
class ExecutionBudgetSnapshot:
    max_model_requests: int
    max_tool_calls: int
    max_wall_time_ms: int
    max_active_agents: int
    model_requests: int
    tool_calls: int
    elapsed_ms: int
    active_agents: int
    exhausted_dimension: str = ""

    def metadata(self) -> dict[str, int | str]:
        return {
            "maxModelRequests": self.max_model_requests,
            "maxToolCalls": self.max_tool_calls,
            "maxWallTimeMs": self.max_wall_time_ms,
            "maxActiveAgents": self.max_active_agents,
            "modelRequests": self.model_requests,
            "toolCalls": self.tool_calls,
            "elapsedMs": self.elapsed_ms,
            "activeAgents": self.active_agents,
            "exhaustedDimension": self.exhausted_dimension,
        }


class BudgetExceeded(RuntimeError):
    def __init__(self, dimension: str, snapshot: ExecutionBudgetSnapshot) -> None:
        self.dimension = dimension
        self.snapshot = snapshot
        labels = {
            "model_requests": "模型请求次数",
            "tool_calls": "工具调用次数",
            "wall_time": "运行时间",
            "active_agents": "活动 Agent 数",
        }
        super().__init__(f"执行预算已耗尽：{labels.get(dimension, dimension)}")

    def metadata(self) -> dict[str, object]:
        return {
            "failureKind": "budget_exhausted",
            "retryable": False,
            "budget": self.snapshot.metadata(),
        }


class ExecutionBudgetLedger:
    """Thread-safe admission ledger for one root Run tree."""

    def __init__(self, limits: ExecutionBudgetLimits | None = None) -> None:
        self.limits = limits or ExecutionBudgetLimits()
        self._started_at = time.monotonic()
        self._model_requests = 0
        self._tool_calls = 0
        self._active_agents = 0
        self._guard = threading.Lock()

    def reserve_model_request(self) -> ExecutionBudgetSnapshot:
        with self._guard:
            self._check_wall_time_locked()
            if self._model_requests >= self.limits.max_model_requests:
                raise self._exceeded_locked("model_requests")
            self._model_requests += 1
            return self._snapshot_locked()

    def check_wall_time(self) -> ExecutionBudgetSnapshot:
        with self._guard:
            self._check_wall_time_locked()
            return self._snapshot_locked()

    def reserve_tool_call(self) -> ExecutionBudgetSnapshot:
        with self._guard:
            self._check_wall_time_locked()
            if self._tool_calls >= self.limits.max_tool_calls:
                raise self._exceeded_locked("tool_calls")
            self._tool_calls += 1
            return self._snapshot_locked()

    def try_acquire_agent(self) -> bool:
        with self._guard:
            self._check_wall_time_locked()
            if self._active_agents >= self.limits.max_active_agents:
                return False
            self._active_agents += 1
            return True

    def release_agent(self) -> None:
        with self._guard:
            self._active_agents = max(0, self._active_agents - 1)

    def snapshot(self) -> ExecutionBudgetSnapshot:
        with self._guard:
            return self._snapshot_locked()

    def _check_wall_time_locked(self) -> None:
        if self._elapsed_ms_locked() >= self.limits.max_wall_time_ms:
            raise self._exceeded_locked("wall_time")

    def _exceeded_locked(self, dimension: str) -> BudgetExceeded:
        return BudgetExceeded(
            dimension,
            self._snapshot_locked(exhausted_dimension=dimension),
        )

    def _snapshot_locked(
        self, *, exhausted_dimension: str = ""
    ) -> ExecutionBudgetSnapshot:
        return ExecutionBudgetSnapshot(
            **asdict(self.limits),
            model_requests=self._model_requests,
            tool_calls=self._tool_calls,
            elapsed_ms=self._elapsed_ms_locked(),
            active_agents=self._active_agents,
            exhausted_dimension=exhausted_dimension,
        )

    def _elapsed_ms_locked(self) -> int:
        return max(0, int((time.monotonic() - self._started_at) * 1_000))
