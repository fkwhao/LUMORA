import { Blocks, Cable, ChevronDown, FolderOpen, PackageOpen, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LumoraMcpApi } from "../../../../shared/mcp-contract";
import type { LumoraSkillApi, SkillSummary } from "../../../../shared/skill-contract";
import { Switch } from "../../../components/ui/switch";
import { McpSettingsPage } from "./McpSettingsPage";

interface PluginsSettingsPageProps {
  api?: LumoraMcpApi;
  skillApi?: LumoraSkillApi;
  workspacePath?: string;
  notify(message: string, tone?: "info" | "success"): void;
}

type PluginSection = "mcp" | "skills";

export function PluginsSettingsPage({
  api,
  skillApi,
  workspacePath,
  notify,
}: PluginsSettingsPageProps) {
  const [section, setSection] = useState<PluginSection>("mcp");
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [installingSkill, setInstallingSkill] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const refreshSkills = useCallback(async () => {
    if (!skillApi) return;
    setLoadingSkills(true);
    try {
      setSkills(await skillApi.list(workspacePath));
    } catch {
      notify("Skill 列表读取失败");
    } finally {
      setLoadingSkills(false);
    }
  }, [notify, skillApi, workspacePath]);

  useEffect(() => {
    if (section === "skills") void refreshSkills();
  }, [refreshSkills, section]);

  useEffect(() => {
    if (!addOpen) return;
    const close = (event: PointerEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) setAddOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAddOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [addOpen]);

  async function installSkill(scope: "user" | "project") {
    if (!skillApi) return;
    setAddOpen(false);
    setInstallingSkill(true);
    try {
      const installed = await skillApi.installFromDirectory(scope, workspacePath);
      if (!installed) return;
      await refreshSkills();
      notify(`已添加 /${installed.name}`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Skill 添加失败");
    } finally {
      setInstallingSkill(false);
    }
  }

  async function browseSkills() {
    if (!skillApi) return;
    try {
      await skillApi.openDirectory("user");
    } catch {
      notify("Skill 目录打开失败");
    }
  }

  async function toggleSkill(skill: SkillSummary, enabled: boolean) {
    if (!skillApi) return;
    setSkills((items) => items.map((item) => item.name === skill.name ? { ...item, enabled } : item));
    try {
      await skillApi.setEnabled(skill.name, enabled);
      notify(enabled ? `已启用 /${skill.name}` : `已停用 /${skill.name}`, "success");
    } catch {
      setSkills((items) => items.map((item) => item.name === skill.name ? { ...item, enabled: !enabled } : item));
      notify("Skill 开关保存失败");
    }
  }

  return (
    <main className="settings-layout plugins-settings-layout">
      <div className="plugins-settings-content">
        <header className="plugins-settings-header">
          <span className="plugins-settings-mark" aria-hidden="true">
            <Blocks size={20} strokeWidth={1.7} />
          </span>
          <div>
            <h1>插件</h1>
            <p>统一管理 MCP 与技能，扩展 LUMORA 的工具和工作方式。</p>
          </div>
          {section === "skills" && (
            <div className="plugins-settings-actions">
              <button type="button" onClick={() => void browseSkills()}>
                <FolderOpen size={14} />
                浏览目录
              </button>
              <div className="plugins-add-menu" ref={addMenuRef}>
                <button
                  className="plugins-add-trigger"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={addOpen}
                  disabled={installingSkill || !skillApi}
                  onClick={() => setAddOpen((open) => !open)}
                >
                  <Plus size={14} />
                  {installingSkill ? "添加中" : "添加"}
                  <ChevronDown size={13} />
                </button>
                {addOpen && (
                  <div className="plugins-add-dropdown" role="menu" aria-label="添加 Skill">
                    <button type="button" role="menuitem" onClick={() => void installSkill("user")}>
                      <PackageOpen size={15} />
                      <span><strong>添加个人 Skill</strong><small>在所有项目中可用</small></span>
                    </button>
                    <button type="button" role="menuitem" disabled={!workspacePath} onClick={() => void installSkill("project")}>
                      <FolderOpen size={15} />
                      <span><strong>添加到当前项目</strong><small>{workspacePath ? "仅在当前项目中可用" : "请先打开一个项目"}</small></span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        <nav className="plugins-settings-tabs" aria-label="插件分类">
          <button
            className={section === "mcp" ? "active" : undefined}
            type="button"
            aria-current={section === "mcp" ? "page" : undefined}
            onClick={() => setSection("mcp")}
          >
            <Cable size={14} />
            MCP
          </button>
          <button
            className={section === "skills" ? "active" : undefined}
            type="button"
            aria-current={section === "skills" ? "page" : undefined}
            onClick={() => setSection("skills")}
          >
            <PackageOpen size={14} />
            技能
          </button>
        </nav>

        {section === "mcp" ? (
          <McpSettingsPage api={api} embedded notify={notify} />
        ) : (
          <section className="skills-settings-panel" aria-label="技能">
            <header>
              <div>
                <strong>Skills</strong>
                <small>项目目录优先于个人目录；Agent 只在需要时加载完整 SOP。</small>
              </div>
              <button type="button" onClick={() => void refreshSkills()} disabled={loadingSkills}>
                <RefreshCw className={loadingSkills ? "is-spinning" : undefined} size={14} />
                刷新
              </button>
            </header>
            {skills.length ? (
              <div className="skills-settings-list">
                {skills.map((skill) => (
                  <article key={skill.name}>
                    <span className="skill-cube" aria-hidden="true"><PackageOpen size={17} /></span>
                    <div>
                      <strong>/{skill.name}</strong>
                      <p>{skill.description}</p>
                      <small>{skill.source === "project" ? "项目" : skill.source === "user" ? "个人" : "内置"} · {skill.mode === "fork" ? "声明 Fork（当前以内联执行）" : "当前上下文"}{skill.resourceCount ? ` · ${skill.resourceCount} 个资源` : ""}</small>
                    </div>
                    <Switch checked={skill.enabled} aria-label={`${skill.enabled ? "停用" : "启用"} ${skill.name}`} onCheckedChange={(enabled) => void toggleSkill(skill, enabled)} />
                  </article>
                ))}
              </div>
            ) : (
              <div className="skills-settings-empty">
                <PackageOpen size={22} />
                <strong>{loadingSkills ? "正在发现 Skills" : "还没有 Skill"}</strong>
                <p>在项目的 .lumora/skills 或 ~/.lumora/skills 中添加 Markdown Skill。</p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
