import hmac

from app.config.settings import AgentSettings
from app.exception.runtime_errors import (
    AuthenticationError,
    InvalidRequestError,
    ProtocolMismatchError,
)


class RequestAuthenticator:
    def __init__(self, settings: AgentSettings) -> None:
        self._settings = settings

    def authenticate(
        self,
        authorization: str | None,
        protocol_version: str | None,
        correlation_id: str | None,
    ) -> str:
        token = self._extract_bearer_token(authorization)

        # 令牌使用恒定时间比较，且任何异常都不能携带原始认证信息。
        if not hmac.compare_digest(token, self._settings.startup_token):
            raise AuthenticationError("启动令牌无效")
        if protocol_version != self._settings.protocol_version:
            raise ProtocolMismatchError("协议版本不兼容")
        if correlation_id is None or not correlation_id.strip():
            raise InvalidRequestError("缺少有效的关联 ID")
        return correlation_id.strip()

    @staticmethod
    def _extract_bearer_token(authorization: str | None) -> str:
        prefix = "Bearer "
        if authorization is None or not authorization.startswith(prefix):
            raise AuthenticationError("启动令牌无效")
        token = authorization[len(prefix) :]
        if not token:
            raise AuthenticationError("启动令牌无效")
        return token
