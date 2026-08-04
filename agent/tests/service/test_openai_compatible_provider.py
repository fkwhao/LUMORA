from app.dto.request.chat_completion_request import ChatMessageRequest
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_builder import PromptBuilder
from app.prompt.prompt_context import PromptContext
from app.provider.openai_compatible_provider import OpenAICompatibleProvider


def test_prompt_assembly_routes_context_and_tools_to_api_fields() -> None:
    provider = OpenAICompatibleProvider()
    prompt = PromptBuilder().build(
        PromptContext(
            memory_summary="用户正在维护 LUMORA。",
            tool_definitions=(
                {
                    "type": "function",
                    "function": {
                        "name": "file_read",
                        "parameters": {"type": "object"},
                    },
                },
            ),
        )
    )

    body = provider._request_body(
        ModelConnectionSettings(
            provider_name="OpenAI compatible",
            base_url="https://example.com/v1",
            model="example-model",
            api_key="secret",
        ),
        prompt,
        [ChatMessageRequest(role="user", content="读取文件")],
        stream=False,
    )

    assert body["messages"][-2]["role"] == "user"
    assert body["messages"][-2]["content"].startswith("以下是系统生成的历史记忆摘要")
    assert body["messages"][-1] == {"role": "user", "content": "读取文件"}
    assert body["tools"][0]["function"]["name"] == "file_read"


def test_deepseek_thinking_strength_uses_official_openai_format() -> None:
    provider = OpenAICompatibleProvider()
    body = provider._request_body(
        ModelConnectionSettings(
            provider_name="DeepSeek",
            base_url="https://api.deepseek.com",
            model="deepseek-v4-pro",
            api_key="secret",
        ),
        PromptBuilder().build(),
        [ChatMessageRequest(role="user", content="你好")],
        stream=True,
        reasoning_effort="max",
    )

    assert body["thinking"] == {"type": "enabled"}
    assert body["reasoning_effort"] == "max"
    assert isinstance(body["messages"][-1]["content"], str)
    assert body["messages"][-1]["content"] == "你好"
