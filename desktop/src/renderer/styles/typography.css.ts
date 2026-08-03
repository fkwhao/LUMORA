import { globalStyle } from "@vanilla-extract/css";

/*
 * 高 DPI 屏幕上的统一排版基线。各页面仍保留自身层级，
 * 这里只集中校准字号、字重和行高，避免散落的小字号发虚。
 */
globalStyle("body", {
  fontSize: "14px",
  fontWeight: "450",
  fontOpticalSizing: "auto",
});

globalStyle("button,\ninput,\nselect,\ntextarea", {
  fontFamily: "inherit",
  fontWeight: "450",
});

globalStyle(".brand-wordmark", {
  fontSize: "22px",
  fontWeight: "740",
});

globalStyle(
  ".new-task-button,\n.nav-item,\n.settings-link",
  {
    fontSize: "14px",
    fontWeight: "500",
  },
);

globalStyle(".nav-item.active,\n.settings-link.active", {
  fontWeight: "680",
});

globalStyle(".sidebar-section-heading", {
  fontSize: "14px",
  fontWeight: "500",
});

globalStyle(".history-label", {
  fontSize: "14px",
  fontWeight: "500",
});

globalStyle(".history-empty", {
  fontSize: "11px",
  fontWeight: "500",
});

globalStyle(".history-item", {
  fontSize: "14px",
  fontWeight: "450",
});

globalStyle(".history-row.current .history-item", {
  fontWeight: "500",
});

globalStyle(".home-hero h1", {
  fontWeight: "560",
});

globalStyle(".home-hero p", {
  fontSize: "12px",
  fontWeight: "470",
});

globalStyle(".project-picker,\n.project-mode,\n.project-branch", {
  fontSize: "11px",
  fontWeight: "520",
});

globalStyle(".goal-composer textarea", {
  fontSize: "14px",
  fontWeight: "450",
  lineHeight: "1.65",
});

globalStyle(".context-actions button,\n.follow-up-composer button", {
  fontSize: "10.5px",
  fontWeight: "520",
});

globalStyle(".selected-contexts > span,\n.home-privacy-note", {
  fontSize: "10px",
  fontWeight: "470",
});

globalStyle(".task-title-row h1", {
  fontSize: "15.5px",
  fontWeight: "680",
});

globalStyle(".status-badge", {
  fontSize: "10px",
  fontWeight: "700",
});

globalStyle(".task-actions > button:not(.icon-button),\n.task-more-menu button", {
  fontSize: "11px",
  fontWeight: "540",
});

globalStyle(".user-message p", {
  fontSize: "14px",
  fontWeight: "450",
  lineHeight: "1.6",
});

globalStyle(".assistant-message > p,\n.markdown-body", {
  fontSize: "14px",
  fontWeight: "450",
  lineHeight: "1.78",
});

globalStyle(".markdown-body h1", {
  fontSize: "19px",
  fontWeight: "720",
});

globalStyle(".markdown-body h2", {
  fontSize: "16.5px",
  fontWeight: "700",
});

globalStyle(".markdown-body h3,\n.markdown-body h4", {
  fontSize: "14.5px",
  fontWeight: "680",
});

globalStyle(".markdown-body code,\n.markdown-body pre code", {
  fontSize: "12px",
  fontWeight: "400",
  lineHeight: "1.65",
});

globalStyle(".agent-run-toggle", {
  fontSize: "14px",
  fontWeight: "450",
});

globalStyle(".agent-run-event strong", {
  fontSize: "11.5px",
  fontWeight: "620",
});

globalStyle(".agent-run-event p", {
  fontSize: "10.5px",
  fontWeight: "450",
});

globalStyle(".follow-up-composer textarea", {
  fontSize: "14px",
  fontWeight: "450",
});

globalStyle(".settings-sidebar-title strong", {
  fontSize: "19px",
  fontWeight: "720",
});

globalStyle(".settings-sidebar-title small,\n.settings-toolbar p", {
  fontSize: "10.5px",
  fontWeight: "470",
});

globalStyle(".settings-search input,\n.settings-nav-item", {
  fontSize: "12px",
  fontWeight: "500",
});

globalStyle(".settings-nav-item.active", {
  fontWeight: "680",
});

globalStyle(".settings-nav-item small,\n.key-state", {
  fontSize: "9.5px",
  fontWeight: "680",
});

globalStyle(".settings-intro strong,\n.settings-card-heading strong", {
  fontSize: "12.5px",
  fontWeight: "680",
});

globalStyle(".settings-intro p,\n.settings-card-heading p", {
  fontSize: "10.5px",
  fontWeight: "450",
});

globalStyle(".settings-form-grid label > span", {
  fontSize: "10.5px",
  fontWeight: "680",
});

globalStyle(".settings-form-grid input,\n.settings-form-grid select", {
  fontSize: "11.5px",
  fontWeight: "470",
});

globalStyle(
  ".settings-security-note,\n.settings-error,\n.settings-actions p",
  {
    fontSize: "10px",
    fontWeight: "470",
  },
);

globalStyle(".settings-actions button,\n.settings-dialog button", {
  fontSize: "10.5px",
  fontWeight: "650",
});

globalStyle(".archived-header p,\n.archive-task-row small", {
  fontSize: "10.5px",
  fontWeight: "450",
});

globalStyle(".archive-task-row strong", {
  fontSize: "12px",
  fontWeight: "620",
});

globalStyle(".prototype-toolbar p,\n.prototype-section-heading p", {
  fontSize: "10.5px",
});

globalStyle(
  ".automation-list strong,\n.skill-grid strong",
  {
    fontSize: "12px",
    fontWeight: "650",
  },
);

globalStyle(
  ".automation-list small,\n.skill-grid p",
  {
    fontSize: "10.5px",
    fontWeight: "450",
  },
);

globalStyle(".prototype-badge,\n.prototype-section-heading > button,\n.skill-grid button", {
  fontSize: "10.5px",
  fontWeight: "540",
});

globalStyle(".appearance-header p", {
  fontSize: "11px",
});

globalStyle(".appearance-section-heading h2", {
  fontSize: "13px",
  fontWeight: "680",
});

globalStyle(".appearance-section-heading p", {
  fontSize: "10.5px",
});

globalStyle(".theme-option-label", {
  fontSize: "11px",
  fontWeight: "680",
});

globalStyle(".appearance-row strong", {
  fontSize: "11.5px",
  fontWeight: "650",
});

globalStyle(".appearance-row small", {
  fontSize: "10px",
  fontWeight: "450",
});

globalStyle(
  ".appearance-row select,\n.color-field,\n.contrast-control output,\n.appearance-footnote",
  {
    fontSize: "10.5px",
    fontWeight: "470",
  },
);
