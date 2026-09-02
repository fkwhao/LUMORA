// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { CloudModelCoordinator } from "../../src/main/features/cloud/cloud-model-coordinator";
import type { CloudModelProxy } from "../../src/main/features/cloud/cloud-model-proxy";
import type { CloudPreferenceStore } from "../../src/main/features/cloud/cloud-preference-store";
import type { CloudSessionClient } from "../../src/main/features/cloud/cloud-session-client";
import type { ModelGateway } from "../../src/main/features/model/model-gateway";
import type {
  CloudBillingOverview,
  CloudPublicModel,
} from "../../src/shared/cloud-contract";

describe("Cloud model coordinator", () => {
  it("exposes only the current purchased plan version's published models", async () => {
    const models = [cloudModel("model-a"), cloudModel("model-b")];
    const coordinator = coordinatorFor(overview("SELECTED", ["model-b"]), models);

    const catalog = await coordinator.getModelCatalog();

    expect(catalog.models.map((model) => model.code)).toEqual(["model-b"]);
  });

  it("keeps migrated legacy subscriptions compatible with all published models", async () => {
    const models = [cloudModel("model-a"), cloudModel("model-b")];
    const coordinator = coordinatorFor(overview("ALL_PUBLISHED_LEGACY", []), models);

    const catalog = await coordinator.getModelCatalog();

    expect(catalog.models.map((model) => model.code)).toEqual(["model-a", "model-b"]);
  });

  it("projects the cloud hosted-search capability into the managed Agent model", async () => {
    const model = cloudModel("model-search", true);
    const createProviderModel = vi.fn(async () => ({}));
    const managedProvider = {
      providerId: "cloud-provider",
      providerName: "LUMORA Cloud",
      active: false,
      models: [],
    };
    const session = {
      getState: () => ({ authenticated: true }),
      requestJson: vi.fn(async (path: string) => {
        if (path === "/api/app/billing/overview") return overview("SELECTED", [model.code]);
        if (path === "/api/app/catalog/models") return [model];
        throw new Error(`Unexpected path: ${path}`);
      }),
    } as unknown as CloudSessionClient;
    const preferences = {
      load: () => ({ modelSource: "LOCAL_BYOK" as const }),
      save: vi.fn(),
    } as unknown as CloudPreferenceStore;
    const modelGateway = {
      listProviders: vi.fn(async () => []),
      createProvider: vi.fn(async () => managedProvider),
      createProviderModel,
      activateProvider: vi.fn(async () => managedProvider),
    } as unknown as ModelGateway;
    const proxy = {
      start: vi.fn(async () => ({ origin: "http://127.0.0.1:4567", token: "temporary" })),
    } as unknown as CloudModelProxy;
    const coordinator = new CloudModelCoordinator(session, preferences, modelGateway, proxy);

    await coordinator.setModelSource("CLOUD_MANAGED");

    expect(createProviderModel).toHaveBeenCalledWith(
      "cloud-provider",
      expect.objectContaining({ modelId: "model-search", webSearchEnabled: true }),
    );
  });
});

function coordinatorFor(
  billingOverview: CloudBillingOverview,
  models: CloudPublicModel[],
): CloudModelCoordinator {
  const requestJson = vi.fn(async (path: string) => {
    if (path === "/api/app/billing/overview") return billingOverview;
    if (path === "/api/app/catalog/models") return models;
    throw new Error(`Unexpected path: ${path}`);
  });
  const session = {
    getState: () => ({ authenticated: true }),
    requestJson,
  } as unknown as CloudSessionClient;
  const preferences = {
    load: () => ({ modelSource: "CLOUD_MANAGED" as const }),
  } as unknown as CloudPreferenceStore;
  return new CloudModelCoordinator(
    session,
    preferences,
    {} as ModelGateway,
    {} as CloudModelProxy,
  );
}

function overview(
  modelAccessMode: "SELECTED" | "ALL_PUBLISHED_LEGACY",
  modelCodes: string[],
): CloudBillingOverview {
  return {
    hasActiveSubscription: true,
    plan: {
      planId: 1,
      code: "pro",
      name: "Pro",
      planVersionId: 11,
      versionNo: 1,
      monthlyPriceMinor: 9900,
      currency: "CNY",
      weeklyQuota: 1000,
      modelAccessMode,
      modelCodes,
    },
  };
}

function cloudModel(code: string, webSearch = false): CloudPublicModel {
  return {
    code,
    displayName: code,
    pricingVersion: `${code}-v1`,
    providerCode: "provider",
    capabilities: {
      contextWindow: 128_000,
      maxOutputTokens: 4096,
      reasoning: true,
      tools: true,
      vision: false,
      json: true,
      webSearch,
    },
    publishedAt: "2026-09-02T00:00:00Z",
  };
}
