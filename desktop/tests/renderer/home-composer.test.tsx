import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeComposer } from "../../src/renderer/features/tasks/components/HomeComposer";
import type { LumoraCloudApi } from "../../src/shared/cloud-contract";
import type { LumoraModelApi } from "../../src/shared/model-contract";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("home composer", () => {
  it("submits the selected model and approval mode without a context meter", async () => {
    const onSubmit = vi.fn(async () => undefined);
    const modelApi = {
      getSettings: vi.fn(async () => ({
        providerName: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        contextWindow: 128_000,
        apiKeyConfigured: true,
        models: [
          {
            modelConfigurationId: "model-1",
            modelId: "deepseek-v4-pro",
            contextWindow: 128_000,
            maxOutputTokens: 8_192,
            reasoningEfforts: [],
            webSearchEnabled: false,
          },
          {
            modelConfigurationId: "model-2",
            modelId: "deepseek-v4-flash",
            contextWindow: 128_000,
            maxOutputTokens: 8_192,
            reasoningEfforts: [],
            webSearchEnabled: false,
          },
        ],
      })),
    } as unknown as LumoraModelApi;

    render(
      <HomeComposer
        isCreating={false}
        modelApi={modelApi}
        notify={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const modelTrigger = screen.getByRole("button", { name: "选择模型" });
    await waitFor(() => expect(modelTrigger).toHaveTextContent("deepseek-v4-pro"));
    expect(screen.queryByRole("button", { name: "上下文已用" }))
      .not.toBeInTheDocument();

    fireEvent.click(modelTrigger);
    fireEvent.click(await screen.findByRole("menuitemradio", {
      name: "deepseek-v4-flash",
    }));

    const permissionTrigger = screen.getByRole("button", {
      name: "选择权限模式",
    });
    fireEvent.click(permissionTrigger);
    fireEvent.click(await screen.findByRole("menuitemradio", {
      name: /替我审批/,
    }));

    fireEvent.change(screen.getByRole("textbox", {
      name: "告诉 LUMORA 你的目标",
    }), { target: { value: "整理项目" } });
    fireEvent.click(screen.getByRole("button", { name: "开始任务" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      content: "整理项目",
      attachments: [],
      model: "deepseek-v4-flash",
      permissionMode: "auto_approve",
    }));
    expect(window.localStorage.getItem("lumora.permission-mode"))
      .toBe("auto_approve");
  });

  it("uses the official catalog as the model picker source in package mode", async () => {
    const onSubmit = vi.fn(async () => undefined);
    const modelApi = {
      getSettings: vi.fn(async () => ({
        providerName: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        contextWindow: 128_000,
        apiKeyConfigured: true,
        models: [{
          modelConfigurationId: "local-model",
          modelId: "deepseek-v4-pro",
          contextWindow: 128_000,
          maxOutputTokens: 8_192,
          reasoningEfforts: [],
          webSearchEnabled: false,
        }],
      })),
    } as unknown as LumoraModelApi;
    const cloudState = {
      auth: { authenticated: true },
      modelSource: "CLOUD_MANAGED" as const,
      selectedCloudModelCode: "cloud-fast",
    };
    const cloudApi = {
      getModelCatalog: vi.fn(async () => ({
        state: cloudState,
        models: [
          cloudModel("cloud-fast", "Cloud Fast", "OPENAI_COMPATIBLE"),
          cloudModel("cloud-deep", "Cloud Deep", "ANTHROPIC"),
        ],
      })),
      selectCloudModel: vi.fn(async (modelCode: string) => ({
        ...cloudState,
        selectedCloudModelCode: modelCode,
      })),
    } as unknown as LumoraCloudApi;

    render(
      <HomeComposer
        isCreating={false}
        cloudApi={cloudApi}
        modelApi={modelApi}
        notify={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const trigger = screen.getByRole("button", { name: "选择模型" });
    await waitFor(() => expect(trigger).toHaveTextContent("Cloud Fast"));
    fireEvent.click(trigger);
    expect(screen.queryByRole("menuitemradio", { name: "deepseek-v4-pro" }))
      .not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Cloud Deep" }));
    await waitFor(() => expect(cloudApi.selectCloudModel).toHaveBeenCalledWith("cloud-deep"));
    await waitFor(() => expect(trigger).toHaveTextContent("Cloud Deep"));

    fireEvent.change(screen.getByRole("textbox", {
      name: "告诉 LUMORA 你的目标",
    }), { target: { value: "使用套餐模型" } });
    fireEvent.click(screen.getByRole("button", { name: "开始任务" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      model: "cloud-deep",
    })));
  });
});

function cloudModel(
  code: string,
  displayName: string,
  protocolType: "OPENAI_COMPATIBLE" | "RESPONSES" | "ANTHROPIC",
) {
  return {
    code,
    displayName,
    pricingVersion: "v1",
    providerCode: "test-provider",
    protocolType,
    capabilities: {
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      reasoning: false,
      tools: true,
      vision: false,
      json: true,
      webSearch: false,
    },
    publishedAt: "2026-09-02T00:00:00Z",
  };
}
