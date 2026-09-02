import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CloudModelSource } from "../../../shared/cloud-contract";

export interface CloudPreferences {
  modelSource: CloudModelSource;
  selectedCloudModelCode?: string;
  localProviderId?: string;
}

const DEFAULT_PREFERENCES: CloudPreferences = {
  modelSource: "LOCAL_BYOK",
};

export class CloudPreferenceStore {
  constructor(private readonly filePath: string) {}

  load(): CloudPreferences {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<CloudPreferences>;
      if (
        parsed.modelSource !== "LOCAL_BYOK"
        && parsed.modelSource !== "CLOUD_MANAGED"
      ) {
        return { ...DEFAULT_PREFERENCES };
      }
      return {
        modelSource: parsed.modelSource,
        selectedCloudModelCode: normalizedId(parsed.selectedCloudModelCode),
        localProviderId: normalizedId(parsed.localProviderId),
      };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  save(value: CloudPreferences): CloudPreferences {
    const normalized: CloudPreferences = {
      modelSource: value.modelSource,
      selectedCloudModelCode: normalizedId(value.selectedCloudModelCode),
      localProviderId: normalizedId(value.localProviderId),
    };
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(normalized), "utf8");
    renameSync(temporaryPath, this.filePath);
    return normalized;
  }
}

function normalizedId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 200
    ? normalized
    : undefined;
}
