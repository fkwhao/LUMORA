import { Brain, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import type { LumoraMemoryApi } from "../../../shared/memory-contract";
import { Switch } from "../../components/ui/switch";
import { SettingsConfirmDialog } from "./SettingsControls";

interface PersonalizationPageProps {
  api?: LumoraMemoryApi;
  notify(message: string, tone?: "info" | "success"): void;
}

export function PersonalizationPage({
  api,
  notify,
}: PersonalizationPageProps) {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!api) {
      setLoading(false);
      return;
    }
    let active = true;
    void api.getSettings()
      .then((settings) => {
        if (active) setEnabled(settings.enabled);
      })
      .catch((loadError: unknown) => {
        if (active) setError(toMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  async function toggleMemory() {
    if (!api || loading || saving) return;
    const next = !enabled;
    setSaving(true);
    setError(undefined);
    try {
      const settings = await api.updateSettings(next);
      setEnabled(settings.enabled);
      notify(settings.enabled ? "记忆已启用" : "记忆已关闭", "success");
    } catch (updateError) {
      setError(toMessage(updateError));
    } finally {
      setSaving(false);
    }
  }

  async function resetMemory() {
    if (!api || resetting) return;
    setResetting(true);
    setError(undefined);
    try {
      const result = await api.reset();
      setConfirmingReset(false);
      notify(
        result.deletedCount > 0
          ? `已重置 ${result.deletedCount} 条记忆`
          : "当前没有需要重置的记忆",
        "success",
      );
    } catch (resetError) {
      setError(toMessage(resetError));
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="settings-layout personalization-settings">
      <header className="personalization-header">
        <span className="eyebrow">个人偏好</span>
        <h1>个性化</h1>
        <p>控制 LUMORA 是否从对话中生成并在后续任务中使用记忆。</p>
      </header>

      <section className="memory-settings-section" aria-labelledby="memory-title">
        <div className="memory-settings-heading">
          <span><Brain size={17} /></span>
          <div>
            <h2 id="memory-title">记忆</h2>
            <p>管理 LUMORA 如何收集、保留和使用动态记忆。</p>
          </div>
        </div>

        <div className="memory-settings-card">
          <div className="memory-settings-row">
            <div>
              <strong>启用记忆</strong>
              <small>从聊天中生成新记忆，并将相关记忆带入后续对话</small>
            </div>
            <Switch
              className="memory-switch"
              aria-label="启用记忆"
              checked={enabled}
              disabled={!api || loading || saving}
              onCheckedChange={() => void toggleMemory()}
            />
          </div>

          <div className="memory-settings-row reset-row">
            <div>
              <strong>重置记忆</strong>
              <small>删除所有用户、项目和会话动态记忆</small>
            </div>
            <button
              className="memory-reset-button"
              type="button"
              disabled={!api || resetting}
              onClick={() => setConfirmingReset(true)}
            >
              <RotateCcw size={13} />
              重置
            </button>
          </div>
        </div>

        {!api && (
          <p className="memory-settings-error">
            记忆设置暂不可用，请从 Electron 桌面进程启动应用。
          </p>
        )}
        {error && <p className="memory-settings-error">{error}</p>}
        <p className="memory-settings-note">
          重置不会删除聊天记录、上下文压缩摘要或项目指令文件。
        </p>
      </section>

      <SettingsConfirmDialog
        open={confirmingReset}
        icon={RotateCcw}
        title="重置全部记忆？"
        description="所有用户、项目和会话动态记忆都会被永久删除，之后无法恢复。"
        confirmLabel={resetting ? "正在重置…" : "确认重置"}
        busy={resetting}
        className="memory-reset-dialog"
        onCancel={() => setConfirmingReset(false)}
        onConfirm={() => void resetMemory()}
      />
    </main>
  );
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "记忆设置操作失败";
}
