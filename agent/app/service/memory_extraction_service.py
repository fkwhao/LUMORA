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
from app.prompt.project_instruction_loader import ProjectInstructionLoader
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
    _REVOCATION_PATTERN = re.compile(
        r"(?:取消|撤销|作废|删除|移除|不要了|不再要求|不再强制|无需继续)"
    )
    _NEGATED_CANDIDATE_PATTERN = re.compile(
        r"(?:不再|取消|撤销|无需|不要求|不强制|不限制|可以引入|允许)"
    )
    def __init__(
        self,
        provider: CompletionProviderPort,
        prompt_loader: PromptLoader | None = None,
        project_instruction_loader: ProjectInstructionLoader | None = None,
    ) -> None:
        self._provider = provider
        self._prompt_loader = prompt_loader or PromptLoader()
        self._project_instruction_loader = (
            project_instruction_loader or ProjectInstructionLoader()
        )

    async def extract(
        self,
        request: MemoryExtractionRequest,
    ) -> MemoryExtractionResponse:
        settings = ModelConnectionSettings(
            provider_name=request.connection.provider_name,
            base_url=request.connection.base_url,
            model=request.connection.model,
            api_key=request.connection.api_key,
            max_output_tokens=request.connection.max_output_tokens,
            context_window=request.connection.context_window,
            api_format=request.connection.api_format,
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
            "existingProjectInstructions": self._load_project_instructions(
                request.workspace_path
            ),
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
            self._normalize_revocations(response, request.user_message)
            self._validate_retention(response)
            return response
        except (
            httpx.HTTPError,
            TypeError,
            ValueError,
            ValidationError,
        ) as error:
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
                if candidate.scope == "CONVERSATION":
                    raise ValueError(
                        "长期记忆必须属于用户或项目范围"
                    )
                candidate.ttl_seconds = None
            elif candidate.scope != "CONVERSATION":
                raise ValueError("短期记忆只能属于当前会话")
            if candidate.storage == "PROJECT_INSTRUCTIONS" and (
                candidate.scope != "PROJECT"
                or candidate.retention != "LONG_TERM"
                or candidate.type not in {"CONSTRAINT", "DECISION"}
            ):
                raise ValueError("项目指令候选的范围或类型无效")
            if (
                candidate.action == "ARCHIVE"
                and candidate.storage == "MEMORY"
                and not candidate.target_memory_id
            ):
                raise ValueError("归档动态记忆必须指定 targetMemoryId")

    @staticmethod
    def _is_deepseek(request: MemoryExtractionRequest) -> bool:
        connection = request.connection
        return "deepseek" in (
            f"{connection.provider_name} {connection.base_url}"
        ).lower()

    def _load_project_instructions(self, workspace_path: str | None) -> str:
        try:
            return "\n\n".join(
                self._project_instruction_loader.load(workspace_path)
            )
        except (OSError, RuntimeError, ValueError):
            return ""

    @classmethod
    def _normalize_revocations(
        cls,
        response: MemoryExtractionResponse,
        user_message: str,
    ) -> None:
        if not cls._REVOCATION_PATTERN.search(user_message):
            return
        for candidate in response.candidates:
            if (
                candidate.action == "UPSERT"
                and candidate.storage == "MEMORY"
                and candidate.target_memory_id
                and cls._NEGATED_CANDIDATE_PATTERN.search(
                    f"{candidate.content} {candidate.value}"
                )
            ):
                candidate.action = "ARCHIVE"
