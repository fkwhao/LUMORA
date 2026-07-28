import unittest

from app.config.settings import AgentSettings
from app.main import create_app
from app.service.planner_service import PlannerService
from fastapi.testclient import TestClient

STARTUP_TOKEN = "a" * 64


class AgentControllerTest(unittest.TestCase):
    def setUp(self) -> None:
        settings = AgentSettings(
            host="127.0.0.1",
            port=45101,
            startup_token=STARTUP_TOKEN,
            protocol_version="1",
        )
        self.client = TestClient(create_app(settings, PlannerService()))

    def authenticated_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {STARTUP_TOKEN}",
            "X-Lumora-Protocol-Version": "1",
            "X-Correlation-Id": "correlation-123",
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
            json={"taskId": "task-123", "goal": "整理本地文档"},
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


if __name__ == "__main__":
    unittest.main()
