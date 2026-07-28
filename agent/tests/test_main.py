import unittest
from pathlib import Path

from app.main import default_dev_config_path


class MainTest(unittest.TestCase):
    def test_default_config_is_relative_to_agent_working_directory(self) -> None:
        self.assertEqual(
            default_dev_config_path(),
            Path("config/dev-local.yml"),
        )


if __name__ == "__main__":
    unittest.main()
