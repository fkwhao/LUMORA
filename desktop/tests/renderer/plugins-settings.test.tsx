import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PluginsSettingsPage } from "../../src/renderer/features/settings/pages/PluginsSettingsPage";
import type { LumoraMcpApi } from "../../src/shared/mcp-contract";
import type { LumoraSkillApi } from "../../src/shared/skill-contract";

describe("plugin settings", () => {
  it("integrates MCP settings and manages discovered skills", async () => {
    const api = {
      listServers: vi.fn(async () => []),
    } as unknown as LumoraMcpApi;

    const skillApi = {
      list: vi.fn(async () => [{
        name: "code-review",
        description: "按项目规范审查代码",
        source: "project",
        mode: "inline",
        context: "full",
        enabled: true,
        resourceCount: 0,
      }]),
      setEnabled: vi.fn(async () => undefined),
      openDirectory: vi.fn(async () => undefined),
      installFromDirectory: vi.fn(async () => undefined),
    } as LumoraSkillApi;

    render(<PluginsSettingsPage api={api} skillApi={skillApi} workspacePath="F:/project" notify={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "插件" })).toBeVisible();
    expect(await screen.findByText("尚未配置 MCP Server")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "技能" }));

    expect(screen.getByRole("region", { name: "技能" })).toBeVisible();
    expect(await screen.findByText("/code-review")).toBeVisible();
    expect(skillApi.list).toHaveBeenCalledWith("F:/project");
    expect(screen.queryByText("尚未配置 MCP Server")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "浏览目录" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /添加/ }));
    expect(screen.getByRole("menu", { name: "添加 Skill" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /添加个人 Skill/ })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /添加到当前项目/ })).toBeEnabled();
  });
});
