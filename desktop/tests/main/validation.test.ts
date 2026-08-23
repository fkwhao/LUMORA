import { describe, expect, it } from "vitest";

import {
  validateApprovalDecisionInput,
  validateGoal,
  validateTaskId,
  validateGitReviewScope,
  validateWorkspaceEnvironmentSelection,
} from "../../src/shared/validation";

describe("process-boundary validation", () => {
  it("normalizes a bounded goal", () => {
    expect(validateGoal("  整理下载目录  ")).toBe("整理下载目录");
    expect(() => validateGoal("x".repeat(2_001))).toThrow("不能超过 2000");
    expect(() => validateGoal({ goal: "伪造对象" })).toThrow("必须是字符串");
  });

  it("accepts only simple bounded identifiers", () => {
    expect(validateTaskId("11111111-1111-1111-1111-111111111111")).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(() => validateTaskId("../core")).toThrow("格式无效");
  });

  it("rejects malformed or extended approval objects", () => {
    expect(() =>
      validateApprovalDecisionInput({
        taskId: "task-1",
        approvalId: "approval-1",
        decision: "ALLOW_ALWAYS",
      }),
    ).toThrow("审批决定无效");
    expect(() =>
      validateApprovalDecisionInput({
        taskId: "task-1",
        approvalId: "approval-1",
        decision: "ALLOW_ONCE",
        channel: "arbitrary",
      }),
    ).toThrow("审批参数格式无效");
  });

  it("requires concrete references for commit and branch review scopes", () => {
    expect(validateGitReviewScope({
      scope: "COMMIT",
      commitSha: "abc123",
    })).toEqual({ scope: "COMMIT", commitSha: "abc123" });
    expect(() => validateGitReviewScope({ scope: "COMMIT" }))
      .toThrow("缺少 Commit");
    expect(() => validateGitReviewScope({ scope: "BRANCH_COMPARE" }))
      .toThrow("缺少基准分支");
  });

  it("defaults new tasks to Local and bounds existing Worktree paths", () => {
    expect(validateWorkspaceEnvironmentSelection(undefined))
      .toEqual({ target: "LOCAL" });
    expect(validateWorkspaceEnvironmentSelection({
      target: "EXISTING_WORKTREE",
      worktreePath: " F:\\worktrees\\auth ",
      autoApplyWhenClean: true,
    })).toEqual({
      target: "EXISTING_WORKTREE",
      worktreePath: "F:\\worktrees\\auth",
    });
    expect(() => validateWorkspaceEnvironmentSelection({
      target: "EXISTING_WORKTREE",
    })).toThrow("请选择已有 Worktree");
  });
});
