export type CloudModelSource = "LOCAL_BYOK" | "CLOUD_MANAGED";

export type CloudConsoleDestination = "home" | "plans" | "wallet";

export interface CloudUserProfile {
  id: string;
  email: string;
  displayName: string;
  status: string;
  roles: string[];
}

export interface CloudAuthState {
  authenticated: boolean;
  user?: CloudUserProfile;
  accessTokenExpiresAt?: string;
  sessionExpiresAt?: string;
}

export interface CloudDesktopState {
  auth: CloudAuthState;
  modelSource: CloudModelSource;
  selectedCloudModelCode?: string;
}

export interface CloudLoginInput {
  email: string;
  password: string;
}

export interface CloudPlan {
  planId: number;
  code: string;
  name: string;
  description?: string;
  planVersionId: number;
  versionNo: number;
  monthlyPriceMinor: number;
  currency: string;
  weeklyQuota: number;
  modelAccessMode: "SELECTED" | "ALL_PUBLISHED_LEGACY";
  modelCodes: string[];
}

export interface CloudSubscription {
  subscriptionId: string;
  userId: number;
  planVersionId: number;
  status: string;
  source: string;
  sourceReference: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

export interface CloudQuota {
  bucketId: string;
  periodNo: number;
  startsAt: string;
  endsAt: string;
  granted: number;
  reserved: number;
  consumed: number;
  remaining: number;
}

export interface CloudBillingOverview {
  hasActiveSubscription: boolean;
  plan?: CloudPlan | null;
  subscription?: CloudSubscription | null;
  quota?: CloudQuota | null;
}

export interface CloudLedgerEntry {
  id: string;
  entryType: string;
  referenceType: string;
  referenceId: string;
  grantedDelta: number;
  reservedDelta: number;
  consumedDelta: number;
  description: string;
  createdAt: string;
}

export interface CloudUsageEntry {
  usageId: string;
  requestId: string;
  modelCode: string;
  pricingVersion: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  billedQuota: number;
  status: string;
  occurredAt: string;
}

export interface CloudBillingHistory {
  ledger: CloudLedgerEntry[];
  usage: CloudUsageEntry[];
}

export interface CloudModelCapabilities {
  contextWindow: number;
  maxOutputTokens: number;
  reasoning: boolean;
  tools: boolean;
  vision: boolean;
  json: boolean;
  webSearch: boolean;
}

export interface CloudPublicModel {
  code: string;
  displayName: string;
  description?: string;
  pricingVersion: string;
  providerCode: string;
  capabilities: CloudModelCapabilities;
  publishedAt: string;
}

export interface CloudDashboard {
  state: CloudDesktopState;
  overview: CloudBillingOverview;
  history: CloudBillingHistory;
  models: CloudPublicModel[];
}

export interface CloudModelCatalog {
  state: CloudDesktopState;
  models: CloudPublicModel[];
}

export interface LumoraCloudApi {
  getState(): Promise<CloudDesktopState>;
  restoreSession(): Promise<CloudDesktopState>;
  login(input: CloudLoginInput): Promise<CloudDesktopState>;
  logout(): Promise<CloudDesktopState>;
  getDashboard(): Promise<CloudDashboard>;
  getModelCatalog(): Promise<CloudModelCatalog>;
  setModelSource(source: CloudModelSource): Promise<CloudDesktopState>;
  selectCloudModel(modelCode: string): Promise<CloudDesktopState>;
  selectLocalProvider(providerId: string): Promise<CloudDesktopState>;
  openConsole(destination: CloudConsoleDestination): Promise<void>;
}
