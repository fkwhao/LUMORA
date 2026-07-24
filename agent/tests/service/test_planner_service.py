import unittest

from app.service.planner_service import PlannerService


class PlannerServiceTest(unittest.TestCase):
    def test_sensitive_step_requires_approval(self) -> None:
        steps = PlannerService().build_plan("整理下载目录")

        self.assertEqual(
            [step.title for step in steps],
            ["理解目标", "整理任务材料", "确认敏感操作", "生成结果"],
        )
        self.assertTrue(steps[2].requires_approval)

    def test_blank_goal_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "目标不能为空"):
            PlannerService().build_plan("   ")


if __name__ == "__main__":
    unittest.main()
