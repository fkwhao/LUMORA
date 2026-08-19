import logging
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config.settings import AgentSettings
from app.constants.error_codes import INTERNAL_ERROR, INVALID_REQUEST
from app.constants.http_contract import CORRELATION_ID_HEADER
from app.constants.service_metadata import SERVICE_TITLE, SERVICE_VERSION
from app.controller.http.agent_controller import (
    AgentHttpController,
)
from app.controller.http.errors import AgentHttpError
from app.dto.response.error_response import ErrorResponse
from app.harness.ports.model_provider import ModelProviderPort
from app.prompt.prompt_builder import PromptBuilder
from app.provider.routing_provider import RoutingModelProvider
from app.service.chat_service import ChatService
from app.service.memory_extraction_service import MemoryExtractionService
from app.service.planner_service import PlannerService

logger = logging.getLogger(__name__)


def default_dev_config_path() -> Path:
    # 配置路径固定以 Agent 工程根目录为基准，避免受 IDE 工作目录影响。
    return Path(__file__).resolve().parent.parent / "config" / "dev-local.yml"


def create_app(
    settings: AgentSettings,
    planner_service: PlannerService,
    chat_service: ChatService | None = None,
    memory_extraction_service: MemoryExtractionService | None = None,
) -> FastAPI:
    app = FastAPI(title=SERVICE_TITLE, version=SERVICE_VERSION)
    provider: ModelProviderPort = RoutingModelProvider()
    resolved_chat_service = chat_service or ChatService(
        provider,
        PromptBuilder(),
        max_parallel_tool_calls=settings.max_parallel_tool_calls,
    )
    resolved_memory_extraction_service = (
        memory_extraction_service or MemoryExtractionService(provider)
    )
    controller = AgentHttpController(
        settings,
        planner_service,
        resolved_chat_service,
        resolved_memory_extraction_service,
    )
    app.include_router(controller.router)
    close_chat_service = getattr(resolved_chat_service, "close", None)
    if callable(close_chat_service):
        app.router.add_event_handler("shutdown", close_chat_service)
    close_provider = getattr(provider, "close", None)
    if callable(close_provider):
        app.router.add_event_handler("shutdown", close_provider)

    @app.exception_handler(AgentHttpError)
    async def handle_agent_http_error(
        request: Request,
        error: AgentHttpError,
    ) -> JSONResponse:
        del request
        return _error_response(
            error.status_code,
            error.code,
            error.message,
            error.retryable,
            error.correlation_id,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request,
        error: RequestValidationError,
    ) -> JSONResponse:
        correlation_id = request.headers.get(
            CORRELATION_ID_HEADER,
            "",
        ).strip()
        validation_message = _validation_error_message(error)
        logger.warning(
            "Agent request validation failed correlation_id=%s details=%s",
            correlation_id,
            validation_message,
        )
        return _error_response(
            status.HTTP_400_BAD_REQUEST,
            INVALID_REQUEST,
            validation_message,
            False,
            correlation_id,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        request: Request,
        error: Exception,
    ) -> JSONResponse:
        del error
        correlation_id = request.headers.get(
                CORRELATION_ID_HEADER,
            "",
        ).strip()
        # 未预期异常在 HTTP 边界统一脱敏，不能返回堆栈或内部异常文本。
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            INTERNAL_ERROR,
            "Agent 内部错误",
            True,
            correlation_id,
        )

    return app


def _error_response(
    status_code: int,
    code: str,
    message: str,
    retryable: bool,
    correlation_id: str,
) -> JSONResponse:
    body = ErrorResponse(
        code=code,
        message=message,
        retryable=retryable,
        correlationId=correlation_id,
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(by_alias=True),
    )


def _validation_error_message(error: RequestValidationError) -> str:
    details: list[str] = []
    for item in error.errors()[:3]:
        location = ".".join(str(part) for part in item.get("loc", ()))
        message = str(item.get("msg") or "字段无效")
        details.append(f"{location}: {message}" if location else message)
    return "请求参数无效" + ("：" + "; ".join(details) if details else "")


def main() -> None:
    settings = AgentSettings.from_yaml(default_dev_config_path())
    uvicorn.run(
        create_app(settings, PlannerService()),
        host=settings.host,
        port=settings.port,
    )


if __name__ == "__main__":
    main()
