import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { splitFinalAssistantBlocks } from "../lib/message-display.ts";

const source = ts.createSourceFile("ChatWindow.tsx", readFileSync(new URL("./ChatWindow.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helpers = source.statements.filter(node => ts.isFunctionDeclaration(node)
  && ["findFinalAssistantIndex", "hasFinalAssistantAnswer"].includes(node.name?.text)).map(node => node.getText(source)).join("\n");
const js = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const findFinal = new Function("splitFinalAssistantBlocks", `${js}\nreturn findFinalAssistantIndex;`)(splitFinalAssistantBlocks);
const assistant = content => ({ role: "assistant", content });

test("an error or tool-only ending cannot promote earlier commentary to the final answer", () => {
  const messages = [
    { role: "user", content: "prompt" },
    assistant([{ type: "text", text: "I will inspect the file" }]),
    assistant([{ type: "toolCall", toolCallId: "r", toolName: "read", input: {} }]),
    { role: "toolResult", toolCallId: "r", content: [] },
    { ...assistant([]), stopReason: "error", errorMessage: "provider failed" },
  ];
  assert.equal(findFinal(messages, 0, 4), 2, "A tool-only ending belongs in process details");
  assert.equal(findFinal(messages, 0, 5), 4, "The error remains outside the folded process");
  messages.push({ role: "user", content: "next prompt" }, assistant([{ type: "text", text: "Next answer" }]));
  assert.equal(findFinal(messages, 0, 5), 4, "Do not cross the next turn's anchor");
  assert.equal(findFinal(messages, 5, 7), 6);
  assert.equal(findFinal(messages, 5, 6), -1);
  assert.equal(findFinal(messages.slice(1, 4), -1, 3), 1, "A paged turn without its anchor groups too");
});
