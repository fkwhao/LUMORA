import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "../../src/renderer/features/settings/pages/SettingsPage";
import type { LumoraModelApi } from "../../src/shared/model-contract";

afterEach(cleanup);

describe("model provider settings", () => {
  it("discovers models before a new provider is saved", async () => {
    const listModels = vi.fn(async () => ["model-a", "model-b"]);
    const createProvider = vi.fn(async () => ({
      providerId: "provider-1",
      providerName: "Example",
      baseUrl: "https://api.example.com/v1",
      model: "model-b",
      contextWindow: 128_000,
      apiFormat: "chat-completions" as const,
      active: true,
      apiKeyConfigured: true,
      models: [],
    }));
    const listProviderModels = vi.fn(async () => ["model-a", "model-b"]);
    const createProviderModel = vi.fn(async (_providerId, input) => ({
      modelConfigurationId: "model-config-1",
      ...input,
    }));
    const updateProviderModel = vi.fn();
    const api = {
      listProviders: vi.fn(async () => []),
      listModels,
      createProvider,
      listProviderModels,
      createProviderModel,
      updateProviderModel,
    } as unknown as LumoraModelApi;

    render(
      <SettingsPage
        api={api}
        archivedTasks={[]}
        onBack={vi.fn()}
        onRestoreTask={vi.fn()}
        onDeleteTask={vi.fn()}
        onDeleteAllTasks={vi.fn()}
        notify={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "模型与 API" }));
    const discoverButton = await screen.findByRole("button", {
      name: "获取模型",
    });
    expect(discoverButton).toBeDisabled();
    const addModelButton = screen.getByRole("button", { name: "添加模型" });
    expect(addModelButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText("供应商名称"), {
      target: { value: "Example" },
    });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://api.example.com/v1" },
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "provider-secret" },
    });

    expect(discoverButton).toBeEnabled();
    fireEvent.click(discoverButton);

    await waitFor(() =>
      expect(listModels).toHaveBeenCalledWith({
        providerName: "Example",
        baseUrl: "https://api.example.com/v1",
        apiFormat: "chat-completions",
        apiKey: "provider-secret",
      }),
    );
    expect(screen.getByLabelText("初始模型 ID")).toHaveValue("model-a");
    expect(
      screen.getByRole("button", { name: "选择模型 model-a" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "选择模型 model-b" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "选择模型 model-b" }),
    );
    expect(screen.getByLabelText("初始模型 ID")).toHaveValue("model-b");

    fireEvent.click(addModelButton);
    expect(
      screen.getByRole("heading", { name: "添加模型配置" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("模型 ID"), {
      target: { value: "manual-model" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "添加模型配置" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "选择模型 manual-model" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() => expect(createProvider).toHaveBeenCalled());
    expect(listProviderModels).toHaveBeenCalledWith(
      "provider-1",
      "provider-secret",
    );
    expect(createProviderModel).toHaveBeenCalledWith(
      "provider-1",
      expect.objectContaining({ modelId: "manual-model" }),
    );
  });

  it("explains that a model name can be entered manually", async () => {
    const api = {
      listProviders: vi.fn(async () => []),
      listModels: vi.fn(async () => {
        throw new Error("HTTP 404");
      }),
    } as unknown as LumoraModelApi;

    render(
      <SettingsPage
        api={api}
        archivedTasks={[]}
        onBack={vi.fn()}
        onRestoreTask={vi.fn()}
        onDeleteTask={vi.fn()}
        onDeleteAllTasks={vi.fn()}
        notify={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "模型与 API" }));
    fireEvent.change(await screen.findByLabelText("供应商名称"), {
      target: { value: "Example" },
    });
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://api.example.com/v1" },
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "provider-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "获取模型" }));

    expect(
      await screen.findByText(/该服务可能不支持模型列表接口，请手动填写模型名/),
    ).toBeInTheDocument();
  });
});
