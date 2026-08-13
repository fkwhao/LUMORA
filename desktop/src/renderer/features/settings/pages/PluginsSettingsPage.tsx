import { Blocks, Cable, PackageOpen } from "lucide-react";
import { useState } from "react";

import type { LumoraMcpApi } from "../../../../shared/mcp-contract";
import { McpSettingsPage } from "./McpSettingsPage";

interface PluginsSettingsPageProps {
  api?: LumoraMcpApi;
  notify(message: string, tone?: "info" | "success"): void;
}

type PluginSection = "mcp" | "skills";

export function PluginsSettingsPage({
  api,
  notify,
}: PluginsSettingsPageProps) {
  const [section, setSection] = useState<PluginSection>("mcp");

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
          <section className="skills-settings-placeholder" aria-label="技能">
            <span aria-hidden="true">
              <PackageOpen size={22} strokeWidth={1.6} />
            </span>
            <strong>技能管理</strong>
            <p>技能界面已经预留，下一步接入技能发现、启停和配置。</p>
          </section>
        )}
      </div>
    </main>
  );
}
