from http import HTTPMethod

from fastapi import APIRouter, Header, status

from app.constants.api_paths import TOOL_APPROVAL_DECISION_ROUTE
from app.constants.error_codes import INVALID_REQUEST
from app.constants.http_contract import (
    AUTHORIZATION_HEADER,
    CORRELATION_ID_HEADER,
    PROTOCOL_VERSION_HEADER,
)
from app.controller.http.errors import AgentHttpError
from app.controller.http.request_guard import HttpRequestGuard
from app.dto.request.tool_approval_decision_request import ToolApprovalDecisionRequest
from app.permission.model import ApprovalDecision
from app.service.chat_service import ChatService


class ApprovalRoutes:
    def __init__(self, chat_service: ChatService, guard: HttpRequestGuard) -> None:
        self.router = APIRouter()
        self._chat_service = chat_service
        self._guard = guard
        self.router.add_api_route(
            TOOL_APPROVAL_DECISION_ROUTE,
            self.decide_tool_approval,
            methods=[HTTPMethod.POST],
            status_code=status.HTTP_204_NO_CONTENT,
        )

    async def decide_tool_approval(
        self,
        approval_id: str,
        request: ToolApprovalDecisionRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> None:
        authenticated_id = self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        decided = self._chat_service.decide_tool_approval(
            approval_id,
            ApprovalDecision(
                "allow_once" if request.decision == "allow" else request.decision
            ),
            authenticated_id,
        )
        if not decided:
            raise AgentHttpError(
                status.HTTP_404_NOT_FOUND,
                INVALID_REQUEST,
                "审批请求不存在、已处理或不属于当前会话",
                False,
                authenticated_id,
            )
