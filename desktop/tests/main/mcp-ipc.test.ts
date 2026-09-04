// @vitest-environment node

import { describe, expect, it } from "vitest";

import { validateMcpServerInput } from "../../src/main/mcp-ipc";
import type { SaveMcpServerInput } from "../../src/shared/mcp-contract";

const validStdioInput: SaveMcpServerInput = {
  name: "Local tools",
  enabled: true,
  transportType: "stdio",
  command: " python.exe ",
  arguments: ["-m", "local_tools"],
  workingDirectory: " F:\\project\\local-tools ",
  environment: { API_TOKEN: "secret" },
  authType: "none",
};

describe("MCP process-boundary validation", () => {
  it("normalizes a bounded Windows stdio configuration", () => {
    expect(validateMcpServerInput(validStdioInput)).toEqual({
      ...validStdioInput,
      command: "python.exe",
      workingDirectory: "F:\\project\\local-tools",
      clearEnvironment: undefined,
    });
  });

  it.each([
    [{ ...validStdioInput, command: "python.exe\r\ncalc.exe" }, "启动命令"],
    [{ ...validStdioInput, workingDirectory: "relative\\path" }, "绝对路径"],
    [{
      ...validStdioInput,
      environment: { Path: "one", PATH: "two" },
    }, "名称重复"],
    [{
      ...validStdioInput,
      authType: "bearer",
      credential: "secret",
    }, "不支持 HTTP"],
  ] as const)("rejects unsafe or mixed stdio fields", (input, message) => {
    expect(() => validateMcpServerInput(input)).toThrow(message);
  });

  it("rejects stdio fields on Streamable HTTP configurations", () => {
    expect(() => validateMcpServerInput({
      name: "Remote",
      enabled: true,
      transportType: "streamable_http",
      url: "https://mcp.example/mcp",
      environment: { TOKEN: "secret" },
      authType: "none",
    })).toThrow("不能包含 stdio");
  });
});
