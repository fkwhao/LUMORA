from http import HTTPMethod

from fastapi import APIRouter, Header, status

from app.constants.api_paths import MCP_TEST_ROUTE
from app.constants.error_codes import MCP_CONNECTION_ERROR
from app.constants.http_contract import (
    AUTHORIZATION_HEADER,
    CORRELATION_ID_HEADER,
    PROTOCOL_VERSION_HEADER,
)
from app.controller.http.errors import AgentHttpError
from app.controller.http.request_guard import HttpRequestGuard
from app.dto.request.mcp_request import McpServerRequest
from app.dto.response.mcp_response import McpTestResponse
from app.mcp.client import McpConnectionError
from app.service.mcp_service import McpService


class McpRoutes:
    def __init__(self, service: McpService, guard: HttpRequestGuard) -> None:
        self.router = APIRouter()
        self._service = service
        self._guard = guard
        self.router.add_api_route(
            MCP_TEST_ROUTE,
            self.test_connection,
            methods=[HTTPMethod.POST],
            response_model=McpTestResponse,
        )

    async def test_connection(
        self,
        request: McpServerRequest,
        authorization: str | None = Header(default=None, alias=AUTHORIZATION_HEADER),
        protocol_version: str | None = Header(default=None, alias=PROTOCOL_VERSION_HEADER),
        correlation_id: str | None = Header(default=None, alias=CORRELATION_ID_HEADER),
    ) -> McpTestResponse:
        authenticated_id = self._guard.authenticate(
            authorization, protocol_version, correlation_id
        )
        try:
            return await self._service.test(request)
        except (McpConnectionError, OSError, TimeoutError, ValueError) as error:
            raise AgentHttpError(
                status.HTTP_502_BAD_GATEWAY,
                MCP_CONNECTION_ERROR,
                str(error),
                True,
                authenticated_id,
            ) from error
