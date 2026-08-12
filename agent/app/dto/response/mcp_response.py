from pydantic import BaseModel, ConfigDict, Field


class McpTestResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    connected: bool = True
    server_name: str = Field(alias="serverName")
    server_version: str = Field(alias="serverVersion")
    tools: list[str]
    resources: list[str] = Field(default_factory=list)
    resource_templates: list[str] = Field(
        default_factory=list,
        alias="resourceTemplates",
    )
    prompts: list[str] = Field(default_factory=list)
    echo_output: str | None = Field(default=None, alias="echoOutput")
