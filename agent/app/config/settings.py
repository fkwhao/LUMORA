from collections.abc import Mapping
from pathlib import Path

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
            host=cls._required_str(server, "host", path),
            port=cls._required_int(server, "port", path),
            startup_token=cls._required_str(
                lumora,
                "startup-token",
                path,
            ),
            protocol_version=cls._optional_str(
                lumora,
                "protocol-version",
                "1",
                path,
            ),
        )

    @staticmethod
    def _required_mapping(
        data: Mapping[str, object],
        key: str,
        path: Path,
    ) -> Mapping[str, object]:
        section = data.get(key)
        if not isinstance(section, Mapping):
            raise TypeError(f"本地配置缺少对象节点 {key}：{path}")
        return section

    @staticmethod
    def _required_str(
        data: Mapping[str, object],
        key: str,
        path: Path,
    ) -> str:
        value = data.get(key)
        if not isinstance(value, str):
            raise TypeError(f"本地配置项 {key} 必须是字符串：{path}")
        return value

    @staticmethod
    def _optional_str(
        data: Mapping[str, object],
        key: str,
        default: str,
        path: Path,
    ) -> str:
        value = data.get(key, default)
        if not isinstance(value, str):
            raise TypeError(f"本地配置项 {key} 必须是字符串：{path}")
        return value

    @staticmethod
    def _required_int(
        data: Mapping[str, object],
        key: str,
        path: Path,
    ) -> int:
        value = data.get(key)
        if not isinstance(value, int) or isinstance(value, bool):
            raise TypeError(f"本地配置项 {key} 必须是整数：{path}")
        return value
