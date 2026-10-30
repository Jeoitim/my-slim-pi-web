"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useI18n } from "@/hooks/useI18n";
import { desktopTextTarget, performDesktopTextAction, type DesktopTextTarget } from "@/lib/desktop-context-target";
import { SidebarMenu, type SidebarMenuItem } from "./SidebarMenu";

interface Opening { x: number; y: number; target: DesktopTextTarget; style: CSSProperties; preserveFieldFocus: boolean }

export function DesktopContextMenu() {
  const { locale, t } = useI18n();
  const [opening, setOpening] = useState<Opening | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // Chromium moves the caret on a secondary press in a field's blank area,
    // before contextmenu can snapshot the selection. Keep that selection for
    // Copy/Paste; an ordinary left click still places the caret normally.
    const preserveFieldSelection = (event: MouseEvent) => {
      if (event.button !== 2 || event.defaultPrevented || !(event.target instanceof HTMLElement)) return;
      const field = event.target.closest<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
      if (field && field.selectionStart !== null && field.selectionStart !== field.selectionEnd) event.preventDefault();
    };
    const open = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof HTMLElement) || event.target.closest(".sidebar-menu, .sidebar-sheet")) return;
      const target = desktopTextTarget(event.target);
      if (!target) return;
      event.preventDefault();
      const rect = event.target.getBoundingClientRect();
      const terminal = event.target.closest(".terminal-panel");
      const style: Record<string, string> = {};
      if (terminal) {
        const colors = getComputedStyle(terminal);
        for (const [key, value] of Object.entries({ "--bg": "--terminal-header-bg", "--text": "--terminal-strong", "--text-muted": "--terminal-muted", "--text-dim": "--terminal-muted", "--border": "--terminal-border", "--bg-hover": "--terminal-hover-bg", "--bg-selected": "--terminal-hover-bg", "--accent": "--terminal-accent" })) {
          style[key] = colors.getPropertyValue(value).trim();
        }
      }
      setFailed(false);
      setOpening({ x: event.clientX || rect.left + 8, y: event.clientY || rect.bottom, target, style: style as CSSProperties,
        preserveFieldFocus: event.button === 2 && target.element.matches("input, textarea") });
    };
    const dismiss = () => setOpening(null);
    document.addEventListener("mousedown", preserveFieldSelection, true);
    document.addEventListener("contextmenu", open);
    window.addEventListener("blur", dismiss);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("mousedown", preserveFieldSelection, true);
      document.removeEventListener("contextmenu", open);
      window.removeEventListener("blur", dismiss);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, []);
  const modifier = window.piDesktop?.platform === "darwin" ? "⌘" : "Ctrl+";
  const item = (id: "copy" | "paste" | "selectAll", label: string, key: string, disabled: boolean): SidebarMenuItem => ({
    type: "item", id, label, note: `${modifier}${key}`, disabled,
    onSelect: () => { if (opening) void performDesktopTextAction(opening.target, id).catch(() => setFailed(true)); },
  });
  const items = opening ? [
    item("copy", t("i18n.copy"), "C", !opening.target.selection),
    ...(opening.target.canPaste ? [item("paste", t("desktop.paste"), "V", false)] : []),
    item("selectAll", t("desktop.selectAll"), "A", !opening.target.canSelectAll),
  ] : [];
  return <>
    <SidebarMenu open={Boolean(opening)} anchor={opening ? { kind: "point", x: opening.x, y: opening.y } : null}
      sheet={false} width={188} topInset={36} ariaLabel={t("desktop.textMenu")} cancelLabel={t("i18n.close")}
      surfaceClassName="desktop-context-menu" surfaceStyle={{ ...opening?.style,
        ...(locale === "zh-CN" ? { fontFamily: '"Microsoft YaHei UI", "Microsoft YaHei", var(--font-ui)' } : {}) }}
      items={items} returnFocusTo={opening?.target.element} preserveOpenerFocus={opening?.preserveFieldFocus}
      onClose={() => setOpening(null)} />
    {failed && <div className="desktop-clipboard-error" role="alert" onClick={() => setFailed(false)}>{t("desktop.clipboardFailed")}</div>}
  </>;
}
