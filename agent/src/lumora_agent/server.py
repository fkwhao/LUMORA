from concurrent.futures import ThreadPoolExecutor

from lumora_agent.service import create_grpc_servicer
from lumora_agent.settings import AgentSettings


def serve() -> None:
    import grpc
    from lumora.v1 import agent_pb2_grpc

    settings = AgentSettings.from_environment()
    server = grpc.server(ThreadPoolExecutor(max_workers=4))
    agent_pb2_grpc.add_AgentServiceServicer_to_server(
        create_grpc_servicer(settings),
        server,
    )
    server.add_insecure_port(f"{settings.host}:{settings.port}")
    server.start()
    server.wait_for_termination()


if __name__ == "__main__":
    serve()

