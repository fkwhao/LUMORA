import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.prompt.core_prompt_rules import (
    DEFAULT_CORE_PROMPT_RULE_REGISTRY,
    CorePromptRuleRegistry,
)
from app.prompt.prompt_errors import PromptConfigurationError
from app.prompt.prompt_metadata import (
    PromptAuthority,
    PromptBinding,
    PromptKind,
    PromptSource,
)
from app.prompt.prompt_segment import (
    PromptCachePolicy,
    PromptPriority,
    PromptSegment,
    PromptTarget,
    PromptTrustLevel,
)


@dataclass(frozen=True, slots=True)
class _ProjectPromptPolicy:
    managed_sources: frozenset[str]
    rules: tuple[dict[str, str], ...]


class _UniqueKeySafeLoader(yaml.SafeLoader):
    """拒绝重复映射键的安全 YAML 加载器。"""


def _construct_unique_mapping(
    loader: yaml.SafeLoader,
    node: yaml.nodes.MappingNode,
    deep: bool = False,
) -> dict[Any, Any]:
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                f"found duplicate key ({key})",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_UniqueKeySafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


def _reject_duplicate_json_keys(
    pairs: list[tuple[str, object]],
) -> dict[str, object]:
    mapping: dict[str, object] = {}
    for key, value in pairs:
        if key in mapping:
            raise PromptConfigurationError(
                f"项目 Prompt 策略包含重复字段：{key}"
            )
        mapping[key] = value
    return mapping


class ProjectInstructionLoader:
    """从工作区读取可信静态规则，不把它们写入动态 Memory。"""

    _RELATIVE_PATHS = (
        Path("AGENTS.md"),
        Path("CLAUDE.md"),
        Path(".lumora") / "AGENTS.md",
        Path(".lumora") / "CLAUDE.md",
    )
    _MAX_FILE_CHARACTERS = 32_000
    _MAX_TOTAL_CHARACTERS = 64_000
    _POLICY_FILES = (
        Path(".lumora") / "prompt-policy.yaml",
        Path(".lumora") / "prompt-policy.json",
    )
    _MAX_POLICY_CHARACTERS = 32_000

    def __init__(
        self,
        rule_registry: CorePromptRuleRegistry | None = None,
    ) -> None:
        self._rule_registry = rule_registry or DEFAULT_CORE_PROMPT_RULE_REGISTRY

    def load(self, workspace_path: str | None) -> tuple[str, ...]:
        return tuple(
            segment.content
            for segment in self.load_segments(workspace_path)
            if isinstance(segment.content, str)
        )

    def load_segments(self, workspace_path: str | None) -> tuple[PromptSegment, ...]:
        """读取项目规则，并保留其本地来源信息。"""
        if not workspace_path:
            return ()
        try:
            workspace = Path(workspace_path).expanduser().resolve(strict=True)
        except (OSError, RuntimeError, TypeError) as error:
            raise PromptConfigurationError("工作区路径无效") from error
        if not workspace.is_dir():
            raise PromptConfigurationError("工作区路径不是目录")
        instructions: list[PromptSegment] = []
        policy = self._load_policy(workspace)
        injected_raw_contents: dict[str, str] = {}
        used = 0
        for relative in self._RELATIVE_PATHS:
            source_ref = relative.as_posix()
            path = (workspace / relative).resolve()
            if not path.is_relative_to(workspace) or not path.is_file():
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except (OSError, UnicodeError) as error:
                raise PromptConfigurationError(
                    f"项目指令文件无法读取：{relative.as_posix()}"
                ) from error
            if not content.strip():
                continue
            if source_ref in policy.managed_sources:
                continue
            remaining = self._MAX_TOTAL_CHARACTERS - used
            if remaining <= 0:
                break
            bounded = content[: min(self._MAX_FILE_CHARACTERS, remaining)]
            instructions.append(PromptSegment(
                key=f"project.file.{relative.as_posix()}",
                target=PromptTarget.SYSTEM,
                content=f"## {relative.as_posix()}\n{bounded.strip()}",
                trust_level=PromptTrustLevel.TRUSTED,
                priority=PromptPriority.REQUIRED,
                cache_policy=PromptCachePolicy.TASK,
                source=PromptSource.WORKSPACE_FILE,
                authority=PromptAuthority.PROJECT,
                binding=PromptBinding.REQUIRED,
                kind=PromptKind.INSTRUCTION,
                scope=self._scope("workspace", workspace),
                source_ref=source_ref,
                conflict_key=None,
            ))
            injected_raw_contents[source_ref] = bounded
            used += len(bounded)
        for rule in policy.rules:
            source_ref = rule["sourceRef"]
            if (
                source_ref not in policy.managed_sources
                and rule["content"] in injected_raw_contents.get(source_ref, "")
            ):
                raise PromptConfigurationError(
                    "项目 Prompt 结构化规则与原始来源重复；"
                    f"请将 {source_ref} 加入 managedSources，或移除重复正文："
                    f"{rule['ruleId']}"
                )
            instructions.append(PromptSegment(
                key=f"project.policy.{rule['ruleId']}",
                target=PromptTarget.SYSTEM,
                content=rule["content"],
                trust_level=PromptTrustLevel.TRUSTED,
                priority=PromptPriority.REQUIRED,
                cache_policy=PromptCachePolicy.TASK,
                source=PromptSource.WORKSPACE_FILE,
                authority=PromptAuthority.PROJECT,
                binding=PromptBinding.REQUIRED,
                kind=PromptKind.INSTRUCTION,
                scope=self._scope(rule["scope"], workspace),
                source_ref=f"{source_ref}#{rule['ruleId']}",
                conflict_key=rule["conflictKey"],
            ))
        return tuple(instructions)

    @staticmethod
    def _scope(scope: str, workspace: Path) -> str:
        normalized = scope.strip()
        if normalized == "workspace":
            workspace_value = workspace.as_posix().rstrip("/")
            return f"workspace:{workspace_value}"
        return normalized

    def _load_policy(self, workspace: Path) -> _ProjectPromptPolicy:
        available_source_refs = {
            relative.as_posix()
            for relative in self._RELATIVE_PATHS
            if (
                (workspace / relative).resolve().is_relative_to(workspace)
                and (workspace / relative).resolve().is_file()
            )
        }
        policy_paths = tuple(
            (workspace / relative).resolve()
            for relative in self._POLICY_FILES
            if (workspace / relative).resolve().is_file()
        )
        if not policy_paths:
            return _ProjectPromptPolicy(frozenset(), ())
        if len(policy_paths) > 1:
            raise PromptConfigurationError(
                "项目 Prompt 策略不能同时存在 YAML 和旧版 JSON 文件"
            )
        path = policy_paths[0]
        if not path.is_relative_to(workspace):
            raise PromptConfigurationError("项目 Prompt 策略路径无效")
        try:
            raw = path.read_text(encoding="utf-8")
            if len(raw) > self._MAX_POLICY_CHARACTERS:
                raise PromptConfigurationError("项目 Prompt 策略文件过大")
            document = (
                yaml.load(raw, Loader=_UniqueKeySafeLoader)
                if path.suffix in {".yaml", ".yml"}
                else json.loads(
                    raw,
                    object_pairs_hook=_reject_duplicate_json_keys,
                )
            )
        except PromptConfigurationError:
            raise
        except yaml.constructor.ConstructorError as error:
            raise PromptConfigurationError(
                "项目 Prompt 策略包含重复字段或结构无效"
            ) from error
        except (OSError, UnicodeError, json.JSONDecodeError, yaml.YAMLError) as error:
            raise PromptConfigurationError("项目 Prompt 策略文件格式无效") from error
        if not isinstance(document, dict) or not isinstance(
            document.get("rules"), list
        ):
            raise PromptConfigurationError(
                "项目 Prompt 策略必须包含 rules 数组"
            )
        unknown_document_fields = tuple(sorted(
            str(field)
            for field in document
            if field not in {"rules", "managedSources"}
        ))
        if unknown_document_fields:
            raise PromptConfigurationError(
                "项目 Prompt 策略包含不允许的顶层字段："
                f"{', '.join(unknown_document_fields)}"
            )

        raw_managed_sources = document.get("managedSources", [])
        if not isinstance(raw_managed_sources, list):
            raise PromptConfigurationError(
                "项目 Prompt 策略的 managedSources 必须是数组"
            )
        managed_sources: list[str] = []
        for source_ref in raw_managed_sources:
            if not isinstance(source_ref, str) or not source_ref.strip():
                raise PromptConfigurationError(
                    "项目 Prompt 策略的 managedSources 包含无效来源"
                )
            normalized_source_ref = source_ref.strip()
            if normalized_source_ref in managed_sources:
                raise PromptConfigurationError(
                    f"项目 Prompt 策略的 managedSources 重复：{normalized_source_ref}"
                )
            if normalized_source_ref not in available_source_refs:
                raise PromptConfigurationError(
                    f"项目 Prompt 策略的 managedSources 引用了未加载的来源："
                    f"{normalized_source_ref}"
                )
            managed_sources.append(normalized_source_ref)

        metadata: list[dict[str, str]] = []
        seen_rule_ids: set[str] = set()
        seen_rule_contents: set[tuple[str, str]] = set()
        for rule in document["rules"]:
            if not isinstance(rule, dict):
                raise PromptConfigurationError(
                    "项目 Prompt 策略规则必须是对象"
                )
            if "authority" in rule or "binding" in rule:
                raise PromptConfigurationError(
                    "项目 Prompt 策略不能声明 authority 或 binding"
                )
            allowed_fields = {
                "ruleId",
                "sourceRef",
                "content",
                "conflictKey",
                "scope",
            }
            unsupported_fields = tuple(sorted(
                (str(field) for field in rule if field not in allowed_fields),
            ))
            if unsupported_fields:
                raise PromptConfigurationError(
                    "项目 Prompt 策略包含不允许的元数据字段："
                    f"{', '.join(sorted(unsupported_fields))}"
                )
            source_ref = rule.get("sourceRef")
            conflict_key = rule.get("conflictKey")
            if not isinstance(source_ref, str) or not source_ref:
                raise PromptConfigurationError("项目 Prompt 策略缺少 sourceRef")
            source_ref = source_ref.strip()
            if source_ref not in available_source_refs:
                raise PromptConfigurationError(
                    f"项目 Prompt 策略引用了未加载的来源：{source_ref}"
                )
            rule_id = rule.get("ruleId")
            if not isinstance(rule_id, str) or not rule_id.strip():
                raise PromptConfigurationError(
                    "项目 Prompt 策略缺少稳定的 ruleId"
                )
            if not isinstance(rule_id, str) or not re.fullmatch(
                r"[A-Za-z0-9._:-]+", rule_id.strip()
            ):
                raise PromptConfigurationError(
                    "项目 Prompt 策略的 ruleId 无效"
                )
            rule_id = rule_id.strip()
            if rule_id in seen_rule_ids:
                raise PromptConfigurationError(
                    f"项目 Prompt 策略的 ruleId 重复：{rule_id}"
                )
            seen_rule_ids.add(rule_id)
            if managed_sources and source_ref not in managed_sources:
                raise PromptConfigurationError(
                    "项目 Prompt 策略规则的 sourceRef 必须属于 managedSources："
                    f"{source_ref}"
                )
            if not isinstance(conflict_key, str) or not re.fullmatch(
                r"[A-Za-z0-9._:-]+", conflict_key.strip()
            ):
                raise PromptConfigurationError(
                    "项目 Prompt 策略的 conflictKey 无效"
                )
            normalized_conflict_key = self._rule_registry.validate_project_conflict_key(
                conflict_key.strip()
            )
            content = rule.get("content")
            if not isinstance(content, str) or not content.strip():
                raise PromptConfigurationError(
                    "项目 Prompt 策略规则缺少结构化 content"
                )
            if len(content) > self._MAX_FILE_CHARACTERS:
                raise PromptConfigurationError(
                    "项目 Prompt 策略规则 content 过大"
                )
            normalized_content = content.strip()
            content_identity = (source_ref, normalized_content)
            if content_identity in seen_rule_contents:
                raise PromptConfigurationError(
                    f"项目 Prompt 策略规则正文重复：{rule_id}"
                )
            seen_rule_contents.add(content_identity)
            scope = rule.get("scope", "workspace")
            if not isinstance(scope, str) or not scope.strip():
                raise PromptConfigurationError("项目 Prompt 策略的 scope 无效")
            normalized_scope = scope.strip()
            if normalized_scope != "workspace":
                raise PromptConfigurationError(
                    "项目 Prompt 策略目前只支持 scope: workspace"
                )
            metadata.append({
                "ruleId": rule_id,
                "sourceRef": source_ref,
                "content": normalized_content,
                "conflictKey": normalized_conflict_key,
                "scope": normalized_scope,
            })
        if managed_sources:
            referenced_sources = {
                rule["sourceRef"] for rule in metadata
            }
            missing_rules = tuple(
                source_ref
                for source_ref in managed_sources
                if source_ref not in referenced_sources
            )
            if missing_rules:
                raise PromptConfigurationError(
                    "managedSources 必须至少声明一条结构化规则："
                    f"{', '.join(missing_rules)}"
                )
        return _ProjectPromptPolicy(
            managed_sources=frozenset(managed_sources),
            rules=tuple(metadata),
        )
