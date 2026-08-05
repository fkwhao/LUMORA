from fastapi import status

from app.config.settings import AgentSettings
from app.constants.error_codes import (
    AUTHENTICATION_FAILED,
    INVALID_REQUEST,
    PROTOCOL_MISMATCH,
)
from app.controller.http.errors import AgentHttpError
from app.exception.runtime_errors import (
    AuthenticationError,
    InvalidRequestError,
    ProtocolMismatchError,
)
from app.security.request_authenticator import RequestAuthenticator


class HttpRequestGuard:
    def __init__(self, settings: AgentSettings) -> None:
        self._authenticator = RequestAuthenticator(settings)

    def authenticate(
        self,
        authorization: str | None,
        protocol_version: str | None,
        correlation_id: str | None,
    ) -> str:
        safe_correlation_id = (correlation_id or "").strip()
        error_mapping: tuple[tuple[type[ValueError], int, str], ...] = (
            (
                AuthenticationError,
                status.HTTP_401_UNAUTHORIZED,
                AUTHENTICATION_FAILED,
            ),
            (
                ProtocolMismatchError,
                status.HTTP_412_PRECONDITION_FAILED,
                PROTOCOL_MISMATCH,
            ),
            (
                InvalidRequestError,
                status.HTTP_400_BAD_REQUEST,
                INVALID_REQUEST,
            ),
        )
        try:
            return self._authenticator.authenticate(
                authorization,
                protocol_version,
                correlation_id,
            )
        except ValueError as error:
            for error_type, status_code, code in error_mapping:
                if isinstance(error, error_type):
                    raise AgentHttpError(
                        status_code,
                        code,
                        str(error),
                        False,
                        safe_correlation_id,
                    ) from error
            raise
