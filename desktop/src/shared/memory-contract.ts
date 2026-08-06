export interface MemorySettings {
  enabled: boolean;
}

export interface MemoryResetResult {
  deletedCount: number;
}

export interface LumoraMemoryApi {
  getSettings(): Promise<MemorySettings>;
  updateSettings(enabled: boolean): Promise<MemorySettings>;
  reset(): Promise<MemoryResetResult>;
}
