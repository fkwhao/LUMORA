import json
import re

import httpx
from pydantic import ValidationError

from app.dto.request.chat_completion_request import ChatMessageRequest
from app.dto.request.memory_extraction_request import MemoryExtractionRequest
from app.dto.response.memory_extraction_response import (
    MemoryExtractionResponse,
)
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly
from app.prompt.prompt_segment import (
    PromptCachePolicy,
    PromptPriority,
    PromptSegment,
    PromptTarget,
    PromptTrustLevel,
)
from app.provider.openai_compatible_provider import OpenAICompatibleProvider
from app.service.chat_service import ModelProviderError


_EXTRACTION_PROMPT = """你是 LUMORA 的记忆提取器。只输出一个 JSON 对象，不要输出 Markdown。

目标：从一轮已经完成的用户消息与最终回答中，提取未来确实有用的记忆候选。

规则：
1. 普通提问、寒暄、模型推测、思考过程和已完成的一次性操作不保存。
2. 长期记忆只包含用户明确表达的稳定偏好、事实、最终决定或长期约束。
3. 短期记忆只包含后续轮次仍需要的未完成目标、临时约束或阶段结论，范围必须为 CONVERSATION。
4. 不保存密码、API Key、访问令牌、银行卡号或其他认证秘密。
5. 不把助手自行提出但用户未确认的建议保存成用户事实。
6. 参考已有记忆避免新增重复行。若相同事实已经存在且 key、subject、predicate、value 均完整，可以不返回该候选。
7. 最多返回 8 条，每条应是独立、简洁、可更新的事实。
8. 为同一事实槽位生成稳定的 dedupeKey，不得包含具体取值。例如数据库从 MySQL 改为 PostgreSQL 时，dedupeKey 都应为 lumora.cloud.relational_database。
9. subject 表示主体，predicate 表示稳定属性名，value 表示当前值。近义表达必须生成相同的 subject、predicate 和 dedupeKey。
10. value 使用简短、规范化的值；同一含义不得仅因措辞不同生成不同 value。
11. 已有记忆中若存在相同事实槽位，targetMemoryId 必须填写其 id；否则为 null。不得猜测或改写 id。
12. 兼容旧记忆：若相同事实已经存在，但其 key、subject、predicate、value 任一为空，仍必须返回该候选，并填写旧记忆的 targetMemoryId，以便原位补齐语义槽字段。此时不算重复保存。
13. 助手回答中的“无需重复记录”只表示不要新增重复行，不能阻止第 12 条所述的旧记忆原位升级。用户本轮明确重申的稳定偏好或决定仍应按上述规则判断。

输出格式：
{"candidates":[{"scope":"USER|CONVERSATION","type":"PREFERENCE|FACT|DECISION|CONSTRAINT|SUMMARY","retention":"SHORT_TERM|LONG_TERM","content":"...","dedupeKey":"user.response.style","subject":"用户","predicate":"response_style","value":"简洁","targetMemoryId":null,"structuredData":{},"confidence":0.0,"ttlSeconds":604800}]}

LONG_TERM 的 ttlSeconds 必须为 null；SHORT_TERM 的 ttlSeconds 为 60 到 2592000 秒。"""


class MemoryExtractionService:
    def __init__(self, provider: OpenAICompatibleProvider) -> None:
        self._provider = provider

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
                content=_EXTRACTION_PROMPT,
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
            raise ValueError("记忆提取响应必须是 JSON 对象")
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
