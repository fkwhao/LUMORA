from fastapi import APIRouter

from app.config.settings import AgentSettings
from app.constants.api_paths import API_V1_PREFIX
from app.controller.http.approval_routes import ApprovalRoutes
from app.controller.http.artifact_routes import ArtifactRoutes
from app.controller.http.chat_routes import ChatRoutes
from app.controller.http.errors import AgentHttpError
from app.controller.http.mcp_routes import McpRoutes
from app.controller.http.memory_routes import MemoryRoutes
from app.controller.http.model_routes import ModelRoutes
from app.controller.http.request_guard import HttpRequestGuard
from app.controller.http.system_routes import SystemRoutes
from app.service.chat_service import ChatService
from app.service.mcp_service import McpService
from app.service.memory_extraction_service import MemoryExtractionService
from app.service.planner_service import PlannerService

__all__ = ["AgentHttpController", "AgentHttpError"]


class AgentHttpController:
    """聚合版本化 HTTP 子路由，不承载具体端点逻辑。"""

    def __init__(
        self,
        settings: AgentSettings,
        planner_service: PlannerService,
        chat_service: ChatService,
        memory_extraction_service: MemoryExtractionService,
    ) -> None:
        self.router = APIRouter(prefix=API_V1_PREFIX)
        guard = HttpRequestGuard(settings)
        route_groups = (
            SystemRoutes(settings, planner_service, guard),
            ChatRoutes(chat_service, guard),
            ArtifactRoutes(chat_service, guard),
            ModelRoutes(chat_service, guard),
            MemoryRoutes(memory_extraction_service, guard),
            McpRoutes(McpService(), guard),
            ApprovalRoutes(chat_service, guard),
        )
        for route_group in route_groups:
            self.router.include_router(route_group.router)
