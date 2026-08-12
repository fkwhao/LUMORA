from collections.abc import Iterable, Mapping
from typing import Any

from app.dto.response.chat_completion_response import TokenUsageResponse


def empty_token_usage() -> TokenUsageResponse:
    return TokenUsageResponse()


def parse_chat_usage(usage: Mapping[str, Any]) -> TokenUsageResponse:
    prompt_tokens = _integer(usage.get("prompt_tokens"))
    completion_tokens = _integer(usage.get("completion_tokens"))
    prompt_details = _mapping(
        usage.get("prompt_tokens_details") or usage.get("input_tokens_details")
    )
    completion_details = _mapping(
        usage.get("completion_tokens_details") or usage.get("output_tokens_details")
    )
    cache_read_tokens = _first_integer(
        prompt_details,
        "cached_tokens",
        "cache_read_tokens",
        "cache_read_input_tokens",
    ) or _first_integer(
        usage,
        "cache_read_tokens",
        "cache_read_input_tokens",
        "input_cache_read",
    )
    cache_write_tokens = _first_integer(
        prompt_details,
        "cache_write_tokens",
        "cache_creation_input_tokens",
    ) or _first_integer(
        usage,
        "cache_write_tokens",
        "cache_creation_input_tokens",
        "input_cache_write",
    )
    reasoning_tokens = _first_integer(
        completion_details,
        "reasoning_tokens",
    ) or _first_integer(usage, "reasoning_tokens")
    cache_metrics_available = any(
        key in usage
        for key in (
            "prompt_tokens_details",
            "input_tokens_details",
            "cache_read_tokens",
            "cache_read_input_tokens",
            "cache_write_tokens",
            "cache_creation_input_tokens",
            "input_cache_read",
            "input_cache_write",
        )
    )
    prompt_details_include_cache = any(
        key in prompt_details
        for key in (
            "cached_tokens",
            "cache_read_tokens",
            "cache_write_tokens",
        )
    )
    normalized_prompt_tokens = prompt_tokens if prompt_details_include_cache else (
        prompt_tokens + cache_read_tokens + cache_write_tokens
    )
    return build_token_usage(
        prompt_tokens=normalized_prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=_integer(usage.get("total_tokens")),
        reasoning_tokens=reasoning_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_write_tokens=cache_write_tokens,
        cache_metrics_available=cache_metrics_available,
        input_tokens=prompt_tokens if not prompt_details_include_cache else None,
    )


def parse_responses_usage(usage: Mapping[str, Any]) -> TokenUsageResponse:
    prompt_tokens = _integer(usage.get("input_tokens"))
    completion_tokens = _integer(usage.get("output_tokens"))
    input_details = _mapping(usage.get("input_tokens_details"))
    output_details = _mapping(usage.get("output_tokens_details"))
    cache_read_tokens = _first_integer(
        input_details,
        "cached_tokens",
        "cache_read_tokens",
    )
    cache_write_tokens = _first_integer(
        input_details,
        "cache_write_tokens",
        "cache_creation_input_tokens",
    )
    reasoning_tokens = _first_integer(output_details, "reasoning_tokens")
    return build_token_usage(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=_integer(usage.get("total_tokens")),
        reasoning_tokens=reasoning_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_write_tokens=cache_write_tokens,
        cache_metrics_available="input_tokens_details" in usage,
    )


def parse_anthropic_usage(usage: Mapping[str, Any]) -> TokenUsageResponse:
    input_tokens = _integer(usage.get("input_tokens"))
    completion_tokens = _integer(usage.get("output_tokens"))
    cache_read_tokens = _first_integer(
        usage,
        "cache_read_input_tokens",
        "cache_read_tokens",
    )
    cache_write_tokens = _first_integer(
        usage,
        "cache_creation_input_tokens",
        "cache_write_tokens",
    )
    reasoning_tokens = _first_integer(usage, "reasoning_tokens")
    prompt_tokens = input_tokens + cache_read_tokens + cache_write_tokens
    return build_token_usage(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=prompt_tokens + completion_tokens,
        reasoning_tokens=reasoning_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_write_tokens=cache_write_tokens,
        cache_metrics_available=any(
            key in usage
            for key in (
                "cache_read_input_tokens",
                "cache_read_tokens",
                "cache_creation_input_tokens",
                "cache_write_tokens",
            )
        ),
        input_tokens=input_tokens,
    )


def build_token_usage(
    *,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int = 0,
    reasoning_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    cache_metrics_available: bool = False,
    input_tokens: int | None = None,
) -> TokenUsageResponse:
    prompt = max(0, prompt_tokens)
    completion = max(0, completion_tokens)
    reasoning = min(completion, max(0, reasoning_tokens))
    cache_read = max(0, cache_read_tokens)
    cache_write = max(0, cache_write_tokens)
    uncached_input = (
        max(0, input_tokens)
        if input_tokens is not None
        else max(0, prompt - cache_read - cache_write)
    )
    output = max(0, completion - reasoning)
    resolved_total = max(0, total_tokens) or prompt + completion
    return TokenUsageResponse(
        promptTokens=prompt,
        completionTokens=completion,
        totalTokens=resolved_total,
        inputTokens=uncached_input,
        outputTokens=output,
        reasoningTokens=reasoning,
        cacheReadTokens=cache_read,
        cacheWriteTokens=cache_write,
        cacheMetricsAvailable=cache_metrics_available,
    )


def add_token_usage(usages: Iterable[TokenUsageResponse]) -> TokenUsageResponse:
    values = list(usages)
    return TokenUsageResponse(
        promptTokens=sum(value.prompt_tokens for value in values),
        completionTokens=sum(value.completion_tokens for value in values),
        totalTokens=sum(value.total_tokens for value in values),
        inputTokens=sum(value.input_tokens for value in values),
        outputTokens=sum(value.output_tokens for value in values),
        reasoningTokens=sum(value.reasoning_tokens for value in values),
        cacheReadTokens=sum(value.cache_read_tokens for value in values),
        cacheWriteTokens=sum(value.cache_write_tokens for value in values),
        cacheMetricsAvailable=any(
            value.cache_metrics_available for value in values
        ),
    )


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _first_integer(source: Mapping[str, Any], *keys: str) -> int:
    for key in keys:
        if key in source:
            return _integer(source.get(key))
    return 0


def _integer(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0
