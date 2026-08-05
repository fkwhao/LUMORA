from http import HTTPMethod

from fastapi import APIRouter, Header, status

from app.config.settings import AgentSettings
from app.constants.api_paths import HEALTH_ROUTE, PLAN_TASK_ROUTE
from app.constants.error_codes import INVALID_REQUEST
from app.constants.http_contract import (
    AUTHORIZATION_HEADER,
    CORRELATION_ID_HEADER,
    PROTOCOL_VERSION_HEADER,
)
from app.constants.service_metadata import SERVICE_NAME, STATUS_UP
from app.controller.http.errors import AgentHttpError
from app.controller.http.request_guard import HttpRequestGuard
from app.dto.request.plan_task_request import PlanTaskRequest
from app.dto.response.health_response import HealthResponse
from app.dto.response.plan_step_response import PlanStepResponse
from app.dto.response.plan_task_response import PlanTaskResponse
from app.service.planner_service import PlannerService


class SystemRoutes:
    def __init__(
        self,
        settings: AgentSettings,
        planner_service: PlannerService,
        guard: HttpRequestGuard,
    ) -> None:
        self.router = APIRouter()
        self._settings = settings
        self._planner_service = planner_service
        self._guard = guard
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
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> HealthResponse:
        self._guard.authenticate(authorization, protocol_version, correlation_id)
        return HealthResponse(
            status=STATUS_UP,
            service=SERVICE_NAME,
            protocolVersion=self._settings.protocol_version,
        )

    def plan_task(
        self,
        request: PlanTaskRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> PlanTaskResponse:
        authenticated_id = self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        try:
            steps = self._planner_service.build_plan(request.goal)
        except ValueError as error:
            raise AgentHttpError(
                status.HTTP_400_BAD_REQUEST,
                INVALID_REQUEST,
                str(error),
                False,
                authenticated_id,
            ) from error
        return PlanTaskResponse(
            taskId=request.task_id,
            steps=[PlanStepResponse.from_model(step) for step in steps],
        )
