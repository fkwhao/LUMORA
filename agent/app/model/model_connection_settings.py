from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class ModelConnectionSettings:
    provider_name: str
    base_url: str
    api_key: str
    model: str

    def validate(self) -> None:
        provider_name = self.provider_name.strip()
        base_url = self.base_url.strip().rstrip("/")
        api_key = self.api_key.strip()
        model = self.model.strip()
        if not provider_name or not base_url or not api_key or not model:
            raise ValueError("模型供应商、API 地址、API Key 和模型名称均不能为空")

        parsed = urlparse(base_url)
        is_loopback_http = (
            parsed.scheme == "http"
            and parsed.hostname in {"127.0.0.1", "localhost"}
        )
        if parsed.scheme != "https" and not is_loopback_http:
            raise ValueError("远程模型 API 必须使用 HTTPS")
        if (
            not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("模型 API 地址格式无效")
