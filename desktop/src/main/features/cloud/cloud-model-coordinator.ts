import type {
  CloudBillingHistory,
  CloudBillingOverview,
  CloudDashboard,
  CloudDesktopState,
  CloudLoginInput,
  CloudModelCatalog,
  CloudModelSource,
  CloudPublicModel,
} from "../../../shared/cloud-contract";
import type { ModelProvider } from "../../../shared/model-contract";
import type { ModelGateway } from "../model/model-gateway";
import type { CloudModelProxy } from "./cloud-model-proxy";
import type { CloudPreferenceStore } from "./cloud-preference-store";
import type { CloudSessionClient } from "./cloud-session-client";

export const CLOUD_PROVIDER_NAME = "LUMORA Cloud";

export class CloudModelCoordinator {
  private restorePromise?: Promise<CloudDesktopState>;

  constructor(
    private readonly session: CloudSessionClient,
    private readonly preferences: CloudPreferenceStore,
    private readonly modelGateway: ModelGateway,
    private readonly proxy: CloudModelProxy,
  ) {}

  getState(): CloudDesktopState {
    const preferences = this.preferences.load();
    return {
      auth: this.session.getState(),
      modelSource: preferences.modelSource,
      selectedCloudModelCode: preferences.selectedCloudModelCode,
    };
  }

  async restoreSession(): Promise<CloudDesktopState> {
    if (this.restorePromise) return this.restorePromise;
    this.restorePromise = this.performRestoreSession()
      .finally(() => {
        this.restorePromise = undefined;
      });
    return this.restorePromise;
  }

  private async performRestoreSession(): Promise<CloudDesktopState> {
    const auth = await this.session.restore();
    const preferences = this.preferences.load();
    if (auth.authenticated && preferences.modelSource === "CLOUD_MANAGED") {
      const models = await this.listAllowedCloudModels();
      if (models.length > 0) {
        const selected = selectCloudModel(models, preferences.selectedCloudModelCode);
        await this.configureManagedModel(selected);
      }
    }
    return this.getState();
  }

  async login(input: CloudLoginInput): Promise<CloudDesktopState> {
    await this.session.login(input);
    const preferences = this.preferences.load();
    if (preferences.modelSource === "CLOUD_MANAGED") {
      const models = await this.listAllowedCloudModels();
      if (models.length > 0) {
        const selected = selectCloudModel(models, preferences.selectedCloudModelCode);
        await this.configureManagedModel(selected);
      }
    }
    return this.getState();
  }

  async logout(): Promise<CloudDesktopState> {
    await this.session.logout();
    return this.getState();
  }

  async getDashboard(): Promise<CloudDashboard> {
    if (!this.session.getState().authenticated) {
      throw new Error("请先登录 LUMORA Cloud");
    }
    const [overview, history, publishedModels] = await Promise.all([
      this.session.requestJson<CloudBillingOverview>("/api/app/billing/overview"),
      this.session.requestJson<CloudBillingHistory>("/api/app/billing/history"),
      this.listCloudModels(),
    ]);
    const models = allowedModels(overview, publishedModels);
    return { state: this.getState(), overview, history, models };
  }

  async getModelCatalog(): Promise<CloudModelCatalog> {
    const state = this.getState();
    if (!state.auth.authenticated || state.modelSource !== "CLOUD_MANAGED") {
      return { state, models: [] };
    }
    const models = await this.listAllowedCloudModels();
    return { state: this.getState(), models };
  }

  async setModelSource(source: CloudModelSource): Promise<CloudDesktopState> {
    if (source === "CLOUD_MANAGED") {
      if (!this.session.getState().authenticated) {
        throw new Error("使用官方套餐前请先登录 LUMORA Cloud");
      }
      const overview = await this.session.requestJson<CloudBillingOverview>(
        "/api/app/billing/overview",
      );
      if (!overview.hasActiveSubscription) {
        throw new Error("当前账号没有有效套餐，请先前往网页控制台购买");
      }
      const preferences = this.preferences.load();
      const models = allowedModels(overview, await this.listCloudModels());
      const selected = selectCloudModel(models, preferences.selectedCloudModelCode);
      await this.configureManagedModel(selected);
      return this.getState();
    }

    const preferences = this.preferences.load();
    const providers = await this.modelGateway.listProviders();
    const localProviders = providers.filter((provider) => !isCloudManagedProvider(provider));
    const selected = localProviders.find(
      (provider) => provider.providerId === preferences.localProviderId,
    ) ?? localProviders.find((provider) => provider.active) ?? localProviders[0];
    if (!selected) {
      throw new Error("尚未配置自定义供应商，请先在“模型与 API”中添加");
    }
    await this.modelGateway.activateProvider(selected.providerId);
    this.preferences.save({
      ...preferences,
      modelSource: "LOCAL_BYOK",
      localProviderId: selected.providerId,
    });
    return this.getState();
  }

  async selectCloudModel(modelCode: string): Promise<CloudDesktopState> {
    if (!this.session.getState().authenticated) {
      throw new Error("选择官方模型前请先登录 LUMORA Cloud");
    }
    if (this.preferences.load().modelSource !== "CLOUD_MANAGED") {
      throw new Error("请先将模型来源切换为官方套餐");
    }
    const models = await this.listAllowedCloudModels();
    const selected = models.find((model) => model.code === modelCode);
    if (!selected) throw new Error("所选云端模型已下线，请刷新后重试");
    await this.configureManagedModel(selected);
    return this.getState();
  }

  async selectLocalProvider(providerId: string): Promise<CloudDesktopState> {
    const providers = await this.modelGateway.listProviders();
    const selected = providers.find((provider) => provider.providerId === providerId);
    if (!selected || isCloudManagedProvider(selected)) {
      throw new Error("自定义供应商不存在");
    }
    await this.modelGateway.activateProvider(providerId);
    const preferences = this.preferences.load();
    this.preferences.save({
      ...preferences,
      modelSource: "LOCAL_BYOK",
      localProviderId: providerId,
    });
    return this.getState();
  }

  private listCloudModels(): Promise<CloudPublicModel[]> {
    return this.session.requestJson<CloudPublicModel[]>("/api/app/catalog/models");
  }

  private async listAllowedCloudModels(): Promise<CloudPublicModel[]> {
    const [overview, models] = await Promise.all([
      this.session.requestJson<CloudBillingOverview>("/api/app/billing/overview"),
      this.listCloudModels(),
    ]);
    return allowedModels(overview, models);
  }

  private async configureManagedModel(model: CloudPublicModel): Promise<void> {
    const proxyAccess = await this.proxy.start();
    const preferences = this.preferences.load();
    const providers = await this.modelGateway.listProviders();
    const activeLocal = providers.find(
      (provider) => provider.active && !isCloudManagedProvider(provider),
    );
    const managed = providers.find(isCloudManagedProvider);
    const input = {
      providerName: CLOUD_PROVIDER_NAME,
      baseUrl: proxyAccess.origin,
      model: model.code,
      contextWindow: model.capabilities.contextWindow,
      apiFormat: "lumora-cloud",
      apiKey: proxyAccess.token,
    } as const;
    const saved = managed
      ? await this.modelGateway.updateProvider(managed.providerId, input)
      : await this.modelGateway.createProvider(input);
    const refreshed = (await this.modelGateway.listProviders())
      .find((provider) => provider.providerId === saved.providerId) ?? saved;
    const modelConfiguration = refreshed.models.find(
      (candidate) => candidate.modelId === model.code,
    );
    const modelInput = {
      modelId: model.code,
      contextWindow: model.capabilities.contextWindow,
      maxOutputTokens: model.capabilities.maxOutputTokens,
      reasoningEfforts: model.capabilities.reasoning
        ? ["low", "medium", "high"]
        : [],
      webSearchEnabled: model.capabilities.webSearch,
    };
    if (modelConfiguration) {
      await this.modelGateway.updateProviderModel(
        saved.providerId,
        modelConfiguration.modelConfigurationId,
        modelInput,
      );
    } else {
      await this.modelGateway.createProviderModel(saved.providerId, modelInput);
    }
    await this.modelGateway.activateProvider(saved.providerId);
    this.preferences.save({
      modelSource: "CLOUD_MANAGED",
      selectedCloudModelCode: model.code,
      localProviderId: activeLocal?.providerId ?? preferences.localProviderId,
    });
  }
}

function allowedModels(
  overview: CloudBillingOverview,
  models: CloudPublicModel[],
): CloudPublicModel[] {
  if (!overview.hasActiveSubscription || !overview.plan) return [];
  if (
    overview.plan.modelAccessMode === "ALL_PUBLISHED_LEGACY"
    || !Array.isArray(overview.plan.modelCodes)
  ) return models;
  const included = new Set(overview.plan.modelCodes);
  return models.filter((model) => included.has(model.code));
}

export function isCloudManagedProvider(provider: ModelProvider): boolean {
  return provider.providerName === CLOUD_PROVIDER_NAME;
}

function selectCloudModel(
  models: CloudPublicModel[],
  preferredCode?: string,
): CloudPublicModel {
  const selected = models.find((model) => model.code === preferredCode) ?? models[0];
  if (!selected) throw new Error("当前没有已发布的云端模型");
  return selected;
}
