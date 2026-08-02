export type ResolvedAppearanceTheme = "light" | "dark";

export interface ProjectDirectory {
  gitBranch?: string;
  name: string;
  path: string;
}

export interface LumoraWindowApi {
  setAppearance(theme: ResolvedAppearanceTheme): void;
  selectProjectDirectory(): Promise<ProjectDirectory | undefined>;
}
