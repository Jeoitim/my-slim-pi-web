import assert from "node:assert/strict";
import test from "node:test";
import {
  PI_SUBAGENT_ASYNC_PREFIX,
  PI_SUBAGENT_INSPECT_PREFIX,
  countActivePiSubagents,
  flattenPiSubagentRuns,
  piSubagentFleetFromWidgets,
  piSubagentInspectFromWidget,
  parsePiSubagentFleetPayload,
} from "./pi-subagents-view.ts";

function snapshotLine(runs = []) {
  return `${PI_SUBAGENT_ASYNC_PREFIX}${JSON.stringify({
    kind: "pi-subagents.async-status-snapshot",
    version: 1,
    generatedAt: 1000,
    caps: { maxRuns: 16, maxChildrenPerNode: 24, maxDepth: 8, maxStringLength: 512, maxSerializedBytes: 65536 },
    omitted: { runs: 0, children: 0, byteLimitExceeded: false },
    runs,
  })}`;
}

test("pi-subagents fleet widget becomes a bounded native tree", () => {
  const widgets = [{
    key: "subagent-async",
    placement: "belowEditor",
    lines: [snapshotLine([{
      id: "workflow-1",
      kind: "workflow",
      label: "Review release",
      state: "running",
      startedAt: 1000,
      activity: { currentTool: "read", turnCount: 2 },
      children: [
        { id: "child-1", kind: "step", label: "API review", state: "complete", startedAt: 1100, endedAt: 5100 },
        { id: "child-2", kind: "step", label: "Desktop review", state: "running", startedAt: 5200 },
      ],
    }])],
  }];
  const snapshot = piSubagentFleetFromWidgets(widgets);
  assert.ok(snapshot);
  assert.equal(snapshot.runs[0].activity?.currentTool, "read");
  assert.deepEqual(flattenPiSubagentRuns(snapshot).map((run) => [run.label, run.depth, run.state]), [
    ["Review release", 0, "running"],
    ["API review", 1, "complete"],
    ["Desktop review", 1, "running"],
  ]);
  assert.equal(countActivePiSubagents(snapshot), 2);
});

test("malformed or foreign fleet payloads are ignored", () => {
  assert.equal(parsePiSubagentFleetPayload({ kind: "wrong", version: 1, runs: [] }), null);
  assert.equal(piSubagentFleetFromWidgets([{ key: "other", placement: "aboveEditor", lines: [snapshotLine()] }]), null);
  const invalidRun = parsePiSubagentFleetPayload({
    kind: "pi-subagents.async-status-snapshot", version: 1, generatedAt: 1,
    omitted: { runs: 0, byteLimitExceeded: false },
    runs: [{ id: "x", kind: "subagent", label: "Bad state", state: "unknown" }],
  });
  assert.ok(invalidRun);
  assert.equal(invalidRun.runs.length, 0);
});

test("inspection reply widget becomes structured transcript data", () => {
  const reply = {
    kind: "pi-subagents.inspect-reply",
    version: 1,
    requestId: "request-1",
    asyncId: "run-1",
    status: "running",
    label: "Reviewer",
    task: "Review the patch",
    messages: [
      { role: "assistant", kind: "text", text: "Checking the changed files." },
      { role: "tool", kind: "toolResult", name: "read", text: "src/app.ts", isError: false },
    ],
    finalOutput: "No blocking issues.",
  };
  const parsed = piSubagentInspectFromWidget("subagent-inspect", [`${PI_SUBAGENT_INSPECT_PREFIX}${JSON.stringify(reply)}`]);
  assert.ok(parsed);
  assert.equal(parsed.requestId, "request-1");
  assert.equal(parsed.messages[1].name, "read");
  assert.equal(parsed.finalOutput, "No blocking issues.");
  assert.equal(piSubagentInspectFromWidget("subagent-async", [`${PI_SUBAGENT_INSPECT_PREFIX}${JSON.stringify(reply)}`]), null);
});
