import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import { isRemoteApiAllowed, isRemoteRequest, isRemoteHostConfigured } from "./remote-access.ts";

const req = host => new Request("http://127.0.0.1/api/sessions", { headers: { host } });

test("external hosts and explicit tunnel mode retain the authenticated remote boundary", () => {
  assert.equal(isRemoteRequest(req("127.0.0.1:30141"), {}), false);
  assert.equal(isRemoteRequest(req("localhost"), { PI_WEB_REMOTE: "1" }), true);
  for (const host of ["agent.example.org", "192.168.1.3", "evil.localhost", "127.0.0.2"]) {
    assert.equal(isRemoteRequest(req(host), {}), true);
  }
  assert.equal(isRemoteHostConfigured(req("192.168.1.3"), ""), false);
  assert.equal(isRemoteHostConfigured(req("agent.example.org"), "agent.example.org"), true);
  assert.equal(isRemoteHostConfigured(req("evil.example.org"), "agent.example.org"), false);
});

test("every Web API handler is available remotely; native host actions and unknown routes remain closed", () => {
  const routes = globSync("app/api/**/route.ts", { cwd: new URL("../", import.meta.url) });
  for (const file of routes) {
    const route = "/" + file.replaceAll("\\", "/").replace(/\/route\.ts$/, "")
      .replace("app/", "")
      .replace("[...path]", "project/file.txt")
      .replaceAll(/\[(?:id|provider|flowId|entryId)\]/g, "example");
    const source = readFileSync(new URL(`../${file.replaceAll("\\", "/")}`, import.meta.url), "utf8");
    const methods = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map(match => match[1]);
    for (const method of methods) {
      assert.equal(isRemoteApiAllowed(route, method), route !== "/api/open-in-explorer", `${method} ${route}`);
    }
  }
  for (const [path, method] of [
    ["/api/new-upstream-endpoint", "GET"],
    ["/api/new-upstream-endpoint", "POST"],
    ["/api/sessions/example/unreviewed", "GET"],
    ["/api/agent/example/unreviewed", "POST"],
    ["/api/open-in-explorer", "GET"],
    ["/api/open-in-explorer", "POST"],
    ["/api/terminal/example/events", "POST"],
    ["/api/sessions/example", "PUT"],
  ]) assert.equal(isRemoteApiAllowed(path, method), false, `${method} ${path}`);
});
