from http import HTTPMethod

from fastapi import APIRouter, Header, status

from app.config.settings import AgentSettings
from app.constants.api_paths import (
    API_V1_PREFIX,
    HEALTH_ROUTE,
    PLAN_TASK_ROUTE,
)
from app.constants.error_codes import (
    AUTHENTICATION_FAILED,
    INVALID_REQUEST,
    PROTOCOL_MISMATCH,
)
from app.constants.http_contract import (
    AUTHORIZATION_HEADER,
    CORRELATION_ID_HEADER,
    PROTOCOL_VERSION_HEADER,
)
from app.constants.service_metadata import SERVICE_NAME, STATUS_UP
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
        self.router = APIRouter(prefix=API_V1_PREFIX)
        self._settings = settings
        self._planner_service = planner_service
        self._authenticator = RequestAuthenticator(settings)
        self.router.add_api_route(
            HEALTH_ROUTE,
            self.health,
            methods=[HTTPMethod.GET],
            response_model=HealthResponse,
        )
        self.router.add_api_route(
            PLAN_TASK_ROUTE,
            self.plan_task,
            methods=[HTTPMethod.POST],
            response_model=PlanTaskResponse,
        )

    def health(
        self,
        authorization: str | None = Header(
            default=None,
            alias=AUTHORIZATION_HEADER,
        ),
        protocol_version: str | None = Header(
            default=None,
            alias=PROTOCOL_VERSION_HEADER,
        ),
        correlation_id: str | None = Header(
            default=None,
            alias=CORRELATION_ID_HEADER,
        ),
    ) -> HealthResponse:
        self._authenticate(authorization, protocol_version, correlation_id)
        return HealthResponse(
            status=STATUS_UP,
            service=SERVICE_NAME,
            protocolVersion=self._settings.protocol_version,
        )

    def plan_task(
        self,
        request: PlanTaskRequest,
        authorization: str | None = Header(
            default=None,
            alias=AUTHORIZATION_HEADER,
        ),
        protocol_version: str | None = Header(
            default=None,
            alias=PROTOCOL_VERSION_HEADER,
        ),
        correlation_id: str | None = Header(
            default=None,
            alias=CORRELATION_ID_HEADER,
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
                status.HTTP_400_BAD_REQUEST,
                INVALID_REQUEST,
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
            (
                AuthenticationError,
                status.HTTP_401_UNAUTHORIZED,
                AUTHENTICATION_FAILED,
            ),
            (
                ProtocolMismatchError,
                status.HTTP_412_PRECONDITION_FAILED,
                PROTOCOL_MISMATCH,
            ),
            (
                InvalidRequestError,
                status.HTTP_400_BAD_REQUEST,
                INVALID_REQUEST,
            ),
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
