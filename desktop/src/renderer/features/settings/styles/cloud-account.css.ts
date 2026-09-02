import { globalStyle } from "@vanilla-extract/css";

globalStyle(".cloud-account-page", {
  padding: "34px 42px 60px",
});

globalStyle(".cloud-account-page > *", {
  width: "min(100%, 980px)",
  marginRight: "auto",
  marginLeft: "auto",
});

globalStyle(".cloud-account-header", {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "24px",
  marginBottom: "22px",
});

globalStyle(".cloud-account-eyebrow", {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  marginBottom: "8px",
  color: "var(--blue)",
  fontSize: "10px",
  fontWeight: "700",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
});

globalStyle(".cloud-account-header h1", {
  margin: "0",
  color: "var(--ink)",
  fontSize: "25px",
  letterSpacing: "-0.035em",
});

globalStyle(".cloud-account-header p", {
  margin: "7px 0 0",
  color: "var(--muted)",
  fontSize: "11px",
});

globalStyle(".cloud-icon-button", {
  display: "grid",
  width: "34px",
  height: "34px",
  placeItems: "center",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: "9px",
  background: "var(--surface)",
  cursor: "pointer",
});

globalStyle(".cloud-icon-button:hover", {
  color: "var(--ink)",
  background: "var(--surface-soft)",
});

globalStyle(".cloud-account-error", {
  boxSizing: "border-box",
  margin: "0 auto 16px",
  padding: "10px 12px",
  border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)",
  borderRadius: "9px",
  background: "color-mix(in srgb, var(--danger) 7%, var(--surface))",
});

globalStyle(".cloud-loading-card", {
  display: "flex",
  minHeight: "220px",
  alignItems: "center",
  justifyContent: "center",
  gap: "9px",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: "14px",
  background: "var(--surface-soft)",
  fontSize: "11px",
});

globalStyle(".cloud-auth-layout", {
  display: "grid",
  minHeight: "430px",
  gridTemplateColumns: "minmax(0, 1.08fr) minmax(330px, 0.92fr)",
  overflow: "hidden",
  border: "1px solid var(--line)",
  borderRadius: "16px",
  background: "var(--surface)",
  boxShadow: "0 16px 50px rgba(17, 24, 39, 0.06)",
});

globalStyle(".cloud-auth-intro", {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: "48px",
  background: "linear-gradient(145deg, var(--blue-soft), var(--surface-soft) 68%)",
});

globalStyle(".cloud-auth-mark", {
  display: "grid",
  width: "47px",
  height: "47px",
  placeItems: "center",
  marginBottom: "24px",
  color: "#fff",
  borderRadius: "13px",
  background: "var(--blue)",
  boxShadow: "0 10px 26px color-mix(in srgb, var(--blue) 28%, transparent)",
});

globalStyle(".cloud-auth-intro h2", {
  margin: 0,
  fontSize: "22px",
  letterSpacing: "-0.03em",
});

globalStyle(".cloud-auth-intro > p", {
  maxWidth: "440px",
  margin: "10px 0 27px",
  color: "var(--muted)",
  fontSize: "11px",
  lineHeight: "1.7",
});

globalStyle(".cloud-auth-intro ul", {
  display: "grid",
  gap: "10px",
  margin: 0,
  padding: 0,
  color: "var(--muted)",
  fontSize: "10px",
  listStyle: "none",
});

globalStyle(".cloud-auth-intro li", {
  display: "flex",
  alignItems: "center",
  gap: "8px",
});

globalStyle(".cloud-login-form", {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: "44px",
});

globalStyle(".cloud-login-form header", {
  marginBottom: "25px",
});

globalStyle(".cloud-login-form h2", {
  margin: 0,
  fontSize: "17px",
});

globalStyle(".cloud-login-form header p", {
  margin: "6px 0 0",
  color: "var(--muted)",
  fontSize: "10px",
});

globalStyle(".cloud-login-form label", {
  display: "grid",
  gap: "7px",
  marginBottom: "15px",
  color: "var(--muted)",
  fontSize: "10px",
  fontWeight: "600",
});

globalStyle(".cloud-login-form input", {
  boxSizing: "border-box",
  width: "100%",
  height: "40px",
  padding: "0 12px",
  color: "var(--ink)",
  border: "1px solid var(--line-strong)",
  borderRadius: "9px",
  outline: "none",
  background: "var(--surface)",
  font: "inherit",
  fontSize: "11px",
});

globalStyle(".cloud-login-form input:focus", {
  borderColor: "var(--blue)",
  boxShadow: "0 0 0 3px var(--blue-soft)",
});

globalStyle(".cloud-primary-button, .cloud-secondary-button, .cloud-text-button", {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "7px",
  border: 0,
  cursor: "pointer",
  font: "inherit",
});

globalStyle(".cloud-primary-button", {
  minHeight: "40px",
  marginTop: "3px",
  color: "#fff",
  borderRadius: "9px",
  background: "var(--blue)",
  fontSize: "11px",
  fontWeight: "700",
});

globalStyle(".cloud-text-button", {
  minHeight: "34px",
  padding: "0 8px",
  color: "var(--muted)",
  background: "transparent",
  fontSize: "10px",
});

globalStyle(".cloud-text-button:hover", {
  color: "var(--blue)",
});

globalStyle(".cloud-account-content", {
  display: "grid",
  gap: "14px",
});

globalStyle(".cloud-identity-card, .cloud-section-card", {
  boxSizing: "border-box",
  border: "1px solid var(--line)",
  borderRadius: "13px",
  background: "var(--surface)",
});

globalStyle(".cloud-identity-card", {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto auto",
  alignItems: "center",
  gap: "12px",
  padding: "15px 17px",
});

globalStyle(".cloud-user-avatar", {
  display: "grid",
  width: "37px",
  height: "37px",
  placeItems: "center",
  color: "#fff",
  borderRadius: "11px",
  background: "linear-gradient(140deg, #4ea8ff, #2779df)",
  fontSize: "13px",
  fontWeight: "750",
});

globalStyle(".cloud-identity-card > div", {
  display: "grid",
  gap: "3px",
});

globalStyle(".cloud-identity-card strong", {
  fontSize: "11px",
});

globalStyle(".cloud-identity-card small", {
  color: "var(--muted)",
  fontSize: "9px",
});

globalStyle(".cloud-session-status", {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "5px 8px",
  color: "var(--green)",
  borderRadius: "999px",
  background: "var(--green-soft)",
  fontSize: "9px",
});

globalStyle(".cloud-session-status i", {
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  background: "currentColor",
});

globalStyle(".cloud-identity-card > button", {
  display: "inline-flex",
  minHeight: "31px",
  alignItems: "center",
  gap: "6px",
  padding: "0 9px",
  color: "var(--muted)",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  background: "var(--surface)",
  cursor: "pointer",
  fontSize: "9px",
});

globalStyle(".cloud-section-card", {
  padding: "19px",
});

globalStyle(".cloud-section-card > header", {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  marginBottom: "16px",
  color: "var(--subtle)",
});

globalStyle(".cloud-section-card h2", {
  margin: 0,
  color: "var(--ink)",
  fontSize: "13px",
  letterSpacing: "-0.015em",
});

globalStyle(".cloud-section-card header p", {
  margin: "5px 0 0",
  color: "var(--muted)",
  fontSize: "9px",
});

globalStyle(".cloud-source-grid", {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
});

globalStyle(".cloud-source-card", {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  alignItems: "center",
  gap: "11px",
  minHeight: "74px",
  padding: "12px",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "10px",
  background: "var(--surface-soft)",
  cursor: "pointer",
  textAlign: "left",
});

globalStyle(".cloud-source-card:hover, .cloud-source-card.active", {
  borderColor: "color-mix(in srgb, var(--blue) 48%, var(--line))",
  background: "var(--blue-soft)",
});

globalStyle(".cloud-source-icon", {
  display: "grid",
  width: "34px",
  height: "34px",
  placeItems: "center",
  color: "var(--blue)",
  borderRadius: "9px",
  background: "var(--surface)",
});

globalStyle(".cloud-source-card > span:nth-child(2)", {
  display: "grid",
  gap: "4px",
});

globalStyle(".cloud-source-card strong", {
  fontSize: "10px",
});

globalStyle(".cloud-source-card small", {
  color: "var(--muted)",
  fontSize: "9px",
  lineHeight: "1.45",
});

globalStyle(".cloud-source-card > i", {
  display: "grid",
  width: "19px",
  height: "19px",
  placeItems: "center",
  color: "#fff",
  border: "1px solid var(--line-strong)",
  borderRadius: "50%",
  background: "var(--surface)",
});

globalStyle(".cloud-source-card.active > i", {
  borderColor: "var(--blue)",
  background: "var(--blue)",
});

globalStyle(".cloud-dashboard-grid", {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.15fr) minmax(300px, 0.85fr)",
  gap: "14px",
});

globalStyle(".cloud-plan-name", {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "18px",
});

globalStyle(".cloud-plan-name strong", {
  fontSize: "18px",
  letterSpacing: "-0.025em",
});

globalStyle(".cloud-plan-name span", {
  color: "var(--muted)",
  fontSize: "9px",
});

globalStyle(".cloud-quota-numbers", {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "8px",
});

globalStyle(".cloud-quota-numbers div", {
  display: "grid",
  gap: "5px",
});

globalStyle(".cloud-quota-numbers span", {
  color: "var(--muted)",
  fontSize: "8px",
});

globalStyle(".cloud-quota-numbers strong", {
  fontSize: "10px",
});

globalStyle(".cloud-quota-track", {
  height: "6px",
  margin: "16px 0 8px",
  overflow: "hidden",
  borderRadius: "99px",
  background: "var(--surface-soft)",
});

globalStyle(".cloud-quota-track i", {
  display: "block",
  height: "100%",
  borderRadius: "inherit",
  background: "linear-gradient(90deg, var(--blue), #70baff)",
});

globalStyle(".cloud-plan-period", {
  display: "block",
  color: "var(--subtle)",
  fontSize: "8px",
});

globalStyle(".cloud-empty-plan", {
  minHeight: "112px",
  padding: "14px",
  borderRadius: "10px",
  background: "var(--surface-soft)",
});

globalStyle(".cloud-empty-plan strong", {
  fontSize: "11px",
});

globalStyle(".cloud-empty-plan p, .cloud-muted-message", {
  margin: "7px 0 0",
  color: "var(--muted)",
  fontSize: "9px",
  lineHeight: "1.55",
});

globalStyle(".cloud-secondary-button", {
  minHeight: "32px",
  marginTop: "17px",
  padding: "0 11px",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  background: "var(--surface-soft)",
  fontSize: "9px",
  fontWeight: "650",
});

globalStyle(".cloud-model-list", {
  display: "grid",
  gap: "7px",
  maxHeight: "214px",
  overflow: "auto",
});

globalStyle(".cloud-model-list button", {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: "8px",
  padding: "10px",
  color: "var(--ink)",
  border: "1px solid transparent",
  borderRadius: "9px",
  background: "var(--surface-soft)",
  cursor: "pointer",
  textAlign: "left",
});

globalStyle(".cloud-model-list button.selected", {
  color: "var(--blue)",
  borderColor: "color-mix(in srgb, var(--blue) 35%, var(--line))",
  background: "var(--blue-soft)",
});

globalStyle(".cloud-model-list button > span", {
  display: "grid",
  gap: "4px",
});

globalStyle(".cloud-model-list strong", {
  fontSize: "9px",
});

globalStyle(".cloud-model-list small", {
  color: "var(--muted)",
  fontSize: "8px",
});

globalStyle(".cloud-usage-list", {
  display: "grid",
});

globalStyle(".cloud-usage-list > div", {
  display: "flex",
  minHeight: "46px",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "18px",
  borderTop: "1px solid var(--line)",
});

globalStyle(".cloud-usage-list > div:first-child", {
  borderTop: 0,
});

globalStyle(".cloud-usage-list span", {
  display: "grid",
  gap: "3px",
});

globalStyle(".cloud-usage-list span:last-child", {
  textAlign: "right",
});

globalStyle(".cloud-usage-list strong", {
  fontSize: "9px",
});

globalStyle(".cloud-usage-list small", {
  color: "var(--muted)",
  fontSize: "8px",
});

globalStyle(".cloud-usage-card > footer", {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  marginTop: "9px",
  paddingTop: "9px",
  borderTop: "1px solid var(--line)",
});

globalStyle("button:disabled", {
  cursor: "not-allowed",
});

globalStyle(".cloud-account-page button:disabled", {
  opacity: "0.55",
});

globalStyle("[data-theme='dark'] .cloud-auth-layout", {
  boxShadow: "none",
});

globalStyle("[data-theme='dark'] .cloud-auth-intro", {
  background: "linear-gradient(145deg, var(--blue-soft), var(--surface-soft) 72%)",
});
