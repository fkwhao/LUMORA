import os

from pydantic import BaseModel, ConfigDict, Field


class AgentSettings(BaseModel):
    model_config = ConfigDict(frozen=True)

    host: str = "127.0.0.1"
    port: int = Field(ge=1, le=65535)
    startup_token: str = Field(min_length=32)
    protocol_version: str = "1"

    @classmethod
    def from_environment(cls) -> "AgentSettings":
        return cls(
            port=int(os.environ["LUMORA_AGENT_PORT"]),
            startup_token=os.environ["LUMORA_STARTUP_TOKEN"],
            protocol_version=os.environ.get("LUMORA_PROTOCOL_VERSION", "1"),
        )
