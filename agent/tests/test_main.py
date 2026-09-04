import subprocess
import sys
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

    def test_direct_script_path_does_not_shadow_official_mcp_sdk(self) -> None:
        agent_root = Path(__file__).resolve().parent.parent
        app_directory = agent_root / "app"
        entrypoint = app_directory / "main.py"
        script = (
            "import runpy, sys\n"
            f"sys.path.insert(0, {str(app_directory)!r})\n"
            f"runpy.run_path({str(entrypoint)!r}, "
            "run_name='lumora_direct_import_smoke')\n"
        )

        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=agent_root,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
