from app.context.planner import ContextPlanner
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly


def test_context_planner_compacts_old_messages_and_keeps_recent_raw() -> None:
    planner = ContextPlanner()
    messages = [
        ChatMessageRequest(
            role="user" if sequence % 2 else "assistant",
            content=(str(sequence) + "x" * 12_000),
            sequence=sequence,
        )
        for sequence in range(1, 9)
    ]
    settings = ModelConnectionSettings(
        provider_name="test",
        base_url="https://example.com/v1",
        api_key="secret",
        model="test-model",
        context_window=20_000,
        max_output_tokens=2_000,
    )
    prompt = PromptAssembly(())

    should_compact, before_tokens, threshold = planner.should_compact(
        settings, prompt, messages
    )
    compacted, retained = planner.split_for_compaction(messages)
    plan = planner.completed_plan(
        prompt,
        messages,
        retained,
        "历史摘要",
        before_tokens,
    )

    assert should_compact is True
    assert before_tokens >= threshold
    assert len(retained) >= 5
    assert compacted + retained == messages
    assert plan.through_sequence == compacted[-1].sequence
    assert plan.retained_from_sequence == retained[0].sequence
    assert plan.after_tokens < plan.before_tokens


def test_context_planner_keeps_tool_call_and_output_in_same_recent_group() -> None:
    planner = ContextPlanner()
    messages = [
        {"role": "user", "content": f"old-{index}-" + "x" * 8_000}
        for index in range(6)
    ] + [
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"id": "call-1", "type": "function"}],
        },
        {"role": "tool", "tool_call_id": "call-1", "content": "result"},
    ]

    compactable, retained = planner.split_rendered_for_compaction(messages)

    assert compactable
    assert retained[-2]["role"] == "assistant"
    assert retained[-1]["role"] == "tool"


def test_manual_compaction_forces_old_messages_below_recent_token_budget() -> None:
    planner = ContextPlanner()
    messages = [
        ChatMessageRequest(
            role="user" if sequence % 2 else "assistant",
            content=f"message-{sequence}",
            sequence=sequence,
        )
        for sequence in range(1, 9)
    ]

    automatic_compactable, _ = planner.split_for_compaction(messages)
    manual_compactable, retained = planner.split_for_compaction(
        messages,
        force=True,
    )

    assert automatic_compactable == []
    assert manual_compactable == messages[:3]
    assert retained == messages[-5:]
