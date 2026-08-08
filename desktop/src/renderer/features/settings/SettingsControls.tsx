import { Search, type LucideIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog";

export function SettingsSearchInput({
  ariaLabel,
  className,
  placeholder,
  value,
  onChange,
}: {
  ariaLabel: string;
  className: string;
  placeholder: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <label className={className}>
      <Search size={className === "settings-search" ? 15 : 16} />
      <input
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SettingsConfirmDialog({
  open,
  icon: Icon,
  title,
  description,
  confirmLabel,
  busy = false,
  className = "",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  className?: string;
  onCancel(): void;
  onConfirm(): void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onCancel();
      }}
    >
      <DialogContent
        className="settings-dialog-frame"
        overlayClassName="settings-dialog-overlay"
        showCloseButton={false}
      >
        <section className={`settings-dialog ${className}`.trim()}>
          <span><Icon size={18} /></span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <div>
            <button type="button" disabled={busy} onClick={onCancel}>
              取消
            </button>
            <button
              className="danger"
              type="button"
              disabled={busy}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
