export function resizeTextarea(
  textarea: HTMLTextAreaElement | null,
  maxHeight: number,
): void {
  if (!textarea) {
    return;
  }
  textarea.style.height = "auto";
  const minHeight = Number.parseFloat(
    globalThis.getComputedStyle?.(textarea).minHeight || "0",
  );
  const contentHeight = textarea.scrollHeight;
  textarea.style.height = `${Math.max(minHeight, Math.min(contentHeight, maxHeight))}px`;
  textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}
