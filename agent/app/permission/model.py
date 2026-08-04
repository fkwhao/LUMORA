from dataclasses import dataclass, field
from enum import StrEnum


class PermissionDecision(StrEnum):
    ALLOW = "allow"
    DENY = "deny"
    ASK = "ask"


class ApprovalDecision(StrEnum):
    ALLOW_ONCE = "allow_once"
    ALLOW_ALWAYS = "allow_always"
    DENY = "deny"


class PermissionMode(StrEnum):
    FULL_ACCESS = "full_access"
    AUTO_APPROVE = "auto_approve"
    REQUEST_APPROVAL = "request_approval"


@dataclass(frozen=True, slots=True)
class PermissionRule:
    tool: str
    pattern: str = "*"
    decision: PermissionDecision = PermissionDecision.ASK
    source: str = "session"
    order: int = 0


@dataclass(frozen=True, slots=True)
class PermissionPolicy:
    mode: PermissionMode = PermissionMode.REQUEST_APPROVAL
    rules: tuple[PermissionRule, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class PermissionEvaluation:
    decision: PermissionDecision
    layer: str
    reason: str
    risk_level: str = "MEDIUM"
    reversible: bool = True
    grants_external_path: bool = False
