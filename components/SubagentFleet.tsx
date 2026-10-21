"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  countActivePiSubagents,
  flattenPiSubagentRuns,
  formatPiSubagentElapsed,
  isActivePiSubagentState,
  type PiSubagentFleetSnapshot,
  type PiSubagentInspectorState,
  type PiSubagentRunState,
} from "@/lib/pi-subagents-view";
import { MarkdownBody } from "./MarkdownBody";

function stateColor(state: PiSubagentRunState): string {
  if (state === "running" || state === "queued") return "var(--accent)";
  if (state === "complete") return "#16a34a";
  if (state === "failed" || state === "rejected") return "#dc2626";
  if (state === "partial" || state === "paused" || state === "stopped") return "#d97706";
  return "var(--text-dim)";
}

function stateLabel(state: PiSubagentRunState, t: (key: string) => string): string {
  return t(`subagentFleet.state.${state}`);
}

export function SubagentFleetView({
  snapshot,
  onInspect,
}: {
  snapshot: PiSubagentFleetSnapshot | null;
  onInspect: (runId: string) => void;
}) {
  const { t } = useI18n();
  const rows = useMemo(() => flattenPiSubagentRuns(snapshot), [snapshot]);
  const activeCount = countActivePiSubagents(snapshot);
  const [expanded, setExpanded] = useState(activeCount > 0);

  useEffect(() => {
    if (activeCount > 0) setExpanded(true);
  }, [activeCount]);

  if (!snapshot || rows.length === 0) return null;
  const visible = expanded ? rows.slice(0, 12) : [];
  const hidden = Math.max(0, rows.length - visible.length);

  return (
    <section className="subagent-fleet" aria-label={t("subagentFleet.title")} style={{ margin: "0 auto", width: "100%", maxWidth: "var(--chat-content-max-width, 820px)", padding: "0 12px 6px" }}>
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)", overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          style={{ width: "100%", minHeight: 36, display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "none", background: "transparent", color: "var(--text)", cursor: "pointer", textAlign: "left" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="7" width="14" height="11" rx="2" /><path d="M9 11h.01M15 11h.01M9 15h6M12 7V4M10 4h4" />
          </svg>
          <strong style={{ fontSize: 12, fontWeight: 650 }}>{t("subagentFleet.title")}</strong>
          <span style={{ fontSize: 11, color: activeCount > 0 ? "var(--accent)" : "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
            {activeCount > 0 ? t("subagentFleet.active", { count: activeCount }) : t("subagentFleet.total", { count: rows.length })}
          </span>
          {snapshot.omittedRuns > 0 && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>+{snapshot.omittedRuns}</span>}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>{expanded ? t("i18n.collapse") : t("i18n.expand")}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expanded ? "rotate(180deg)" : undefined }}>
            <polyline points="2 3.5 5 6.5 8 3.5" />
          </svg>
        </button>
        {expanded && (
          <div role="list" style={{ borderTop: "1px solid var(--border)", maxHeight: 260, overflowY: "auto" }}>
            {visible.map((run) => {
              const elapsed = formatPiSubagentElapsed(run);
              const activity = run.activity?.currentTool || run.detail;
              return (
                <button
                  key={`${run.depth}:${run.id}`}
                  type="button"
                  role="listitem"
                  onClick={() => onInspect(run.id)}
                  title={t("subagentFleet.inspectHint")}
                  style={{
                    width: "100%", minHeight: 38, display: "flex", alignItems: "center", gap: 8,
                    padding: `6px 10px 6px ${10 + run.depth * 16}px`, border: "none",
                    borderTop: run === visible[0] ? "none" : "1px solid color-mix(in srgb, var(--border) 65%, transparent)",
                    background: "transparent", color: "var(--text)", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span aria-hidden="true" style={{ width: 7, height: 7, flexShrink: 0, borderRadius: "50%", background: stateColor(run.state), boxShadow: isActivePiSubagentState(run.state) ? `0 0 0 3px color-mix(in srgb, ${stateColor(run.state)} 18%, transparent)` : undefined }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.label}</span>
                      <span style={{ flexShrink: 0, fontSize: 10, color: stateColor(run.state) }}>{stateLabel(run.state, t)}</span>
                    </span>
                    {activity && <span style={{ display: "block", marginTop: 1, fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activity}</span>}
                  </span>
                  {elapsed && <span style={{ flexShrink: 0, color: "var(--text-dim)", fontSize: 10, fontVariantNumeric: "tabular-nums" }}>{elapsed}</span>}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              );
            })}
            {hidden > 0 && <div style={{ padding: "7px 10px", borderTop: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 10 }}>{t("subagentFleet.more", { count: hidden })}</div>}
          </div>
        )}
      </div>
    </section>
  );
}

export function SubagentInspectorDialog({
  inspector,
  onClose,
}: {
  inspector: PiSubagentInspectorState | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!inspector) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [inspector, onClose]);

  if (!inspector) return null;
  const reply = inspector.reply;
  const error = inspector.error ?? reply?.error?.message;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 96, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "color-mix(in srgb, var(--bg) 42%, transparent)", pointerEvents: "auto" }}>
      <div role="dialog" aria-modal="true" aria-label={t("subagentFleet.inspector")} style={{ width: "min(820px, 100%)", maxHeight: "min(760px, 100%)", display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", boxShadow: "0 20px 60px rgba(0,0,0,0.28)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <strong style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reply?.label || inspector.runId}</strong>
              {reply?.status && <span style={{ flexShrink: 0, color: "var(--accent)", fontSize: 10 }}>{reply.status}</span>}
            </div>
            <div style={{ marginTop: 2, color: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inspector.runId}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("i18n.close")} title={t("i18n.close")} style={{ display: "grid", placeItems: "center", width: 28, height: 28, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text-muted)", cursor: "pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div style={{ minHeight: 0, overflowY: "auto", padding: 14 }}>
          {inspector.pending && !reply && <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 12 }}><span className="animate-spin" aria-hidden="true">◌</span>{t("subagentFleet.inspectorLoading")}</div>}
          {error && <div role="alert" style={{ padding: 10, border: "1px solid color-mix(in srgb, #dc2626 40%, var(--border))", borderRadius: 6, color: "#dc2626", fontSize: 12, whiteSpace: "pre-wrap" }}>{error}</div>}
          {reply?.task && <section style={{ marginTop: error ? 12 : 0 }}>
            <div style={{ marginBottom: 5, color: "var(--text-dim)", fontSize: 10, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("subagentFleet.task")}</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{reply.task}</div>
          </section>}
          {reply && reply.messages.length > 0 && <section style={{ marginTop: 14 }}>
            <div style={{ marginBottom: 6, color: "var(--text-dim)", fontSize: 10, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("subagentFleet.transcript")}</div>
            <div style={{ display: "grid", gap: 7 }}>
              {reply.messages.map((message, index) => (
                <div key={index} style={{ padding: "8px 9px", border: `1px solid ${message.isError ? "color-mix(in srgb, #dc2626 45%, var(--border))" : "var(--border)"}`, borderRadius: 6, background: "var(--bg-panel)" }}>
                  <div style={{ marginBottom: 4, display: "flex", gap: 6, alignItems: "center", color: message.isError ? "#dc2626" : "var(--text-dim)", fontSize: 9, fontFamily: "var(--font-mono)" }}>
                    <span>{message.role}</span><span>·</span><span>{message.name || message.kind}</span>
                  </div>
                  {message.kind === "text" ? <div style={{ fontSize: 12, lineHeight: 1.5 }}><MarkdownBody>{message.text}</MarkdownBody></div> : <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, lineHeight: 1.45, fontFamily: "var(--font-mono)" }}>{message.text}</pre>}
                </div>
              ))}
            </div>
          </section>}
          {reply?.finalOutput && <section style={{ marginTop: 14 }}>
            <div style={{ marginBottom: 6, color: "var(--text-dim)", fontSize: 10, fontWeight: 650, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("subagentFleet.finalOutput")}</div>
            <div style={{ fontSize: 12, lineHeight: 1.55 }}><MarkdownBody>{reply.finalOutput}</MarkdownBody></div>
          </section>}
          {!inspector.pending && !error && reply && reply.messages.length === 0 && !reply.finalOutput && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("subagentFleet.empty")}</div>}
        </div>
      </div>
    </div>
  );
}
