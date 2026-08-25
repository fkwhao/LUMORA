import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProfilePage } from "../../src/renderer/features/settings/pages/ProfilePage";
import type { LumoraModelApi } from "../../src/shared/model-contract";

describe("profile token usage", () => {
  it("renders daily and cache statistics from the local usage API", async () => {
    const api = {
      getUsageStatistics: vi.fn(async () => ({
        usage: {
          promptTokens: 100,
          completionTokens: 30,
          totalTokens: 130,
          inputTokens: 40,
          outputTokens: 20,
          reasoningTokens: 10,
          cacheReadTokens: 60,
          cacheWriteTokens: 0,
          cacheMetricsAvailable: true,
        },
        peakDailyTokens: 130,
        activeDays: 1,
        currentStreak: 1,
        longestStreak: 1,
        requestCount: 1,
        conversationCount: 1,
        daily: [],
      })),
    } as unknown as LumoraModelApi;

    render(<ProfilePage api={api} />);

    expect(await screen.findByText("60.0%")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "个人资料" })).toBeInTheDocument();
    expect(screen.getByText("LUMORA")).toBeInTheDocument();
    expect(screen.queryByText("LUMORA 本地用户")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新个人资料统计" })).toBeInTheDocument();
    expect(screen.getByText("Token 活动")).toBeInTheDocument();
    expect(screen.getByText("累计 Token 数")).toBeInTheDocument();
    const activityDays = screen.getAllByRole("gridcell");
    expect(activityDays).toHaveLength(364);
    expect(document.querySelectorAll(".token-heatmap-week")).toHaveLength(52);
    expect(document.querySelectorAll(".token-heatmap-week:first-child [role='gridcell']")).toHaveLength(7);
    expect(document.querySelectorAll(".token-heatmap-months span").length).toBeGreaterThanOrEqual(11);

    const firstActivityDay = activityDays[0]!;
    fireEvent.pointerEnter(firstActivityDay);
    expect(screen.getByRole("tooltip")).toHaveTextContent("使用了 0 个 Token");
    fireEvent.pointerLeave(firstActivityDay);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
