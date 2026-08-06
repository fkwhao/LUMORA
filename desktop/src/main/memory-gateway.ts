import type {
  MemoryResetResult,
  MemorySettings,
} from "../shared/memory-contract";

export interface MemoryGateway {
  getSettings(): Promise<MemorySettings>;
  updateSettings(enabled: boolean): Promise<MemorySettings>;
  reset(): Promise<MemoryResetResult>;
}
