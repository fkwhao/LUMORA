import unittest
from pathlib import Path

from app.main import default_dev_config_path


class MainTest(unittest.TestCase):
    def test_default_config_is_resolved_from_agent_project_root(self) -> None:
        expected_path = (
            Path(__file__).resolve().parent.parent
            / "config"
            / "dev-local.yml"
        )

        self.assertEqual(
            default_dev_config_path(),
            expected_path,
        )


if __name__ == "__main__":
    unittest.main()
