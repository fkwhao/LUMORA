import tempfile
import unittest
from pathlib import Path

from app.config.settings import AgentSettings


class AgentSettingsTest(unittest.TestCase):
    def test_reads_required_yaml_settings(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config_path = Path(temporary_directory) / "dev-local.yml"
            config_path.write_text(
                f"""
server:
  host: 127.0.0.1
  port: 45123
lumora:
  startup-token: {"a" * 43}
  protocol-version: "1"
  max-parallel-tool-calls: 4
""",
                encoding="utf-8",
            )
            settings = AgentSettings.from_yaml(config_path)

        self.assertEqual(settings.port, 45123)
        self.assertEqual(settings.startup_token, "a" * 43)
        self.assertEqual(settings.protocol_version, "1")
        self.assertEqual(settings.max_parallel_tool_calls, 4)

    def test_rejects_invalid_port_range(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config_path = Path(temporary_directory) / "dev-local.yml"
            config_path.write_text(
                f"""
server:
  host: 127.0.0.1
  port: 70000
lumora:
  startup-token: {"a" * 43}
  protocol-version: "1"
""",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                AgentSettings.from_yaml(config_path)


if __name__ == "__main__":
    unittest.main()
