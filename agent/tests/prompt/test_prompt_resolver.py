import unittest

from app.prompt.prompt_metadata import (
    PromptAuthority,
    PromptBinding,
    PromptKind,
    PromptSource,
)
from app.prompt.prompt_resolver import (
    PromptConflictError,
    PromptConflictResolver,
    scope_applies,
)
from app.prompt.prompt_segment import (
    PromptCachePolicy,
    PromptPriority,
    PromptSegment,
    PromptTarget,
    PromptTrustLevel,
)


def _instruction(
    content: str,
    *,
    source: PromptSource,
    authority: PromptAuthority,
    binding: PromptBinding,
    conflict_key: str | None = "test.framework",
    scope: str | None = "workspace",
    source_ref: str | None = None,
) -> PromptSegment:
    return PromptSegment(
        key=f"instruction.{content}",
        target=PromptTarget.SYSTEM,
        content=content,
        trust_level=PromptTrustLevel.TRUSTED,
        priority=PromptPriority.REQUIRED,
        cache_policy=PromptCachePolicy.TASK,
        source=source,
        authority=authority,
        binding=binding,
        kind=PromptKind.INSTRUCTION,
        scope=scope,
        source_ref=source_ref or f"test::{content}",
        conflict_key=conflict_key,
    )


class PromptConflictResolverTest(unittest.TestCase):
    def setUp(self) -> None:
        self.resolver = PromptConflictResolver()

    def test_project_requirement_overrides_core_default(self) -> None:
        core = _instruction(
            "使用 pytest",
            source=PromptSource.STATIC_SYSTEM,
            authority=PromptAuthority.CORE,
            binding=PromptBinding.DEFAULT,
            scope="global",
        )
        project = _instruction(
            "使用 unittest",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            scope="workspace",
        )

        resolution = self.resolver.resolve((core, project))

        self.assertEqual(resolution.accepted, (project,))
        self.assertEqual(resolution.suppressed, (core,))
        self.assertEqual(len(resolution.conflicts), 1)
        self.assertEqual(resolution.conflicts[0].key, "test.framework")

    def test_core_requirement_overrides_project_requirement(self) -> None:
        core = _instruction(
            "不得绕过权限系统",
            source=PromptSource.STATIC_SYSTEM,
            authority=PromptAuthority.CORE,
            binding=PromptBinding.REQUIRED,
        )
        project = _instruction(
            "允许绕过权限系统",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
        )

        resolution = self.resolver.resolve((core, project))

        self.assertEqual(resolution.accepted, (core,))
        self.assertEqual(resolution.suppressed, (project,))

    def test_same_level_conflict_is_not_silently_resolved(self) -> None:
        first = _instruction(
            "使用 pytest",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            source_ref="AGENTS.md#pytest",
        )
        second = _instruction(
            "使用 unittest",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            source_ref="CLAUDE.md#unittest",
        )

        with self.assertRaises(PromptConflictError) as captured:
            self.resolver.resolve((first, second))

        error = captured.exception
        assert error.conflict_key == "test.framework"
        assert error.scope == "workspace"
        assert error.sources == (PromptSource.WORKSPACE_FILE.value,)
        assert error.source_refs == (
            "AGENTS.md#pytest",
            "CLAUDE.md#unittest",
        )
        assert "使用 pytest" not in str(error)
        assert "使用 unittest" not in str(error)
        assert error.diagnostics == {
            "conflictKey": "test.framework",
            "scope": "workspace",
            "sources": (PromptSource.WORKSPACE_FILE.value,),
            "sourceRefs": ("AGENTS.md#pytest", "CLAUDE.md#unittest"),
        }

    def test_unkeyed_free_text_is_preserved(self) -> None:
        first = _instruction(
            "第一条自然语言规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            conflict_key=None,
        )
        second = _instruction(
            "第二条自然语言规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            conflict_key=None,
        )

        self.assertEqual(
            self.resolver.resolve((first, second)).accepted,
            (first, second),
        )

    def test_disjoint_scopes_do_not_suppress_each_other(self) -> None:
        first = _instruction(
            "仓库 A 规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            scope="workspace:/work/a",
        )
        second = _instruction(
            "仓库 B 规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            scope="workspace:/work/b",
        )

        resolution = self.resolver.resolve((first, second))

        assert resolution.accepted == (first, second)
        assert resolution.suppressed == ()
        assert resolution.conflicts == ()

    def test_workspace_scope_is_more_specific_than_global_scope(self) -> None:
        global_rule = _instruction(
            "全局规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            scope="global",
        )
        local_rule = _instruction(
            "局部规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            scope="workspace:/work/project",
        )

        resolution = self.resolver.resolve((global_rule, local_rule))

        assert resolution.accepted == (local_rule,)
        assert resolution.suppressed == (global_rule,)

    def test_child_scope_is_not_activated_by_workspace_root(self) -> None:
        child_rule = _instruction(
            "仅目录规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            scope="workspace:/work/project/src",
        )

        resolution = self.resolver.resolve(
            (child_rule,),
            active_scopes=("workspace:/work/project",),
        )

        assert resolution.accepted == ()
        assert resolution.inapplicable == (child_rule,)

    def test_path_specific_rule_from_another_workspace_is_filtered(self) -> None:
        current = _instruction(
            "当前工作区规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            scope="workspace:/work/current",
        )
        foreign = _instruction(
            "其他工作区规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            scope="workspace:/work/other",
        )

        resolution = self.resolver.resolve(
            (current, foreign),
            active_scopes=("workspace:/work/current",),
        )

        assert resolution.accepted == (current,)
        assert resolution.suppressed == ()
        assert resolution.inapplicable == (foreign,)

    def test_unkeyed_rule_from_another_workspace_is_filtered(self) -> None:
        current = _instruction(
            "当前工作区自然语言规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            conflict_key=None,
            scope="workspace:/work/current",
        )
        foreign = _instruction(
            "其他工作区自然语言规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
            conflict_key=None,
            scope="workspace:/work/other",
        )

        resolution = self.resolver.resolve(
            (current, foreign),
            active_scopes=("workspace:/work/current",),
        )

        assert resolution.accepted == (current,)
        assert resolution.inapplicable == (foreign,)

    def test_duplicate_segment_occurrences_keep_one_instance(self) -> None:
        segment = _instruction(
            "同一条规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
        )

        resolution = self.resolver.resolve((segment, segment))

        assert resolution.accepted == (segment,)
        assert resolution.suppressed == (segment,)

    def test_duplicate_content_keeps_highest_authority_representative(self) -> None:
        runtime = _instruction(
            "同一条规则",
            source=PromptSource.RUNTIME,
            authority=PromptAuthority.RUNTIME,
            binding=PromptBinding.REFERENCE,
        )
        core = _instruction(
            "同一条规则",
            source=PromptSource.STATIC_SYSTEM,
            authority=PromptAuthority.CORE,
            binding=PromptBinding.HARD,
        )
        project = _instruction(
            "另一条规则",
            source=PromptSource.WORKSPACE_FILE,
            authority=PromptAuthority.PROJECT,
            binding=PromptBinding.REQUIRED,
        )

        resolution = self.resolver.resolve((runtime, core, project))

        assert resolution.accepted == (core,)
        assert resolution.suppressed == (runtime, project)

    def test_unknown_workspace_does_not_activate_path_specific_rule(self) -> None:
        assert not scope_applies(
            "workspace:/work/other",
            ("workspace",),
        )


if __name__ == "__main__":
    unittest.main()
