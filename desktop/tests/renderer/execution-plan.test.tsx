import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlanTodoList } from "../../src/renderer/features/tasks/components/PlanTodoList";
import {
  executionPlanFromWorkLog,
  isExecutionPlanComplete,
} from "../../src/shared/execution-plan";

describe("execution plan", () => {
  it("only treats a non-empty, fully completed plan as complete", () => {
    expect(isExecutionPlanComplete([])).toBe(false);
    expect(
      isExecutionPlanComplete([
        { step: "检查项目", status: "completed" },
        { step: "运行测试", status: "completed" },
      ]),
    ).toBe(true);
    expect(
      isExecutionPlanComplete([
        { step: "检查项目", status: "completed" },
        { step: "运行测试", status: "in_progress" },
      ]),
    ).toBe(false);
  });

  it("reads the latest update_plan snapshot from the work log", () => {
    const plan = executionPlanFromWorkLog([
      {
        itemId: "plan-1",
        kind: "tool",
        status: "completed",
        toolName: "update_plan",
        arguments: {
          steps: [
            { step: "检查项目", status: "in_progress" },
            { step: "运行测试", status: "pending" },
          ],
        },
      },
      {
        itemId: "plan-2",
        kind: "tool",
        status: "completed",
        toolName: "update_plan",
        arguments: {
          steps: [
            { step: "检查项目", status: "completed" },
            { step: "实现计划功能", status: "in_progress" },
            { step: "运行测试", status: "pending" },
          ],
        },
      },
    ]);

    expect(plan).toEqual([
      { step: "检查项目", status: "completed" },
      { step: "实现计划功能", status: "in_progress" },
      { step: "运行测试", status: "pending" },
    ]);
  });

  it("renders live states and collapses from the header", () => {
    render(
      <PlanTodoList
        steps={[
          { step: "检查项目", status: "completed" },
          { step: "实现计划功能", status: "in_progress" },
          { step: "运行测试", status: "pending" },
        ]}
      />,
    );

    const toggle = screen.getByRole("button", { name: "展开或收起执行计划" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("1/3")).toBeInTheDocument();
    expect(screen.getByText("实现计划功能").closest("li")).toHaveAttribute(
      "class",
      expect.stringContaining("active"),
    );

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("execution-plan")).toHaveAttribute(
      "class",
      expect.stringContaining("isCollapsed"),
    );
  });
});
