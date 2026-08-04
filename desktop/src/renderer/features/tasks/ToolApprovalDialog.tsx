import { ShieldAlert } from "lucide-react";
import { useStore } from "zustand";

import type { TaskStore } from "./task-store";

interface ToolApprovalDialogProps {
  store: TaskStore;
}

export function ToolApprovalDialog({ store }: ToolApprovalDialogProps) {
  const approval = useStore(store, (state) => state.pendingToolApproval);
  const isDeciding = useStore(
    store,
    (state) => state.isDecidingToolApproval,
  );
  if (!approval) return null;

  const command =
    stringArgument(approval.arguments.command) ||
    stringArgument(approval.arguments.path) ||
    stringArgument(approval.arguments.pattern);
  const canAlwaysAllow = approval.permissionLayer !== "path_sandbox";

  return (
    <div className="tool-approval-backdrop">
      <section
        className="tool-approval-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tool-approval-title"
        aria-describedby="tool-approval-description"
      >
        <div className="tool-approval-heading">
          <span className="tool-approval-icon" aria-hidden="true">
            <ShieldAlert size={18} strokeWidth={1.8} />
          </span>
          <div>
            <h2 id="tool-approval-title">允许执行这项操作？</h2>
            <p>{approval.title}</p>
          </div>
        </div>

        {command && <pre className="tool-approval-command">{command}</pre>}

        <p className="tool-approval-reason" id="tool-approval-description">
          {approval.reason}
        </p>
        <div className="tool-approval-risk">
          <span>{riskLabel(approval.riskLevel)}</span>
          <span>{approval.reversible ? "可撤销" : "可能不可撤销"}</span>
        </div>

        <div className="tool-approval-actions">
          <button
            type="button"
            disabled={isDeciding}
            onClick={() => void store.getState().decideToolApproval("deny")}
          >
            拒绝
          </button>
          {canAlwaysAllow && (
            <button
              type="button"
              disabled={isDeciding}
              onClick={() =>
                void store.getState().decideToolApproval("allow_always")
              }
            >
              始终允许
            </button>
          )}
          <button
            className="primary"
            type="button"
            disabled={isDeciding}
            onClick={() =>
              void store.getState().decideToolApproval("allow_once")
            }
          >
            {isDeciding ? "正在处理…" : "允许本次"}
          </button>
        </div>
      </section>
    </div>
  );
}

function stringArgument(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function riskLabel(risk: string): string {
  if (risk === "HIGH") return "高风险";
  if (risk === "LOW") return "低风险";
  return "中等风险";
}
