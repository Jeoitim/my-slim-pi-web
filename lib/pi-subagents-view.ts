import type { ExtensionWidgetItem } from "@/lib/types";

export const PI_SUBAGENT_ASYNC_WIDGET_KEY = "subagent-async";
export const PI_SUBAGENT_INSPECT_WIDGET_KEY = "subagent-inspect";
export const PI_SUBAGENT_ASYNC_PREFIX = "PI_SUBAGENT_ASYNC_JSON:";
export const PI_SUBAGENT_INSPECT_PREFIX = "PI_SUBAGENT_INSPECT_JSON:";

export type PiSubagentRunState =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "partial"
  | "paused"
  | "stopped"
  | "rejected";

export interface PiSubagentActivity {
  state?: string;
  currentTool?: string;
  lastActivityAt?: number;
  currentToolStartedAt?: number;
  turnCount?: number;
  toolCount?: number;
}

export interface PiSubagentRunNode {
  id: string;
  kind: "subagent" | "workflow" | "step" | "host-step";
  label: string;
  state: PiSubagentRunState;
  startedAt?: number;
  updatedAt?: number;
  endedAt?: number;
  activity?: PiSubagentActivity;
  detail?: string;
  children: PiSubagentRunNode[];
}

export interface PiSubagentFleetSnapshot {
  generatedAt: number;
  runs: PiSubagentRunNode[];
  omittedRuns: number;
  byteLimitExceeded: boolean;
}

export interface FlatPiSubagentRun extends PiSubagentRunNode {
  depth: number;
}

export interface PiSubagentInspectMessage {
  role: string;
  kind: "text" | "toolCall" | "toolResult";
  text: string;
  name?: string;
  isError?: boolean;
}

export interface PiSubagentInspectReply {
  requestId: string;
  asyncId?: string;
  childId?: string;
  status?: string;
  label?: string;
  task?: string;
  messages: PiSubagentInspectMessage[];
  finalOutput?: string;
  error?: { code?: string; message: string };
}

export interface PiSubagentInspectorState {
  runId: string;
  requestId: string;
  pending: boolean;
  reply?: PiSubagentInspectReply;
  error?: string;
}

const MAX_WIDGET_PAYLOAD_CHARS = 2 * 1024 * 1024;
const MAX_VISIBLE_RUNS = 128;
const STATES = new Set<PiSubagentRunState>([
  "queued", "running", "complete", "failed", "partial", "paused", "stopped", "rejected",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max = 4096): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function timestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function parseActivity(value: unknown): PiSubagentActivity | undefined {
  const source = record(value);
  if (!source) return undefined;
  const activity: PiSubagentActivity = {
    ...(text(source.state, 80) ? { state: text(source.state, 80) } : {}),
    ...(text(source.currentTool, 160) ? { currentTool: text(source.currentTool, 160) } : {}),
    ...(timestamp(source.lastActivityAt) !== undefined ? { lastActivityAt: timestamp(source.lastActivityAt) } : {}),
    ...(timestamp(source.currentToolStartedAt) !== undefined ? { currentToolStartedAt: timestamp(source.currentToolStartedAt) } : {}),
    ...(count(source.turnCount) !== undefined ? { turnCount: count(source.turnCount) } : {}),
    ...(count(source.toolCount) !== undefined ? { toolCount: count(source.toolCount) } : {}),
  };
  return Object.keys(activity).length > 0 ? activity : undefined;
}

function parseNode(value: unknown, depth: number): PiSubagentRunNode | null {
  if (depth > 8) return null;
  const source = record(value);
  if (!source) return null;
  const id = text(source.id, 512);
  const label = text(source.label, 512);
  if (!id || !label || typeof source.state !== "string" || !STATES.has(source.state as PiSubagentRunState)) return null;
  const kind = source.kind === "workflow" || source.kind === "step" || source.kind === "host-step"
    ? source.kind
    : "subagent";
  const rawChildren = Array.isArray(source.children) ? source.children : [];
  const children: PiSubagentRunNode[] = [];
  for (const child of rawChildren) {
    if (children.length >= MAX_VISIBLE_RUNS) break;
    const parsed = parseNode(child, depth + 1);
    if (parsed) children.push(parsed);
  }
  const hostStep = record(source.hostStep);
  const detail = text(hostStep?.detail, 512);
  const activity = parseActivity(source.activity);
  return {
    id,
    kind,
    label,
    state: source.state as PiSubagentRunState,
    ...(timestamp(source.startedAt) !== undefined ? { startedAt: timestamp(source.startedAt) } : {}),
    ...(timestamp(source.updatedAt) !== undefined ? { updatedAt: timestamp(source.updatedAt) } : {}),
    ...(timestamp(source.endedAt) !== undefined ? { endedAt: timestamp(source.endedAt) } : {}),
    ...(activity ? { activity } : {}),
    ...(detail ? { detail } : {}),
    children,
  };
}

function payloadFromLines(lines: readonly string[] | undefined, prefix: string): unknown | null {
  if (!lines?.length) return null;
  for (const line of lines) {
    if (!line.startsWith(prefix) || line.length > MAX_WIDGET_PAYLOAD_CHARS) continue;
    try {
      return JSON.parse(line.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

/** Decode the bounded JSON widget pi-subagents emits to non-TUI hosts. */
export function piSubagentFleetFromWidgets(widgets: readonly ExtensionWidgetItem[]): PiSubagentFleetSnapshot | null {
  const widget = widgets.find((item) => item.key === PI_SUBAGENT_ASYNC_WIDGET_KEY);
  if (!widget) return null;
  return parsePiSubagentFleetPayload(payloadFromLines(widget.lines, PI_SUBAGENT_ASYNC_PREFIX));
}

export function parsePiSubagentFleetPayload(value: unknown): PiSubagentFleetSnapshot | null {
  const source = record(value);
  if (!source || source.kind !== "pi-subagents.async-status-snapshot" || source.version !== 1) return null;
  const rawRuns = Array.isArray(source.runs) ? source.runs : [];
  const runs: PiSubagentRunNode[] = [];
  for (const value of rawRuns) {
    if (runs.length >= MAX_VISIBLE_RUNS) break;
    const run = parseNode(value, 0);
    if (run) runs.push(run);
  }
  const omitted = record(source.omitted);
  return {
    generatedAt: timestamp(source.generatedAt) ?? Date.now(),
    runs,
    omittedRuns: count(omitted?.runs) ?? 0,
    byteLimitExceeded: omitted?.byteLimitExceeded === true,
  };
}

/** Decode the correlated inspection reply emitted by `/subagents-inspect-rpc`. */
export function piSubagentInspectFromWidget(
  key: string,
  lines: readonly string[] | undefined,
): PiSubagentInspectReply | null {
  if (key !== PI_SUBAGENT_INSPECT_WIDGET_KEY) return null;
  return parsePiSubagentInspectPayload(payloadFromLines(lines, PI_SUBAGENT_INSPECT_PREFIX));
}

export function parsePiSubagentInspectPayload(value: unknown): PiSubagentInspectReply | null {
  const source = record(value);
  if (!source || source.kind !== "pi-subagents.inspect-reply" || source.version !== 1) return null;
  const requestId = text(source.requestId, 128);
  if (!requestId) return null;
  const rawMessages = Array.isArray(source.messages) ? source.messages : [];
  const messages: PiSubagentInspectMessage[] = [];
  for (const value of rawMessages) {
    if (messages.length >= 200) break;
    const message = record(value);
    if (!message) continue;
    const role = text(message.role, 80);
    const messageText = text(message.text, 16_000);
    const kind = message.kind === "toolCall" || message.kind === "toolResult" ? message.kind : "text";
    if (!role || !messageText) continue;
    messages.push({
      role,
      kind,
      text: messageText,
      ...(text(message.name, 160) ? { name: text(message.name, 160) } : {}),
      ...(message.isError === true ? { isError: true } : {}),
    });
  }
  const error = record(source.error);
  const errorMessage = text(error?.message, 1024);
  return {
    requestId,
    ...(text(source.asyncId, 512) ? { asyncId: text(source.asyncId, 512) } : {}),
    ...(text(source.childId, 512) ? { childId: text(source.childId, 512) } : {}),
    ...(text(source.status, 80) ? { status: text(source.status, 80) } : {}),
    ...(text(source.label, 512) ? { label: text(source.label, 512) } : {}),
    ...(text(source.task, 8000) ? { task: text(source.task, 8000) } : {}),
    messages,
    ...(text(source.finalOutput, 24_000) ? { finalOutput: text(source.finalOutput, 24_000) } : {}),
    ...(errorMessage ? { error: { ...(text(error?.code, 80) ? { code: text(error?.code, 80) } : {}), message: errorMessage } } : {}),
  };
}

/** Depth-first order matching the terminal Fleet view. */
export function flattenPiSubagentRuns(snapshot: PiSubagentFleetSnapshot | null): FlatPiSubagentRun[] {
  if (!snapshot) return [];
  const rows: FlatPiSubagentRun[] = [];
  const visit = (run: PiSubagentRunNode, depth: number) => {
    if (rows.length >= MAX_VISIBLE_RUNS) return;
    rows.push({ ...run, depth });
    for (const child of run.children) visit(child, Math.min(8, depth + 1));
  };
  for (const run of snapshot.runs) visit(run, 0);
  return rows;
}

export function isActivePiSubagentState(state: PiSubagentRunState): boolean {
  return state === "queued" || state === "running";
}

export function countActivePiSubagents(snapshot: PiSubagentFleetSnapshot | null): number {
  return flattenPiSubagentRuns(snapshot).filter((run) => isActivePiSubagentState(run.state)).length;
}

export function formatPiSubagentElapsed(run: Pick<PiSubagentRunNode, "state" | "startedAt" | "endedAt" | "updatedAt">, now = Date.now()): string | null {
  if (run.startedAt === undefined) return null;
  const end = isActivePiSubagentState(run.state) ? now : run.endedAt ?? run.updatedAt ?? now;
  const seconds = Math.max(0, Math.round((end - run.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
