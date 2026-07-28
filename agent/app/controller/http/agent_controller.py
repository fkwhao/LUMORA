from fastapi import APIRouter, Header

from app.config.settings import AgentSettings
from app.dto.request.plan_task_request import PlanTaskRequest
from app.dto.response.health_response import HealthResponse
from app.dto.response.plan_step_response import PlanStepResponse
from app.dto.response.plan_task_response import PlanTaskResponse
from app.exception.runtime_errors import (
    AuthenticationError,
    InvalidRequestError,
    ProtocolMismatchError,
)
from app.security.request_authenticator import RequestAuthenticator
from app.service.planner_service import PlannerService


class AgentHttpError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        retryable: bool,
        correlation_id: str,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retryable = retryable
        self.correlation_id = correlation_id


class AgentHttpController:
    def __init__(
        self,
        settings: AgentSettings,
        planner_service: PlannerService,
    ) -> None:
        self.router = APIRouter(prefix="/api/v1")
        self._settings = settings
        self._planner_service = planner_service
        self._authenticator = RequestAuthenticator(settings)
        self.router.add_api_route(
            "/health",
            self.health,
            methods=["GET"],
            response_model=HealthResponse,
        )
        self.router.add_api_route(
            "/tasks/plan",
            self.plan_task,
            methods=["POST"],
            response_model=PlanTaskResponse,
        )

    def health(
        self,
        authorization: str | None = Header(default=None),
        protocol_version: str | None = Header(
            default=None,
            alias="X-Lumora-Protocol-Version",
        ),
        correlation_id: str | None = Header(
            default=None,
            alias="X-Correlation-Id",
        ),
    ) -> HealthResponse:
        self._authenticate(authorization, protocol_version, correlation_id)
        return HealthResponse(
            status="UP",
            service="lumora-agent",
            protocolVersion=self._settings.protocol_version,
        )

    def plan_task(
        self,
        request: PlanTaskRequest,
        authorization: str | None = Header(default=None),
        protocol_version: str | None = Header(
            default=None,
            alias="X-Lumora-Protocol-Version",
        ),
        correlation_id: str | None = Header(
            default=None,
            alias="X-Correlation-Id",
        ),
    ) -> PlanTaskResponse:
        authenticated_correlation_id = self._authenticate(
            authorization,
            protocol_version,
            correlation_id,
        )
        try:
            steps = self._planner_service.build_plan(request.goal)
        except ValueError as error:
            raise AgentHttpError(
                400,
                "INVALID_REQUEST",
                str(error),
                False,
                authenticated_correlation_id,
            ) from error

        return PlanTaskResponse(
            taskId=request.task_id,
            steps=[PlanStepResponse.from_model(step) for step in steps],
        )

    def _authenticate(
        self,
        authorization: str | None,
        protocol_version: str | None,
        correlation_id: str | None,
    ) -> str:
        safe_correlation_id = (correlation_id or "").strip()
        error_mapping: tuple[
            tuple[type[ValueError], int, str],
            ...,
        ] = (
            (AuthenticationError, 401, "AUTHENTICATION_FAILED"),
            (ProtocolMismatchError, 412, "PROTOCOL_MISMATCH"),
            (InvalidRequestError, 400, "INVALID_REQUEST"),
        )
        try:
            return self._authenticator.authenticate(
                authorization,
                protocol_version,
                correlation_id,
            )
        except ValueError as error:
            for error_type, status_code, code in error_mapping:
                if isinstance(error, error_type):
                    # HTTP 边界只返回稳定错误码，不透出令牌或内部调用栈。
                    raise AgentHttpError(
                        status_code,
                        code,
                        str(error),
                        False,
                        safe_correlation_id,
                    ) from error
            raise
