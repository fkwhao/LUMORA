from app.dto.request.mcp_request import McpServerRequest
from app.dto.response.mcp_response import McpTestResponse
from app.mcp.client import McpClient
from app.mcp.model import McpServerConfig


class McpService:
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


def to_mcp_config(request: McpServerRequest) -> McpServerConfig:
    return McpServerConfig(
        server_id=request.server_id,
        name=request.name,
        enabled=request.enabled,
        url=request.url,
        auth_type=request.auth_type,
        header_name=request.header_name,
        credential=request.credential,
    )
