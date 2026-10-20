"use client";
import { useEffect, type ReactNode } from "react";
import { useDesktop } from "@/hooks/useDesktop";
import { useI18n } from "@/hooks/useI18n";
import { PiLogo } from "./PiLogo";

export function DesktopShell({ children }: { children: ReactNode }) {
  const desktop = useDesktop();
  const { t } = useI18n();
  useEffect(() => {
    if (!desktop) return;
    const sync = () => {
      const styles = getComputedStyle(document.documentElement);
      const background = styles.getPropertyValue("--bg-panel").trim();
      const foreground = styles.getPropertyValue("--text").trim();
      if (/^#[a-f0-9]{6}$/i.test(background) && /^#[a-f0-9]{6}$/i.test(foreground)) {
        void desktop.setTitleBarColors({ background, foreground }).catch(() => {});
      }
    };
    document.documentElement.dataset.desktop = desktop.platform;
    document.documentElement.style.setProperty("--desktop-titlebar-height", "36px");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => { observer.disconnect(); delete document.documentElement.dataset.desktop; document.documentElement.style.removeProperty("--desktop-titlebar-height"); };
  }, [desktop]);
  return <>
    {desktop && <header className={`desktop-titlebar is-${desktop.platform}`}>
      <div className="desktop-titlebar-safe-area">
        <div className="desktop-titlebar-brand"><PiLogo /><span>My Slim Pi</span><span className="desktop-titlebar-edition">Web</span></div>
        <div className="desktop-titlebar-actions">
          <button type="button" title={t("desktop.fullscreen")} aria-label={t("desktop.fullscreen")} onClick={() => void desktop.toggleFullScreen()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg>
          </button>
        </div>
      </div>
    </header>}
    <div className={desktop ? "desktop-content" : undefined}>{children}</div>
  </>;
}
