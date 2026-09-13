import asyncio
import json

import pytest

from app.controller.http.chat_routes import ChatRoutes
from app.controller.http.errors import AgentHttpError
from app.dto.request.chat_completion_request import ChatCompletionRequest
from app.prompt.prompt_errors import PromptConfigurationError
from app.prompt.prompt_resolver import PromptConflictError


class _Guard:
    def authenticate(self, *_args):
        return "correlation-1"


class _ConflictService:
    async def complete(self, _request):
        raise PromptConflictError("key='lumora.execution'")

    async def compact(self, _request):
        raise PromptConflictError("key='lumora.execution'")

    async def stream(self, _request, _correlation_id):
        raise PromptConflictError("key='lumora.execution'")
        yield  # pragma: no cover


class _ConfigurationService:
    async def complete(self, _request):
        raise PromptConfigurationError("项目 Prompt 策略格式无效")

    async def compact(self, _request):
        raise PromptConfigurationError("项目 Prompt 策略格式无效")

    async def stream(self, _request, _correlation_id):
        raise PromptConfigurationError("项目 Prompt 策略格式无效")
        yield  # pragma: no cover


def _request() -> ChatCompletionRequest:
    return ChatCompletionRequest.model_validate({
        "messages": [{"role": "user", "content": "继续执行"}],
        "connection": {
            "providerName": "test",
            "baseUrl": "https://example.com/v1",
            "model": "test-model",
            "apiKey": "secret",
        },
    })


def test_complete_maps_prompt_conflict_to_409() -> None:
    routes = ChatRoutes(_ConflictService(), _Guard())

    with pytest.raises(AgentHttpError) as captured:
        asyncio.run(routes.complete_chat(_request()))

    assert captured.value.status_code == 409
    assert captured.value.code == "PROMPT_CONFLICT"
    assert captured.value.retryable is False


def test_stream_emits_stable_prompt_conflict_event() -> None:
    routes = ChatRoutes(_ConflictService(), _Guard())

    async def collect() -> list[str]:
        return [
            frame
            async for frame in routes._stream_events(_request(), "correlation-1")
        ]

    frames = asyncio.run(collect())
    assert len(frames) == 1
    assert frames[0].startswith("event: failed\n")
    payload = json.loads(frames[0].splitlines()[1].removeprefix("data: "))
    assert payload["metadata"]["errorCode"] == "PROMPT_CONFLICT"


def test_complete_maps_prompt_configuration_to_invalid_request() -> None:
    routes = ChatRoutes(_ConfigurationService(), _Guard())

    with pytest.raises(AgentHttpError) as captured:
        asyncio.run(routes.complete_chat(_request()))

    assert captured.value.status_code == 400
    assert captured.value.code == "INVALID_REQUEST"
    assert captured.value.retryable is False


def test_stream_emits_stable_prompt_configuration_event() -> None:
    routes = ChatRoutes(_ConfigurationService(), _Guard())

    async def collect() -> list[str]:
        return [
            frame
            async for frame in routes._stream_events(_request(), "correlation-1")
        ]

    frames = asyncio.run(collect())
    assert len(frames) == 1
    payload = json.loads(frames[0].splitlines()[1].removeprefix("data: "))
    assert payload["metadata"]["errorCode"] == "INVALID_REQUEST"
