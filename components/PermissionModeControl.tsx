"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { PERMISSION_MODES, type PermissionMode } from "@/lib/permission-mode";
import { listenForStackedDialogEscape } from "@/lib/stacked-dialog";
import { SelectorRow } from "./SelectorRow";

/** A session control beside the model/reasoning controls. State is always Agent-owned. */
export function PermissionModeControl({ mode, disabled, onChange }: {
  mode: PermissionMode | null;
  disabled: boolean;
  onChange: (mode: PermissionMode) => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const id = useId();
  const menuVisible = open && !disabled && !pending;

  useEffect(() => {
    if (!menuVisible) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    const stopEscape = listenForStackedDialogEscape(document, () => {
      setOpen(false); trigger.current?.focus();
    });
    const selected = list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?? list.current?.querySelector<HTMLButtonElement>('[role="option"]');
    selected?.focus();
    return () => { document.removeEventListener("pointerdown", outside); stopEscape(); };
  }, [menuVisible]);

  const choose = async (next: PermissionMode) => {
    setOpen(false); trigger.current?.focus();
    if (next === mode || disabled || inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    try { await onChange(next); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { inFlight.current = false; setPending(false); }
  };

  return <div className="permission-mode" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={trigger} type="button" className="permission-mode-trigger"
      aria-label={t("permissions.label") + ": " + (mode?.toUpperCase() ?? t("permissions.unknown"))} aria-haspopup="listbox" aria-expanded={menuVisible}
      aria-controls={menuVisible ? id : undefined} aria-busy={pending || undefined}
      disabled={disabled || pending}
      title={pending ? t("permissions.switching") : t("permissions.description")}
      onClick={() => { setError(""); setOpen(value => !value); }}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>
      <svg className="permission-mode-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 4.5 6v5.2c0 4.4 3.1 7.8 7.5 9.8 4.4-2 7.5-5.4 7.5-9.8V6L12 3Z" />
        <path d="m8.7 11.8 2.2 2.2 4.5-4.5" />
      </svg>
      <span className="permission-mode-value">{mode?.toUpperCase() ?? t("permissions.shortLabel")}</span>
      {pending ? <span className="permission-mode-wait" aria-hidden="true">···</span>
        : <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>}
    </button>
    {menuVisible && <div className="permission-mode-menu">
      <div className="permission-mode-heading"><span>{t("permissions.label")}</span><span>{t("permissions.menuHint")}</span></div>
      <div id={id} ref={list} role="listbox" aria-label={t("permissions.label")}
        onKeyDown={event => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const options = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
          const index = options.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
          options[next]?.focus();
        }}>
        {PERMISSION_MODES.map(value => <SelectorRow key={value} active={mode === value} onSelect={() => void choose(value)}>
          <span className="permission-mode-option"><span className="permission-mode-option-name">{value.toUpperCase()}</span><span className="permission-mode-option-description">{t("permissions." + value)}</span></span>
        </SelectorRow>)}
      </div>
    </div>}
    {error && <div className="permission-mode-error" role="alert"><span>{t("permissions.failed")}: {error}</span><button type="button" onClick={() => setError("")} aria-label={t("permissions.closeError")}>×</button></div>}
  </div>;
}
