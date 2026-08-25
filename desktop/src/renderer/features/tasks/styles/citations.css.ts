import { globalStyle } from "@vanilla-extract/css";

globalStyle(".inline-citation-tip", {
  position: "relative",
  display: "inline-flex",
  margin: "0 2px",
  verticalAlign: "0.42em",
});

globalStyle(".inline-citation-mark", {
  display: "inline-grid",
  width: "13px",
  height: "13px",
  minWidth: "13px",
  padding: 0,
  placeItems: "center",
  color: "color-mix(in srgb, var(--muted) 78%, transparent)",
  border: "1px solid color-mix(in srgb, var(--line) 68%, transparent)",
  borderRadius: "4px",
  background: "color-mix(in srgb, var(--ink) 5%, var(--surface))",
  fontSize: "8px",
  fontWeight: "650",
  lineHeight: "1",
  fontVariantNumeric: "tabular-nums",
  textDecoration: "none",
  cursor: "pointer",
  transition: "color 140ms ease, border-color 140ms ease, background-color 140ms ease",
});

globalStyle(".inline-citation-mark:hover, .inline-citation-mark:focus-visible", {
  color: "var(--ink)",
  borderColor: "color-mix(in srgb, var(--muted) 42%, var(--line))",
  background: "color-mix(in srgb, var(--ink) 10%, var(--surface))",
  outline: "none",
});

globalStyle(".inline-citation-tip-box", {
  position: "absolute",
  zIndex: "120",
  bottom: "calc(100% + 7px)",
  left: "-8px",
  maxWidth: "260px",
  padding: "5px 8px",
  overflow: "hidden",
  color: "rgb(248 248 248)",
  border: "1px solid rgb(255 255 255 / 10%)",
  borderRadius: "7px",
  background: "rgb(31 31 31)",
  boxShadow: "0 8px 22px rgb(0 0 0 / 28%)",
  fontFamily: "inherit",
  fontSize: "12px",
  fontWeight: "520",
  lineHeight: "1.35",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  pointerEvents: "none",
  opacity: 0,
  transition: "opacity 120ms ease",
});

globalStyle(".inline-citation-tip:hover .inline-citation-tip-box, .inline-citation-tip:focus-within .inline-citation-tip-box", {
  opacity: 1,
});

globalStyle(".inline-citation-footer", {
  display: "flex",
  margin: "15px 0 3px",
  padding: "10px 0 1px",
  flexDirection: "column",
  gap: "4px",
  borderTop: "1px solid color-mix(in srgb, var(--line) 72%, transparent)",
});

globalStyle(".inline-citation-reference", {
  display: "flex",
  width: "100%",
  minWidth: 0,
  minHeight: "26px",
  padding: "1px 2px",
  alignItems: "center",
  gap: "6px",
  color: "var(--subtle)",
  border: 0,
  borderRadius: "6px",
  background: "transparent",
  fontFamily: "inherit",
  fontSize: "inherit",
  lineHeight: "1.5",
  textAlign: "left",
  cursor: "pointer",
});

globalStyle(".inline-citation-reference > .inline-citation-mark", {
  margin: 0,
  cursor: "inherit",
});

globalStyle(".inline-citation-label", {
  minWidth: 0,
  overflow: "hidden",
  color: "color-mix(in srgb, var(--ink) 82%, transparent)",
  fontWeight: "480",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".inline-citation-separator, .inline-citation-host", {
  flex: "0 0 auto",
  color: "var(--subtle)",
  whiteSpace: "nowrap",
});

globalStyle(".inline-citation-arrow", {
  display: "inline-flex",
  marginLeft: "-2px",
  flex: "0 0 auto",
  color: "var(--subtle)",
  opacity: 0,
  transform: "rotate(45deg) translate(0, 2px)",
  transition: "opacity 150ms ease, transform 190ms ease",
});

globalStyle(".inline-citation-reference:hover .inline-citation-arrow", {
  opacity: 1,
  transform: "rotate(45deg) translate(0, 0)",
});

globalStyle(".inline-citation-reference:hover .inline-citation-host", {
  color: "var(--ink)",
});

globalStyle(".citation-preview", {
  display: "flex",
  width: "100%",
  height: "100%",
  minHeight: 0,
  flexDirection: "column",
  background: "var(--surface)",
});

globalStyle(".citation-preview-toolbar", {
  display: "grid",
  minHeight: "42px",
  padding: "0 10px",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  alignItems: "center",
  gap: "9px",
  borderBottom: "1px solid color-mix(in srgb, var(--line) 78%, transparent)",
  background: "color-mix(in srgb, var(--surface) 96%, var(--ink) 4%)",
});

globalStyle(".citation-web-controls", {
  display: "flex",
  alignItems: "center",
  gap: "2px",
});

globalStyle(".citation-web-controls button", {
  display: "grid",
  width: "27px",
  height: "27px",
  padding: 0,
  placeItems: "center",
  color: "var(--muted)",
  border: 0,
  borderRadius: "7px",
  background: "transparent",
  cursor: "pointer",
});

globalStyle(".citation-web-controls button:hover:not(:disabled)", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 7%, transparent)",
});

globalStyle(".citation-web-controls button:disabled", {
  color: "var(--subtle)",
  cursor: "default",
  opacity: "0.38",
});

globalStyle(".citation-web-controls svg", { width: "14px", height: "14px" });

globalStyle(".citation-web-address", {
  display: "flex",
  minWidth: 0,
  height: "27px",
  padding: "0 10px",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  color: "var(--muted)",
  border: "1px solid color-mix(in srgb, var(--line) 72%, transparent)",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--surface) 93%, var(--ink) 7%)",
  fontSize: "10px",
});

globalStyle(".citation-web-address svg", {
  width: "12px",
  height: "12px",
  flex: "0 0 auto",
});

globalStyle(".citation-web-address span", {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".citation-web-surface", {
  position: "relative",
  minHeight: 0,
  flex: "1 1 auto",
  overflow: "hidden",
  background: "color-mix(in srgb, var(--surface) 97%, var(--ink) 3%)",
});

globalStyle(".citation-preview-placeholder, .citation-preview-error", {
  display: "flex",
  height: "100%",
  minHeight: "180px",
  padding: "28px",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  gap: "9px",
  color: "var(--subtle)",
  fontSize: "11px",
  textAlign: "center",
});

globalStyle(".citation-preview-placeholder svg", {
  width: "18px",
  height: "18px",
  color: "var(--muted)",
});

globalStyle(".citation-preview-error", {
  position: "absolute",
  inset: 0,
  zIndex: 1,
  background: "var(--surface)",
});

globalStyle(".citation-preview-error strong", {
  color: "var(--ink)",
  fontSize: "12px",
  fontWeight: "600",
});

globalStyle(".citation-preview-error span", {
  maxWidth: "320px",
  lineHeight: "1.55",
});

globalStyle(".citation-local-header", {
  display: "grid",
  minHeight: "56px",
  padding: "0 14px",
  gridTemplateColumns: "28px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "9px",
  borderBottom: "1px solid color-mix(in srgb, var(--line) 76%, transparent)",
});

globalStyle(".citation-local-icon", {
  display: "grid",
  width: "28px",
  height: "28px",
  placeItems: "center",
  color: "var(--muted)",
  border: "1px solid color-mix(in srgb, var(--line) 70%, transparent)",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--ink) 5%, var(--surface))",
});

globalStyle(".citation-local-icon svg", { width: "14px", height: "14px" });

globalStyle(".citation-local-header > div", {
  display: "grid",
  minWidth: 0,
  gap: "2px",
});

globalStyle(".citation-local-header strong", {
  overflow: "hidden",
  color: "var(--ink)",
  fontSize: "11.5px",
  fontWeight: "580",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".citation-local-header div > span", {
  overflow: "hidden",
  color: "var(--subtle)",
  fontSize: "9.5px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".citation-local-header small", {
  color: "var(--muted)",
  fontSize: "9.5px",
  fontVariantNumeric: "tabular-nums",
});

globalStyle(".citation-text-preview", {
  position: "relative",
  display: "flex",
  width: "100%",
  height: "100%",
  minHeight: 0,
  flex: "1 1 auto",
  flexDirection: "column",
  overflow: "hidden",
  background: "var(--surface)",
});

globalStyle(".citation-file-toolbar", {
  display: "grid",
  width: "100%",
  minHeight: "36px",
  padding: "0 12px 0 16px",
  flex: "0 0 auto",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "12px",
  borderBottom: "1px solid color-mix(in srgb, var(--line) 78%, transparent)",
  background: "color-mix(in srgb, var(--surface) 98%, var(--ink) 2%)",
});

globalStyle(".citation-file-breadcrumb", {
  display: "flex",
  minWidth: 0,
  alignItems: "center",
  gap: "6px",
  overflowX: "auto",
  overflowY: "hidden",
  color: "color-mix(in srgb, var(--ink) 90%, transparent)",
  fontSize: "12.5px",
  fontWeight: "560",
  lineHeight: "1",
  scrollbarWidth: "none",
  whiteSpace: "nowrap",
});

globalStyle(".citation-file-breadcrumb::-webkit-scrollbar", {
  display: "none",
});

globalStyle(".citation-file-breadcrumb-entry", {
  display: "inline-flex",
  flex: "0 0 auto",
  alignItems: "center",
  gap: "6px",
});

globalStyle(".citation-file-breadcrumb-entry > span", {
  whiteSpace: "nowrap",
});

globalStyle(".citation-file-breadcrumb-entry > span.is-current", {
  color: "inherit",
  fontWeight: "inherit",
});

globalStyle(".citation-file-breadcrumb-entry svg", {
  flex: "0 0 auto",
  color: "color-mix(in srgb, var(--muted) 72%, transparent)",
  strokeWidth: "1.7",
});

globalStyle(".citation-markdown-mode", {
  minHeight: "27px",
  padding: "0 7px",
  color: "color-mix(in srgb, var(--ink) 86%, transparent)",
  border: 0,
  borderRadius: "6px",
  background: "transparent",
  fontFamily: "inherit",
  fontSize: "11px",
  fontWeight: "560",
  whiteSpace: "nowrap",
  cursor: "pointer",
  transition: "color 130ms ease, background-color 130ms ease",
});

globalStyle(".citation-markdown-mode:hover, .citation-markdown-mode:focus-visible", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--ink) 7%, transparent)",
  outline: "none",
});

globalStyle(".citation-file-content", {
  display: "flex",
  width: "100%",
  minHeight: 0,
  flex: "1 1 auto",
  overflow: "hidden",
  background: "var(--surface)",
});

globalStyle(".citation-source-file-panel", {
  display: "flex",
  width: "100%",
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
});

globalStyle(".citation-source-file-panel > div", {
  width: "100%",
  minWidth: 0,
});

globalStyle(".citation-markdown-preview", {
  width: "100%",
  minHeight: 0,
  padding: "18px 20px 42px",
  overflow: "auto",
  color: "var(--ink)",
  fontSize: "13px",
  scrollbarColor: "color-mix(in srgb, var(--muted) 38%, transparent) transparent",
  scrollbarGutter: "stable",
  scrollbarWidth: "thin",
});

globalStyle(".citation-markdown-preview > .aui-md", {
  width: "100%",
  maxWidth: "none",
});

globalStyle(".citation-markdown-preview::-webkit-scrollbar", {
  width: "10px",
  height: "10px",
});

globalStyle(".citation-markdown-preview::-webkit-scrollbar-track, .citation-markdown-preview::-webkit-scrollbar-corner", {
  background: "transparent",
});

globalStyle(".citation-markdown-preview::-webkit-scrollbar-thumb", {
  minWidth: "44px",
  minHeight: "44px",
  border: "3px solid transparent",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--muted) 38%, transparent) padding-box",
});

globalStyle(".citation-image-preview", {
  display: "grid",
  minHeight: 0,
  padding: "22px",
  flex: "1 1 auto",
  placeItems: "center",
  overflow: "auto",
  backgroundImage: "linear-gradient(45deg, color-mix(in srgb, var(--ink) 4%, transparent) 25%, transparent 25%), linear-gradient(-45deg, color-mix(in srgb, var(--ink) 4%, transparent) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--ink) 4%, transparent) 75%), linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--ink) 4%, transparent) 75%)",
  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
  backgroundSize: "12px 12px",
});

globalStyle(".citation-image-preview img", {
  display: "block",
  maxWidth: "100%",
  maxHeight: "100%",
  objectFit: "contain",
  borderRadius: "5px",
  boxShadow: "0 10px 34px rgb(0 0 0 / 18%)",
});

globalStyle(".citation-pdf-preview", {
  minHeight: 0,
  flex: "1 1 auto",
  background: "color-mix(in srgb, var(--surface) 97%, var(--ink) 3%)",
});

globalStyle(".citation-pdf-preview embed", {
  display: "block",
  width: "100%",
  height: "100%",
  minHeight: "320px",
  border: 0,
});
