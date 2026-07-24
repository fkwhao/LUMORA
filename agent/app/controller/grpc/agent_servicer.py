import hmac
from typing import Any

from app.config.settings import AgentSettings
from app.exception.runtime_errors import (
    AuthenticationError,
    ProtocolMismatchError,
)
from app.service.planner_service import PlannerService

__all__ = [
    "AuthenticationError",
    "ProtocolMismatchError",
    "create_agent_servicer",
    "validate_request_context",
]


def validate_request_context(
    *,
    protocol_version: str,
    startup_token: str,
    expected_protocol_version: str,
    expected_startup_token: str,
) -> None:
    """业务逻辑执行前统一校验进程身份和协议兼容性。"""
    if not hmac.compare_digest(startup_token, expected_startup_token):
        raise AuthenticationError("启动令牌无效")
    if protocol_version != expected_protocol_version:
        raise ProtocolMismatchError("协议版本不兼容")


def create_agent_servicer(
    settings: AgentSettings,
    planner_service: PlannerService,
) -> Any:
    # 延迟导入让 Service 单元测试不依赖尚未生成的 Protobuf 代码。
    import grpc
    from lumora.v1 import agent_pb2, agent_pb2_grpc, common_pb2

    class AgentGrpcController(agent_pb2_grpc.AgentServiceServicer):
        async def _validate(
            self,
            request: Any,
            context: grpc.aio.ServicerContext,
        ) -> None:
            try:
                validate_request_context(
                    protocol_version=request.context.protocol_version,
                    startup_token=request.context.startup_token,
                    expected_protocol_version=settings.protocol_version,
                    expected_startup_token=settings.startup_token,
                )
            except AuthenticationError as error:
                await context.abort(grpc.StatusCode.UNAUTHENTICATED, str(error))
            except ProtocolMismatchError as error:
                await context.abort(
                    grpc.StatusCode.FAILED_PRECONDITION,
                    str(error),
                )

        async def Health(
            self,
            request: Any,
            context: grpc.aio.ServicerContext,
        ) -> Any:
            await self._validate(request, context)
            return common_pb2.HealthResponse(
                service_name="lumora-agent",
                service_version="0.1.0",
                protocol_version=settings.protocol_version,
            )

        async def PlanTask(
            self,
            request: Any,
            context: grpc.aio.ServicerContext,
        ) -> Any:
            await self._validate(request, context)
            try:
                steps = planner_service.build_plan(request.goal)
            except ValueError as error:
                await context.abort(
                    grpc.StatusCode.INVALID_ARGUMENT,
                    str(error),
                )
                raise

            return agent_pb2.PlanTaskResponse(
                task_id=request.task_id,
                steps=[
                    agent_pb2.PlanStep(
                        step_id=step.step_id,
                        title=step.title,
                        description=step.description,
                        requires_approval=step.requires_approval,
                    )
                    for step in steps
                ],
            )

    return AgentGrpcController()
