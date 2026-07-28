import tempfile
import unittest
from pathlib import Path

from app.config.settings import AgentSettings
from app.config.yaml_loader import load_yaml_mapping


VALID_TOKEN = "a" * 64


class YamlLoaderTest(unittest.TestCase):
    def write_config(self, directory: Path, content: str) -> Path:
        config_path = directory / "dev-local.yml"
        config_path.write_text(content, encoding="utf-8")
        return config_path

    def test_loads_valid_agent_settings(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config_path = self.write_config(
                Path(temporary_directory),
                f"""
server:
  host: 127.0.0.1
  port: 45101
lumora:
  startup-token: {VALID_TOKEN}
  protocol-version: "1"
""",
            )

            settings = AgentSettings.from_yaml(config_path)

        self.assertEqual(settings.host, "127.0.0.1")
        self.assertEqual(settings.port, 45101)
        self.assertEqual(settings.startup_token, VALID_TOKEN)
        self.assertEqual(settings.protocol_version, "1")

    def test_missing_file_error_contains_path(self) -> None:
        missing_path = Path("missing") / "dev-local.yml"

        with self.assertRaises(ValueError) as context:
            load_yaml_mapping(missing_path)

        self.assertIn(str(missing_path), str(context.exception))

    def test_rejects_non_loopback_host(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config_path = self.write_config(
                Path(temporary_directory),
                f"""
server:
  host: 0.0.0.0
  port: 45101
lumora:
  startup-token: {VALID_TOKEN}
  protocol-version: "1"
""",
            )

            with self.assertRaises(ValueError):
                AgentSettings.from_yaml(config_path)

    def test_rejects_short_token(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config_path = self.write_config(
                Path(temporary_directory),
                """
server:
  host: 127.0.0.1
  port: 45101
lumora:
  startup-token: short
  protocol-version: "1"
""",
            )

            with self.assertRaises(ValueError):
                AgentSettings.from_yaml(config_path)

    def test_rejects_missing_required_sections(self) -> None:
        for content in ("lumora: {}\n", "server: {}\n"):
            with self.subTest(content=content):
                with tempfile.TemporaryDirectory() as temporary_directory:
                    config_path = self.write_config(
                        Path(temporary_directory),
                        content,
                    )

                    with self.assertRaises(ValueError):
                        AgentSettings.from_yaml(config_path)

    def test_rejects_python_yaml_tags(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config_path = self.write_config(
                Path(temporary_directory),
                "!!python/object/apply:os.system ['echo unsafe']\n",
            )

            with self.assertRaises(ValueError):
                load_yaml_mapping(config_path)


if __name__ == "__main__":
    unittest.main()
