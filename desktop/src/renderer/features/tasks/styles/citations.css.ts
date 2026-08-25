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
  minHeight: 0,
  flex: "1 1 auto",
  overflow: "auto",
  scrollbarGutter: "stable",
  background: "color-mix(in srgb, var(--surface) 97%, var(--ink) 3%)",
});

globalStyle(".citation-text-preview pre", {
  minWidth: "max-content",
  margin: 0,
  padding: "12px 0 28px",
  fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
  fontSize: "10.5px",
  lineHeight: "1.65",
  tabSize: 2,
});

globalStyle(".citation-code-line", {
  display: "grid",
  minHeight: "18px",
  gridTemplateColumns: "50px minmax(max-content, 1fr)",
  color: "color-mix(in srgb, var(--ink) 84%, transparent)",
});

globalStyle(".citation-code-line i", {
  paddingRight: "12px",
  color: "var(--subtle)",
  fontStyle: "normal",
  textAlign: "right",
  userSelect: "none",
});

globalStyle(".citation-code-line code", {
  display: "block",
  paddingRight: "20px",
  whiteSpace: "pre",
});

globalStyle(".citation-code-line.is-highlighted", {
  color: "var(--ink)",
  background: "color-mix(in srgb, var(--blue) 13%, transparent)",
  boxShadow: "inset 2px 0 color-mix(in srgb, var(--blue) 68%, transparent)",
});

globalStyle(".citation-preview-notice", {
  position: "sticky",
  bottom: "8px",
  width: "max-content",
  margin: "0 auto",
  padding: "5px 9px",
  color: "var(--muted)",
  border: "1px solid color-mix(in srgb, var(--line) 72%, transparent)",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--surface) 92%, transparent)",
  backdropFilter: "blur(8px)",
  fontSize: "9.5px",
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
