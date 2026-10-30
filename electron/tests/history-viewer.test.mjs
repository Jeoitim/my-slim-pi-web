import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { historyUrl, historyRequestAllowed } = require("../main/history-viewer.cjs");
const origin = "http://127.0.0.1:43210";
const url = `${origin}/api/sessions/39c062d4-a2ab-4f23-9366-c589edb28cfa/export?inline=1`;

test("only the exact local session export route gets a scripted history viewer", () => {
  assert.equal(historyUrl(url, origin), url);
  assert.equal(historyUrl(url + "#answer", origin), url);
  for (const value of [url.replace(":43210", ":43211"), url.replace("inline=1", "inline=0"), url.replace("/export", "/export/other"), `${origin}/api/files/page.html?inline=1`, `${origin}/?inline=1`, url.replace("http://", "http://user:secret@"), "file:///history.html", "invalid"]) {
    assert.equal(historyUrl(value, origin), null);
  }
});

test("history credentials are restricted to its own GET document and never API fetches", () => {
  const request = { webContentsId: 12, method: "GET", resourceType: "mainFrame", url };
  assert.equal(historyRequestAllowed(request, url, 12), true);
  for (const change of [{ webContentsId: 13 }, { method: "POST" }, { resourceType: "xhr" }, { resourceType: "subFrame" }, { resourceType: "webSocket" }, { url: origin + "/api/agent/running" }, { url: url.replace("39c062d4", "00000000") }]) {
    assert.equal(historyRequestAllowed({ ...request, ...change }, url, 12), false);
  }
});
