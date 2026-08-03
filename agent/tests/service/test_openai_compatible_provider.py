from app.dto.request.chat_completion_request import ChatMessageRequest
from app.model.model_connection_settings import ModelConnectionSettings
from app.provider.openai_compatible_provider import OpenAICompatibleProvider
from app.prompt.prompt_builder import PromptBuilder
from app.prompt.prompt_context import PromptContext


def test_prompt_assembly_routes_context_and_tools_to_api_fields() -> None:
    provider = OpenAICompatibleProvider()
    prompt = PromptBuilder().build(
        PromptContext(
            memory_summary="用户正在维护 LUMORA。",
            system_reminders=("本轮只做只读分析。",),
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
    assert body["messages"][-1] == {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": (
                    "<system-reminder>\n"
                    "本轮只做只读分析。\n"
                    "</system-reminder>"
                ),
            },
            {"type": "text", "text": "读取文件"},
        ],
    }
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
        PromptBuilder().build(PromptContext(
            system_reminders=("本轮不要修改文件。",),
        )),
        [ChatMessageRequest(role="user", content="你好")],
        stream=True,
        reasoning_effort="max",
    )

    assert body["thinking"] == {"type": "enabled"}
    assert body["reasoning_effort"] == "max"
    assert isinstance(body["messages"][-1]["content"], str)
    assert body["messages"][-1]["content"].endswith("\n\n你好")


def test_reminder_only_changes_current_user_message() -> None:
    provider = OpenAICompatibleProvider()
    settings = ModelConnectionSettings(
        provider_name="OpenAI compatible",
        base_url="https://example.com/v1",
        model="example-model",
        api_key="secret",
    )
    history = [
        ChatMessageRequest(role="user", content="上一问"),
        ChatMessageRequest(role="assistant", content="上一答"),
        ChatMessageRequest(role="user", content="当前问题"),
    ]
    plain = provider._request_body(
        settings,
        PromptBuilder().build(),
        history,
        stream=False,
    )
    reminded = provider._request_body(
        settings,
        PromptBuilder().build(PromptContext(
            system_reminders=("仅返回最终结果。",),
        )),
        history,
        stream=False,
    )

    assert plain["messages"][:-1] == reminded["messages"][:-1]
    assert reminded["messages"][-1]["role"] == "user"
    assert isinstance(reminded["messages"][-1]["content"], list)
