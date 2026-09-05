from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ContextUsageSnapshot:
    """Latest settled main-request input, independent of cumulative usage.

    Compaction can replace the sample with an estimate of the retained context.
    Streaming drafts and tool-result projections are never display samples.
    """

    tokens: int
    estimated: bool = True

    def as_metadata(self) -> dict[str, Any]:
        return {
            "contextUsage": {
                "tokens": max(0, self.tokens),
                "estimated": self.estimated,
            },
        }
