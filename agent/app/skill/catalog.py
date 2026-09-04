from __future__ import annotations

import json
import re
from dataclasses import dataclass
from itertools import islice
from pathlib import Path
from typing import Any, Literal

import yaml

SkillSource = Literal["project", "user", "builtin"]
_NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_MAX_SKILL_BYTES = 256 * 1024
_MAX_RESOURCE_BYTES = 1024 * 1024
_MAX_RESOURCE_COUNT = 256
_MAX_RESOURCE_SCAN_ENTRIES = 4_096


@dataclass(frozen=True, slots=True)
class SkillSummary:
    name: str
    description: str
    source: SkillSource
    mode: Literal["inline", "fork"] = "inline"
    context: Literal["full", "recent", "none"] = "full"
    model: str | None = None


@dataclass(frozen=True, slots=True)
class SkillDefinition:
    summary: SkillSummary
    instructions: str
    directory: Path
    resources: tuple[str, ...] = ()


class SkillCatalog:
    """Discover Skill metadata cheaply and load the SOP only when requested."""

    def __init__(
        self,
        *,
        user_root: Path | None = None,
        builtin_root: Path | None = None,
        settings_path: Path | None = None,
    ) -> None:
        lumora_home = Path.home() / ".lumora"
        self._user_root = user_root or lumora_home / "skills"
        self._builtin_root = builtin_root or Path(__file__).parent / "builtin"
        self._settings_path = settings_path or lumora_home / "skill-settings.json"

    def discover(self, workspace_path: str | Path | None = None) -> tuple[SkillSummary, ...]:
        disabled = self._disabled_names()
        discovered: dict[str, SkillSummary] = {}
        roots: list[tuple[SkillSource, Path]] = [
            ("builtin", self._builtin_root),
            ("user", self._user_root),
        ]
        if workspace_path:
            roots.append(("project", Path(workspace_path) / ".lumora" / "skills"))

        # Later roots have higher priority: project > user > builtin.
        for source, root in roots:
            for file_path in self._skill_files(root):
                parsed = self._parse(file_path, source, include_body=False)
                if parsed and parsed.summary.name not in disabled:
                    discovered[parsed.summary.name] = parsed.summary
        return tuple(sorted(discovered.values(), key=lambda item: item.name))

    def load(
        self,
        name: str,
        workspace_path: str | Path | None = None,
        arguments: str = "",
    ) -> SkillDefinition | None:
        normalized = name.strip().lower()
        if not _NAME_PATTERN.fullmatch(normalized):
            return None
        if normalized in self._disabled_names():
            return None

        roots: list[tuple[SkillSource, Path]] = [
            ("builtin", self._builtin_root),
            ("user", self._user_root),
        ]
        if workspace_path:
            roots.append(("project", Path(workspace_path) / ".lumora" / "skills"))
        match: SkillDefinition | None = None
        for source, root in roots:
            for file_path in self._skill_files(root):
                parsed = self._parse(file_path, source, include_body=True)
                if parsed and parsed.summary.name == normalized:
                    match = parsed
        if match is None:
            return None
        return SkillDefinition(
            summary=match.summary,
            instructions=match.instructions.replace("$ARGUMENTS", arguments.strip()),
            directory=match.directory,
            resources=match.resources,
        )

    def _disabled_names(self) -> set[str]:
        try:
            raw = json.loads(self._settings_path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return set()
        values = raw.get("disabled", []) if isinstance(raw, dict) else []
        return {
            value for value in values
            if isinstance(value, str) and _NAME_PATTERN.fullmatch(value)
        }

    @staticmethod
    def _skill_files(root: Path) -> tuple[Path, ...]:
        try:
            resolved_root = root.expanduser().resolve(strict=True)
        except OSError:
            return ()
        candidates = [*resolved_root.glob("*.md"), *resolved_root.glob("*/SKILL.md")]
        safe: list[Path] = []
        for candidate in candidates:
            try:
                resolved = candidate.resolve(strict=True)
                resolved.relative_to(resolved_root)
                if resolved.is_file() and resolved.stat().st_size <= _MAX_SKILL_BYTES:
                    safe.append(resolved)
            except (OSError, ValueError):
                continue
        return tuple(sorted(safe))

    @staticmethod
    def _parse(
        file_path: Path,
        source: SkillSource,
        *,
        include_body: bool,
    ) -> SkillDefinition | None:
        try:
            text = file_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            return None
        if not text.startswith("---"):
            return None
        match = re.match(r"^---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)(.*)$", text, re.DOTALL)
        if not match:
            return None
        try:
            metadata: Any = yaml.safe_load(match.group(1)) or {}
        except yaml.YAMLError:
            return None
        if not isinstance(metadata, dict):
            return None
        name = str(metadata.get("name", "")).strip().lower()
        description = " ".join(str(metadata.get("description", "")).split())[:500]
        mode = str(metadata.get("mode", "inline")).strip().lower()
        context = str(metadata.get("context", "full")).strip().lower()
        model = str(metadata.get("model", "")).strip() or None
        if not _NAME_PATTERN.fullmatch(name) or not description:
            return None
        if mode not in {"inline", "fork"} or context not in {"full", "recent", "none"}:
            return None
        directory = file_path.parent
        resources: tuple[str, ...] = ()
        if include_body and file_path.name == "SKILL.md":
            try:
                discovered_resources: list[str] = []
                for path in islice(
                    directory.rglob("*"),
                    _MAX_RESOURCE_SCAN_ENTRIES,
                ):
                    if len(discovered_resources) >= _MAX_RESOURCE_COUNT:
                        break
                    if (
                        path == file_path
                        or path.is_symlink()
                        or not path.is_file()
                        or path.stat().st_size > _MAX_RESOURCE_BYTES
                    ):
                        continue
                    discovered_resources.append(
                        str(path.relative_to(directory)).replace("\\", "/")
                    )
                resources = tuple(sorted(discovered_resources))
            except OSError:
                resources = ()
        return SkillDefinition(
            summary=SkillSummary(
                name=name,
                description=description,
                source=source,
                mode=mode,  # type: ignore[arg-type]
                context=context,  # type: ignore[arg-type]
                model=model,
            ),
            instructions=match.group(2).strip() if include_body else "",
            directory=directory,
            resources=resources,
        )

    def read_resource(
        self,
        name: str,
        resource_path: str,
        workspace_path: str | Path | None = None,
    ) -> str | None:
        definition = self.load(name, workspace_path)
        if definition is None or not resource_path.strip():
            return None
        try:
            root = definition.directory.resolve(strict=True)
            target = (root / resource_path).resolve(strict=True)
            target.relative_to(root)
            relative_path = str(target.relative_to(root)).replace("\\", "/")
            if (
                relative_path not in definition.resources
                or not target.is_file()
                or target.is_symlink()
                or target.name == "SKILL.md"
                or target.stat().st_size > _MAX_RESOURCE_BYTES
            ):
                return None
            return target.read_text(encoding="utf-8")
        except (OSError, UnicodeError, ValueError):
            return None
