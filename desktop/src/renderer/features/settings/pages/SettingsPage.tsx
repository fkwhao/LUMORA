import {
  Archive,
  ArrowLeft,
  Bot,
  Box,
  Cable,
  ChevronDown,
  CircleCheck,
  Eye,
  EyeOff,
  LockKeyhole,
  Palette,
  Sparkles,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import type {
  ApiFormat,
  LumoraModelApi,
  ModelProvider,
  ProviderModel,
  SaveProviderModelInput,
} from "../../../../shared/model-contract";
import type { LumoraMemoryApi } from "../../../../shared/memory-contract";
import type { LumoraMcpApi } from "../../../../shared/mcp-contract";
import type { TaskSummary } from "../../../../shared/task-contract";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";
import { AppearancePage } from "./AppearancePage";
import { PersonalizationPage } from "./PersonalizationPage";
import { McpSettingsPage } from "./McpSettingsPage";
import {
  SettingsConfirmDialog,
  SettingsSearchInput,
} from "../components/SettingsControls";

interface SettingsPageProps {
  api?: LumoraModelApi;
  memoryApi?: LumoraMemoryApi;
  mcpApi?: LumoraMcpApi;
  archivedTasks: TaskSummary[];
  onBack(): void;
  onRestoreTask(taskId: string): void;
  onDeleteTask(taskId: string): void;
  onDeleteAllTasks(): void;
  notify(message: string, tone?: "info" | "success"): void;
}

const apiFormatOptions: Array<{
  value: ApiFormat;
  label: string;
}> = [
  { value: "anthropic", label: "Anthropic Messages (/v1/messages)" },
  { value: "chat-completions", label: "Chat Completions (/chat/completions)" },
  { value: "responses", label: "Responses (/responses)" },
];

type SettingsSection =
  | "model"
  | "personalization"
  | "mcp"
  | "appearance"
  | "archived";

export function SettingsPage({
  api,
  memoryApi,
  mcpApi,
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
  const showPersonalization = "个性化 记忆 重置记忆".includes(
    normalizedSettingsQuery,
  );
  const showMcp = "MCP 工具 Server Streamable HTTP".toLowerCase().includes(
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
        <SettingsSearchInput
          ariaLabel="搜索设置"
          className="settings-search"
          placeholder="搜索设置"
          value={settingsQuery}
          onChange={setSettingsQuery}
        />
        <nav>
          {showModel && (
            <SettingsNavItem
              active={section === "model"}
              icon={Bot}
              label="模型与 API"
              onClick={() => setSection("model")}
            />
          )}
          {showPersonalization && (
            <SettingsNavItem
              active={section === "personalization"}
              icon={Sparkles}
              label="个性化"
              onClick={() => setSection("personalization")}
            />
          )}
          {showMcp && (
            <SettingsNavItem
              active={section === "mcp"}
              icon={Cable}
              label="MCP"
              onClick={() => setSection("mcp")}
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
          {!showModel && !showPersonalization && !showMcp && !showAppearance
            && !showArchived && (
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
        ) : section === "personalization" ? (
          <PersonalizationPage api={memoryApi} notify={notify} />
        ) : section === "mcp" ? (
          <McpSettingsPage api={mcpApi} notify={notify} />
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

      <SettingsConfirmDialog
        open={Boolean(pendingDelete)}
        icon={Trash2}
        title={pendingDelete === "all" ? "删除全部归档任务？" : "删除归档任务？"}
        description="此操作会从当前客户端的任务列表移除记录，之后不能在界面中恢复。"
        confirmLabel="确认删除"
        onCancel={() => setPendingDelete(undefined)}
        onConfirm={confirmDelete}
      />
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
          <p>归档只整理任务列表，不会影响模型配置和项目关联。</p>
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
        <SettingsSearchInput
          ariaLabel="搜索已归档任务"
          className="archive-search"
          placeholder="搜索已归档任务"
          value={query}
          onChange={onQueryChange}
        />

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
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [providerName, setProviderName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [contextWindow, setContextWindow] = useState(128_000);
  const [apiKey, setApiKey] = useState("");
  const [apiFormat, setApiFormat] =
    useState<ApiFormat>("chat-completions");
  const [showApiKey, setShowApiKey] = useState(false);
  const [renamingProvider, setRenamingProvider] = useState(false);
  const [addingProvider, setAddingProvider] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [editingModel, setEditingModel] = useState<ProviderModel | "new">();
  const [testingModelId, setTestingModelId] = useState<string>();
  const [connectedModelId, setConnectedModelId] = useState<string>();
  const [isListingModels, setIsListingModels] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string>();

  const selectedProvider = providers.find(
    (provider) => provider.providerId === selectedId,
  );

  function editProvider(provider: ModelProvider) {
    setSelectedId(provider.providerId);
    setProviderName(provider.providerName);
    setBaseUrl(provider.baseUrl);
    setModel(provider.model);
    setContextWindow(provider.contextWindow);
    setApiFormat(provider.apiFormat);
    setApiKey("");
    setAvailableModels([]);
    setAddingProvider(false);
    setRenamingProvider(false);
    setError(undefined);
  }

  async function reloadProviders(preferredId?: string) {
    const loaded = await api.listProviders();
    setProviders(loaded);
    const next = loaded.find((provider) => provider.providerId === preferredId)
      ?? loaded.find((provider) => provider.active)
      ?? loaded[0];
    if (next) {
      editProvider(next);
    } else {
      beginAddingProvider();
    }
    return loaded;
  }

  useEffect(() => {
    void reloadProviders()
      .catch((loadError: unknown) => setError(toMessage(loadError)));
  }, [api]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setError(undefined);
    try {
      const input = {
        providerName,
        baseUrl,
        model,
        contextWindow,
        apiFormat,
        apiKey: apiKey.trim() || undefined,
      };
      const updated = addingProvider
        ? await api.createProvider(input)
        : await api.updateProvider(selectedId!, input);
      await reloadProviders(updated.providerId);
      setApiKey("");
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch (saveError) {
      setStatus("idle");
      setError(toMessage(saveError));
    }
  }

  async function listModels() {
    setIsListingModels(true);
    setError(undefined);
    try {
      if (!selectedId || addingProvider) {
        throw new Error("请先保存供应商，再获取模型列表");
      }
      const models = await api.listProviderModels(
        selectedId,
        apiKey.trim() || undefined,
      );
      setAvailableModels(models);
      await reloadProviders(selectedId);
    } catch (listError) {
      setError(toMessage(listError));
    } finally {
      setIsListingModels(false);
    }
  }

  function beginAddingProvider() {
    setSelectedId(undefined);
    setProviderName("");
    setBaseUrl("");
    setModel("");
    setApiKey("");
    setAvailableModels([]);
    setAddingProvider(true);
    setRenamingProvider(true);
    setApiFormat("chat-completions");
    setContextWindow(128_000);
    setError(undefined);
  }
  async function toggleProviderEnabled() {
    if (!selectedId) return;
    try {
      if (selectedProvider?.active) {
        await api.disableProvider(selectedId);
      } else {
        await api.activateProvider(selectedId);
      }
      await reloadProviders(selectedId);
    } catch (toggleError) {
      setError(toMessage(toggleError));
    }
  }

  async function saveProviderModel(input: SaveProviderModelInput) {
    if (!selectedId) return;
    if (editingModel === "new") {
      await api.createProviderModel(selectedId, input);
    } else if (editingModel) {
      await api.updateProviderModel(
        selectedId,
        editingModel.modelConfigurationId,
        input,
      );
    }
    setEditingModel(undefined);
    await reloadProviders(selectedId);
  }

  async function deleteModel(providerModel: ProviderModel) {
    if (!selectedId || !window.confirm(`确定删除模型“${providerModel.modelId}”吗？`)) return;
    try {
      await api.deleteProviderModel(
        selectedId,
        providerModel.modelConfigurationId,
      );
      await reloadProviders(selectedId);
    } catch (deleteError) {
      setError(toMessage(deleteError));
    }
  }

  async function testModel(providerModel: ProviderModel) {
    if (!selectedId) return;
    setTestingModelId(providerModel.modelConfigurationId);
    setConnectedModelId(undefined);
    setError(undefined);
    try {
      await api.testProviderModel(
        selectedId,
        providerModel.modelConfigurationId,
      );
      setConnectedModelId(providerModel.modelConfigurationId);
    } catch (testError) {
      setError(`模型 ${providerModel.modelId} 连接失败：${toMessage(testError)}`);
    } finally {
      setTestingModelId(undefined);
    }
  }

  async function deleteSelected() {
    if (!selectedId || !window.confirm(`确定删除供应商“${providerName}”吗？`)) {
      return;
    }
    try {
      await api.deleteProvider(selectedId);
      const remaining = await reloadProviders();
      if (remaining.length === 0) beginAddingProvider();
    } catch (deleteError) {
      setError(toMessage(deleteError));
    }
  }

  return (
    <main className="settings-layout model-settings-layout">
      <header className="model-settings-page-header">
        <div>
          <h1>模型设置</h1>
          <p>管理自定义模型供应商，配置后可在聊天时选择使用。</p>
        </div>
        <button
          className="model-settings-refresh"
          type="button"
          aria-label="获取模型列表"
          title="获取模型列表"
          disabled={
            isListingModels || addingProvider || !selectedId ||
            (!apiKey.trim() && !selectedProvider?.apiKeyConfigured)
          }
          onClick={() => void listModels()}
        >
          <RefreshCw
            size={16}
            className={isListingModels ? "is-spinning" : undefined}
          />
        </button>
      </header>

      <section className="model-provider-workspace">
        <aside className="model-provider-sidebar" aria-label="模型供应商">
          <span className="model-provider-section-label">套餐</span>
          <button
            className="model-provider-item builtin"
            type="button"
            disabled
            aria-label="BigModel 套餐暂未开放"
          >
            <span className="provider-logo bigmodel">◆</span>
            <strong>BigModel</strong>
            <i />
          </button>

          <span className="model-provider-section-label custom">
            自定义供应商
          </span>
          {providers.map((provider) => {
            const selected = provider.providerId === selectedId;
            return (
              <button
                className={`model-provider-item${selected ? " active" : ""}`}
                type="button"
                key={provider.providerId}
                onClick={() => editProvider(provider)}
              >
                <Box size={16} strokeWidth={1.7} />
                <strong>{provider.providerName}</strong>
                <i className={provider.active ? "ready" : ""} />
              </button>
            );
          })}
          <button
            className={`model-provider-add${addingProvider ? " active" : ""}`}
            type="button"
            onClick={beginAddingProvider}
          >
            <Plus size={17} />
            添加供应商
          </button>
        </aside>

        <form className="model-provider-detail" onSubmit={save}>
          <header className="model-provider-detail-header">
            <div className="model-provider-title">
              <Box size={18} strokeWidth={1.7} />
              {renamingProvider ? (
                <input
                  aria-label="供应商名称"
                  autoFocus
                  value={providerName}
                  onBlur={() => setRenamingProvider(false)}
                  onChange={(event) => setProviderName(event.target.value)}
                />
              ) : (
                <strong>{providerName || "添加模型供应商"}</strong>
              )}
              <button
                type="button"
                aria-label="修改供应商名称"
                title="修改供应商名称"
                onClick={() => setRenamingProvider(true)}
              >
                <Pencil size={15} />
              </button>
              <span
                className={
                  selectedProvider?.active
                    ? "provider-enabled-state ready"
                    : "provider-enabled-state"
                }
              >
                {selectedProvider?.active ? "已启用" : "未启用"}
              </span>
            </div>
            <div className="provider-header-actions">
              {!addingProvider && (
                <button type="button" onClick={() => void toggleProviderEnabled()}>
                  {selectedProvider?.active ? "禁用" : "启用"}
                </button>
              )}
              {!addingProvider && (
                <button
                  className="danger"
                  type="button"
                  aria-label="删除供应商"
                  onClick={() => void deleteSelected()}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </header>

          <div className="model-provider-fields">
            <label className="provider-field">
              <span>Base URL</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.example.com/v1"
                required
              />
            </label>

            <label className="provider-field">
              <span>API 格式</span>
              <ApiFormatSelect value={apiFormat} onChange={setApiFormat} />
              <small>决定模型请求协议，以及可启用的服务商托管能力。</small>
            </label>

            <label className="provider-field">
              <span>API Key</span>
              <span className="provider-secret-input">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={
                    selectedProvider?.apiKeyConfigured
                      ? "已配置；留空表示保持现有 Key"
                      : "输入供应商 API Key"
                  }
                  required={addingProvider || !selectedProvider?.apiKeyConfigured}
                  autoComplete="off"
                />
                <button
                  type="button"
                  aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  onClick={() => setShowApiKey((visible) => !visible)}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            <section className="provider-models-section">
              <header>
                <div>
                  <span>模型列表</span>
                  {(selectedProvider?.models.length ?? 0) > 0 && (
                    <small>{selectedProvider?.models.length} 个已配置模型</small>
                  )}
                </div>
                <button
                  type="button"
                  disabled={
                    isListingModels || addingProvider || !selectedId ||
                    (!apiKey.trim() && !selectedProvider?.apiKeyConfigured)
                  }
                  onClick={() => void listModels()}
                >
                  <RefreshCw
                    size={14}
                    className={isListingModels ? "is-spinning" : undefined}
                  />
                  {isListingModels ? "获取中" : "获取模型"}
                </button>
              </header>

              <div className="provider-model-list">
                {addingProvider ? (
                  <div className="provider-model-row selected">
                    <input
                      list="available-models"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder="输入初始模型 ID"
                      required
                    />
                    <span>保存后可配置 Token</span>
                  </div>
                ) : selectedProvider?.models.length ? (
                  selectedProvider.models.map((providerModel) => (
                    <div
                      className={`provider-model-row${providerModel.modelId === selectedProvider.model ? " selected" : ""}`}
                      key={providerModel.modelConfigurationId}
                    >
                      <div className="provider-model-identity">
                        <strong>{providerModel.modelId}</strong>
                        <small>
                          {formatContextWindow(providerModel.contextWindow)} 上下文
                          · {formatContextWindow(providerModel.maxOutputTokens)} 输出
                          {(providerModel.reasoningEfforts ?? []).length > 0
                            ? ` · 推理 ${providerModel.reasoningEfforts.join(" / ")}`
                            : " · 无推理选项"}
                          {providerModel.webSearchEnabled ? " · 联网搜索" : ""}
                        </small>
                      </div>
                      <div className="provider-model-actions">
                        <button
                          type="button"
                          className={connectedModelId === providerModel.modelConfigurationId ? "is-connected" : undefined}
                          aria-label={`测试 ${providerModel.modelId} 连接`}
                          title={connectedModelId === providerModel.modelConfigurationId ? "连接成功" : "测试连接"}
                          onClick={() => void testModel(providerModel)}
                        >
                          {connectedModelId === providerModel.modelConfigurationId ? (
                            <>
                              <CircleCheck size={15} />
                              <span>连接成功</span>
                            </>
                          ) : (
                            <Cable
                              size={15}
                              className={testingModelId === providerModel.modelConfigurationId ? "is-pulsing" : undefined}
                            />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`编辑 ${providerModel.modelId}`}
                          title="编辑模型配置"
                          onClick={() => setEditingModel(providerModel)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label={`删除 ${providerModel.modelId}`}
                          title="删除模型"
                          onClick={() => void deleteModel(providerModel)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="provider-model-empty">尚未配置模型</div>
                )}
              </div>
              <datalist id="available-models">
                {availableModels.map((availableModel) => (
                  <option value={availableModel} key={availableModel} />
                ))}
              </datalist>

              <div className="provider-model-controls">
                <button
                  type="button"
                  disabled={addingProvider}
                  onClick={() => setEditingModel("new")}
                >
                  <Plus size={15} />
                  添加模型
                </button>
              </div>
            </section>

            {error && <p className="settings-error provider-error">{error}</p>}
          </div>

          <footer className="model-provider-actions">
            <p>
              <LockKeyhole size={14} />
              API Key 经 Windows DPAPI 加密，仅保存在本机。
            </p>
            <button type="submit" disabled={status === "saving"}>
              {status === "saving"
                ? "保存中…"
                : status === "saved"
                  ? "已保存"
                  : "保存配置"}
            </button>
          </footer>
        </form>
      </section>
      {editingModel && (
        <ModelConfigurationDialog
          apiFormat={apiFormat}
          model={editingModel === "new" ? undefined : editingModel}
          suggestions={availableModels}
          onClose={() => setEditingModel(undefined)}
          onSave={saveProviderModel}
        />
      )}
    </main>
  );
}

function ModelConfigurationDialog({
  apiFormat,
  model,
  suggestions,
  onClose,
  onSave,
}: {
  apiFormat: ApiFormat;
  model?: ProviderModel;
  suggestions: string[];
  onClose(): void;
  onSave(input: SaveProviderModelInput): Promise<void>;
}) {
  const [modelId, setModelId] = useState(model?.modelId ?? "");
  const [contextWindow, setContextWindow] = useState(
    String(model?.contextWindow ?? 128_000),
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    String(model?.maxOutputTokens ?? 8192),
  );
  const [supportsReasoning, setSupportsReasoning] = useState(
    Boolean(model?.reasoningEfforts?.length),
  );
  const [reasoningEfforts, setReasoningEfforts] = useState<string[]>(
    model?.reasoningEfforts ?? [],
  );
  const [webSearchEnabled, setWebSearchEnabled] = useState(
    model?.webSearchEnabled ?? false,
  );
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsedContextWindow = parseTokenLimit(contextWindow, "上下文窗口");
    const parsedMaxOutputTokens = parseTokenLimit(
      maxOutputTokens,
      "最大输出 Token",
    );
    if (typeof parsedContextWindow === "string") {
      setDialogError(parsedContextWindow);
      return;
    }
    if (typeof parsedMaxOutputTokens === "string") {
      setDialogError(parsedMaxOutputTokens);
      return;
    }
    const normalizedReasoningEfforts = supportsReasoning
      ? reasoningEfforts.map((effort) => effort.trim())
      : [];
    if (normalizedReasoningEfforts.some((effort) => !effort)) {
      setDialogError("推理档位字段不能为空");
      return;
    }
    if (
      normalizedReasoningEfforts.some(
        (effort) => effort.length > 64 || !/^[A-Za-z0-9._-]+$/.test(effort),
      )
    ) {
      setDialogError("推理档位只能包含字母、数字、点、下划线和连字符");
      return;
    }
    if (new Set(normalizedReasoningEfforts).size !== normalizedReasoningEfforts.length) {
      setDialogError("推理档位不能重复");
      return;
    }
    if (supportsReasoning && normalizedReasoningEfforts.length === 0) {
      setDialogError("请至少添加一个推理档位");
      return;
    }
    setSaving(true);
    setDialogError(undefined);
    try {
      await onSave({
        modelId,
        contextWindow: parsedContextWindow,
        maxOutputTokens: parsedMaxOutputTokens,
        reasoningEfforts: normalizedReasoningEfforts,
        webSearchEnabled:
          apiFormat === "chat-completions" ? false : webSearchEnabled,
      });
    } catch (saveError) {
      setDialogError(toMessage(saveError));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className="model-config-dialog-frame"
        overlayClassName="model-config-dialog-overlay"
        showCloseButton={false}
      >
        <form className="model-config-dialog" onSubmit={submit}>
        <header>
          <DialogTitle>
            {model ? "编辑模型配置" : "添加模型配置"}
          </DialogTitle>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <label>
          <span>模型 ID</span>
          <input
            autoFocus
            list="model-config-suggestions"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            placeholder="例如 deepseek-chat"
            required
          />
        </label>
        <datalist id="model-config-suggestions">
          {suggestions.map((suggestion) => (
            <option value={suggestion} key={suggestion} />
          ))}
        </datalist>

        <label>
          <span>上下文窗口</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={contextWindow}
            onChange={(event) =>
              setContextWindow(onlyDigits(event.target.value))
            }
            required
          />
        </label>

        <button
          className={`model-config-advanced-toggle${advancedOpen ? " open" : ""}`}
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <ChevronDown size={15} />
          高级
        </button>

        {advancedOpen && (
          <div className="model-config-advanced-fields">
            <label>
              <span>最大输出 Token</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={maxOutputTokens}
                onChange={(event) =>
                  setMaxOutputTokens(onlyDigits(event.target.value))
                }
                required
              />
            </label>

            <section className="reasoning-capability-editor">
              <header>
                <div>
                  <strong>推理选项</strong>
                  <small>这些字段会原样发送给模型 API，请按供应商文档填写。</small>
                </div>
                <Switch
                  className="model-capability-switch"
                  aria-label="该模型支持推理选项"
                  checked={supportsReasoning}
                  onCheckedChange={(checked) => {
                    setSupportsReasoning(checked);
                    if (checked && reasoningEfforts.length === 0) {
                      setReasoningEfforts(["none", "low", "high", "max"]);
                    }
                  }}
                />
              </header>

              {supportsReasoning && (
                <div className="reasoning-effort-table">
                  <div className="reasoning-effort-table-head">
                    <span>顺序</span>
                    <span>API 字段值</span>
                    <span>操作</span>
                  </div>
                  {reasoningEfforts.map((effort, index) => (
                    <div className="reasoning-effort-row" key={index}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <input
                        aria-label={`第 ${index + 1} 个推理档位`}
                        value={effort}
                        placeholder="例如 high"
                        onChange={(event) =>
                          setReasoningEfforts((values) =>
                            values.map((value, valueIndex) =>
                              valueIndex === index ? event.target.value : value,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        aria-label={`删除推理档位 ${effort || index + 1}`}
                        onClick={() =>
                          setReasoningEfforts((values) =>
                            values.filter((_, valueIndex) => valueIndex !== index),
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="reasoning-effort-add"
                    type="button"
                    disabled={reasoningEfforts.length >= 16}
                    onClick={() => setReasoningEfforts((values) => [...values, ""])}
                  >
                    <Plus size={14} />
                    添加档位
                  </button>
                </div>
              )}
            </section>

            <section className="reasoning-capability-editor">
              <header>
                <div>
                  <strong>服务商原生 Web Search</strong>
                  <small>
                    允许模型按需调用供应商托管的网络搜索；可能产生额外费用。
                    {apiFormat === "chat-completions"
                      ? " 当前 Chat Completions 适配暂不支持。"
                      : ""}
                  </small>
                </div>
                <Switch
                  className="model-capability-switch"
                  aria-label="该模型支持服务商原生 Web Search"
                  checked={webSearchEnabled && apiFormat !== "chat-completions"}
                  disabled={apiFormat === "chat-completions"}
                  onCheckedChange={setWebSearchEnabled}
                />
              </header>
            </section>
          </div>
        )}

        {dialogError && <p>{dialogError}</p>}
        <footer>
          <button type="button" onClick={onClose}>取消</button>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function parseTokenLimit(value: string, label: string): number | string {
  if (!value) return `${label}不能为空`;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000_000) {
    return `${label}必须在 1 到 10000000 之间`;
  }
  return parsed;
}

function ApiFormatSelect({
  value,
  onChange,
}: {
  value: ApiFormat;
  onChange(value: ApiFormat): void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) onChange(nextValue as ApiFormat);
      }}
    >
      <SelectTrigger className="api-format-trigger">
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        className="api-format-content"
        align="start"
        alignItemWithTrigger={false}
      >
        {apiFormatOptions.map((option) => (
          <SelectItem
            className="api-format-option"
            value={option.value}
            key={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }
  return String(tokens);
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
