import asyncio
import json

from app.config.settings import AgentSettings
from app.controller.grpc.agent_servicer import create_agent_servicer
from app.service.planner_service import PlannerService


def format_ready_event(port: int) -> str:
    payload = json.dumps(
        {"service": "agent", "port": port},
        separators=(",", ":"),
    )
    return f"LUMORA_READY {payload}"


async def serve() -> None:
    """启动由 Java Core 管理的本机异步 gRPC 服务。"""
    import grpc
    from lumora.v1 import agent_pb2_grpc

    settings = AgentSettings.from_environment()
    server = grpc.aio.server()
    agent_pb2_grpc.add_AgentServiceServicer_to_server(
        create_agent_servicer(settings, PlannerService()),
        server,
    )
    bound_port = server.add_insecure_port(f"{settings.host}:{settings.port}")
    if bound_port == 0:
        raise RuntimeError(
            f"Agent Runtime 无法绑定 {settings.host}:{settings.port}"
        )

    # Java 负责进程生命周期；收到终止信号时 aio Server 会释放活动 RPC。
    await server.start()
    # 仅在 gRPC 服务启动成功后通知父进程，避免发布虚假就绪状态。
    print(format_ready_event(bound_port), flush=True)
    await server.wait_for_termination()


if __name__ == "__main__":
    asyncio.run(serve())
