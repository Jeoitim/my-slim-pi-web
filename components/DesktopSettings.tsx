"use client";
import { useEffect, useRef, useState } from "react";
import { useDesktop } from "@/hooks/useDesktop";
import { useI18n } from "@/hooks/useI18n";
import type { DesktopSettings as Settings, ServiceStatus } from "@/electron/shared/contracts";
import { ConfigButton, ConfigField, ConfigSwitch, ConfigStatusDot } from "./SettingsUi";

export function DesktopSettings() {
  const desktop = useDesktop();
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [port, setPort] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    void desktop.getSettings().then(value => { if (!cancelled) { setSettings(value); setPort(String(value.port)); } }).catch(() => { if (!cancelled) setError(t("desktop.failed")); });
    const refresh = () => void desktop.getStatus().then(value => { if (!cancelled) setStatus(value); }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [desktop, t]);
  if (!desktop) return null;
  const run = async (action: () => Promise<unknown>, success = "") => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); setStatus(await desktop.getStatus()); setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("desktop.failed")); }
    finally { lock.current = false; setBusy(false); }
  };
  const save = async (patch: Partial<Settings>) => { setSettings(await desktop.updateSettings(patch)); };
  const validPort = /^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;
  const webAvailable = status?.phase === "running" && Boolean(status.externalUrl);
  return <div className="settings-general desktop-settings">
    <section className="settings-general-section">
      <h3 className="settings-general-heading">{t("desktop.externalControl")}</h3>
      <p className="settings-general-description" id="desktop-security">{t("desktop.security")}</p>
      <div className="settings-chat-option settings-chat-switch-option">
        <span>{t("desktop.localWeb")}</span>
        <ConfigSwitch label={t("desktop.localWeb")} describedBy="desktop-security" checked={settings?.externalControl === true}
          disabled={!settings || busy || status?.phase !== "running" || (!status.passwordConfigured && !settings.externalControl)}
          onChange={value => void run(() => save({ externalControl: value }))} />
      </div>
      {status && !status.passwordConfigured && <p className="settings-general-description">{t("desktop.passwordRequired")}</p>}
      <div className="desktop-port-row">
        <ConfigField label={t("desktop.port")}>
          <input className="desktop-port-input" aria-label={t("desktop.port")} aria-invalid={!validPort} inputMode="numeric" value={port}
            onChange={event => setPort(event.target.value)} disabled={busy || !settings} />
        </ConfigField>
        <ConfigButton disabled={busy || !settings || !validPort || Number(port) === settings.port} onClick={() => void run(() => save({ port: Number(port) }), t("desktop.portApplied"))}>{t("desktop.apply")}</ConfigButton>
      </div>
      {!validPort && settings && <p role="alert" className="settings-general-error">{t("desktop.invalidPort")}</p>}
      {validPort && Number(port) < 1024 && <p className="settings-general-description">{t("desktop.lowPort")}</p>}
      <p className="settings-general-description">{t("desktop.portHint")}</p>
      <div className="desktop-service-status" role="status"><ConfigStatusDot active={status?.phase === "running"} />
        <span>{t(`desktop.phase.${status?.phase ?? "starting"}`)}</span>
        {status?.externalUrl && <code>{status.externalUrl}</code>}
      </div>
      <div className="desktop-settings-actions">
        <ConfigButton disabled={!webAvailable || busy} onClick={() => void run(() => desktop.openLocalWeb())}>{t("desktop.openWeb")}</ConfigButton>
        <ConfigButton disabled={!webAvailable || busy} onClick={() => void run(() => desktop.copyLocalWebUrl(), t("desktop.copied"))}>{t("desktop.copyUrl")}</ConfigButton>
        <ConfigButton disabled={busy || !status || ["starting", "stopping"].includes(status.phase)} onClick={() => void run(() => desktop.restartService())}>{t("desktop.restart")}</ConfigButton>
      </div>
      {status?.error && <p role="alert" className="settings-general-error">{status.error}</p>}
      {error && <p role="alert" className="settings-general-error">{error}</p>}
      {notice && <p role="status" className="settings-general-description">{notice}</p>}
    </section>
    <section className="settings-general-section">
      <h3 className="settings-general-heading">{t("desktop.lifecycle")}</h3>
      <p className="settings-general-description">{t("desktop.lifecycleHint")}</p>
      <p className="settings-general-description">{status && `My Slim Pi Web ${status.version} · Node.js ${status.nodeVersion}`}</p>
      <ConfigButton disabled={busy} onClick={() => void desktop.quit()}>{t("desktop.quit")}</ConfigButton>
    </section>
  </div>;
}
