import { globalStyle } from "@vanilla-extract/css";

globalStyle(
  '[data-theme="dark"] .home-layout,\n[data-theme="dark"] .task-layout,\n[data-theme="dark"] .prototype-layout,\n[data-theme="dark"] .settings-surface',
  {
    borderColor: "var(--appearance-line, var(--line-strong))",
    boxShadow: "none",
  },
);

globalStyle(
  '[data-theme="dark"] .sidebar,\n[data-theme="dark"] .settings-sidebar',
  {
    color: "var(--ink)",
    background: "var(--canvas)",
  },
);

globalStyle(
  '[data-translucent-sidebar="true"] .sidebar,\n[data-translucent-sidebar="true"] .settings-sidebar',
  {
    background: "color-mix(in srgb, var(--canvas) 82%, transparent)",
    backdropFilter: "blur(18px) saturate(135%)",
  },
);

globalStyle(
  '[data-theme="dark"] .brand-mark,\n[data-theme="dark"] .new-task-button,\n[data-theme="dark"] .nav-item,\n[data-theme="dark"] .history-item,\n[data-theme="dark"] .workspace-link,\n[data-theme="dark"] .settings-link',
  {
    color: "#d9dde3",
  },
);

globalStyle(
  '[data-theme="dark"] .new-task-button:hover,\n[data-theme="dark"] .nav-item:hover,\n[data-theme="dark"] .settings-link:hover,\n[data-theme="dark"] .history-row:hover',
  {
    color: "#f4f5f6",
    background: "#242528",
  },
);

globalStyle(
  '[data-theme="dark"] .nav-item.active,\n[data-theme="dark"] .settings-link.active,\n[data-theme="dark"] .history-row.current',
  {
    color: "#f4f5f6",
    background: "#2a2b2e",
  },
);

globalStyle(
  '[data-theme="dark"] .history-row:hover .history-item,\n[data-theme="dark"] .history-row.current .history-item',
  {
    color: "#f4f5f6",
  },
);

globalStyle(
  '[data-theme="dark"] .sidebar-section-heading button:hover,\n[data-theme="dark"] .workspace-link:hover,\n[data-theme="dark"] .history-archive-action:hover',
  {
    color: "#f0f2f4",
    background: "#242528",
  },
);

globalStyle(
  '[data-theme="dark"] .primary-nav,\n[data-theme="dark"] .workspace-shortcut',
  {
    borderColor: "var(--appearance-line, var(--line))",
  },
);

globalStyle(
  '[data-theme="dark"] .window-navigation button,\n[data-theme="dark"] .settings-back',
  {
    color: "#9da3ac",
  },
);

globalStyle(
  '[data-theme="dark"] .window-navigation button:hover:not(:disabled),\n[data-theme="dark"] .settings-back:hover',
  {
    color: "#f5f6f7",
    background: "#35383f",
  },
);

globalStyle(
  '[data-theme="dark"] input,\n[data-theme="dark"] select,\n[data-theme="dark"] textarea',
  {
    color: "var(--ink)",
  },
);

globalStyle(
  '[data-theme="dark"] .settings-search,\n[data-theme="dark"] .history-search,\n[data-theme="dark"] .archive-search,\n[data-theme="dark"] .settings-form-grid input,\n[data-theme="dark"] .settings-form-grid select',
  {
    color: "var(--ink)",
    borderColor: "var(--appearance-line, var(--line-strong))",
    background: "var(--surface-soft)",
  },
);

globalStyle(
  '[data-theme="dark"] .settings-nav-item,\n[data-theme="dark"] .settings-form-grid label > span',
  {
    color: "#b7bdc6",
  },
);

globalStyle(
  '[data-theme="dark"] .settings-nav-item:hover,\n[data-theme="dark"] .settings-nav-item.active',
  {
    color: "#fff",
    background: "#35383f",
  },
);

globalStyle(
  '[data-theme="dark"] .model-settings-card,\n[data-theme="dark"] .archive-list,\n[data-theme="dark"] .settings-dialog',
  {
    borderColor: "var(--appearance-line, var(--line-strong))",
    background: "var(--surface)",
    boxShadow: "0 18px 52px rgb(0 0 0 / 20%)",
  },
);

globalStyle(
  '[data-theme="dark"] .settings-card-heading,\n[data-theme="dark"] .settings-actions,\n[data-theme="dark"] .archive-list-heading',
  {
    borderColor: "var(--appearance-line, var(--line))",
    background: "var(--surface-soft)",
  },
);

globalStyle('[data-theme="dark"] .settings-intro', {
  borderColor: "#30425e",
  background: "linear-gradient(135deg, #1b2534, #1b1e22)",
});

globalStyle(
  '[data-theme="dark"] .archive-task-row,\n[data-theme="dark"] .settings-topbar',
  {
    borderColor: "var(--appearance-line, var(--line))",
  },
);

globalStyle('[data-theme="dark"] .archive-task-row:hover', {
  background: "#2d3036",
});

globalStyle(
  '[data-theme="dark"] .archive-task-row strong,\n[data-theme="dark"] .archive-empty strong,\n[data-theme="dark"] .settings-unavailable strong',
  {
    color: "var(--ink)",
  },
);

globalStyle('[data-theme="dark"] .archive-empty', {
  borderColor: "var(--appearance-line, var(--line-strong))",
  background: "rgb(42 45 51 / 68%)",
});

globalStyle(
  '[data-theme="dark"] .user-message,\n[data-theme="dark"] .prototype-card',
  {
    color: "var(--ink)",
    borderColor: "transparent",
    background: "#2b2c2f",
  },
);

globalStyle(
  '[data-theme="dark"] .markdown-body code,\n[data-theme="dark"] .markdown-body pre',
  {
    color: "#e7e9ed",
    background: "#1b1d21",
  },
);

globalStyle(".markdown-body code,\n.markdown-body pre", {
  fontFamily:
    'var(--code-font, "Cascadia Code", "SFMono-Regular", Consolas, monospace)',
});

globalStyle('[data-theme="dark"] .desktop-bridge-error', {
  color: "var(--ink)",
  background: "var(--canvas)",
});

globalStyle(
  '[data-theme="dark"] .goal-composer label,\n[data-theme="dark"] .assistant-message > span,\n[data-theme="dark"] .assistant-message > p,\n[data-theme="dark"] .markdown-body',
  {
    color: "var(--ink)",
  },
);

globalStyle('[data-theme="dark"] textarea::placeholder', {
  color: "var(--subtle)",
});

globalStyle(
  '[data-theme="dark"] .composer-footer,\n[data-theme="dark"] .recent-item,\n[data-theme="dark"] .automation-list article',
  {
    borderColor: "var(--appearance-line, var(--line))",
  },
);

globalStyle(
  '[data-theme="dark"] .context-actions button,\n[data-theme="dark"] .follow-up-composer button,\n[data-theme="dark"] .hint-tags button,\n[data-theme="dark"] .task-actions > button:not(.icon-button),\n[data-theme="dark"] .icon-button',
  {
    color: "#bdc3cc",
    borderColor: "var(--appearance-line, var(--line-strong))",
    background: "#27282b",
  },
);

globalStyle(
  '[data-theme="dark"] .context-actions button:hover,\n[data-theme="dark"] .follow-up-composer button:hover:not(:disabled),\n[data-theme="dark"] .hint-tags button:hover',
  {
    color: "#fff",
    borderColor: "#545a63",
    background: "#303134",
  },
);

globalStyle('[data-theme="dark"] .selected-contexts > span', {
  color: "#c1c7d0",
  borderColor: "#344158",
  background: "#1c2738",
});

globalStyle(
  '[data-theme="dark"] .recent-item:hover,\n[data-theme="dark"] .workspace-card:hover,\n[data-theme="dark"] .workspace-card.active',
  {
    background: "#2d3138",
  },
);

globalStyle('[data-theme="dark"] .task-glyph', {
  color: "#85b4ff",
  background: "#20314b",
});

globalStyle('[data-theme="dark"] .task-glyph.glyph-2', {
  color: "#e7bb77",
  background: "#352b1e",
});

globalStyle('[data-theme="dark"] .task-glyph.glyph-3', {
  color: "#7dd3ae",
  background: "#1b342a",
});

globalStyle('[data-theme="dark"] .recent-copy span', {
  color: "#a9b0ba",
  background: "#35383f",
});

globalStyle('[data-theme="dark"] .recent-copy span.running', {
  color: "#76d6aa",
  background: "var(--green-soft)",
});

globalStyle('[data-theme="dark"] .context-hint', {
  borderColor: "#3b4047",
  background: "rgb(45 48 54 / 62%)",
});

globalStyle('[data-theme="dark"] .starter-icon', {
  color: "#85b4ff",
  background: "#20314b",
});

globalStyle('[data-theme="dark"] .task-more-menu', {
  borderColor: "var(--appearance-line, var(--line-strong))",
  background: "#2a2d33",
  boxShadow: "0 18px 44px rgb(0 0 0 / 32%)",
});

globalStyle('[data-theme="dark"] .task-more-menu button', {
  color: "#c3c8d0",
});

globalStyle('[data-theme="dark"] .task-more-menu button:hover', {
  color: "#fff",
  background: "#393d44",
});

globalStyle('[data-theme="dark"] .status-badge', {
  borderColor: "#365783",
});

globalStyle('[data-theme="dark"] .status-waiting_approval', {
  color: "#f0b45d",
  borderColor: "#684b23",
});

globalStyle('[data-theme="dark"] .status-completed', {
  color: "#67d5a4",
  borderColor: "#265d45",
});

globalStyle(
  '[data-theme="dark"] .status-failed,\n[data-theme="dark"] .status-rejected,\n[data-theme="dark"] .status-interrupted,\n[data-theme="dark"] .task-error-banner',
  {
    color: "#ff8e89",
    borderColor: "#633936",
    background: "#351e1e",
  },
);

globalStyle('[data-theme="dark"] .markdown-body h1,\n[data-theme="dark"] .markdown-body h2,\n[data-theme="dark"] .markdown-body h3,\n[data-theme="dark"] .markdown-body h4', {
  color: "#f4f5f6",
});

globalStyle('[data-theme="dark"] .markdown-body h1', {
  borderColor: "var(--appearance-line, var(--line))",
});

globalStyle('[data-theme="dark"] .markdown-body blockquote', {
  color: "#b2bac5",
  borderColor: "#5075aa",
  background: "#1d2633",
});

globalStyle('[data-theme="dark"] .markdown-body a', {
  color: "#79adff",
  textDecorationColor: "#4f78b3",
});

globalStyle('[data-theme="dark"] .markdown-body a:hover', {
  color: "#a7c8ff",
});

globalStyle('[data-theme="dark"] .markdown-body code', {
  color: "#f0a8c2",
  borderColor: "#3b4047",
  background: "#30343a",
});

globalStyle('[data-theme="dark"] .markdown-body pre code', {
  color: "inherit",
  borderColor: "transparent",
  background: "transparent",
});

globalStyle(
  '[data-theme="dark"] .markdown-body th,\n[data-theme="dark"] .markdown-body td',
  {
    borderColor: "var(--appearance-line, var(--line-strong))",
  },
);

globalStyle('[data-theme="dark"] .markdown-body th', {
  background: "#30343a",
});

globalStyle('[data-theme="dark"] .markdown-body tr:nth-child(even) td', {
  background: "#292c31",
});

globalStyle('[data-theme="dark"] .markdown-body hr', {
  background: "var(--appearance-line, var(--line))",
});

globalStyle('[data-theme="dark"] .conversation-footer', {
  background: "linear-gradient(transparent, var(--surface) 20%)",
});

globalStyle('[data-theme="dark"] .follow-up-composer', {
  borderColor: "var(--appearance-line, var(--line-strong))",
  background: "#292a2d",
  boxShadow: "0 16px 42px rgb(0 0 0 / 20%)",
});

globalStyle('[data-theme="dark"] .follow-up-composer .send-follow-up', {
  color: "#1b1d21",
  background: "#f2f3f5",
});

globalStyle(
  '[data-theme="dark"] .follow-up-composer .send-follow-up:hover:not(:disabled)',
  {
    color: "#111318",
    borderColor: "#fff",
    background: "#fff",
  },
);

globalStyle('[data-theme="dark"] .history-search:focus', {
  borderColor: "#5d779d",
  boxShadow: "0 0 0 3px rgb(77 147 255 / 15%)",
});

globalStyle('[data-theme="dark"] .approval-content', {
  color: "#f1bd70",
  borderColor: "#6d5027",
});

globalStyle('[data-theme="dark"] .approval-icon', {
  background: "#49351c",
});

globalStyle('[data-theme="dark"] .approval-actions button', {
  color: "#e4c99f",
  borderColor: "#725d38",
  background: "#2a241b",
});

globalStyle('[data-theme="dark"] .approval-actions button.allow', {
  color: "#fff",
  borderColor: "#c97812",
  background: "#c97812",
});

globalStyle(
  '[data-theme="dark"] .prototype-badge,\n[data-theme="dark"] .workspace-card,\n[data-theme="dark"] .automation-list,\n[data-theme="dark"] .skill-grid article,\n[data-theme="dark"] .skill-grid button',
  {
    color: "#c0c6cf",
    borderColor: "var(--appearance-line, var(--line-strong))",
    background: "var(--surface-soft)",
  },
);

globalStyle(
  '[data-theme="dark"] .workspace-card > span,\n[data-theme="dark"] .skill-grid article > span,\n[data-theme="dark"] .automation-list article > span',
  {
    color: "#83b2fb",
    background: "#21314a",
  },
);

globalStyle('[data-theme="dark"] .prototype-switch', {
  background: "#454a52",
});

globalStyle('[data-theme="dark"] .skill-grid button.active', {
  color: "#76d6aa",
  borderColor: "#2f6d52",
  background: "var(--green-soft)",
});

globalStyle('[data-theme="dark"] .settings-security-note', {
  color: "#75d1ab",
  borderColor: "#2b5b47",
  background: "#1b3027",
});

globalStyle('[data-theme="dark"] .settings-intro > span,\n[data-theme="dark"] .settings-icon', {
  background: "#22334e",
});

globalStyle('[data-theme="dark"] .key-state', {
  color: "#f0bd6c",
  background: "#3b2d1b",
});

globalStyle('[data-theme="dark"] .key-state.ready', {
  color: "#75d6aa",
  background: "#1c382c",
});

globalStyle('[data-theme="dark"] .settings-error', {
  color: "#ff918c",
  background: "#351f1f",
});

globalStyle('[data-theme="dark"] .settings-actions button', {
  color: "#17191d",
  background: "#f0f1f3",
});

globalStyle('[data-theme="dark"] .settings-actions button:hover:not(:disabled)', {
  background: "#d9dce1",
});

globalStyle('[data-theme="dark"] .delete-all-button', {
  color: "#ff8e89",
  borderColor: "#633a37",
  background: "#351f1f",
});

globalStyle('[data-theme="dark"] .delete-all-button:hover:not(:disabled)', {
  borderColor: "#86504c",
  background: "#422424",
});

globalStyle('[data-theme="dark"] .archive-delete:hover', {
  color: "#ff8e89",
  background: "#3a2222",
});

globalStyle('[data-theme="dark"] .archive-restore', {
  color: "#c5cad2",
  borderColor: "var(--appearance-line, var(--line-strong))",
  background: "#30343a",
});

globalStyle('[data-theme="dark"] .archive-restore:hover', {
  borderColor: "#555b64",
  background: "#3a3e45",
});

globalStyle('[data-theme="dark"] .settings-dialog button:not(.danger)', {
  color: "#c7ccd4",
  borderColor: "var(--appearance-line, var(--line-strong))",
  background: "#30343a",
});

globalStyle(
  '.home-layout,\n.task-layout,\n.prototype-layout,\n.settings-surface,\n.sidebar,\n.settings-sidebar,\nbutton,\ninput,\nselect,\ntextarea',
  {
    transition:
      "color 140ms ease, background-color 140ms ease, border-color 140ms ease",
  },
);
