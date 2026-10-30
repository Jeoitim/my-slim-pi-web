"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { selectStreamingMessage, useStreamingSelector } from "@/hooks/useStreamingSelector";
import { useI18n } from "@/hooks/useI18n";
import { countToolCallBlocks, splitFinalAssistantBlocks } from "@/lib/message-display";
import { getProcessActivities, PROCESS_ACTIVITY_LIMIT, type ProcessActivity } from "@/lib/process-activity";
import { createStreamingStore, type StreamingStore } from "@/lib/streaming-message";
import type { CacheMissSummary } from "@/lib/transcript-notices";
import { formatTurnDuration } from "@/lib/turn-duration";
import { MessageView, ProcessActivityView } from "./MessageView";
import { cacheMissSummaryText, TRANSCRIPT_NOTICE_WARNING_COLOR } from "./TranscriptNotices";

const idleStore = createStreamingStore();
type MessageProps = Pick<ComponentProps<typeof MessageView>, "toolResults" | "modelNames" | "cwd" | "onOpenFile" | "onOpenSubagent">;

export function ProcessDetailsGroup({ messageCount, toolCallCount, durationMs, cacheMisses, reveal = false, activities = [], live = false, folded = true, store, onCommit, messageProps, children }: {
  messageCount: number;
  toolCallCount: number;
  durationMs?: number;
  cacheMisses?: CacheMissSummary;
  reveal?: boolean;
  activities?: ProcessActivity[];
  live?: boolean;
  folded?: boolean;
  store: StreamingStore;
  onCommit?: () => void;
  messageProps: MessageProps;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const expand = useCallback(() => setExpanded(true), []);
  const bodyId = useId();
  // Only this turn subscribes to chunks. History and the composer stay still.
  const selectedMessage = useStreamingSelector(live ? store : idleStore, selectStreamingMessage);
  const streaming = live ? selectedMessage : null;
  useLayoutEffect(() => { if (reveal) setExpanded(true); }, [reveal]);
  useLayoutEffect(() => { if (live) onCommit?.(); }, [streaming, live, expanded, folded, onCommit]);

  const split = streaming ? splitFinalAssistantBlocks(streaming, { isStreaming: true }) : undefined;
  const streamProcess = split && streaming ? { ...streaming, content: streaming.content.slice(0, split.answerBlocks.length ? streaming.content.indexOf(split.answerBlocks[0]) : undefined) } : undefined;
  const streamHasProcess = Boolean(split?.processBlocks.length);
  const count = messageCount + (streamHasProcess ? 1 : 0);
  const tools = toolCallCount + countToolCallBlocks(split?.processBlocks ?? []);
  const previews = live && folded ? [...activities, ...(streamProcess ? getProcessActivities(streamProcess.content) : [])].slice(-PROCESS_ACTIVITY_LIMIT) : [];
  const open = expanded || reveal;
  const parts = [`${count} ${t(count === 1 ? "chat.message" : "chat.messages")}`];
  if (tools > 0) parts.push(`${tools} ${t(tools === 1 ? "chat.toolCall" : "chat.toolCalls")}`);
  if (durationMs !== undefined) parts.push(t("chat.turnDuration", { time: formatTurnDuration(durationMs) }));
  const cacheMissText = cacheMisses && !open ? cacheMissSummaryText(t, cacheMisses) : undefined;

  useLayoutEffect(() => { followLatest.current = true; }, [open, folded]);
  // Show exactly the latest original card header, including the user's font
  // size. The preceding headers form a real scrollable history, not a fake rail.
  useLayoutEffect(() => {
    const viewport = previewRef.current;
    const lastRow = viewport?.lastElementChild;
    if (!viewport || !lastRow) return;
    const measure = () => {
      viewport.style.height = `${lastRow.getBoundingClientRect().height}px`;
      if (followLatest.current) viewport.scrollTop = viewport.scrollHeight;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(lastRow);
    return () => observer.disconnect();
  }, [streaming, activities, live, open, folded]);

  const streamedProcess = streamHasProcess && streamProcess && <MessageView {...messageProps} message={streamProcess} isStreaming />;
  const streamedAnswer = streaming && split && split.answerBlocks.length > 0 && <MessageView {...messageProps} message={{ ...streaming, content: split.answerBlocks }} isStreaming />;

  if (!folded) return <>{children}{streamedProcess}{streamedAnswer}</>;

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
      {!open && previews.length > 0 && <div ref={previewRef} className="process-activity-scroll" role="region" tabIndex={0}
        aria-label={t("chat.processActivityHistory")} title={t("chat.processActivityHistory")}
        onScroll={event => {
          const element = event.currentTarget;
          followLatest.current = element.scrollHeight - element.clientHeight - element.scrollTop < 2;
        }}>
        {previews.map((activity, index) => <div className="process-activity-row" key={activity.type === "toolCall" ? activity.call.toolCallId : index}>
          <ProcessActivityView activity={activity} result={activity.type === "toolCall" ? messageProps.toolResults?.get(activity.call.toolCallId) : undefined} onExpand={expand} />
        </div>)}
      </div>}
      {open && <div id={bodyId} role="region" aria-label={t("chat.processDetails")} tabIndex={0} className="process-details-body"
        style={{ marginTop: 8, minWidth: 0, maxHeight: "min(420px, calc(var(--app-viewport-height, 100dvh) * 0.5))", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", scrollbarGutter: "stable" }}>
        {children}
        {streamedProcess}
      </div>}
    </div>}
    {streamedAnswer}
  </>;
}
