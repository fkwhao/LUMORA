import hmac
from typing import Any

from lumora_agent.planner import build_plan
from lumora_agent.settings import AgentSettings


class AuthenticationError(ValueError):
    pass


class ProtocolMismatchError(ValueError):
    pass


def validate_request_context(
    *,
    protocol_version: str,
    startup_token: str,
    expected_protocol_version: str,
    expected_startup_token: str,
) -> None:
    if not hmac.compare_digest(startup_token, expected_startup_token):
        raise AuthenticationError("启动令牌无效")
    if protocol_version != expected_protocol_version:
        raise ProtocolMismatchError("协议版本不兼容")


def create_grpc_servicer(settings: AgentSettings) -> Any:
    import grpc
    from lumora.v1 import agent_pb2, agent_pb2_grpc, common_pb2

    class AgentGrpcService(agent_pb2_grpc.AgentServiceServicer):
        def _validate(self, request: Any, context: grpc.ServicerContext) -> None:
            try:
                validate_request_context(
                    protocol_version=request.context.protocol_version,
                    startup_token=request.context.startup_token,
                    expected_protocol_version=settings.protocol_version,
                    expected_startup_token=settings.startup_token,
                )
            except AuthenticationError as error:
                context.abort(grpc.StatusCode.UNAUTHENTICATED, str(error))
            except ProtocolMismatchError as error:
                context.abort(grpc.StatusCode.FAILED_PRECONDITION, str(error))

        def Health(self, request: Any, context: grpc.ServicerContext) -> Any:
            self._validate(request, context)
            return common_pb2.HealthResponse(
                service_name="lumora-agent",
                service_version="0.1.0",
                protocol_version=settings.protocol_version,
            )

        def PlanTask(self, request: Any, context: grpc.ServicerContext) -> Any:
            self._validate(request, context)
            try:
                steps = build_plan(request.goal)
            except ValueError as error:
                context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(error))

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

    return AgentGrpcService()

