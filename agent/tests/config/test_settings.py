import os
import unittest
from unittest.mock import patch

from app.config.settings import AgentSettings


class AgentSettingsTest(unittest.TestCase):
    def test_reads_required_runtime_environment(self) -> None:
        environment = {
            "LUMORA_AGENT_PORT": "45123",
            "LUMORA_STARTUP_TOKEN": "a" * 43,
            "LUMORA_PROTOCOL_VERSION": "1",
        }

        with patch.dict(os.environ, environment, clear=True):
            settings = AgentSettings.from_environment()

        self.assertEqual(settings.port, 45123)
        self.assertEqual(settings.startup_token, "a" * 43)
        self.assertEqual(settings.protocol_version, "1")

    def test_rejects_non_loopback_port_range(self) -> None:
        environment = {
            "LUMORA_AGENT_PORT": "70000",
            "LUMORA_STARTUP_TOKEN": "a" * 43,
            "LUMORA_PROTOCOL_VERSION": "1",
        }

        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaises(ValueError):
                AgentSettings.from_environment()


if __name__ == "__main__":
    unittest.main()
