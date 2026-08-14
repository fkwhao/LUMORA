import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SkillService } from "./skill-service";

async function writeSkill(root: string, name: string, description: string) {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nSOP\n`, "utf8");
}

describe("SkillService", () => {
  it("discovers project skills with higher priority and persists toggles", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lumora-skill-"));
    const lumoraHome = path.join(root, "home");
    const workspace = path.join(root, "workspace");
    await writeSkill(path.join(lumoraHome, "skills"), "code-review", "个人审查");
    await writeSkill(path.join(workspace, ".lumora", "skills"), "code-review", "项目审查");
    const service = new SkillService({ lumoraHome });

    expect(await service.list(workspace)).toMatchObject([
      { name: "code-review", description: "项目审查", source: "project", enabled: true },
    ]);

    await service.setEnabled("code-review", false);
    expect(await service.list(workspace)).toMatchObject([{ enabled: false }]);
    expect(JSON.parse(await readFile(path.join(lumoraHome, "skill-settings.json"), "utf8"))).toEqual({ disabled: ["code-review"] });
  });

  it("installs a complete skill package into the personal directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lumora-skill-install-"));
    const source = path.join(root, "source-package");
    const lumoraHome = path.join(root, "home");
    await writeSkill(root, "source-package", "生成发布说明");
    await writeFile(path.join(source, "example.md"), "示例", "utf8");
    const service = new SkillService({ lumoraHome });

    const installed = await service.installFromDirectory(source, "user");

    expect(installed).toMatchObject({ name: "source-package", source: "user" });
    expect(await readFile(path.join(lumoraHome, "skills", "source-package", "example.md"), "utf8")).toBe("示例");
    await expect(service.installFromDirectory(source, "user")).rejects.toThrow("已存在");
  });
});
