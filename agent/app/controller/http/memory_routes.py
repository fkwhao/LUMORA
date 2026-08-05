from http import HTTPMethod

from fastapi import APIRouter, Header, status

from app.constants.api_paths import MEMORY_EXTRACTIONS_ROUTE
from app.constants.error_codes import MODEL_PROVIDER_ERROR
from app.constants.http_contract import (
    AUTHORIZATION_HEADER,
    CORRELATION_ID_HEADER,
    PROTOCOL_VERSION_HEADER,
)
from app.controller.http.errors import AgentHttpError
from app.controller.http.request_guard import HttpRequestGuard
from app.dto.request.memory_extraction_request import MemoryExtractionRequest
from app.dto.response.memory_extraction_response import MemoryExtractionResponse
from app.exception.provider_errors import ModelProviderError
from app.service.memory_extraction_service import MemoryExtractionService


class MemoryRoutes:
    def __init__(
        self,
        service: MemoryExtractionService,
        guard: HttpRequestGuard,
    ) -> None:
        self.router = APIRouter()
        self._service = service
        self._guard = guard
        self.router.add_api_route(
            MEMORY_EXTRACTIONS_ROUTE,
            self.extract_memories,
            methods=[HTTPMethod.POST],
            response_model=MemoryExtractionResponse,
        )

    async def extract_memories(
        self,
        request: MemoryExtractionRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> MemoryExtractionResponse:
        authenticated_id = self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        try:
            return await self._service.extract(request)
        except ModelProviderError as error:
            raise AgentHttpError(
                status.HTTP_502_BAD_GATEWAY,
                MODEL_PROVIDER_ERROR,
                str(error),
                True,
                authenticated_id,
            ) from error
