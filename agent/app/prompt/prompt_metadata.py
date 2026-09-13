import re
from dataclasses import dataclass
from enum import IntEnum, StrEnum


class PromptSource(StrEnum):
    """提供模型可见 Prompt 项的来源组件。"""

    STATIC_SYSTEM = "static_system"
    WORKSPACE_FILE = "workspace_file"
    UPSTREAM_PROJECT = "upstream_project"
    RUNTIME = "runtime"
    SECURITY_RUNTIME = "security_runtime"
    USER_TASK = "user_task"
    MEMORY = "memory"
    HISTORY = "history"
    TOOL_CONTRACT = "tool_contract"


class PromptAuthority(StrEnum):
    """语义权威等级；它不是安全权限。"""

    SECURITY = "security"
    CORE = "core"
    RUNTIME = "runtime"
    PROJECT = "project"
    USER = "user"
    CONTEXT = "context"


class PromptBinding(StrEnum):
    """Prompt 项对模型行为的约束强度。"""

    HARD = "hard"
    REQUIRED = "required"
    DEFAULT = "default"
    REFERENCE = "reference"


class PromptTrustLevel(StrEnum):
    """Prompt 项可以被安全路由到模型的程度。"""

    TRUSTED = "trusted"
    USER_CONTEXT = "user_context"
    UNTRUSTED = "untrusted"


class PromptKind(StrEnum):
    INSTRUCTION = "instruction"
    FACT = "fact"
    SUMMARY = "summary"
    EVENT = "event"
    TOOL_CONTRACT = "tool_contract"


class PromptRetention(StrEnum):
    """上下文保留策略，特意与语义权威等级分离。"""

    REQUIRED = "required"
    COMPRESSIBLE = "compressible"
    DISCARDABLE = "discardable"


class _PromptRank(IntEnum):
    REFERENCE = 10
    DEFAULT = 20
    REQUIRED = 30
    HARD = 40


_BINDING_RANK = {
    PromptBinding.REFERENCE: _PromptRank.REFERENCE,
    PromptBinding.DEFAULT: _PromptRank.DEFAULT,
    PromptBinding.REQUIRED: _PromptRank.REQUIRED,
    PromptBinding.HARD: _PromptRank.HARD,
}

_AUTHORITY_RANK = {
    PromptAuthority.CONTEXT: 10,
    PromptAuthority.USER: 20,
    PromptAuthority.PROJECT: 30,
    PromptAuthority.RUNTIME: 40,
    PromptAuthority.CORE: 50,
    PromptAuthority.SECURITY: 60,
}

_PROMPT_CONFLICT_KEY_PATTERN = re.compile(r"[A-Za-z0-9._:-]+")


def normalize_prompt_conflict_key(value: str | None) -> str | None:
    """规范化并校验结构化 conflictKey 的语法。"""
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError("Prompt conflictKey 必须是字符串")
    normalized = value.strip()
    if not normalized or not _PROMPT_CONFLICT_KEY_PATTERN.fullmatch(normalized):
        raise ValueError("Prompt conflictKey 无效")
    return normalized

@dataclass(frozen=True, slots=True)
class PromptPolicy:
    """用于派生并约束 Prompt 元数据的中央来源策略。"""

    default_authority: PromptAuthority
    default_binding: PromptBinding
    default_trust: PromptTrustLevel
    max_authority: PromptAuthority
    max_binding: PromptBinding
    allowed_trust_levels: frozenset[PromptTrustLevel]

    @classmethod
    def for_source(cls, source: PromptSource) -> "PromptPolicy":
        try:
            return _SOURCE_POLICIES[source]
        except (KeyError, TypeError) as error:
            raise ValueError(f"未知 Prompt 来源：{source!r}") from error

    def derive(
        self,
        authority: PromptAuthority | None = None,
        binding: PromptBinding | None = None,
        trust_level: PromptTrustLevel | None = None,
    ) -> tuple[PromptAuthority, PromptBinding, PromptTrustLevel]:
        resolved_authority = authority or self.default_authority
        resolved_binding = binding or self.default_binding
        resolved_trust = trust_level or self.default_trust
        self.validate(resolved_authority, resolved_binding, resolved_trust)
        return resolved_authority, resolved_binding, resolved_trust

    def validate(
        self,
        authority: PromptAuthority,
        binding: PromptBinding,
        trust_level: PromptTrustLevel | None = None,
    ) -> None:
        if authority_rank(authority) > authority_rank(self.max_authority):
            raise ValueError(
                "Prompt 元数据不能提升，authority 超出来源允许范围："
                f"{authority.value} > {self.max_authority.value}"
            )
        if binding_rank(binding) > binding_rank(self.max_binding):
            raise ValueError(
                "Prompt 元数据不能提升，binding 超出来源允许范围："
                f"{binding.value} > {self.max_binding.value}"
            )
        if trust_level is not None and trust_level not in self.allowed_trust_levels:
            raise ValueError(
                "Prompt 元数据不能伪造，trust_level 不属于来源允许范围："
                f"{trust_level.value}"
            )


_SOURCE_POLICIES = {
    PromptSource.STATIC_SYSTEM: PromptPolicy(
        default_authority=PromptAuthority.CORE,
        default_binding=PromptBinding.DEFAULT,
        default_trust=PromptTrustLevel.TRUSTED,
        max_authority=PromptAuthority.CORE,
        max_binding=PromptBinding.HARD,
        allowed_trust_levels=frozenset({PromptTrustLevel.TRUSTED}),
    ),
    PromptSource.WORKSPACE_FILE: PromptPolicy(
        default_authority=PromptAuthority.PROJECT,
        default_binding=PromptBinding.REQUIRED,
        default_trust=PromptTrustLevel.TRUSTED,
        max_authority=PromptAuthority.PROJECT,
        max_binding=PromptBinding.REQUIRED,
        allowed_trust_levels=frozenset({PromptTrustLevel.TRUSTED}),
    ),
    PromptSource.UPSTREAM_PROJECT: PromptPolicy(
        default_authority=PromptAuthority.PROJECT,
        default_binding=PromptBinding.REQUIRED,
        default_trust=PromptTrustLevel.TRUSTED,
        max_authority=PromptAuthority.PROJECT,
        max_binding=PromptBinding.REQUIRED,
        allowed_trust_levels=frozenset({PromptTrustLevel.TRUSTED}),
    ),
    PromptSource.RUNTIME: PromptPolicy(
        default_authority=PromptAuthority.RUNTIME,
        default_binding=PromptBinding.REFERENCE,
        default_trust=PromptTrustLevel.TRUSTED,
        max_authority=PromptAuthority.RUNTIME,
        max_binding=PromptBinding.REQUIRED,
        allowed_trust_levels=frozenset({
            PromptTrustLevel.TRUSTED,
            PromptTrustLevel.USER_CONTEXT,
            PromptTrustLevel.UNTRUSTED,
        }),
    ),
    PromptSource.SECURITY_RUNTIME: PromptPolicy(
        default_authority=PromptAuthority.SECURITY,
        default_binding=PromptBinding.HARD,
        default_trust=PromptTrustLevel.TRUSTED,
        max_authority=PromptAuthority.SECURITY,
        max_binding=PromptBinding.HARD,
        allowed_trust_levels=frozenset({PromptTrustLevel.TRUSTED}),
    ),
    PromptSource.USER_TASK: PromptPolicy(
        default_authority=PromptAuthority.USER,
        default_binding=PromptBinding.REQUIRED,
        default_trust=PromptTrustLevel.USER_CONTEXT,
        max_authority=PromptAuthority.USER,
        max_binding=PromptBinding.REQUIRED,
        allowed_trust_levels=frozenset({PromptTrustLevel.USER_CONTEXT}),
    ),
    PromptSource.MEMORY: PromptPolicy(
        default_authority=PromptAuthority.CONTEXT,
        default_binding=PromptBinding.REFERENCE,
        default_trust=PromptTrustLevel.USER_CONTEXT,
        max_authority=PromptAuthority.CONTEXT,
        max_binding=PromptBinding.REFERENCE,
        allowed_trust_levels=frozenset({PromptTrustLevel.USER_CONTEXT}),
    ),
    PromptSource.HISTORY: PromptPolicy(
        default_authority=PromptAuthority.CONTEXT,
        default_binding=PromptBinding.REFERENCE,
        default_trust=PromptTrustLevel.USER_CONTEXT,
        max_authority=PromptAuthority.CONTEXT,
        max_binding=PromptBinding.REFERENCE,
        allowed_trust_levels=frozenset({PromptTrustLevel.USER_CONTEXT}),
    ),
    PromptSource.TOOL_CONTRACT: PromptPolicy(
        default_authority=PromptAuthority.RUNTIME,
        default_binding=PromptBinding.REQUIRED,
        default_trust=PromptTrustLevel.TRUSTED,
        max_authority=PromptAuthority.RUNTIME,
        max_binding=PromptBinding.REQUIRED,
        allowed_trust_levels=frozenset({PromptTrustLevel.TRUSTED}),
    ),
}


def binding_rank(binding: PromptBinding) -> int:
    return int(_BINDING_RANK[binding])


def authority_rank(authority: PromptAuthority) -> int:
    return _AUTHORITY_RANK[authority]


def validate_prompt_metadata(
    source: PromptSource,
    authority: PromptAuthority | None,
    binding: PromptBinding | None,
    trust_level: PromptTrustLevel | None = None,
) -> None:
    """拒绝没有来源依据的元数据提升。

    这里特意采用上限检查，而不是完全相等检查：适配器可以为了更窄的用途降低
    元数据等级，但不能声明超过可信来源允许范围的权威等级。
    """
    PromptPolicy.for_source(source).derive(authority, binding, trust_level)
