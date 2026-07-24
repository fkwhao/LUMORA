import unittest

from lumora_agent.planner import build_plan


class BuildPlanTest(unittest.TestCase):
    def test_sensitive_demo_step_requires_approval(self) -> None:
        steps = build_plan("整理下载目录")

        self.assertEqual(
            [step.title for step in steps],
            ["理解目标", "整理任务材料", "确认敏感操作", "生成结果"],
        )
        self.assertTrue(steps[2].requires_approval)

    def test_blank_goal_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "目标不能为空"):
            build_plan("   ")


if __name__ == "__main__":
    unittest.main()

