/**
 * 主聊天与独立 Markdown 渲染器共用的视觉样式。
 *
 * 这里是 Markdown 排版的唯一来源，避免 Agent 详情等独立视图各自维护
 * 列表、标题和代码块样式后逐渐与主聊天产生差异。
 */
export const markdownStyleClasses = {
  root: "aui-md",
  h1: "aui-md-h1 mt-5 mb-2 scroll-m-20 text-xl font-semibold first:mt-0 last:mb-0",
  h2: "aui-md-h2 mt-5 mb-2 scroll-m-20 text-lg font-semibold first:mt-0 last:mb-0",
  h3: "aui-md-h3 mt-4 mb-1.5 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0",
  h4: "aui-md-h4 mt-3.5 mb-1 scroll-m-20 text-base font-medium first:mt-0 last:mb-0",
  h5: "aui-md-h5 mt-3 mb-1 text-sm font-semibold first:mt-0 last:mb-0",
  h6: "aui-md-h6 mt-3 mb-1 text-sm font-medium first:mt-0 last:mb-0",
  p: "aui-md-p my-3 leading-relaxed first:mt-0 last:mb-0",
  a: "aui-md-a text-primary hover:text-primary/80 underline underline-offset-2",
  blockquote: "aui-md-blockquote border-muted-foreground/30 text-muted-foreground my-3 border-s-2 ps-4",
  ul: "aui-md-ul marker:text-muted-foreground my-3 ms-5 list-disc [&>li]:mt-1",
  ol: "aui-md-ol marker:text-muted-foreground my-3 ms-5 list-decimal [&>li]:mt-1",
  hr: "aui-md-hr border-muted-foreground/20 my-3",
  table: "aui-md-table my-3 w-full border-separate border-spacing-0 overflow-y-auto",
  th: "aui-md-th bg-muted px-3 py-1.5 text-start font-medium first:rounded-ss-lg last:rounded-se-lg [[align=center]]:text-center [[align=right]]:text-right",
  td: "aui-md-td border-muted-foreground/20 border-s border-b px-3 py-1.5 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right",
  tr: "aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-es-lg [&:last-child>td:last-child]:rounded-ee-lg",
  li: "aui-md-li leading-relaxed",
  strong: "aui-md-strong font-semibold",
  sup: "aui-md-sup [&>a]:text-xs [&>a]:no-underline",
  pre: "aui-md-pre border-border/50 bg-muted/30 overflow-x-auto rounded-t-none rounded-b-xl border border-t-0 p-3.5 text-[13px] leading-relaxed",
  inlineCode: "aui-md-inline-code bg-muted rounded-md px-1.5 py-0.5 font-mono text-[0.85em]",
  codeHeader: "aui-code-header-root border-border/50 bg-muted/50 mt-3 flex items-center justify-between rounded-t-xl border border-b-0 px-3.5 py-1.5 text-xs",
  codeHeaderLanguage: "aui-code-header-language text-muted-foreground font-medium lowercase",
} as const;
