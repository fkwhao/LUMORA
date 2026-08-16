import json
from collections.abc import AsyncIterator
from http import HTTPMethod

from fastapi import APIRouter, Header, status
from fastapi.responses import StreamingResponse

from app.constants.api_paths import (
    CHAT_COMPACTION_ROUTE,
    CHAT_COMPLETIONS_ROUTE,
    CHAT_COMPLETIONS_STREAM_ROUTE,
    CHAT_RUN_PAUSE_ROUTE,
    CHAT_RUN_STEERS_ROUTE,
)
from app.constants.error_codes import INVALID_REQUEST, MODEL_PROVIDER_ERROR
from app.constants.http_contract import (
    AUTHORIZATION_HEADER,
    CORRELATION_ID_HEADER,
    PROTOCOL_VERSION_HEADER,
)
from app.controller.http.chat_stream_event_mapper import ChatStreamEventMapper
from app.controller.http.errors import AgentHttpError
from app.controller.http.request_guard import HttpRequestGuard
from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.dto.request.steer_request import SteerRequest
from app.dto.response.chat_completion_response import ChatCompletionResponse
from app.dto.response.context_compaction_response import ContextCompactionResponse
from app.exception.provider_errors import ModelProviderError
from app.service.chat_service import ChatService


class ChatRoutes:
    def __init__(self, chat_service: ChatService, guard: HttpRequestGuard) -> None:
        self.router = APIRouter()
        self._chat_service = chat_service
        self._guard = guard
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
            CHAT_COMPACTION_ROUTE,
            self.compact_chat,
            methods=[HTTPMethod.POST],
            response_model=ContextCompactionResponse,
        )
        self.router.add_api_route(
            CHAT_RUN_PAUSE_ROUTE,
            self.pause_run,
            methods=[HTTPMethod.POST],
        )
        self.router.add_api_route(
            CHAT_RUN_STEERS_ROUTE,
            self.add_steer,
            methods=[HTTPMethod.POST],
        )
        self.router.add_api_route(
            CHAT_RUN_STEERS_ROUTE,
            self.replace_steer,
            methods=[HTTPMethod.PUT],
        )
        self.router.add_api_route(
            CHAT_RUN_STEERS_ROUTE,
            self.remove_steer,
            methods=[HTTPMethod.DELETE],
        )

    async def pause_run(
        self,
        run_id: str,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> dict[str, bool]:
        self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        return {"paused": await self._chat_service.pause_run(run_id)}

    async def add_steer(
        self,
        run_id: str,
        input_id: str,
        request: SteerRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> dict[str, bool]:
        self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        return {
            "accepted": await self._chat_service.add_steer(
                run_id, input_id, request.content
            )
        }

    async def replace_steer(
        self,
        run_id: str,
        input_id: str,
        request: SteerRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> dict[str, bool]:
        self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        return {
            "replaced": await self._chat_service.replace_steer(
                run_id, input_id, request.content
            )
        }

    async def remove_steer(
        self,
        run_id: str,
        input_id: str,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> dict[str, bool]:
        self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        return {
            "removed": await self._chat_service.remove_steer(
                run_id, input_id
            )
        }

    async def complete_chat(
        self,
        request: ChatCompletionRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> ChatCompletionResponse:
        authenticated_id = self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        try:
            return await self._chat_service.complete(request)
        except ValueError as error:
            raise AgentHttpError(
                status.HTTP_400_BAD_REQUEST,
                INVALID_REQUEST,
                str(error),
                False,
                authenticated_id,
            ) from error
        except ModelProviderError as error:
            raise AgentHttpError(
                status.HTTP_502_BAD_GATEWAY,
                MODEL_PROVIDER_ERROR,
                str(error),
                True,
                authenticated_id,
            ) from error

    async def compact_chat(
        self,
        request: ChatCompletionRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> ContextCompactionResponse:
        authenticated_id = self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        try:
            return await self._chat_service.compact(request)
        except ValueError as error:
            raise AgentHttpError(
                status.HTTP_400_BAD_REQUEST,
                INVALID_REQUEST,
                str(error),
                False,
                authenticated_id,
            ) from error
        except ModelProviderError as error:
            raise AgentHttpError(
                status.HTTP_502_BAD_GATEWAY,
                MODEL_PROVIDER_ERROR,
                str(error),
                True,
                authenticated_id,
            ) from error

    def stream_chat(
        self,
        request: ChatCompletionRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> StreamingResponse:
        authenticated_id = self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        return StreamingResponse(
            self._stream_events(request, authenticated_id),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache"},
        )

    async def _stream_events(
        self,
        request: ChatCompletionRequest,
        correlation_id: str,
    ) -> AsyncIterator[str]:
        try:
            async for event in self._chat_service.stream(request, correlation_id):
                response = ChatStreamEventMapper.to_response(event)
                data = response.model_dump_json(by_alias=True)
                yield f"event: {event.type}\ndata: {data}\n\n"
        except ModelProviderError:
            data = json.dumps(
                {
                    "type": "failed",
                    "errorMessage": "模型 API 流式调用失败",
                },
                ensure_ascii=False,
            )
            yield f"event: failed\ndata: {data}\n\n"
