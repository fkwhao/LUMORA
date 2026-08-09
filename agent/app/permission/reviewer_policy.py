from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

_CONFIG_DIRECTORY = ".lumora"
_POLICY_NAME = "approval-reviewer.md"
_LOCAL_POLICY_NAME = "approval-reviewer.local.md"
_MAX_POLICY_BYTES = 64_000


@dataclass(frozen=True, slots=True)
class ApprovalReviewerPolicy:
    user: str = ""
    project: str = ""
    local: str = ""

    def render(self) -> str:
        sections = (
            ("User policy", self.user),
            ("Project policy", self.project),
            ("Local project policy", self.local),
        )
        rendered = [
            f"## {title}\n{content.strip()}"
            for title, content in sections
            if content.strip()
        ]
        return "\n\n".join(rendered) or "No custom approval policy is configured."


class ApprovalReviewerPolicyStore:
    """Load user-authored reviewer guidance without executing it."""

    def __init__(self, user_home: Path | None = None) -> None:
        self._user_home = (user_home or Path.home()).expanduser().resolve()

    def load(self, workspace_path: Path) -> ApprovalReviewerPolicy:
        workspace = workspace_path.resolve()
        return ApprovalReviewerPolicy(
            user=self._read(self._user_home / _CONFIG_DIRECTORY / _POLICY_NAME),
            project=self._read(workspace / _CONFIG_DIRECTORY / _POLICY_NAME),
            local=self._read(
                workspace / _CONFIG_DIRECTORY / _LOCAL_POLICY_NAME,
            ),
        )

    @staticmethod
    def _read(path: Path) -> str:
        if not path.exists():
            return ""
        if not path.is_file() or path.is_symlink() or path.parent.is_symlink():
            raise ValueError(f"Approval reviewer policy must be a regular file: {path}")
        if path.stat().st_size > _MAX_POLICY_BYTES:
            raise ValueError(f"Approval reviewer policy is too large: {path}")
        return path.read_text(encoding="utf-8")
