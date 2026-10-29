"use client";

import { useId, useLayoutEffect, useState, type ComponentProps, type ReactNode } from "react";
import { selectStreamingMessage, useStreamingSelector } from "@/hooks/useStreamingSelector";
import { useI18n } from "@/hooks/useI18n";
import { countToolCallBlocks, splitFinalAssistantBlocks } from "@/lib/message-display";
import { getProcessActivity, type ProcessActivity } from "@/lib/process-activity";
import { mcpToolLabel } from "@/lib/mcp-tool-display";
import { createStreamingStore, type StreamingStore } from "@/lib/streaming-message";
import type { CacheMissSummary } from "@/lib/transcript-notices";
import { formatTurnDuration } from "@/lib/turn-duration";
import { MessageView } from "./MessageView";
import { cacheMissSummaryText, TRANSCRIPT_NOTICE_WARNING_COLOR } from "./TranscriptNotices";

const idleStore = createStreamingStore();
type MessageProps = Pick<ComponentProps<typeof MessageView>, "toolResults" | "modelNames" | "cwd" | "onOpenFile" | "onOpenSubagent">;

export function ProcessDetailsGroup({ messageCount, toolCallCount, durationMs, cacheMisses, reveal = false, activity, live = false, pendingToolResults, store, onCommit, messageProps, children }: {
  messageCount: number;
  toolCallCount: number;
  durationMs?: number;
  cacheMisses?: CacheMissSummary;
  reveal?: boolean;
  activity?: ProcessActivity;
  live?: boolean;
  pendingToolResults?: ReadonlyMap<string, unknown>;
  store: StreamingStore;
  onCommit?: () => void;
  messageProps: MessageProps;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  // Only this turn subscribes to chunks. History and the composer stay still.
  const selectedMessage = useStreamingSelector(live ? store : idleStore, selectStreamingMessage);
  const streaming = live ? selectedMessage : null;
  useLayoutEffect(() => { if (reveal) setExpanded(true); }, [reveal]);
  useLayoutEffect(() => { if (live) onCommit?.(); }, [streaming, live, expanded, onCommit]);

  const split = streaming ? splitFinalAssistantBlocks(streaming, { isStreaming: true }) : undefined;
  const streamProcess = split && streaming ? { ...streaming, content: streaming.content.slice(0, split.answerBlocks.length ? streaming.content.indexOf(split.answerBlocks[0]) : undefined) } : undefined;
  const streamHasProcess = Boolean(split?.processBlocks.length);
  const count = messageCount + (streamHasProcess ? 1 : 0);
  const tools = toolCallCount + countToolCallBlocks(split?.processBlocks ?? []);
  const latest = (streamProcess && getProcessActivity(streamProcess.content)) || activity;
  const open = expanded || reveal;
  const parts = [`${count} ${t(count === 1 ? "chat.message" : "chat.messages")}`];
  if (tools > 0) parts.push(`${tools} ${t(tools === 1 ? "chat.toolCall" : "chat.toolCalls")}`);
  if (durationMs !== undefined) parts.push(t("chat.turnDuration", { time: formatTurnDuration(durationMs) }));
  const cacheMissText = cacheMisses && !open ? cacheMissSummaryText(t, cacheMisses) : undefined;
  let preview = latest?.text ?? "";
  if (latest?.type === "toolCall") {
    const result = messageProps.toolResults?.get(latest.call.toolCallId);
    const label = mcpToolLabel(latest.call.toolName, result?.details);
    const name = label ? `${label.server}/${label.tool}` : latest.call.toolName;
    const pending = pendingToolResults?.has(latest.call.toolCallId);
    const status = pending ? "⋯" : result ? (result.isError ? "✕" : "✓") : (live ? "⋯" : "·");
    preview = `${status} ${name}${preview ? ` · ${preview}` : ""}`;
  } else if (latest?.type === "thinking") {
    preview = `${t("chat.thinking")}${preview ? ` · ${preview}` : ""}`;
  }

  return <>
    {count === 0 && children}
    {count > 0 && <div className="process-details-group" style={{ marginBottom: 14, minWidth: 0 }}>
      <button type="button" aria-expanded={open} aria-controls={bodyId}
        aria-label={[t("chat.processDetails"), ...parts, ...(cacheMissText ? [cacheMissText] : [])].join(" · ")}
        onClick={() => setExpanded((value) => !value)} title={t(open ? "chat.collapseProcess" : "chat.expandProcess")}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "auto", maxWidth: "100%", minHeight: 24, padding: "2px 0", border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, textAlign: "left" }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none" }}><polyline points="4 2.5 7.5 6 4 9.5" /></svg>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {parts.join(" · ")}{cacheMissText && <span style={{ color: TRANSCRIPT_NOTICE_WARNING_COLOR }}>{` · ${cacheMissText}`}</span>}
        </span>
      </button>
      {!open && preview && <button type="button" className="process-activity" onClick={() => setExpanded(true)} title={preview} aria-label={`${t("chat.expandProcess")} · ${preview}`}
        style={{ display: "block", maxWidth: "100%", minWidth: 0, padding: "2px 0 2px 20px", border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontSize: 12, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview}</button>}
      {open && <div id={bodyId} role="region" aria-label={t("chat.processDetails")} tabIndex={0} className="process-details-body scrollbar-subtle"
        style={{ marginTop: 8, minWidth: 0, maxHeight: "min(420px, calc(var(--app-viewport-height, 100dvh) * 0.5))", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", scrollbarGutter: "stable" }}>
        {children}
        {streamHasProcess && streamProcess && <MessageView {...messageProps} message={streamProcess} isStreaming />}
      </div>}
    </div>}
    {streaming && split && split.answerBlocks.length > 0 && <MessageView {...messageProps} message={{ ...streaming, content: split.answerBlocks }} isStreaming />}
  </>;
}
