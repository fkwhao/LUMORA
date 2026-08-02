import tempfile
import unittest
from pathlib import Path

from app.prompt.prompt_builder import PromptBuilder
from app.prompt.prompt_context import PromptContext
from app.prompt.prompt_loader import PromptLoader


class PromptBuilderTest(unittest.TestCase):
    def test_build_contains_identity_and_runtime_capabilities(self) -> None:
        prompt = PromptBuilder().build(
            PromptContext(
                workspace_path="F:/project/LUMORA",
                available_tools=("file.read", "file.search"),
                project_instructions=("遵守项目现有代码规范。",),
            )
        )

        self.assertIn("你是 LUMORA", prompt)
        self.assertIn("F:/project/LUMORA", prompt)
        self.assertIn("file.read", prompt)
        self.assertIn("遵守项目现有代码规范。", prompt)
        self.assertNotIn("API Key", prompt.split("# 当前运行上下文")[1])

    def test_build_does_not_advertise_unregistered_tools(self) -> None:
        prompt = PromptBuilder().build()

        self.assertIn("当前未向模型注册任何可调用工具", prompt)
        self.assertNotIn("shell.execute", prompt)

    def test_loader_rejects_empty_prompt_section(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            for file_name in PromptLoader._SECTION_FILES:
                (directory / file_name).write_text(
                    "内容" if file_name != "20_execution.md" else "",
                    encoding="utf-8",
                )

            with self.assertRaisesRegex(
                ValueError,
                "System Prompt 片段不能为空",
            ):
                PromptLoader(directory).load_static_sections()


if __name__ == "__main__":
    unittest.main()
