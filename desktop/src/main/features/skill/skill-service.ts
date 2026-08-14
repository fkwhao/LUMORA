import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parse } from "yaml";

import type { SkillInstallScope, SkillSource, SkillSummary } from "../../../shared/skill-contract";

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_BYTES = 256 * 1024;
const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const MAX_PACKAGE_FILES = 200;

export class SkillService {
  private readonly lumoraHome: string;
  private readonly builtinRoot?: string;

  constructor(options?: { lumoraHome?: string; builtinRoot?: string }) {
    this.lumoraHome = options?.lumoraHome ?? path.join(homedir(), ".lumora");
    this.builtinRoot = options?.builtinRoot;
  }

  async list(workspacePath?: string): Promise<SkillSummary[]> {
    const disabled = await this.disabledNames();
    const skills = new Map<string, SkillSummary>();
    const roots: Array<[SkillSource, string | undefined]> = [
      ["builtin", this.builtinRoot],
      ["user", path.join(this.lumoraHome, "skills")],
      ["project", workspacePath ? path.join(workspacePath, ".lumora", "skills") : undefined],
    ];
    for (const [source, root] of roots) {
      if (!root) continue;
      for (const file of await this.skillFiles(root)) {
        const skill = await this.parseSkill(file, source, disabled);
        if (skill) skills.set(skill.name, skill);
      }
    }
    return [...skills.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  async setEnabled(name: string, enabled: boolean): Promise<void> {
    const normalized = name.trim().toLowerCase();
    if (!SKILL_NAME.test(normalized)) throw new TypeError("Skill 名称格式无效");
    const disabled = await this.disabledNames();
    if (enabled) disabled.delete(normalized);
    else disabled.add(normalized);
    await mkdir(this.lumoraHome, { recursive: true });
    await writeFile(
      path.join(this.lumoraHome, "skill-settings.json"),
      `${JSON.stringify({ disabled: [...disabled].sort() }, null, 2)}\n`,
      "utf8",
    );
  }

  async directory(scope: SkillInstallScope, workspacePath?: string): Promise<string> {
    const root = this.rootForScope(scope, workspacePath);
    await mkdir(root, { recursive: true });
    return root;
  }

  async installFromDirectory(
    sourceDirectory: string,
    scope: SkillInstallScope,
    workspacePath?: string,
  ): Promise<SkillSummary> {
    const sourceRoot = await realpath(sourceDirectory);
    const sourceDetails = await stat(sourceRoot);
    if (!sourceDetails.isDirectory()) throw new TypeError("请选择一个 Skill 文件夹");
    const manifest = path.join(sourceRoot, "SKILL.md");
    const parsed = await this.parseSkill(manifest, scope === "project" ? "project" : "user", new Set());
    if (!parsed) throw new TypeError("所选文件夹缺少有效的 SKILL.md");

    const destinationRoot = await this.directory(scope, workspacePath);
    const destination = path.join(destinationRoot, parsed.name);
    try {
      await stat(destination);
      throw new TypeError(`Skill /${parsed.name} 已存在，请先移除原目录`);
    } catch (error) {
      if (error instanceof TypeError) throw error;
    }
    const stagingRoot = await mkdtemp(path.join(destinationRoot, ".installing-"));
    const stagedPackage = path.join(stagingRoot, parsed.name);
    try {
      await this.copyPackage(sourceRoot, stagedPackage, { files: 0, bytes: 0 });
      await rename(stagedPackage, destination);
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
    const installed = await this.parseSkill(
      path.join(destination, "SKILL.md"),
      scope === "project" ? "project" : "user",
      await this.disabledNames(),
    );
    if (!installed) throw new TypeError("Skill 安装后校验失败");
    return installed;
  }

  private rootForScope(scope: SkillInstallScope, workspacePath?: string): string {
    if (scope === "project") {
      const normalizedWorkspace = workspacePath?.trim();
      if (!normalizedWorkspace) throw new TypeError("请先打开一个项目，再添加项目 Skill");
      return path.join(normalizedWorkspace, ".lumora", "skills");
    }
    return path.join(this.lumoraHome, "skills");
  }

  private async copyPackage(
    source: string,
    destination: string,
    budget: { files: number; bytes: number },
  ): Promise<void> {
    const details = await lstat(source);
    if (details.isSymbolicLink()) throw new TypeError("Skill 包不能包含符号链接");
    if (details.isDirectory()) {
      await mkdir(destination, { recursive: false });
      for (const entry of await readdir(source)) {
        await this.copyPackage(path.join(source, entry), path.join(destination, entry), budget);
      }
      return;
    }
    if (!details.isFile()) throw new TypeError("Skill 包包含不支持的文件类型");
    budget.files += 1;
    budget.bytes += details.size;
    if (budget.files > MAX_PACKAGE_FILES || budget.bytes > MAX_PACKAGE_BYTES) {
      throw new TypeError("Skill 包超过 200 个文件或 10 MB 限制");
    }
    await copyFile(source, destination);
  }

  private async disabledNames(): Promise<Set<string>> {
    try {
      const value = JSON.parse(await readFile(path.join(this.lumoraHome, "skill-settings.json"), "utf8")) as { disabled?: unknown };
      return new Set(Array.isArray(value.disabled)
        ? value.disabled.filter((item): item is string => typeof item === "string" && SKILL_NAME.test(item))
        : []);
    } catch {
      return new Set();
    }
  }

  private async skillFiles(root: string): Promise<string[]> {
    try {
      const safeRoot = await realpath(root);
      const entries = await readdir(safeRoot, { withFileTypes: true });
      const candidates = entries.flatMap((entry) => {
        if (entry.isFile() && entry.name.endsWith(".md")) return [path.join(safeRoot, entry.name)];
        if (entry.isDirectory()) return [path.join(safeRoot, entry.name, "SKILL.md")];
        return [];
      });
      const safe: string[] = [];
      for (const candidate of candidates) {
        try {
          const resolved = await realpath(candidate);
          const relative = path.relative(safeRoot, resolved);
          const details = await stat(resolved);
          if (!relative.startsWith("..") && !path.isAbsolute(relative) && details.isFile() && details.size <= MAX_SKILL_BYTES) safe.push(resolved);
        } catch { /* Invalid candidates are ignored. */ }
      }
      return safe.sort();
    } catch {
      return [];
    }
  }

  private async parseSkill(file: string, source: SkillSource, disabled: Set<string>): Promise<SkillSummary | undefined> {
    try {
      const text = await readFile(file, "utf8");
      const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
      if (!match) return undefined;
      const metadata = parse(match[1] ?? "") as Record<string, unknown>;
      const name = String(metadata?.name ?? "").trim().toLowerCase();
      const description = String(metadata?.description ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
      const mode = String(metadata?.mode ?? "inline").trim().toLowerCase();
      const context = String(metadata?.context ?? "full").trim().toLowerCase();
      const model = String(metadata?.model ?? "").trim() || undefined;
      if (!SKILL_NAME.test(name) || !description || !["inline", "fork"].includes(mode) || !["full", "recent", "none"].includes(context)) return undefined;
      const resourceCount = path.basename(file) === "SKILL.md"
        ? (await readdir(path.dirname(file), { withFileTypes: true })).filter((entry) => entry.name !== "SKILL.md").length
        : 0;
      return { name, description, source, mode: mode as SkillSummary["mode"], context: context as SkillSummary["context"], model, enabled: !disabled.has(name), resourceCount };
    } catch {
      return undefined;
    }
  }
}
