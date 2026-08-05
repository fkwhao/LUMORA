import json
from typing import Any


class TokenEstimator:
    """未知 OpenAI Compatible 模型的保守本地估算器。"""

    def estimate_text(self, content: str) -> int:
        if not content:
            return 0
        return max(1, (len(content.encode("utf-8")) + 3) // 4)

    def estimate_messages(self, messages: list[dict[str, Any]]) -> int:
        return sum(
            4 + self.estimate_text(json.dumps(message, ensure_ascii=False))
            for message in messages
        )

    def estimate_tools(self, tools: tuple[dict[str, Any], ...]) -> int:
        return self.estimate_text(json.dumps(tools, ensure_ascii=False))

    def estimate_hybrid(
        self,
        server_prompt_tokens: int,
        pending_messages: list[dict[str, Any]],
        fallback_messages: list[dict[str, Any]],
        tools: tuple[dict[str, Any], ...] = (),
    ) -> int:
        """Use provider usage as the anchor and estimate only unsampled additions.

        Some OpenAI-compatible providers omit usage. In that case the complete
        model-visible request remains the conservative fallback.
        """
        if server_prompt_tokens > 0:
            return server_prompt_tokens + self.estimate_messages(pending_messages)
        return self.estimate_messages(fallback_messages) + self.estimate_tools(tools)
