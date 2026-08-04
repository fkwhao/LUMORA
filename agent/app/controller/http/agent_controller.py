import json
from collections.abc import AsyncIterator
from http import HTTPMethod

from fastapi import APIRouter, Header, status
from fastapi.responses import StreamingResponse

from app.config.settings import AgentSettings
from app.constants.api_paths import (
    API_V1_PREFIX,
    CHAT_COMPLETIONS_ROUTE,
    CHAT_COMPLETIONS_STREAM_ROUTE,
    HEALTH_ROUTE,
    MEMORY_EXTRACTIONS_ROUTE,
    MODELS_ROUTE,
    PLAN_TASK_ROUTE,
)
from app.constants.error_codes import (
    AUTHENTICATION_FAILED,
    INVALID_REQUEST,
    MODEL_PROVIDER_ERROR,
    PROTOCOL_MISMATCH,
)
from app.constants.http_contract import (
    AUTHORIZATION_HEADER,
    CORRELATION_ID_HEADER,
    PROTOCOL_VERSION_HEADER,
)
from app.constants.service_metadata import SERVICE_NAME, STATUS_UP
from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.dto.request.memory_extraction_request import MemoryExtractionRequest
from app.dto.request.model_list_request import ModelListRequest
from app.dto.request.plan_task_request import PlanTaskRequest
from app.dto.response.chat_completion_response import ChatCompletionResponse
from app.dto.response.health_response import HealthResponse
from app.dto.response.memory_extraction_response import MemoryExtractionResponse
from app.dto.response.model_list_response import ModelListResponse
from app.dto.response.plan_step_response import PlanStepResponse
from app.dto.response.plan_task_response import PlanTaskResponse
from app.exception.runtime_errors import (
    AuthenticationError,
    InvalidRequestError,
    ProtocolMismatchError,
)
from app.security.request_authenticator import RequestAuthenticator
from app.service.chat_service import ChatService, ModelProviderError
from app.service.memory_extraction_service import MemoryExtractionService
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
        chat_service: ChatService,
        memory_extraction_service: MemoryExtractionService,
    ) -> None:
        self.router = APIRouter(prefix=API_V1_PREFIX)
        self._settings = settings
        self._planner_service = planner_service
        self._chat_service = chat_service
        self._memory_extraction_service = memory_extraction_service
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
        self.router.add_api_route(
            CHAT_COMPLETIONS_ROUTE,
            self.complete_chat,
            methods=[HTTPMethod.POST],
            response_model=ChatCompletionResponse,
        )
        self.router.add_api_route(
            CHAT_COMPLETIONS_STREAM_ROUTE,
            self.stream_chat,
            methods=[HTTPMethod.POST],
            response_class=StreamingResponse,
        )
        self.router.add_api_route(
            MODELS_ROUTE,
            self.list_models,
            methods=[HTTPMethod.POST],
            response_model=ModelListResponse,
        )
        self.router.add_api_route(
            MEMORY_EXTRACTIONS_ROUTE,
            self.extract_memories,
            methods=[HTTPMethod.POST],
            response_model=MemoryExtractionResponse,
        )

    async def extract_memories(
        self,
        request: MemoryExtractionRequest,
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
    ) -> MemoryExtractionResponse:
        authenticated_correlation_id = self._authenticate(
            authorization,
            protocol_version,
            correlation_id,
        )
        try:
            return await self._memory_extraction_service.extract(request)
        except ModelProviderError as error:
            raise AgentHttpError(
                status.HTTP_502_BAD_GATEWAY,
                MODEL_PROVIDER_ERROR,
                str(error),
                True,
                authenticated_correlation_id,
            ) from error

    async def list_models(
        self,
        request: ModelListRequest,
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
    ) -> ModelListResponse:
        authenticated_correlation_id = self._authenticate(
            authorization,
            protocol_version,
            correlation_id,
        )
        try:
            return ModelListResponse(
                models=await self._chat_service.list_models(request)
            )
        except ValueError as error:
            raise AgentHttpError(
                status.HTTP_400_BAD_REQUEST,
                INVALID_REQUEST,
                str(error),
                False,
                authenticated_correlation_id,
            ) from error
        except ModelProviderError as error:
            raise AgentHttpError(
                status.HTTP_502_BAD_GATEWAY,
                MODEL_PROVIDER_ERROR,
                str(error),
                True,
                authenticated_correlation_id,
            ) from error

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

    async def complete_chat(
        self,
        request: ChatCompletionRequest,
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
    ) -> ChatCompletionResponse:
        authenticated_correlation_id = self._authenticate(
            authorization,
            protocol_version,
            correlation_id,
        )
        try:
            return await self._chat_service.complete(request)
        except ValueError as error:
            raise AgentHttpError(
                status.HTTP_400_BAD_REQUEST,
                INVALID_REQUEST,
                str(error),
                False,
                authenticated_correlation_id,
            ) from error
        except ModelProviderError as error:
            raise AgentHttpError(
                status.HTTP_502_BAD_GATEWAY,
                MODEL_PROVIDER_ERROR,
                str(error),
                True,
                authenticated_correlation_id,
            ) from error

    def stream_chat(
        self,
        request: ChatCompletionRequest,
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
    ) -> StreamingResponse:
        self._authenticate(
            authorization,
            protocol_version,
            correlation_id,
        )
        return StreamingResponse(
            self._stream_events(request),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache"},
        )

    async def _stream_events(
        self,
        request: ChatCompletionRequest,
    ) -> AsyncIterator[str]:
        try:
            async for event in self._chat_service.stream(request):
                data = event.model_dump_json(by_alias=True)
                yield f"event: {event.type}\ndata: {data}\n\n"
        except ModelProviderError:
            # 流开始后不能再修改 HTTP 状态码，使用稳定失败事件结束本次响应。
            data = json.dumps(
                {
                    "type": "failed",
                    "errorMessage": "模型 API 流式调用失败",
                },
                ensure_ascii=False,
            )
            yield f"event: failed\ndata: {data}\n\n"

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
