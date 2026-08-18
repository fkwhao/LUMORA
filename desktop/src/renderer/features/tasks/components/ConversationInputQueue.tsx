import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CornerDownRight,
  CornerUpLeft,
  MoreHorizontal,
  Pause,
  Paperclip,
  Pencil,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { useStore } from "zustand";

import type { TaskStore } from "../state/task-store";

interface ConversationInputQueueProps {
  store: TaskStore;
  notify(message: string, tone?: "info" | "success"): void;
}

export function ConversationInputQueue({
  store,
  notify,
}: ConversationInputQueueProps) {
  const inputs = useStore(store, (state) => state.pendingInputs);
  const activeRun = useStore(store, (state) => state.activeRun);
  const isChatting = useStore(store, (state) => state.isChatting);
  const isPausing = useStore(store, (state) => state.isPausing);
  const [editingId, setEditingId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string>();

  const queued = inputs
    .filter((input) => input.target === "NEXT_TURN")
    .sort((left, right) => left.position - right.position);
  const paused = activeRun?.status === "PAUSED";
  const canAdjustDirection = isChatting || paused;

  if (queued.length === 0 && !paused) return null;

  const run = async (inputId: string, action: () => Promise<void>) => {
    setBusyId(inputId);
    try {
      await action();
    } catch (error) {
      notify(error instanceof Error ? error.message : "更新问题队列失败", "info");
    } finally {
      setBusyId(undefined);
    }
  };

  const resume = () => void run("__resume__", async () => {
    await store.getState().resumeChat();
  });

  return (
    <section
      className="relative z-10 mx-auto -mb-[17px] w-[calc(100%_-_34px)] overflow-hidden rounded-[22px_22px_12px_12px] border border-border/60 bg-background/96 pb-[17px] shadow-[0_8px_26px_rgba(20,25,32,0.05)] backdrop-blur"
      aria-label="问题队列"
    >
      {paused && (
        <header className="flex min-h-10 items-center justify-between gap-3 border-b border-border/55 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
            <Pause className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {queued.length > 0
                ? "由于你暂停了当前响应，问题队列已暂停"
                : "当前响应已暂停，进度和上下文均已保留"}
            </span>
          </div>
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            type="button"
            disabled={isPausing || busyId === "__resume__"}
            onClick={resume}
          >
            <Play className="size-3 fill-current" />
            继续
          </button>
        </header>
      )}

      {queued.length > 0 && (
        <div className="divide-y divide-border/45">
          {queued.map((input, index) => {
            const busy = busyId === input.inputId;
            const editing = editingId === input.inputId;
            const expanded = expandedId === input.inputId;
            return (
              <article key={input.inputId} className="px-3.5 py-2">
                <div className="flex min-h-7 items-center gap-2">
                  <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
                  {editing ? (
                    <textarea
                      className="min-h-14 flex-1 resize-y rounded-lg border border-border bg-muted/25 px-2.5 py-2 text-sm outline-none focus:border-foreground/35"
                      value={draft}
                      autoFocus
                      onChange={(event) => setDraft(event.target.value)}
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {input.content}
                      </p>
                      {(input.attachments?.length ?? 0) > 0 && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                          <Paperclip className="size-3 shrink-0" />
                          {input.attachments!.map((item) => item.name).join("、")}
                        </p>
                      )}
                    </div>
                  )}

                  {editing ? (
                    <>
                      <QueueIconButton
                        label="保存"
                        disabled={busy || !draft.trim()}
                        onClick={() => void run(input.inputId, async () => {
                          await store.getState().updateInput(input.inputId, {
                            content: draft.trim(),
                          });
                          setEditingId(undefined);
                        })}
                      >
                        <Check />
                      </QueueIconButton>
                      <QueueIconButton
                        label="取消"
                        onClick={() => setEditingId(undefined)}
                      >
                        <X />
                      </QueueIconButton>
                    </>
                  ) : (
                    <>
                      <button
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                        type="button"
                        disabled={
                          busy ||
                          !canAdjustDirection ||
                          (input.attachments?.length ?? 0) > 0
                        }
                        title={
                          (input.attachments?.length ?? 0) > 0
                            ? "带附件的问题会在下一轮完整发送"
                            : canAdjustDirection
                            ? "作为引导发送给当前运行"
                            : "当前没有可调整方向的运行"
                        }
                        onClick={() => void run(input.inputId, async () => {
                          await store.getState().updateInput(input.inputId, {
                            target: "NEXT_STEP",
                          });
                          if (paused) await store.getState().resumeChat();
                          notify("已调整方向并发送给当前运行", "success");
                        })}
                      >
                        <CornerUpLeft className="size-3.5" />
                        调整方向
                      </button>
                      <QueueIconButton
                        label="删除"
                        danger
                        disabled={busy}
                        onClick={() => void run(input.inputId, () =>
                          store.getState().deleteInput(input.inputId))}
                      >
                        <Trash2 />
                      </QueueIconButton>
                      <QueueIconButton
                        label="更多操作"
                        pressed={expanded}
                        disabled={busy}
                        onClick={() => setExpandedId(
                          expanded ? undefined : input.inputId,
                        )}
                      >
                        <MoreHorizontal />
                      </QueueIconButton>
                    </>
                  )}
                </div>

                {expanded && !editing && (
                  <div className="mt-1 flex items-center justify-end gap-1 pr-0.5">
                    <QueueTextButton
                      label="编辑"
                      onClick={() => {
                        setEditingId(input.inputId);
                        setDraft(input.content);
                        setExpandedId(undefined);
                      }}
                    >
                      <Pencil />
                    </QueueTextButton>
                    <QueueTextButton
                      label="上移"
                      disabled={index === 0}
                      onClick={() => void run(input.inputId, () =>
                        store.getState().moveInput(input.inputId, -1))}
                    >
                      <ArrowUp />
                    </QueueTextButton>
                    <QueueTextButton
                      label="下移"
                      disabled={index === queued.length - 1}
                      onClick={() => void run(input.inputId, () =>
                        store.getState().moveInput(input.inputId, 1))}
                    >
                      <ArrowDown />
                    </QueueTextButton>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QueueIconButton({
  label,
  children,
  disabled,
  danger,
  pressed,
  onClick,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  pressed?: boolean;
  onClick(): void;
}) {
  return (
    <button
      className={
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 [&_svg]:size-3.5 " +
        (danger ? "hover:bg-destructive/10 hover:text-destructive " : "") +
        (pressed ? "bg-muted text-foreground" : "")
      }
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function QueueTextButton({
  label,
  children,
  disabled,
  onClick,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 [&_svg]:size-3"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      {label}
    </button>
  );
}
