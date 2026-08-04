from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

from app.permission.model import (
    PermissionDecision,
    PermissionPolicy,
    PermissionRule,
)
from app.tool.base import Tool, ToolCategory, ToolInput

_CONFIG_DIRECTORY = ".lumora"
_CONFIG_NAME = "permissions.yaml"
_LOCAL_CONFIG_NAME = "permissions.local.yaml"
_MAX_CONFIG_BYTES = 256_000


class PermissionConfigStore:
    """Loads layered rules and persists project-local 'always allow' grants."""

    def __init__(self, user_home: Path | None = None) -> None:
        self._user_home = (user_home or Path.home()).expanduser().resolve()

    def load_policy(
        self,
        workspace_path: Path,
        base_policy: PermissionPolicy,
    ) -> PermissionPolicy:
        workspace = workspace_path.resolve()
        layered_rules = (
            *self._read_rules(
                self._user_home / _CONFIG_DIRECTORY / _CONFIG_NAME,
                "user",
            ),
            *self._read_rules(
                workspace / _CONFIG_DIRECTORY / _CONFIG_NAME,
                "project",
            ),
            *self._read_rules(
                workspace / _CONFIG_DIRECTORY / _LOCAL_CONFIG_NAME,
                "local",
            ),
            *(
                PermissionRule(
                    tool=rule.tool,
                    pattern=rule.pattern,
                    decision=rule.decision,
                    source="session",
                    order=index,
                )
                for index, rule in enumerate(base_policy.rules)
            ),
        )
        return PermissionPolicy(mode=base_policy.mode, rules=layered_rules)

    def add_local_allow(
        self,
        workspace_path: Path,
        tool: Tool,
        input_data: ToolInput,
    ) -> PermissionRule:
        workspace = workspace_path.resolve()
        config_directory = workspace / _CONFIG_DIRECTORY
        if config_directory.exists() and config_directory.resolve() != config_directory:
            raise ValueError("本地权限配置目录不能是符号链接")
        config_directory.mkdir(parents=True, exist_ok=True)
        config_path = config_directory / _LOCAL_CONFIG_NAME
        if config_path.is_symlink():
            raise ValueError("本地权限配置文件不能是符号链接")

        existing = list(self._read_rules(config_path, "local"))
        pattern = self._input_pattern(tool, input_data)
        rule = PermissionRule(
            tool="Bash" if tool.category is ToolCategory.SHELL else tool.name,
            pattern=pattern,
            decision=PermissionDecision.ALLOW,
            source="local",
            order=len(existing),
        )
        existing.append(rule)
        payload = {
            "version": 1,
            "rules": [
                {
                    "tool": item.tool,
                    "pattern": item.pattern,
                    "decision": item.decision.value,
                }
                for item in existing
            ],
        }
        self._atomic_yaml_write(config_path, payload)
        self._ensure_local_ignore(config_directory)
        return rule

    @staticmethod
    def _input_pattern(tool: Tool, input_data: ToolInput) -> str:
        if tool.category is ToolCategory.SHELL:
            return str(input_data.get("command") or "")
        return str(input_data.get("path") or input_data.get("pattern") or "*")

    @staticmethod
    def _read_rules(path: Path, source: str) -> tuple[PermissionRule, ...]:
        if not path.exists():
            return ()
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"权限配置必须是普通文件：{path}")
        if path.stat().st_size > _MAX_CONFIG_BYTES:
            raise ValueError(f"权限配置文件过大：{path}")
        payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if not isinstance(payload, dict) or payload.get("version", 1) != 1:
            raise ValueError(f"权限配置格式或版本无效：{path}")
        raw_rules = payload.get("rules", [])
        if not isinstance(raw_rules, list):
            raise TypeError(f"权限配置 rules 必须是数组：{path}")
        rules: list[PermissionRule] = []
        for index, raw_rule in enumerate(raw_rules):
            if not isinstance(raw_rule, dict):
                raise TypeError(f"权限规则必须是对象：{path}#{index + 1}")
            tool = raw_rule.get("tool")
            pattern = raw_rule.get("pattern", "*")
            decision = raw_rule.get("decision", "ask")
            if not isinstance(tool, str) or not tool.strip():
                raise ValueError(f"权限规则缺少工具名：{path}#{index + 1}")
            if not isinstance(pattern, str) or not pattern:
                raise ValueError(f"权限规则 pattern 无效：{path}#{index + 1}")
            try:
                parsed_decision = PermissionDecision(str(decision))
            except ValueError as error:
                raise ValueError(
                    f"权限规则 decision 无效：{path}#{index + 1}"
                ) from error
            rules.append(
                PermissionRule(
                    tool=tool.strip(),
                    pattern=pattern,
                    decision=parsed_decision,
                    source=source,
                    order=index,
                )
            )
        return tuple(rules)

    @staticmethod
    def _atomic_yaml_write(path: Path, payload: dict[str, Any]) -> None:
        temporary = path.with_name(f".{path.name}.lumora-tmp")
        text = yaml.safe_dump(
            payload,
            allow_unicode=True,
            sort_keys=False,
        )
        with temporary.open("w", encoding="utf-8", newline="\n") as file:
            file.write(text)
            file.flush()
            os.fsync(file.fileno())
        temporary.replace(path)

    @staticmethod
    def _ensure_local_ignore(config_directory: Path) -> None:
        ignore_path = config_directory / ".gitignore"
        entry = f"/{_LOCAL_CONFIG_NAME}"
        existing = (
            ignore_path.read_text(encoding="utf-8").splitlines()
            if ignore_path.is_file()
            else []
        )
        if entry in existing:
            return
        updated = [*existing, entry]
        ignore_path.write_text("\n".join(updated) + "\n", encoding="utf-8")
