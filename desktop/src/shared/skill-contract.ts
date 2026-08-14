export type SkillSource = "project" | "user" | "builtin";
export type SkillMode = "inline" | "fork";
export type SkillContext = "full" | "recent" | "none";
export type SkillInstallScope = "user" | "project";

export interface SkillSummary {
  name: string;
  description: string;
  source: SkillSource;
  mode: SkillMode;
  context: SkillContext;
  model?: string;
  enabled: boolean;
  resourceCount: number;
}

export interface LumoraSkillApi {
  list(workspacePath?: string): Promise<SkillSummary[]>;
  setEnabled(name: string, enabled: boolean): Promise<void>;
  openDirectory(scope: SkillInstallScope, workspacePath?: string): Promise<void>;
  installFromDirectory(
    scope: SkillInstallScope,
    workspacePath?: string,
  ): Promise<SkillSummary | undefined>;
}
