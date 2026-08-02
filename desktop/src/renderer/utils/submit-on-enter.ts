import type { KeyboardEvent } from "react";

/**
 * 对话输入框统一使用 Enter 发送、Shift + Enter 换行。
 * 中文输入法处于组词阶段时不提交，避免按 Enter 确认候选词时误发送消息。
 */
export function submitFormOnEnter(
  event: KeyboardEvent<HTMLTextAreaElement>,
): void {
  const isComposing =
    event.nativeEvent.isComposing || event.keyCode === 229;
  if (event.key !== "Enter" || event.shiftKey || isComposing) {
    return;
  }
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
