from app.dto.request.mcp_request import McpServerRequest
from app.dto.response.mcp_response import McpTestResponse
from app.mcp.client import McpClient
from app.mcp.model import McpServerConfig
from app.mcp.oauth import McpOAuthManager


class McpService:
    def __init__(self, oauth_manager: McpOAuthManager | None = None) -> None:
        self._oauth_manager = oauth_manager or McpOAuthManager()

    async def test(self, request: McpServerRequest) -> McpTestResponse:
        client = McpClient(to_mcp_config(request))
        try:
            result = await client.test()
            return McpTestResponse(
                connected=True,
                serverName=result.server_name,
                serverVersion=result.server_version,
                tools=list(result.tools),
                resources=list(result.resources),
                resourceTemplates=list(result.resource_templates),
                prompts=list(result.prompts),
                echoOutput=result.echo_output,
            )
        finally:
            await client.close()

    async def start_oauth(self, request: McpServerRequest):
        return await self._oauth_manager.start(to_mcp_config(request))

    async def oauth_status(self, flow_id: str):
        return await self._oauth_manager.status(flow_id)

    async def oauth_callback(
        self,
        server_id: str,
        code: str,
        state: str | None,
        issuer: str | None,
        error: str | None,
    ) -> str:
        return await self._oauth_manager.callback(
            server_id,
            code,
            state,
            issuer,
            error,
        )


def to_mcp_config(request: McpServerRequest) -> McpServerConfig:
    return McpServerConfig(
        server_id=request.server_id,
        name=request.name,
        enabled=request.enabled,
        url=request.url or "",
        auth_type=request.auth_type,
        header_name=request.header_name,
        credential=request.credential,
        transport=request.transport,
        command=request.command,
        arguments=tuple(request.arguments),
        working_directory=request.working_directory,
        environment=request.environment,
    )
