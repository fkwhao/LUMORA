import { globalStyle, keyframes } from "@vanilla-extract/css";

const searchShimmer = keyframes({
  "0%": { backgroundPosition: "-200% 0" },
  "100%": { backgroundPosition: "200% 0" },
});

const searchEnter = keyframes({
  from: { opacity: 0, transform: "translateY(4px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

globalStyle(".web-search", {
  display: "flex",
  minWidth: 0,
  flexDirection: "column",
  gap: "4px",
  color: "var(--ink)",
  fontSize: "12px",
  lineHeight: "1.4",
});

globalStyle(".web-search-row", {
  display: "flex",
  minHeight: "22px",
  alignItems: "center",
  gap: "7px",
  padding: "3px 0",
});

globalStyle(".web-search-row > svg", {
  flex: "0 0 auto",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "1.8",
  color: "var(--muted)",
});

globalStyle(".web-search-label", {
  display: "inline-flex",
  minWidth: 0,
  alignItems: "center",
  gap: "4px",
  color: "var(--ink)",
  fontWeight: "550",
  whiteSpace: "nowrap",
});

globalStyle(".web-search-query", {
  marginLeft: "4px",
});

globalStyle(".web-search-shimmer", {
  overflow: "hidden",
  textOverflow: "ellipsis",
  color: "transparent",
  backgroundImage:
    "linear-gradient(90deg, color-mix(in srgb, var(--ink) 45%, transparent) 0%, var(--ink) 44%, color-mix(in srgb, var(--ink) 45%, transparent) 80%)",
  backgroundPosition: "-200% 0",
  backgroundSize: "220% 100%",
  backgroundClip: "text",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  animation: `${searchShimmer} 2.7s linear infinite`,
});

globalStyle(".web-search-shimmer.is-done", {
  color: "var(--ink)",
  background: "none",
  WebkitTextFillColor: "var(--ink)",
  animation: "none",
});

globalStyle(".web-search-chevron", {
  display: "inline-flex",
  width: "16px",
  height: "16px",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  border: 0,
  borderRadius: "4px",
  color: "var(--subtle)",
  background: "none",
  cursor: "pointer",
  transition: "color 160ms ease, transform 280ms cubic-bezier(.32,.72,0,1)",
});

globalStyle(".web-search-chevron svg", {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "1.8",
});

globalStyle('.web-search-chevron[aria-expanded="false"]', {
  transform: "rotate(180deg)",
});

globalStyle(".web-search-chevron:hover", { color: "var(--muted)" });

globalStyle(".web-search-collapsible", {
  display: "grid",
  gridTemplateRows: "1fr",
  opacity: 1,
  transition: "grid-template-rows 320ms cubic-bezier(.32,.72,0,1), opacity 220ms ease",
});

globalStyle(".web-search-collapsible.is-collapsed", {
  gridTemplateRows: "0fr",
  opacity: 0,
  pointerEvents: "none",
});

globalStyle(".web-search-collapsible-inner", { minHeight: 0, overflow: "hidden" });

globalStyle(".web-search-results", {
  position: "relative",
  display: "flex",
  minWidth: 0,
  alignItems: "stretch",
  gap: "6px",
});

globalStyle(".web-search-rail", {
  width: "1px",
  flex: "0 0 auto",
  alignSelf: "stretch",
  marginLeft: "5.5px",
  borderLeft: "1px solid var(--line)",
});

globalStyle(".web-search-list", {
  display: "flex",
  minWidth: 0,
  flex: 1,
  flexDirection: "column",
  gap: "6px",
  margin: 0,
  padding: "4px 0 3px 6px",
  listStyle: "none",
});

globalStyle(".web-search-site", {
  minWidth: 0,
  animation: `${searchEnter} 340ms cubic-bezier(.32,.72,0,1) both`,
});

globalStyle(".web-search-site > a", {
  display: "flex",
  minWidth: 0,
  alignItems: "center",
  gap: "6px",
  color: "var(--muted)",
  fontSize: "11.5px",
  lineHeight: "18px",
  textDecoration: "none",
});

globalStyle(".web-search-bullet", {
  display: "inline-flex",
  width: "12px",
  height: "12px",
  flex: "0 0 auto",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--green)",
});

globalStyle(".web-search-bullet svg,.web-search-arrow svg", {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "1.6",
});

globalStyle(".web-search-title", {
  overflow: "hidden",
  flex: "0 1 auto",
  color: "var(--ink)",
  fontWeight: "450",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

globalStyle(".web-search-separator", { flex: "0 0 auto", color: "var(--subtle)" });

globalStyle(".web-search-url", {
  overflow: "hidden",
  minWidth: 0,
  flex: "1 1 auto",
  color: "var(--muted)",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  transition: "color 160ms ease",
});

globalStyle(".web-search-arrow", {
  display: "inline-flex",
  flex: "0 0 auto",
  marginLeft: "-2px",
  color: "var(--subtle)",
  opacity: 0,
  transform: "rotate(45deg) translate(0,2px)",
  transition: "opacity 160ms ease, transform 220ms ease",
});

globalStyle(".web-search-site > a:hover .web-search-arrow", {
  opacity: 1,
  transform: "rotate(45deg) translate(0,0)",
});

globalStyle(".web-search-site > a:hover .web-search-url", { color: "var(--ink)" });

globalStyle(".web-search-error", {
  margin: 0,
  padding: "4px 0 3px 6px",
  color: "var(--danger)",
  fontSize: "11.5px",
});

globalStyle(".web-search[data-state='failed'] .web-search-row", { color: "var(--danger)" });

globalStyle(".web-search-shimmer", {
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      color: "var(--ink)",
      background: "none",
      WebkitTextFillColor: "var(--ink)",
      animation: "none",
    },
  },
});

globalStyle(".web-search-site", {
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      opacity: 1,
      transform: "none",
      animation: "none",
    },
  },
});
