import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { McpSettingsPage } from "../../src/renderer/features/settings/pages/McpSettingsPage";
import type { LumoraMcpApi } from "../../src/shared/mcp-contract";

describe("MCP settings", () => {
  it("saves a local stdio server with structured arguments and environment", async () => {
    const saveServer = vi.fn(async (serverId: string) => ({
      serverId,
      name: "Local tools",
      enabled: true,
      transportType: "stdio" as const,
      command: "python.exe",
      arguments: ["-m", "local_tools"],
      workingDirectory: "F:\\project\\local-tools",
      environmentKeys: ["API_TOKEN"],
      environmentConfigured: true,
      authType: "none" as const,
      credentialConfigured: false,
    }));
    const api: LumoraMcpApi = {
      listServers: vi.fn(async () => []),
      saveServer,
      deleteServer: vi.fn(async () => undefined),
      testServer: vi.fn(),
    };

    render(<McpSettingsPage api={api} notify={vi.fn()} />);
    await screen.findByText("尚未配置 MCP Server");
    fireEvent.click(screen.getByRole("button", { name: "添加 Server" }));
    fireEvent.change(screen.getByLabelText("名称"), {
      target: { value: "Local tools" },
    });
    fireEvent.change(screen.getByLabelText("Transport"), {
      target: { value: "stdio" },
    });
    fireEvent.change(screen.getByLabelText("启动命令"), {
      target: { value: "python.exe" },
    });
    fireEvent.change(screen.getByLabelText("参数（每行一个）"), {
      target: { value: "-m\nlocal_tools" },
    });
    fireEvent.change(screen.getByLabelText("工作目录（可选）"), {
      target: { value: "F:\\project\\local-tools" },
    });
    fireEvent.change(screen.getByLabelText("环境变量（每行 KEY=value）"), {
      target: { value: "API_TOKEN=secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(saveServer).toHaveBeenCalled());
    expect(saveServer).toHaveBeenCalledWith(expect.any(String), {
      name: "Local tools",
      enabled: true,
      transportType: "stdio",
      command: "python.exe",
      arguments: ["-m", "local_tools"],
      workingDirectory: "F:\\project\\local-tools",
      environment: { API_TOKEN: "secret" },
      clearEnvironment: undefined,
      authType: "none",
    });
    expect(await screen.findByText(/stdio · 本机进程 · python\.exe/)).toBeVisible();
  });
});
