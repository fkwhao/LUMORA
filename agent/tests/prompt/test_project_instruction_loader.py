import json

import pytest

from app.prompt.project_instruction_loader import ProjectInstructionLoader
from app.prompt.prompt_errors import PromptConfigurationError
from app.prompt.prompt_metadata import (
    PromptAuthority,
    PromptBinding,
    PromptSource,
)


def test_loads_supported_project_instruction_files(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("根目录规则", encoding="utf-8")
    nested = tmp_path / ".lumora"
    nested.mkdir()
    (nested / "CLAUDE.md").write_text("LUMORA 规则", encoding="utf-8")
    (tmp_path / "README.md").write_text("不应注入", encoding="utf-8")

    instructions = ProjectInstructionLoader().load(str(tmp_path))

    assert instructions == (
        "## AGENTS.md\n根目录规则",
        "## .lumora/CLAUDE.md\nLUMORA 规则",
    )


def test_load_segments_retains_workspace_file_provenance(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("根目录规则", encoding="utf-8")

    segments = ProjectInstructionLoader().load_segments(str(tmp_path))

    assert len(segments) == 1
    segment = segments[0]
    assert segment.source is PromptSource.WORKSPACE_FILE
    assert segment.authority is PromptAuthority.PROJECT
    assert segment.binding is PromptBinding.REQUIRED
    assert segment.scope == f"workspace:{tmp_path.as_posix()}"
    assert segment.source_ref == "AGENTS.md"


def test_policy_file_assigns_structured_conflict_metadata(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("执行规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.json").write_text(
        json.dumps({
            "rules": [{
                "ruleId": "project.framework",
                "sourceRef": "AGENTS.md",
                "content": "项目要求使用 unittest",
                "conflictKey": "lumora.execution.requested_change",
            }],
        }),
        encoding="utf-8",
    )

    segments = ProjectInstructionLoader().load_segments(str(tmp_path))
    segment = next(item for item in segments if item.conflict_key)

    assert segment.conflict_key == "lumora.execution.requested_change"
    assert segment.scope == f"workspace:{tmp_path.as_posix()}"
    assert segment.content == "项目要求使用 unittest"
    assert segments[0].conflict_key is None


def test_yaml_policy_file_assigns_structured_conflict_metadata(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("执行规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.yaml").write_text(
        (
            "rules:\n"
            "  - ruleId: project.framework\n"
            "    sourceRef: AGENTS.md\n"
            "    content: 项目要求使用 unittest\n"
            "    conflictKey: lumora.execution.requested_change\n"
        ),
        encoding="utf-8",
    )

    segment = next(
        item
        for item in ProjectInstructionLoader().load_segments(str(tmp_path))
        if item.conflict_key
    )

    assert segment.conflict_key == "lumora.execution.requested_change"
    assert segment.content == "项目要求使用 unittest"


def test_policy_rejects_directory_scope(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("执行规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.yaml").write_text(
        (
            "rules:\n"
            "  - ruleId: project.directory\n"
            "    sourceRef: AGENTS.md\n"
            "    content: 目录规则\n"
            "    conflictKey: project.directory\n"
            "    scope: workspace:/repo/src\n"
        ),
        encoding="utf-8",
    )

    with pytest.raises(PromptConfigurationError, match="只支持 scope: workspace"):
        ProjectInstructionLoader().load_segments(str(tmp_path))


def test_policy_rejects_unknown_core_conflict_key(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("执行规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.yaml").write_text(
        (
            "rules:\n"
            "  - ruleId: project.unknown\n"
            "    sourceRef: AGENTS.md\n"
            "    content: 项目规则\n"
            "    conflictKey: lumora.execution.unknown\n"
        ),
        encoding="utf-8",
    )

    with pytest.raises(PromptConfigurationError, match="不存在或不可覆盖"):
        ProjectInstructionLoader().load_segments(str(tmp_path))


def test_managed_source_injects_only_structured_rules(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text(
        "# 项目规则\n项目要求使用 unittest\n",
        encoding="utf-8",
    )
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.yaml").write_text(
        (
            "managedSources:\n"
            "  - AGENTS.md\n"
            "rules:\n"
            "  - ruleId: project.framework\n"
            "    sourceRef: AGENTS.md\n"
            "    content: 项目要求使用 unittest\n"
            "    conflictKey: lumora.execution.requested_change\n"
        ),
        encoding="utf-8",
    )

    segments = ProjectInstructionLoader().load_segments(str(tmp_path))

    assert [segment.key for segment in segments] == [
        "project.policy.project.framework",
    ]
    assert segments[0].source_ref == "AGENTS.md#project.framework"
    assert segments[0].content == "项目要求使用 unittest"


def test_unmanaged_source_keeps_raw_text_compatibility(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text(
        "项目要求使用 unittest\n",
        encoding="utf-8",
    )
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.yaml").write_text(
        (
            "rules:\n"
            "  - ruleId: project.docs\n"
            "    sourceRef: AGENTS.md\n"
            "    content: 项目要求保留变更日志\n"
            "    conflictKey: lumora.response.summary\n"
        ),
        encoding="utf-8",
    )

    segments = ProjectInstructionLoader().load_segments(str(tmp_path))

    assert segments[0].key == "project.file.AGENTS.md"
    assert segments[0].content == "## AGENTS.md\n项目要求使用 unittest"
    assert segments[1].key == "project.policy.project.docs"


def test_policy_rejects_structured_content_duplicated_in_unmanaged_source(
    tmp_path,
) -> None:
    (tmp_path / "AGENTS.md").write_text(
        "项目要求使用 unittest\n",
        encoding="utf-8",
    )
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.json").write_text(
        json.dumps({
            "rules": [{
                "ruleId": "project.framework",
                "sourceRef": "AGENTS.md",
                "content": "项目要求使用 unittest",
                "conflictKey": "lumora.execution.requested_change",
            }],
        }),
        encoding="utf-8",
    )

    with pytest.raises(PromptConfigurationError, match="managedSources"):
        ProjectInstructionLoader().load_segments(str(tmp_path))


def test_managed_source_requires_rules(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("项目规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.json").write_text(
        json.dumps({"managedSources": ["AGENTS.md"], "rules": []}),
        encoding="utf-8",
    )

    with pytest.raises(PromptConfigurationError, match="至少声明一条"):
        ProjectInstructionLoader().load_segments(str(tmp_path))


def test_policy_rejects_duplicate_rule_ids(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("项目规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.json").write_text(
        json.dumps({
            "managedSources": ["AGENTS.md"],
            "rules": [
                {
                    "ruleId": "project.same",
                    "sourceRef": "AGENTS.md",
                    "content": "第一条",
                    "conflictKey": "project.execution.one",
                },
                {
                    "ruleId": "project.same",
                    "sourceRef": "AGENTS.md",
                    "content": "第二条",
                    "conflictKey": "project.execution.two",
                },
            ],
        }),
        encoding="utf-8",
    )

    with pytest.raises(PromptConfigurationError, match="ruleId 重复"):
        ProjectInstructionLoader().load_segments(str(tmp_path))


def test_policy_file_rejects_ambiguous_yaml_and_json(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("执行规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    policy = {"rules": [{
        "ruleId": "project.rule",
        "sourceRef": "AGENTS.md",
        "conflictKey": "rule",
    }]}
    (lumora / "prompt-policy.yaml").write_text(
        (
            "rules:\n"
            "  - ruleId: project.rule\n"
            "    sourceRef: AGENTS.md\n"
            "    content: 项目规则\n"
            "    conflictKey: rule\n"
        ),
        encoding="utf-8",
    )
    (lumora / "prompt-policy.json").write_text(
        json.dumps(policy),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="不能同时存在"):
        ProjectInstructionLoader().load_segments(str(tmp_path))


def test_policy_file_rejects_duplicate_json_fields(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("执行规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.json").write_text(
        (
            '{"rules":[{"ruleId":"project.rule",'
            '"sourceRef":"AGENTS.md",'
            '"sourceRef":"AGENTS.md",'
            '"content":"项目规则",'
            '"conflictKey":"project.rule"}]}'
        ),
        encoding="utf-8",
    )

    with pytest.raises(PromptConfigurationError, match="重复字段"):
        ProjectInstructionLoader().load_segments(str(tmp_path))


def test_policy_file_rejects_authority_or_binding_fields(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("执行规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.json").write_text(
        json.dumps({
            "rules": [{
                "ruleId": "project.authority",
                "sourceRef": "AGENTS.md",
                "content": "项目规则",
                "conflictKey": "lumora.execution",
                "authority": "security",
            }],
        }),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="不能声明 authority 或 binding"):
        ProjectInstructionLoader().load_segments(str(tmp_path))


def test_policy_file_rejects_source_ref_for_missing_file(tmp_path) -> None:
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.yaml").write_text(
        (
            "rules:\n"
            "  - ruleId: project.missing_source\n"
            "    sourceRef: AGENTS.md\n"
            "    content: 项目规则\n"
            "    conflictKey: lumora.execution\n"
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="未加载的来源"):
        ProjectInstructionLoader().load_segments(str(tmp_path))


def test_policy_file_rejects_trust_and_other_metadata_fields(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("执行规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.yaml").write_text(
        (
            "rules:\n"
            "  - ruleId: project.rule\n"
            "    sourceRef: AGENTS.md\n"
            "    conflictKey: lumora.execution\n"
            "    trust: trusted\n"
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="不允许的元数据字段"):
        ProjectInstructionLoader().load_segments(str(tmp_path))


def test_policy_file_requires_stable_rule_id(tmp_path) -> None:
    (tmp_path / "AGENTS.md").write_text("执行规则", encoding="utf-8")
    lumora = tmp_path / ".lumora"
    lumora.mkdir()
    (lumora / "prompt-policy.json").write_text(
        json.dumps({
            "rules": [{
                "sourceRef": "AGENTS.md",
                "content": "项目规则",
                "conflictKey": "lumora.execution",
            }],
        }),
        encoding="utf-8",
    )

    with pytest.raises(PromptConfigurationError, match="缺少稳定的 ruleId"):
        ProjectInstructionLoader().load_segments(str(tmp_path))
