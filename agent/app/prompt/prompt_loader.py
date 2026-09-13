import re
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar

from app.prompt.core_prompt_rules import (
    DEFAULT_CORE_PROMPT_RULE_REGISTRY,
    CorePromptRuleRegistry,
)
from app.prompt.prompt_errors import PromptConfigurationError
from app.prompt.prompt_metadata import PromptBinding


@dataclass(frozen=True, slots=True)
class PromptTemplateSection:
    file_name: str
    content: str
    binding: PromptBinding
    conflict_key: str | None
    segment_id: str | None = None
    source_ref: str | None = None


class PromptLoader:
    """按固定顺序加载 LUMORA 自有的静态 Prompt 片段。"""

    _SECTION_FILES = (
        "00_identity.md",
        "10_collaboration.md",
        "20_execution.md",
        "30_tools_and_safety.md",
        "40_response.md",
    )
    _SECTION_BINDINGS: ClassVar[dict[str, PromptBinding]] = {
        "00_identity.md": PromptBinding.HARD,
        "10_collaboration.md": PromptBinding.DEFAULT,
        "20_execution.md": PromptBinding.DEFAULT,
        "30_tools_and_safety.md": PromptBinding.HARD,
        "40_response.md": PromptBinding.DEFAULT,
    }
    _RULE_START_MARKER: ClassVar[re.Pattern[str]] = re.compile(
        r"^[ \t]*<!--[ \t]*lumora-rule-start:[ \t]*"
        r"([A-Za-z0-9._:-]+)[ \t]*-->[ \t]*$",
        re.MULTILINE,
    )
    _RULE_END_MARKER: ClassVar[re.Pattern[str]] = re.compile(
        r"^[ \t]*<!--[ \t]*lumora-rule-end[ \t]*-->[ \t]*$",
        re.MULTILINE,
    )
    _SPECIALIZED_FILES: ClassVar[dict[str, str]] = {
        "agent_history_compaction": "agent_history_compaction_system.md",
        "approval_reviewer": "approval_reviewer.md",
        "context_compaction_request": "context_compaction_request.md",
        "context_compaction_system": "context_compaction_system.md",
        "memory_extraction": "memory_extraction.md",
    }

    def __init__(
        self,
        template_directory: Path | None = None,
        rule_registry: CorePromptRuleRegistry | None = None,
    ) -> None:
        self._template_directory = (
            template_directory
            if template_directory is not None
            else Path(__file__).resolve().parent / "templates"
        )
        self._rule_registry = rule_registry or DEFAULT_CORE_PROMPT_RULE_REGISTRY
        self._cached_sections: tuple[str, ...] | None = None
        self._cached_template_sections: tuple[PromptTemplateSection, ...] | None = None

    @property
    def rule_registry(self) -> CorePromptRuleRegistry:
        return self._rule_registry

    def load_static_sections(self) -> tuple[str, ...]:
        """读取并缓存静态片段，避免每次模型请求都访问磁盘。"""
        if self._cached_sections is not None:
            return self._cached_sections
        sections = self.load_static_sections_with_metadata()
        self._cached_sections = tuple(
            "\n\n".join(
                section.content
                for section in sections
                if section.file_name == file_name
            )
            for file_name in self._SECTION_FILES
        )
        return self._cached_sections

    def load_static_sections_with_metadata(
        self,
    ) -> tuple[PromptTemplateSection, ...]:
        """读取静态片段，并附加稳定的策略元数据。"""
        if self._cached_template_sections is not None:
            return self._cached_template_sections

        sections: list[PromptTemplateSection] = []
        seen_conflict_keys: set[str] = set()
        for file_name in self._SECTION_FILES:
            path = self._template_directory / file_name
            try:
                content = path.read_text(encoding="utf-8").strip()
            except (OSError, UnicodeError) as error:
                raise PromptConfigurationError(
                    f"System Prompt 片段无法读取：{file_name}"
                ) from error
            if not content:
                raise PromptConfigurationError(
                    f"System Prompt 片段不能为空：{file_name}"
                )
            sections.extend(self._split_template_sections(
                file_name,
                content,
                self._SECTION_BINDINGS[file_name],
                seen_conflict_keys,
            ))
        self._rule_registry.validate_template_completeness(seen_conflict_keys)
        self._cached_template_sections = tuple(sections)
        self._cached_sections = tuple(
            "\n\n".join(
                section.content
                for section in sections
                if section.file_name == file_name
            )
            for file_name in self._SECTION_FILES
        )
        return self._cached_template_sections

    def _split_template_sections(
        self,
        file_name: str,
        content: str,
        binding: PromptBinding,
        seen_conflict_keys: set[str],
    ) -> tuple[PromptTemplateSection, ...]:
        """只拆分明确标记且受控的模板规则。"""
        markers = [
            (marker, "start")
            for marker in self._RULE_START_MARKER.finditer(content)
        ] + [
            (marker, "end")
            for marker in self._RULE_END_MARKER.finditer(content)
        ]
        markers.sort(key=lambda item: item[0].start())
        if not markers:
            return (PromptTemplateSection(
                file_name=file_name,
                content=content,
                binding=binding,
                conflict_key=None,
                segment_id=file_name,
                source_ref=file_name,
            ),)

        result: list[PromptTemplateSection] = []
        cursor = 0
        open_marker: re.Match[str] | None = None
        base_index = 0
        for marker, marker_kind in markers:
            if open_marker is None:
                base = content[cursor:marker.start()].strip()
                if base:
                    result.append(PromptTemplateSection(
                        file_name=file_name,
                        content=base,
                        binding=binding,
                        conflict_key=None,
                        segment_id=(
                            f"{file_name}#base"
                            if base_index == 0
                            else f"{file_name}#base-{base_index}"
                        ),
                        source_ref=file_name,
                    ))
                    base_index += 1
                if marker_kind == "end":
                    raise PromptConfigurationError(
                        f"System Prompt 出现未匹配的 rule-end marker：{file_name}"
                    )
                open_marker = marker
                continue

            if marker_kind == "start":
                raise PromptConfigurationError(
                    f"System Prompt 原子规则缺少 rule-end marker：{file_name}"
                )
            conflict_key = open_marker.group(1)
            if conflict_key in seen_conflict_keys:
                raise PromptConfigurationError(
                    f"System Prompt 规则 conflictKey 重复：{conflict_key}"
                )
            rule = self._rule_registry.validate_template_marker(
                file_name,
                conflict_key,
            )
            rule_content = content[open_marker.end():marker.start()].strip()
            if not rule_content:
                raise PromptConfigurationError(
                    f"System Prompt 原子规则不能为空：{conflict_key}"
                )
            seen_conflict_keys.add(conflict_key)
            result.append(PromptTemplateSection(
                file_name=file_name,
                content=rule_content,
                binding=rule.binding,
                conflict_key=conflict_key,
                segment_id=f"{file_name}#{conflict_key}",
                source_ref=rule.source_ref,
            ))
            cursor = marker.end()
            open_marker = None

        if open_marker is not None:
            raise PromptConfigurationError(
                f"System Prompt 原子规则缺少 rule-end marker：{file_name}"
            )
        trailing = content[cursor:].strip()
        if trailing:
            result.append(PromptTemplateSection(
                file_name=file_name,
                content=trailing,
                binding=binding,
                conflict_key=None,
                segment_id=(
                    f"{file_name}#base"
                    if base_index == 0
                    else f"{file_name}#base-{base_index}"
                ),
                source_ref=file_name,
            ))
        return tuple(result)

    def load_specialized(self, name: str) -> str:
        """加载受控的专用 Prompt，调用方不能传入任意文件路径。"""
        try:
            file_name = self._SPECIALIZED_FILES[name]
        except KeyError as error:
            raise ValueError(f"未知专用 Prompt：{name}") from error
        try:
            content = (self._template_directory / file_name).read_text(
                encoding="utf-8"
            ).strip()
        except (OSError, UnicodeError) as error:
            raise PromptConfigurationError(
                f"专用 Prompt 无法读取：{file_name}"
            ) from error
        if not content:
            raise PromptConfigurationError(f"专用 Prompt 不能为空：{file_name}")
        return content
