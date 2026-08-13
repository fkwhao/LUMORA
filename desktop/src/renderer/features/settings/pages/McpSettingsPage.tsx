import {
  Cable,
  CircleCheck,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import type {
  LumoraMcpApi,
  McpAuthenticationType,
  McpServer,
  SaveMcpServerInput,
} from "../../../../shared/mcp-contract";
import { Switch } from "../../../components/ui/switch";

interface McpSettingsPageProps {
  api?: LumoraMcpApi;
  embedded?: boolean;
  notify(message: string, tone?: "info" | "success"): void;
}

interface McpDraft extends Omit<McpServer, "credentialConfigured"> {
  credentialConfigured: boolean;
  credential: string;
  persistedAuthType?: McpAuthenticationType;
  persistedCredentialConfigured: boolean;
}

export function McpSettingsPage({
  api,
  embedded = false,
  notify,
}: McpSettingsPageProps) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [draft, setDraft] = useState<McpDraft>();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  const [testMessage, setTestMessage] = useState<string>();

  useEffect(() => {
    if (!api) {
      setLoading(false);
      return;
    }
    let active = true;
    void api.listServers()
      .then((items) => active && setServers(items))
      .catch((loadError: unknown) => active && setError(toMessage(loadError)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api]);

  async function saveDraft() {
    if (!api || !draft || busyId) return;
    setBusyId(draft.serverId);
    setError(undefined);
    setTestMessage(undefined);
    try {
      const saved = await api.saveServer(draft.serverId, toInput(draft));
      setServers((current) => [
        ...current.filter((server) => server.serverId !== saved.serverId),
        saved,
      ]);
      setDraft(undefined);
      notify("MCP Server 配置已保存", "success");
    } catch (saveError) {
      setError(toMessage(saveError));
    } finally {
      setBusyId(undefined);
    }
  }

  async function toggleServer(server: McpServer) {
    if (!api || busyId) return;
    setBusyId(server.serverId);
    setError(undefined);
    try {
      const saved = await api.saveServer(server.serverId, {
        name: server.name,
        enabled: !server.enabled,
        url: server.url,
        authType: server.authType,
        headerName: server.headerName,
      });
      setServers((current) => current.map((item) =>
        item.serverId === saved.serverId ? saved : item));
    } catch (toggleError) {
      setError(toMessage(toggleError));
    } finally {
      setBusyId(undefined);
    }
  }

  async function deleteServer(serverId: string) {
    if (!api || busyId) return;
    setBusyId(serverId);
    setError(undefined);
    try {
      await api.deleteServer(serverId);
      setServers((current) => current.filter((server) => server.serverId !== serverId));
      notify("MCP Server 已移除", "success");
    } catch (deleteError) {
      setError(toMessage(deleteError));
    } finally {
      setBusyId(undefined);
    }
  }

  async function testServer(serverId: string) {
    if (!api || busyId) return;
    setBusyId(serverId);
    setError(undefined);
    setTestMessage(undefined);
    try {
      const result = await api.testServer(serverId);
      const capabilitySummary = [
        `Tools ${result.tools.length}`,
        `Resources ${result.resources.length + result.resourceTemplates.length}`,
        `Prompts ${result.prompts.length}`,
      ].join(" · ");
      setTestMessage(`已连接 ${result.serverName} · ${capabilitySummary}${
        result.echoOutput ? ` · ${result.echoOutput}` : ""
      }`);
    } catch (testError) {
      setError(toMessage(testError));
    } finally {
      setBusyId(undefined);
    }
  }

  function updateAuthType(authType: McpAuthenticationType) {
    if (!draft) return;
    setDraft({
      ...draft,
      authType,
      headerName: authType === "api_key"
        ? draft.headerName || "X-API-Key"
        : authType === "custom_header" ? draft.headerName : undefined,
      credential: authType === "none" ? "" : draft.credential,
      credentialConfigured: authType !== "none"
        && authType === draft.persistedAuthType
        && draft.persistedCredentialConfigured,
    });
  }

  return (
    <section
      className={`mcp-settings-layout${embedded ? " is-embedded" : ""}`}
      aria-label="MCP"
    >
      <div className="mcp-settings-content">
        <header className="mcp-settings-header">
          <div>
            {!embedded && <span className="eyebrow">远程能力</span>}
            <h1>{embedded ? "MCP Server" : "MCP"}</h1>
            <p>连接 Streamable HTTP Server，使用 Tools、Resources 与 Prompts。</p>
          </div>
          <button type="button" disabled={!api || Boolean(draft)} onClick={() => setDraft(emptyDraft())}>
            <Plus size={14} /> 添加 Server
          </button>
        </header>

        {draft && (
          <section className="mcp-editor" aria-label="MCP Server 配置">
            <div className="mcp-editor-heading">
              <div><Cable size={16} /><strong>{servers.some((item) => item.serverId === draft.serverId) ? "编辑 Server" : "添加 Server"}</strong></div>
              <button type="button" aria-label="关闭" onClick={() => setDraft(undefined)}><X size={15} /></button>
            </div>
            <div className="mcp-editor-grid">
              <label><span>名称</span><input value={draft.name} placeholder="例如：团队知识库" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label><span>Server 地址</span><input value={draft.url} placeholder="https://example.com/mcp" onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
              <label>
                <span>静态认证</span>
                <select value={draft.authType} onChange={(event) => updateAuthType(event.target.value as McpAuthenticationType)}>
                  <option value="none">无需认证</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="api_key">API Key Header</option>
                  <option value="custom_header">自定义 Header</option>
                </select>
              </label>
              {(draft.authType === "api_key" || draft.authType === "custom_header") && (
                <label><span>Header 名称</span><input value={draft.headerName || ""} placeholder={draft.authType === "api_key" ? "X-API-Key" : "X-Custom-Token"} onChange={(event) => setDraft({ ...draft, headerName: event.target.value })} /></label>
              )}
              {draft.authType !== "none" && (
                <label className="mcp-field-wide">
                  <span>凭据</span>
                  <div className="mcp-secret-input"><KeyRound size={13} /><input type="password" autoComplete="off" value={draft.credential} placeholder={draft.credentialConfigured ? "已安全保存；留空保持不变" : "输入 Token 或 API Key"} onChange={(event) => setDraft({ ...draft, credential: event.target.value })} /></div>
                  <small>凭据使用 Windows DPAPI 加密，页面和日志不会返回明文。</small>
                </label>
              )}
            </div>
            <div className="mcp-editor-actions"><small>保存后可测试认证与全部 MCP 能力发现。</small><button type="button" disabled={busyId === draft.serverId} onClick={() => void saveDraft()}>{busyId === draft.serverId ? "正在保存…" : "保存"}</button></div>
          </section>
        )}

        <section className="mcp-server-list" aria-label="已配置 MCP Server">
          <div className="mcp-list-heading"><strong>Server</strong><small>{servers.length} 个配置</small></div>
          {!loading && servers.length === 0 && <div className="mcp-empty"><Cable size={19} /><strong>尚未配置 MCP Server</strong><span>可先添加项目提供的 Java 测试 Server。</span></div>}
          {servers.map((server) => (
            <article className="mcp-server-row" key={server.serverId}>
              <span className={`mcp-status-dot${server.enabled ? " enabled" : ""}`} />
              <div><strong>{server.name}</strong><small>Streamable HTTP · {authLabel(server)} · {server.url}</small></div>
              <Switch aria-label={`启用 ${server.name}`} checked={server.enabled} disabled={busyId === server.serverId} onCheckedChange={() => void toggleServer(server)} />
              <button type="button" disabled={busyId === server.serverId} onClick={() => void testServer(server.serverId)}><RefreshCw size={13} /> 测试</button>
              <button className="icon-only" type="button" aria-label={`编辑 ${server.name}`} onClick={() => setDraft(fromServer(server))}><Pencil size={13} /></button>
              <button className="icon-only danger" type="button" aria-label={`删除 ${server.name}`} disabled={busyId === server.serverId} onClick={() => void deleteServer(server.serverId)}><Trash2 size={13} /></button>
            </article>
          ))}
        </section>

        {testMessage && <p className="mcp-test-result"><CircleCheck size={13} />{testMessage}</p>}
        {!api && <p className="mcp-settings-error">MCP 设置暂不可用，请从 Electron 桌面进程启动应用。</p>}
        {error && <p className="mcp-settings-error">{error}</p>}
        <p className="mcp-settings-note">当前支持静态 Header 凭据；OAuth、市场与云端托管将在后续版本提供。</p>
      </div>
    </section>
  );
}

function emptyDraft(): McpDraft {
  return {
    serverId: `mcp-${crypto.randomUUID()}`,
    name: "",
    enabled: true,
    url: "",
    authType: "none",
    credentialConfigured: false,
    credential: "",
    persistedCredentialConfigured: false,
  };
}

function fromServer(server: McpServer): McpDraft {
  return {
    ...server,
    credential: "",
    persistedAuthType: server.authType,
    persistedCredentialConfigured: server.credentialConfigured,
  };
}

function toInput(draft: McpDraft): SaveMcpServerInput {
  return {
    name: draft.name,
    enabled: draft.enabled,
    url: draft.url,
    authType: draft.authType,
    headerName: draft.headerName,
    credential: draft.credential || undefined,
  };
}

function authLabel(server: McpServer): string {
  if (server.authType === "none") return "无认证";
  if (server.authType === "bearer") return server.credentialConfigured ? "Bearer · 已加密" : "Bearer";
  return `${server.headerName || "Header"}${server.credentialConfigured ? " · 已加密" : ""}`;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "MCP 设置操作失败";
}
