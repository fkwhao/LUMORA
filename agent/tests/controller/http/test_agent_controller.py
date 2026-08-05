import json
import unittest

from app.config.settings import AgentSettings
from app.harness.run_event import RunEvent
from app.main import create_app
from app.service.planner_service import PlannerService
from fastapi.testclient import TestClient

STARTUP_TOKEN = "a" * 64


class AgentControllerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = AgentSettings(
            host="127.0.0.1",
            port=45101,
            startup_token=STARTUP_TOKEN,
            protocol_version="1",
        )
        self.client = TestClient(
            create_app(self.settings, PlannerService())
        )

    def authenticated_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {STARTUP_TOKEN}",
            "X-Lumora-Protocol-Version": "1",
            "X-Correlation-Id": "correlation-123",
        }

    @staticmethod
    def model_connection(
        base_url: str = "https://api.example.com/v1",
    ) -> dict[str, str]:
        return {
            "providerName": "OpenAI Compatible",
            "baseUrl": base_url,
            "model": "example-model",
            "apiKey": "secret-provider-key",
        }

    def test_health_returns_exact_contract(self) -> None:
        response = self.client.get(
            "/api/v1/health",
            headers=self.authenticated_headers(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "UP",
                "service": "lumora-agent",
                "protocolVersion": "1",
            },
        )

    def test_plan_returns_task_and_mapped_steps(self) -> None:
        response = self.client.post(
            "/api/v1/tasks/plan",
            headers=self.authenticated_headers(),
            json={"taskId": "task-123", "goal": "整理本地文档。"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["taskId"], "task-123")
        self.assertGreater(len(body["steps"]), 0)
        self.assertEqual(
            set(body["steps"][0]),
            {"stepId", "title", "description", "requiresApproval"},
        )

    def test_missing_or_wrong_bearer_token_returns_401(self) -> None:
        for authorization in (None, "Bearer wrong-token"):
            with self.subTest(authorization=authorization):
                headers = self.authenticated_headers()
                if authorization is None:
                    headers.pop("Authorization")
                else:
                    headers["Authorization"] = authorization

                response = self.client.get(
                    "/api/v1/health",
                    headers=headers,
                )

                self.assertEqual(response.status_code, 401)
                self.assertEqual(
                    response.json()["code"],
                    "AUTHENTICATION_FAILED",
                )

    def test_wrong_protocol_version_returns_412(self) -> None:
        headers = self.authenticated_headers()
        headers["X-Lumora-Protocol-Version"] = "2"

        response = self.client.get("/api/v1/health", headers=headers)

        self.assertEqual(response.status_code, 412)
        self.assertEqual(response.json()["code"], "PROTOCOL_MISMATCH")

    def test_blank_goal_returns_400(self) -> None:
        response = self.client.post(
            "/api/v1/tasks/plan",
            headers=self.authenticated_headers(),
            json={"taskId": "task-123", "goal": "   "},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "INVALID_REQUEST")

    def test_missing_correlation_id_returns_400(self) -> None:
        headers = self.authenticated_headers()
        headers.pop("X-Correlation-Id")

        response = self.client.get("/api/v1/health", headers=headers)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "INVALID_REQUEST")

    def test_error_response_never_leaks_token_or_stack_trace(self) -> None:
        response = self.client.get(
            "/api/v1/health",
            headers={
                "Authorization": f"Bearer {STARTUP_TOKEN}wrong",
                "X-Lumora-Protocol-Version": "1",
                "X-Correlation-Id": "correlation-123",
            },
        )
        response_text = response.text

        self.assertNotIn(STARTUP_TOKEN, response_text)
        self.assertNotIn("Traceback", response_text)
        self.assertEqual(
            set(response.json()),
            {"code", "message", "retryable", "correlationId"},
        )

    def test_chat_requires_transient_model_connection(self) -> None:
        response = self.client.post(
            "/api/v1/chat/completions",
            headers=self.authenticated_headers(),
            json={"messages": [{"role": "user", "content": "你好"}]},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "INVALID_REQUEST")

    def test_remote_model_api_rejects_plain_http_without_leaking_key(
        self,
    ) -> None:
        response = self.client.post(
            "/api/v1/chat/completions",
            headers=self.authenticated_headers(),
            json={
                "messages": [{"role": "user", "content": "你好"}],
                "connection": self.model_connection(
                    "http://api.example.com/v1"
                ),
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "INVALID_REQUEST")
        self.assertNotIn("secret-provider-key", response.text)

    def test_chat_stream_returns_incremental_sse_events(self) -> None:
        chat_service = StreamingChatService()
        client = TestClient(
            create_app(
                self.settings,
                PlannerService(),
                chat_service,
            )
        )

        response = client.post(
            "/api/v1/chat/completions/stream",
            headers=self.authenticated_headers(),
            json={
                "messages": [{"role": "user", "content": "你好"}],
                "connection": self.model_connection(),
                "reasoningEffort": "high",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('"type":"reasoning_delta"', response.text)
        self.assertIn('"delta":"先理解用户问题。"', response.text)
        self.assertIn('"type":"text_delta"', response.text)
        self.assertIn('"delta":"你好"', response.text)
        self.assertIn('"type":"completed"', response.text)
        self.assertEqual(chat_service.last_reasoning_effort, "high")
        frames = [frame for frame in response.text.strip().split("\n\n") if frame]
        event_names = [frame.splitlines()[0].removeprefix("event: ") for frame in frames]
        payloads = [
            json.loads(frame.splitlines()[1].removeprefix("data: "))
            for frame in frames
        ]
        self.assertEqual(
            event_names,
            ["reasoning_delta", "text_delta", "completed"],
        )
        self.assertEqual(
            [payload["type"] for payload in payloads],
            event_names,
        )

    def test_model_list_returns_provider_model_ids(self) -> None:
        chat_service = StreamingChatService()
        client = TestClient(
            create_app(
                self.settings,
                PlannerService(),
                chat_service,
            )
        )

        response = client.post(
            "/api/v1/models",
            headers=self.authenticated_headers(),
            json={
                "providerName": "DeepSeek",
                "baseUrl": "https://api.deepseek.com",
                "apiKey": "secret-provider-key",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["models"],
            ["deepseek-v4-flash", "deepseek-v4-pro"],
        )

    def test_tool_approval_decision_is_bound_to_correlation_id(self) -> None:
        chat_service = ApprovalDecisionChatService()
        client = TestClient(
            create_app(
                self.settings,
                PlannerService(),
                chat_service,
            )
        )

        response = client.post(
            "/api/v1/tool-approvals/approval-1",
            headers=self.authenticated_headers(),
            json={"decision": "allow_always"},
        )

        self.assertEqual(response.status_code, 204)
        self.assertEqual(
            chat_service.decision,
            ("approval-1", "allow_always", "correlation-123"),
        )


class StreamingChatService:
    def __init__(self) -> None:
        self.last_reasoning_effort: str | None = None

    async def list_models(self, request: object) -> list[str]:
        del request
        return ["deepseek-v4-flash", "deepseek-v4-pro"]

    async def stream(self, request: object, correlation_id: str = ""):
        assert correlation_id == "correlation-123"
        self.last_reasoning_effort = getattr(
            request,
            "reasoning_effort",
            None,
        )
        yield RunEvent(
            type="reasoning_delta",
            delta="先理解用户问题。",
            model="test-model",
        )
        yield RunEvent(
            type="text_delta",
            delta="你好",
            model="test-model",
        )
        yield RunEvent(
            type="completed",
            model="test-model",
        )


class ApprovalDecisionChatService:
    def __init__(self) -> None:
        self.decision: tuple[str, str, str] | None = None

    def decide_tool_approval(self, approval_id, decision, correlation_id):
        self.decision = (approval_id, decision.value, correlation_id)
        return True


if __name__ == "__main__":
    unittest.main()
