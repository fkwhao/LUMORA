from http import HTTPMethod

from fastapi import APIRouter, Header

from app.constants.api_paths import ARTIFACT_READ_ROUTE, ARTIFACT_SEARCH_ROUTE
from app.constants.http_contract import (
    AUTHORIZATION_HEADER,
    CORRELATION_ID_HEADER,
    PROTOCOL_VERSION_HEADER,
)
from app.controller.http.request_guard import HttpRequestGuard
from app.dto.request.artifact_request import ArtifactReadRequest, ArtifactSearchRequest
from app.service.chat_service import ChatService


class ArtifactRoutes:
    def __init__(self, chat_service: ChatService, guard: HttpRequestGuard) -> None:
        self.router = APIRouter()
        self._chat_service = chat_service
        self._guard = guard
        self.router.add_api_route(
            ARTIFACT_READ_ROUTE, self.read_artifact, methods=[HTTPMethod.POST]
        )
        self.router.add_api_route(
            ARTIFACT_SEARCH_ROUTE, self.search_artifact, methods=[HTTPMethod.POST]
        )

    def read_artifact(
        self,
        request: ArtifactReadRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> dict[str, object]:
        self._guard.authenticate(authorization, protocol_version, correlation_id)
        return self._chat_service.read_artifact(request)

    def search_artifact(
        self,
        request: ArtifactSearchRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> dict[str, object]:
        self._guard.authenticate(authorization, protocol_version, correlation_id)
        return self._chat_service.search_artifact(request)
