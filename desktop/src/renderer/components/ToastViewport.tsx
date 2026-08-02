import { CheckCircle2, Info, X } from "lucide-react";

export interface ToastNotice {
  id: number;
  message: string;
  tone?: "info" | "success";
}

interface ToastViewportProps {
  notice?: ToastNotice;
  onDismiss(): void;
}

export function ToastViewport({
  notice,
  onDismiss,
}: ToastViewportProps) {
  if (!notice) {
    return null;
  }
  return (
    <div className="toast-viewport" aria-live="polite">
      <div className={`toast-card ${notice.tone ?? "info"}`}>
        {notice.tone === "success" ? (
          <CheckCircle2 size={16} />
        ) : (
          <Info size={16} />
        )}
        <span>{notice.message}</span>
        <button type="button" aria-label="关闭提示" onClick={onDismiss}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
