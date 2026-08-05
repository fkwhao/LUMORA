import json
import re

import httpx
from pydantic import ValidationError

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.request.memory_extraction_request import MemoryExtractionRequest
from app.dto.response.memory_extraction_response import (
    MemoryExtractionResponse,
)
from app.exception.provider_errors import ModelProviderError
from app.harness.ports.model_provider import CompletionProviderPort
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly
from app.prompt.prompt_loader import PromptLoader
from app.prompt.prompt_segment import (
    PromptCachePolicy,
    PromptPriority,
    PromptSegment,
    PromptTarget,
    PromptTrustLevel,
)


class MemoryExtractionService:
    def __init__(
        self,
        provider: CompletionProviderPort,
        prompt_loader: PromptLoader | None = None,
    ) -> None:
        self._provider = provider
        self._prompt_loader = prompt_loader or PromptLoader()

    async def extract(
        self,
        request: MemoryExtractionRequest,
    ) -> MemoryExtractionResponse:
        settings = ModelConnectionSettings(
            provider_name=request.connection.provider_name,
            base_url=request.connection.base_url,
            model=request.connection.model,
            api_key=request.connection.api_key,
        )
        settings.validate()
        prompt = PromptAssembly((
            PromptSegment(
                key="memory.extraction",
                target=PromptTarget.SYSTEM,
                content=self._prompt_loader.load_specialized(
                    "memory_extraction"
                ),
                trust_level=PromptTrustLevel.TRUSTED,
                priority=PromptPriority.REQUIRED,
                cache_policy=PromptCachePolicy.STATIC,
            ),
        ))
        payload = {
            "userMessage": request.user_message,
            "assistantMessage": request.assistant_message,
            "existingMemorySummary": request.existing_memory_summary or "",
        }
        try:
            completion = await self._provider.complete(
                settings,
                prompt,
                [
                    ChatMessageRequest(
                        role="user",
                        content=json.dumps(payload, ensure_ascii=False),
                    )
                ],
                reasoning_effort=(
                    "low" if self._is_deepseek(request) else None
                ),
            )
            parsed = self._parse_json_object(completion.message)
            response = MemoryExtractionResponse.model_validate(parsed)
            self._validate_retention(response)
            return response
        except (httpx.HTTPError, ValueError, ValidationError) as error:
            raise ModelProviderError("记忆提取失败") from error

    @staticmethod
    def _parse_json_object(value: str) -> dict:
        normalized = value.strip()
        fenced = re.fullmatch(
            r"```(?:json)?\s*(\{.*\})\s*```",
            normalized,
            flags=re.DOTALL | re.IGNORECASE,
        )
        if fenced:
            normalized = fenced.group(1)
        else:
            start = normalized.find("{")
            end = normalized.rfind("}")
            if start < 0 or end < start:
                raise ValueError("记忆提取响应不包含 JSON 对象")
            normalized = normalized[start : end + 1]
        parsed = json.loads(normalized)
        if not isinstance(parsed, dict):
            raise TypeError("记忆提取响应必须是 JSON 对象")
        return parsed

    @staticmethod
    def _validate_retention(response: MemoryExtractionResponse) -> None:
        for candidate in response.candidates:
            if candidate.retention == "LONG_TERM":
                candidate.ttl_seconds = None
            elif candidate.scope != "CONVERSATION":
                raise ValueError("短期记忆只能属于当前会话")

    @staticmethod
    def _is_deepseek(request: MemoryExtractionRequest) -> bool:
        connection = request.connection
        return "deepseek" in (
            f"{connection.provider_name} {connection.base_url}"
        ).lower()
