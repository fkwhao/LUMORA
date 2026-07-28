from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config.settings import AgentSettings
from app.controller.http.agent_controller import (
    AgentHttpController,
    AgentHttpError,
)
from app.dto.response.error_response import ErrorResponse
from app.service.planner_service import PlannerService


def default_dev_config_path() -> Path:
    return Path("config/dev-local.yml")


def create_app(
    settings: AgentSettings,
    planner_service: PlannerService,
) -> FastAPI:
    app = FastAPI(title="LUMORA Agent", version="1.0.0")
    controller = AgentHttpController(settings, planner_service)
    app.include_router(controller.router)

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
        del error
        correlation_id = request.headers.get("X-Correlation-Id", "").strip()
        return _error_response(
            400,
            "INVALID_REQUEST",
            "请求参数无效",
            False,
            correlation_id,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        request: Request,
        error: Exception,
    ) -> JSONResponse:
        del error
        correlation_id = request.headers.get("X-Correlation-Id", "").strip()
        # 未预期异常在 HTTP 边界统一脱敏，不能返回堆栈或内部异常文本。
        return _error_response(
            500,
            "INTERNAL_ERROR",
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


def main() -> None:
    settings = AgentSettings.from_yaml(default_dev_config_path())
    uvicorn.run(
        create_app(settings, PlannerService()),
        host=settings.host,
        port=settings.port,
    )


if __name__ == "__main__":
    main()
