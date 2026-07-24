import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoTaskGateway } from "../../src/main/task-gateway";
import type { TaskEvent } from "../../src/shared/task-contract";

describe("demo task approval boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a decision before an approval is pending", async () => {
    const gateway = new DemoTaskGateway();
    const task = await gateway.create("整理下载目录");

    await expect(
      gateway.decideApproval({
        taskId: task.taskId,
        approvalId: "forged",
        decision: "ALLOW_ONCE",
      }),
    ).rejects.toThrow("没有待处理的审批");
    gateway.dispose();
  });

  it("requires the exact pending approval and rejects duplicates", async () => {
    const gateway = new DemoTaskGateway();
    const task = await gateway.create("整理下载目录");
    const events: TaskEvent[] = [];
    gateway.subscribe(task.taskId, (event) => events.push(event));

    await vi.advanceTimersByTimeAsync(1_850);
    const approval = events.find((event) => event.approval)?.approval;
    expect(approval).toBeDefined();

    await expect(
      gateway.decideApproval({
        taskId: task.taskId,
        approvalId: "stale-approval",
        decision: "ALLOW_ONCE",
      }),
    ).rejects.toThrow("审批请求不匹配");

    await gateway.decideApproval({
      taskId: task.taskId,
      approvalId: approval!.approvalId,
      decision: "ALLOW_ONCE",
    });

    await expect(
      gateway.decideApproval({
        taskId: task.taskId,
        approvalId: approval!.approvalId,
        decision: "ALLOW_ONCE",
      }),
    ).rejects.toThrow("没有待处理的审批");
    gateway.dispose();
  });
});
