from dataclasses import dataclass

from app.context.estimator import TokenEstimator
from app.dto.request.chat_completion_request import ChatMessageRequest
from app.model.model_connection_settings import ModelConnectionSettings
from app.prompt.prompt_assembly import PromptAssembly

RECENT_RAW_TOKENS = 10_000
MIN_RECENT_MESSAGES = 5
MIN_GROWTH_RESERVE = 4_000
MAX_GROWTH_RESERVE = 20_000
MIN_SUMMARY_OUTPUT = 4_000
MAX_SUMMARY_OUTPUT = 20_000


@dataclass(frozen=True, slots=True)
class ContextPlan:
    messages: list[ChatMessageRequest]
    summary: str | None
    compacted: bool
    before_tokens: int
    after_tokens: int
    through_sequence: int | None
    retained_from_sequence: int | None


class ContextPlanner:
    def __init__(self, estimator: TokenEstimator | None = None) -> None:
        self._estimator = estimator or TokenEstimator()

    def should_compact(
        self,
        settings: ModelConnectionSettings,
        prompt: PromptAssembly,
        messages: list[ChatMessageRequest],
    ) -> tuple[bool, int, int]:
        rendered = [
            *prompt.system_messages,
            *prompt.context_messages,
            *[
                {"role": message.role, "content": message.content}
                for message in messages
            ],
        ]
        before_tokens = (
            self._estimator.estimate_messages(rendered)
            + self._estimator.estimate_tools(prompt.tools)
        )
        threshold = self.compaction_threshold(settings, before_tokens)
        return before_tokens >= threshold, before_tokens, threshold

    @staticmethod
    def compaction_threshold(
        settings: ModelConnectionSettings,
        estimated_tokens: int,
    ) -> int:
        context_window = settings.context_window or 128_000
        normal_output = settings.max_output_tokens or min(8_000, context_window // 8)
        summary_output = min(
            MAX_SUMMARY_OUTPUT,
            max(MIN_SUMMARY_OUTPUT, context_window // 10),
        )
        growth_reserve = min(
            MAX_GROWTH_RESERVE,
            max(MIN_GROWTH_RESERVE, context_window // 16),
        )
        estimation_reserve = max(1_024, estimated_tokens // 20)
        threshold = min(
            context_window - normal_output - growth_reserve - estimation_reserve,
            context_window - summary_output - estimation_reserve,
        )
        return max(1, threshold)

    def should_compact_tokens(
        self,
        settings: ModelConnectionSettings,
        active_tokens: int,
    ) -> tuple[bool, int]:
        threshold = self.compaction_threshold(settings, active_tokens)
        return active_tokens >= threshold, threshold

    def split_rendered_for_compaction(
        self,
        messages: list[dict],
    ) -> tuple[list[dict], list[dict]]:
        """Split model messages without orphaning assistant tool-call groups."""
        if len(messages) <= MIN_RECENT_MESSAGES:
            return [], list(messages)
        groups: list[list[dict]] = []
        for message in messages:
            if message.get("role") == "tool" and groups:
                groups[-1].append(message)
            else:
                groups.append([message])
        retained_groups: list[list[dict]] = []
        retained_tokens = 0
        for group in reversed(groups):
            group_tokens = self._estimator.estimate_messages(group)
            retained_count = sum(len(item) for item in retained_groups)
            if (
                retained_count >= MIN_RECENT_MESSAGES
                and retained_tokens + group_tokens > RECENT_RAW_TOKENS
            ):
                break
            retained_groups.append(group)
            retained_tokens += group_tokens
        retained_groups.reverse()
        retained = [message for group in retained_groups for message in group]
        return messages[: len(messages) - len(retained)], retained

    def split_for_compaction(
        self,
        messages: list[ChatMessageRequest],
        *,
        force: bool = False,
    ) -> tuple[list[ChatMessageRequest], list[ChatMessageRequest]]:
        if len(messages) <= MIN_RECENT_MESSAGES:
            return [], list(messages)
        if force:
            return (
                messages[:-MIN_RECENT_MESSAGES],
                messages[-MIN_RECENT_MESSAGES:],
            )
        retained: list[ChatMessageRequest] = []
        retained_tokens = 0
        for message in reversed(messages):
            tokens = self._estimator.estimate_text(message.content) + 4
            if (
                len(retained) >= MIN_RECENT_MESSAGES
                and retained_tokens + tokens > RECENT_RAW_TOKENS
            ):
                break
            retained.append(message)
            retained_tokens += tokens
        retained.reverse()
        compacted_count = len(messages) - len(retained)
        return messages[:compacted_count], retained

    def completed_plan(
        self,
        prompt: PromptAssembly,
        original: list[ChatMessageRequest],
        retained: list[ChatMessageRequest],
        summary: str,
        before_tokens: int,
    ) -> ContextPlan:
        rendered = [
            *prompt.system_messages,
            {"role": "user", "content": summary},
            *[
                {"role": message.role, "content": message.content}
                for message in retained
            ],
        ]
        through_sequence = next(
            (
                message.sequence
                for message in reversed(original[: len(original) - len(retained)])
                if message.sequence is not None
            ),
            None,
        )
        retained_from = next(
            (message.sequence for message in retained if message.sequence is not None),
            None,
        )
        return ContextPlan(
            messages=retained,
            summary=summary,
            compacted=True,
            before_tokens=before_tokens,
            after_tokens=self._estimator.estimate_messages(rendered),
            through_sequence=through_sequence,
            retained_from_sequence=retained_from,
        )
