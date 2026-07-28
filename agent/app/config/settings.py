from collections.abc import Mapping
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.config.yaml_loader import load_yaml_mapping


class AgentSettings(BaseModel):
    model_config = ConfigDict(frozen=True)

    host: str = "127.0.0.1"
    port: int = Field(ge=1, le=65535)
    startup_token: str = Field(min_length=32)
    protocol_version: str = "1"

    @field_validator("host")
    @classmethod
    def validate_loopback_host(cls, value: str) -> str:
        # Agent 目前只服务本机 Core，禁止误配置为局域网或公网监听地址。
        if value != "127.0.0.1":
            raise ValueError("Agent 仅允许监听 127.0.0.1")
        return value

    @classmethod
    def from_yaml(cls, path: Path) -> "AgentSettings":
        data = load_yaml_mapping(path)
        server = cls._required_mapping(data, "server", path)
        lumora = cls._required_mapping(data, "lumora", path)

        return cls(
            host=server.get("host"),
            port=server.get("port"),
            startup_token=lumora.get("startup-token"),
            protocol_version=lumora.get("protocol-version", "1"),
        )

    @staticmethod
    def _required_mapping(
        data: Mapping[str, object],
        key: str,
        path: Path,
    ) -> Mapping[str, Any]:
        section = data.get(key)
        if not isinstance(section, Mapping):
            raise ValueError(f"本地配置缺少对象节点 {key}：{path}")
        return section
