from typing import Literal

from pydantic import BaseModel


class ToolApprovalDecisionRequest(BaseModel):
    decision: Literal["allow", "allow_once", "allow_always", "deny"]
