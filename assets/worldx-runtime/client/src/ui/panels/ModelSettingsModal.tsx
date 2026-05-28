import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "../services/api-client";

export function ModelSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyPreview, setApiKeyPreview] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.getLLMSettings()
      .then((response) => {
        if (cancelled) return;
        setBaseUrl(response.simulation.baseUrl || "");
        setModel(response.simulation.model || "");
        setHasApiKey(response.simulation.hasApiKey);
        setApiKeyPreview(response.simulation.apiKeyPreview || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const response = await apiClient.saveLLMSettings({
        baseUrl,
        model,
        apiKey,
        clearApiKey,
      });
      setBaseUrl(response.simulation.baseUrl || "");
      setModel(response.simulation.model || "");
      setHasApiKey(response.simulation.hasApiKey);
      setApiKeyPreview(response.simulation.apiKeyPreview || "");
      setApiKey("");
      setClearApiKey(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={backdropStyle} onMouseDown={onClose}>
      <form style={modalStyle} onMouseDown={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div style={headerStyle}>
          <div>
            <div style={titleStyle}>{t("settings.title")}</div>
            <div style={subtitleStyle}>{t("settings.subtitle")}</div>
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle} aria-label={t("settings.close")}>×</button>
        </div>

        {loading ? (
          <div style={statusStyle}>{t("settings.loading")}</div>
        ) : (
          <>
            <label style={labelStyle}>
              <span>{t("settings.baseUrl")}</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://openrouter.ai/api/v1"
                style={inputStyle}
                autoComplete="off"
              />
            </label>

            <label style={labelStyle}>
              <span>{t("settings.model")}</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="google/gemini-2.5-flash-preview"
                style={inputStyle}
                autoComplete="off"
              />
            </label>

            <label style={labelStyle}>
              <span>{t("settings.apiKey")}</span>
              <input
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  if (event.target.value) setClearApiKey(false);
                }}
                placeholder={hasApiKey ? t("settings.keepExistingKey", { key: apiKeyPreview }) : "sk-..."}
                style={inputStyle}
                type="password"
                autoComplete="off"
              />
            </label>

            {hasApiKey && (
              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={clearApiKey}
                  disabled={Boolean(apiKey)}
                  onChange={(event) => setClearApiKey(event.target.checked)}
                />
                <span>{t("settings.clearApiKey")}</span>
              </label>
            )}

            <div style={hintStyle}>{t("settings.hint")}</div>

            {error && <div style={errorStyle}>{error}</div>}
            {saved && <div style={successStyle}>{t("settings.saved")}</div>}

            <div style={footerStyle}>
              <button type="button" onClick={onClose} style={secondaryButtonStyle}>{t("settings.cancel")}</button>
              <button type="submit" disabled={saving} style={primaryButtonStyle(saving)}>
                {saving ? t("settings.saving") : t("settings.save")}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(3,6,18,0.62)",
  backdropFilter: "blur(8px)",
  zIndex: 10000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modalStyle: CSSProperties = {
  width: "min(520px, 100%)",
  background: "linear-gradient(180deg, rgba(18,24,42,0.98), rgba(13,18,32,0.98))",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  boxShadow: "0 24px 80px rgba(0,0,0,0.48)",
  color: "#eef3ff",
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 700 };
const subtitleStyle: CSSProperties = { fontSize: 12, color: "rgba(238,243,255,0.66)", marginTop: 5, lineHeight: 1.5 };
const statusStyle: CSSProperties = { padding: "28px 0", color: "rgba(238,243,255,0.72)" };

const iconButtonStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 20,
  lineHeight: "24px",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(238,243,255,0.88)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  padding: "10px 11px",
  fontSize: 13,
  outline: "none",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "rgba(238,243,255,0.76)",
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.55,
  color: "rgba(238,243,255,0.62)",
  background: "rgba(116,185,255,0.08)",
  border: "1px solid rgba(116,185,255,0.18)",
  borderRadius: 8,
  padding: "9px 10px",
};

const errorStyle: CSSProperties = {
  fontSize: 12,
  color: "#ffb8b8",
  background: "rgba(231,76,60,0.12)",
  border: "1px solid rgba(231,76,60,0.28)",
  borderRadius: 8,
  padding: "8px 10px",
};

const successStyle: CSSProperties = {
  fontSize: 12,
  color: "#b9ffd2",
  background: "rgba(0,184,148,0.12)",
  border: "1px solid rgba(0,184,148,0.28)",
  borderRadius: 8,
  padding: "8px 10px",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 2,
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.08)",
  color: "#e8eefc",
  borderRadius: 999,
  padding: "8px 14px",
  cursor: "pointer",
};

function primaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: "1px solid rgba(116,185,255,0.5)",
    background: disabled ? "rgba(116,185,255,0.12)" : "rgba(116,185,255,0.28)",
    color: "#f5fbff",
    borderRadius: 999,
    padding: "8px 15px",
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.65 : 1,
    fontWeight: 700,
  };
}
