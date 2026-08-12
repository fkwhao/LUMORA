import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("Token 活动")).toBeInTheDocument();
    expect(screen.getByText("累计 Token 数")).toBeInTheDocument();
  });
});
