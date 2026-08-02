import {
  Archive,
  ArrowLeft,
  Bot,
  Check,
  KeyRound,
  LockKeyhole,
  Palette,
  RotateCcw,
  Search,
  Server,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import type {
  LumoraModelApi,
  ModelSettings,
} from "../../../shared/model-contract";
import type { TaskSummary } from "../../../shared/task-contract";
import { AppearancePage } from "./AppearancePage";

interface SettingsPageProps {
  api?: LumoraModelApi;
  archivedTasks: TaskSummary[];
  onBack(): void;
  onRestoreTask(taskId: string): void;
  onDeleteTask(taskId: string): void;
  onDeleteAllTasks(): void;
  notify(message: string, tone?: "info" | "success"): void;
}

interface ProviderPreset {
  name: string;
  baseUrl: string;
  defaultModel?: string;
}

const providerPresets: ProviderPreset[] = [
  {
    name: "OpenAI Compatible",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-pro",
  },
  {
    name: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
];

type SettingsSection = "model" | "appearance" | "archived";

export function SettingsPage({
  api,
  archivedTasks,
  onBack,
  onRestoreTask,
  onDeleteTask,
  onDeleteAllTasks,
  notify,
}: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>("model");
  const [settingsQuery, setSettingsQuery] = useState("");
  const [archiveQuery, setArchiveQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | "all">();
  const normalizedSettingsQuery = settingsQuery.trim().toLowerCase();
  const showModel = "模型与 API".toLowerCase().includes(
    normalizedSettingsQuery,
  );
  const showAppearance = "外观 主题 颜色 字体".includes(
    normalizedSettingsQuery,
  );
  const showArchived = "已归档任务".includes(normalizedSettingsQuery);
  const filteredArchivedTasks = archivedTasks.filter((task) =>
    task.goal.toLowerCase().includes(archiveQuery.trim().toLowerCase()),
  );

  function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    if (pendingDelete === "all") {
      const count = archivedTasks.length;
      onDeleteAllTasks();
      notify(`已删除 ${count} 个本地归档任务`, "success");
    } else {
      onDeleteTask(pendingDelete);
      notify("归档任务已从本地列表删除", "success");
    }
    setPendingDelete(undefined);
  }

  return (
    <div className="settings-shell">
      <aside className="settings-sidebar" aria-label="设置导航">
        <button className="settings-back" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          返回应用
        </button>
        <div className="settings-sidebar-title">
          <strong>设置</strong>
          <small>LUMORA 本地偏好</small>
        </div>
        <label className="settings-search">
          <Search size={15} />
          <input
            aria-label="搜索设置"
            placeholder="搜索设置"
            value={settingsQuery}
            onChange={(event) => setSettingsQuery(event.target.value)}
          />
        </label>
        <nav>
          {showModel && (
            <SettingsNavItem
              active={section === "model"}
              icon={Bot}
              label="模型与 API"
              onClick={() => setSection("model")}
            />
          )}
          {showAppearance && (
            <SettingsNavItem
              active={section === "appearance"}
              icon={Palette}
              label="外观"
              onClick={() => setSection("appearance")}
            />
          )}
          {showArchived && (
            <SettingsNavItem
              active={section === "archived"}
              count={archivedTasks.length}
              icon={Archive}
              label="已归档任务"
              onClick={() => setSection("archived")}
            />
          )}
          {!showModel && !showAppearance && !showArchived && (
            <p className="settings-search-empty">没有匹配的设置</p>
          )}
        </nav>
      </aside>

      <section className="settings-surface">
        <header className="settings-topbar" aria-hidden="true" />
        {section === "model" ? (
          api ? (
            <ModelSettingsPanel api={api} />
          ) : (
            <main className="settings-layout">
              <div className="settings-unavailable">
                <Bot size={22} />
                <strong>模型设置暂不可用</strong>
                <p>请从 Electron 桌面进程启动应用后再配置模型。</p>
              </div>
            </main>
          )
        ) : section === "appearance" ? (
          <AppearancePage />
        ) : (
          <ArchivedTasksPanel
            query={archiveQuery}
            tasks={filteredArchivedTasks}
            totalCount={archivedTasks.length}
            onQueryChange={setArchiveQuery}
            onRestore={(taskId) => {
              onRestoreTask(taskId);
              notify("任务已恢复到最近列表", "success");
            }}
            onDelete={setPendingDelete}
            onDeleteAll={() => setPendingDelete("all")}
          />
        )}
      </section>

      {pendingDelete && (
        <div className="settings-dialog-backdrop" role="presentation">
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <span><Trash2 size={18} /></span>
            <h2 id="delete-dialog-title">
              {pendingDelete === "all" ? "删除全部归档任务？" : "删除归档任务？"}
            </h2>
            <p>
              此操作会从当前客户端的任务列表移除记录，之后不能在界面中恢复。
            </p>
            <div>
              <button
                type="button"
                onClick={() => setPendingDelete(undefined)}
              >
                取消
              </button>
              <button className="danger" type="button" onClick={confirmDelete}>
                确认删除
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

interface SettingsNavItemProps {
  active: boolean;
  count?: number;
  icon: typeof Bot;
  label: string;
  onClick(): void;
}

function SettingsNavItem({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: SettingsNavItemProps) {
  return (
    <button
      className={`settings-nav-item${active ? " active" : ""}`}
      type="button"
      onClick={onClick}
    >
      <Icon size={16} />
      <span>{label}</span>
      {count !== undefined && <small>{count}</small>}
    </button>
  );
}

interface ArchivedTasksPanelProps {
  tasks: TaskSummary[];
  totalCount: number;
  query: string;
  onQueryChange(value: string): void;
  onRestore(taskId: string): void;
  onDelete(taskId: string): void;
  onDeleteAll(): void;
}

function ArchivedTasksPanel({
  tasks,
  totalCount,
  query,
  onQueryChange,
  onRestore,
  onDelete,
  onDeleteAll,
}: ArchivedTasksPanelProps) {
  return (
    <main className="settings-layout archived-settings">
      <header className="archived-header">
        <div>
          <span className="eyebrow">本地数据</span>
          <h1>已归档任务</h1>
          <p>归档只整理任务列表，不会影响模型配置和工作空间。</p>
        </div>
        <button
          className="delete-all-button"
          type="button"
          disabled={totalCount === 0}
          onClick={onDeleteAll}
        >
          <Trash2 size={15} />
          全部删除
        </button>
      </header>

      <section className="archive-manager">
        <label className="archive-search">
          <Search size={16} />
          <input
            aria-label="搜索已归档任务"
            placeholder="搜索已归档任务"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>

        {totalCount === 0 ? (
          <div className="archive-empty">
            <span><Archive size={22} /></span>
            <strong>没有已归档任务</strong>
            <p>在应用侧边栏悬停任务，点击归档图标后会显示在这里。</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="archive-empty compact">
            <strong>没有匹配的归档任务</strong>
          </div>
        ) : (
          <div className="archive-list">
            <div className="archive-list-heading">
              <span>本地任务</span>
              <small>{tasks.length} 个任务</small>
            </div>
            {tasks.map((task) => (
              <article className="archive-task-row" key={task.taskId}>
                <div>
                  <strong>{task.goal}</strong>
                  <small>{formatTaskTime(task.updatedAt)}</small>
                </div>
                <button
                  className="archive-delete"
                  type="button"
                  aria-label={`删除归档任务：${task.goal}`}
                  title="删除"
                  onClick={() => onDelete(task.taskId)}
                >
                  <Trash2 size={15} />
                </button>
                <button
                  className="archive-restore"
                  type="button"
                  onClick={() => onRestore(task.taskId)}
                >
                  <RotateCcw size={14} />
                  取消归档
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ModelSettingsPanel({ api }: { api: LumoraModelApi }) {
  const [settings, setSettings] = useState<ModelSettings>();
  const [providerName, setProviderName] = useState("OpenAI Compatible");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .getSettings()
      .then((loaded) => {
        const normalized = normalizeLegacyDeepSeekSettings(loaded);
        setSettings(loaded);
        setProviderName(normalized.providerName);
        setBaseUrl(normalized.baseUrl);
        setModel(normalized.model);
      })
      .catch((loadError: unknown) => setError(toMessage(loadError)));
  }, [api]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setError(undefined);
    try {
      const updated = await api.updateSettings({
        providerName,
        baseUrl,
        model,
        apiKey: apiKey.trim() || undefined,
      });
      setSettings(updated);
      setApiKey("");
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch (saveError) {
      setStatus("idle");
      setError(toMessage(saveError));
    }
  }

  function applyPreset(name: string) {
    const preset = providerPresets.find((item) => item.name === name);
    setProviderName(name);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      if (preset.defaultModel) {
        setModel(preset.defaultModel);
      }
    }
  }

  return (
    <main className="settings-layout">
      <header className="page-toolbar settings-toolbar">
        <div>
          <span className="eyebrow">设置</span>
          <h1>模型连接</h1>
          <p>配置 LUMORA 对话和后续 Agent 执行使用的模型接口。</p>
        </div>
        <div className="settings-security-note">
          <LockKeyhole size={16} />
          <span>仅保存在本机</span>
        </div>
      </header>

      <div className="settings-content">
        <section className="settings-intro">
          <span><Sparkles size={18} /></span>
          <div>
            <strong>OpenAI 兼容接口</strong>
            <p>
              第一版支持 Chat Completions 契约，可连接 OpenAI、DeepSeek、
              通义千问兼容模式及其他兼容供应商。
            </p>
          </div>
        </section>

        <form className="model-settings-card" onSubmit={save}>
          <div className="settings-card-heading">
            <div>
              <span className="settings-icon"><Server size={17} /></span>
              <div>
                <strong>连接参数</strong>
                <p>远程接口必须使用 HTTPS，本机模型允许 127.0.0.1。</p>
              </div>
            </div>
            <span className={settings?.apiKeyConfigured ? "key-state ready" : "key-state"}>
              {settings?.apiKeyConfigured ? <Check size={12} /> : <KeyRound size={12} />}
              {settings?.apiKeyConfigured ? "Key 已配置" : "等待配置"}
            </span>
          </div>

          <div className="settings-form-grid">
            <label>
              <span>供应商</span>
              <select
                value={providerName}
                onChange={(event) => applyPreset(event.target.value)}
              >
                {providerPresets.map((provider) => (
                  <option value={provider.name} key={provider.name}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>模型名称</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="例如 gpt-4.1-mini"
                required
              />
            </label>
            <label className="field-wide">
              <span>API Base URL</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.example.com/v1"
                required
              />
            </label>
            <label className="field-wide">
              <span>API Key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  settings?.apiKeyConfigured
                    ? "已配置；留空表示保持现有 Key"
                    : "输入供应商 API Key"
                }
                required={!settings?.apiKeyConfigured}
                autoComplete="off"
              />
            </label>
          </div>

          {error && <p className="settings-error">{error}</p>}

          <div className="settings-actions">
            <p>Key 经 Windows DPAPI 加密后保存，不会回显或写入 Git。</p>
            <button type="submit" disabled={status === "saving"}>
              {status === "saving"
                ? "保存中…"
                : status === "saved"
                  ? "已保存"
                  : "保存模型配置"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function formatTaskTime(value?: string): string {
  if (!value) {
    return "时间未知";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "模型配置操作失败";
}

function normalizeLegacyDeepSeekSettings(
  settings: ModelSettings,
): ModelSettings {
  if (settings.providerName !== "DeepSeek") {
    return settings;
  }
  return {
    ...settings,
    baseUrl:
      settings.baseUrl === "https://api.deepseek.com/v1"
        ? "https://api.deepseek.com"
        : settings.baseUrl,
    model:
      settings.model === "deepseek-v4"
        ? "deepseek-v4-pro"
        : settings.model,
  };
}
