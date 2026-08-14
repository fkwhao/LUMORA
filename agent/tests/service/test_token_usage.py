from app.provider.token_usage import (
    add_token_usage,
    parse_anthropic_usage,
    parse_chat_usage,
    parse_responses_usage,
)


def test_chat_usage_normalizes_cache_and_reasoning_tokens() -> None:
    usage = parse_chat_usage({
        "prompt_tokens": 100,
        "completion_tokens": 30,
        "total_tokens": 130,
        "prompt_tokens_details": {"cached_tokens": 60},
        "completion_tokens_details": {"reasoning_tokens": 10},
    })

    assert usage.input_tokens == 40
    assert usage.output_tokens == 20
    assert usage.reasoning_tokens == 10
    assert usage.cache_read_tokens == 60
    assert usage.cache_metrics_available is True


def test_chat_usage_supports_native_deepseek_cache_fields() -> None:
    usage = parse_chat_usage({
        "prompt_tokens": 100,
        "completion_tokens": 30,
        "total_tokens": 130,
        "prompt_cache_hit_tokens": 60,
        "prompt_cache_miss_tokens": 40,
    })

    assert usage.prompt_tokens == 100
    assert usage.input_tokens == 40
    assert usage.cache_read_tokens == 60
    assert usage.total_tokens == 130
    assert usage.cache_metrics_available is True


def test_chat_usage_reconstructs_deepseek_prompt_total_when_missing() -> None:
    usage = parse_chat_usage({
        "completion_tokens": 12,
        "prompt_cache_hit_tokens": 70,
        "prompt_cache_miss_tokens": 30,
    })

    assert usage.prompt_tokens == 100
    assert usage.input_tokens == 30
    assert usage.cache_read_tokens == 70
    assert usage.total_tokens == 112


def test_nested_zero_cache_value_does_not_fall_through_to_top_level() -> None:
    usage = parse_chat_usage({
        "prompt_tokens": 50,
        "completion_tokens": 10,
        "prompt_tokens_details": {"cached_tokens": 0},
        "cache_read_tokens": 40,
    })

    assert usage.input_tokens == 50
    assert usage.cache_read_tokens == 0


def test_responses_usage_reads_nested_details() -> None:
    usage = parse_responses_usage({
        "input_tokens": 120,
        "output_tokens": 50,
        "input_tokens_details": {"cached_tokens": 90},
        "output_tokens_details": {"reasoning_tokens": 20},
    })

    assert usage.input_tokens == 30
    assert usage.output_tokens == 30
    assert usage.reasoning_tokens == 20
    assert usage.cache_read_tokens == 90
    assert usage.total_tokens == 170


def test_chat_usage_supports_anthropic_style_top_level_cache_fields() -> None:
    usage = parse_chat_usage({
        "prompt_tokens": 40,
        "completion_tokens": 12,
        "cache_read_input_tokens": 70,
        "cache_creation_input_tokens": 5,
    })

    assert usage.prompt_tokens == 115
    assert usage.input_tokens == 40
    assert usage.cache_read_tokens == 70
    assert usage.cache_write_tokens == 5


def test_anthropic_usage_includes_cache_input_in_legacy_prompt_total() -> None:
    usage = parse_anthropic_usage({
        "input_tokens": 40,
        "output_tokens": 12,
        "cache_read_input_tokens": 70,
        "cache_creation_input_tokens": 5,
    })

    assert usage.prompt_tokens == 115
    assert usage.input_tokens == 40
    assert usage.cache_read_tokens == 70
    assert usage.cache_write_tokens == 5
    assert usage.total_tokens == 127


def test_usage_aggregation_preserves_cache_availability() -> None:
    result = add_token_usage((
        parse_chat_usage({"prompt_tokens": 5, "completion_tokens": 2}),
        parse_responses_usage({
            "input_tokens": 8,
            "output_tokens": 3,
            "input_tokens_details": {"cached_tokens": 6},
        }),
    ))

    assert result.total_tokens == 18
    assert result.input_tokens == 7
    assert result.output_tokens == 5
    assert result.cache_read_tokens == 6
    assert result.cache_metrics_available is True
