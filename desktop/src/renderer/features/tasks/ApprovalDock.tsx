import { ShieldAlert } from "lucide-react";
import { useStore } from "zustand";

import type { TaskStore } from "./task-store";

interface ApprovalDockProps {
  store: TaskStore;
}

export function ApprovalDock({ store }: ApprovalDockProps) {
  const task = useStore(store, (state) => state.activeTask);
  const approval = task?.approval;
  if (!approval) {
    return null;
  }

  return (
    <section className="approval-dock" aria-label="权限与提醒">
      <div className="approval-content">
        <span className="approval-icon">
          <ShieldAlert size={18} />
        </span>
        <div>
          <strong>{approval.action}</strong>
          <p>{approval.impactSummary}</p>
          <small>
            {approval.riskLevel === "HIGH" ? "高风险" : "中等风险"} ·
            {approval.reversible ? " 可撤销" : " 不可撤销"}
          </small>
        </div>
        <div className="approval-actions">
          <button
            type="button"
            onClick={() => void store.getState().decideApproval("REJECT")}
          >
            拒绝
          </button>
          <button
            className="allow"
            type="button"
            onClick={() => void store.getState().decideApproval("ALLOW_ONCE")}
          >
            仅允许本次
          </button>
        </div>
      </div>
    </section>
  );
}
