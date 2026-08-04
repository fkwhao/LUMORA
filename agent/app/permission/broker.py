import asyncio
import uuid
from dataclasses import dataclass

from app.permission.model import ApprovalDecision


@dataclass(frozen=True, slots=True)
class ApprovalRequest:
    approval_id: str
    correlation_id: str


class ApprovalBroker:
    """在 SSE Agent Loop 与独立审批 HTTP 请求之间传递一次性决定。"""

    def __init__(self) -> None:
        self._pending: dict[
            str,
            tuple[str, asyncio.Future[ApprovalDecision]],
        ] = {}

    def create(self, correlation_id: str) -> ApprovalRequest:
        approval_id = str(uuid.uuid4())
        future = asyncio.get_running_loop().create_future()
        self._pending[approval_id] = (correlation_id, future)
        return ApprovalRequest(approval_id, correlation_id)

    async def wait(self, approval_id: str) -> ApprovalDecision:
        pending = self._pending.get(approval_id)
        if pending is None:
            raise ValueError("审批请求不存在或已经处理")
        try:
            return await pending[1]
        finally:
            self._pending.pop(approval_id, None)

    def decide(
        self,
        approval_id: str,
        decision: ApprovalDecision,
        correlation_id: str | None = None,
    ) -> bool:
        pending = self._pending.get(approval_id)
        if (
            pending is None
            or pending[1].done()
            or (correlation_id is not None and pending[0] != correlation_id)
        ):
            return False
        pending[1].set_result(decision)
        return True

    def correlation_id(self, approval_id: str) -> str | None:
        pending = self._pending.get(approval_id)
        return pending[0] if pending is not None else None

    def discard(self, approval_id: str) -> None:
        pending = self._pending.pop(approval_id, None)
        if pending is not None and not pending[1].done():
            pending[1].cancel()
