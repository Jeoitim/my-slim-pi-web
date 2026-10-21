import { _electron as electron } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const baseline = process.argv.includes("--baseline");
const area = resolve(`.local/desktop-clipboard-${randomUUID()}`);
const workspace = join(area, "workspace");
const agent = join(area, "agent");
await mkdir(join(agent, "sessions/test"), { recursive: true });
await mkdir(workspace, { recursive: true });
const id = randomUUID();
const code = 'const clipboardProbe = "代码复制";\nconsole.log(clipboardProbe);';
const fileText = "File selection 中文\nSecond line\n";
await writeFile(join(workspace, "clipboard-fixture.txt"), fileText);
await writeFile(join(agent, "sessions/test", `2026-10-21T00-00-00-000Z_${id}.jsonl`), [
  { type: "session", version: 3, id, timestamp: "2026-10-21T00:00:00.000Z", cwd: workspace },
  { type: "message", id: "00000001", parentId: null, message: { role: "user", content: "Clipboard transcript fixture", timestamp: Date.now() } },
  { type: "message", id: "00000002", parentId: "00000001", message: { role: "assistant", content: [{ type: "text", text: `Clipboard reply fixture\n\n\`\`\`js\n${code}\n\`\`\`` }], api: "openai-responses", provider: "fixture", model: "fixture", stopReason: "stop", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, timestamp: Date.now() } },
].map(value => JSON.stringify(value)).join("\n") + "\n");
const environment = { ...process.env, PI_CODING_AGENT_DIR: agent, PI_DESKTOP_TEST_USER_DATA: join(area, "userData") };
for (const name of ["PI_WEB_PASSWORD", "PI_WEB_REMOTE", "ELECTRON_RUN_AS_NODE"]) delete environment[name];
const app = await electron.launch({ executablePath: process.env.PI_DESKTOP_E2E_EXECUTABLE || resolve("dist-desktop/win-unpacked/MySlimPiWeb.exe"), env: environment, args: [], timeout: 120_000 });
// Keep all ClipboardItems in the main process; never serialize, log or save them.
let backedUp = false;
const read = () => app.evaluate(({ clipboard }) => clipboard.readText());
const write = text => app.evaluate(({ clipboard }, text) => clipboard.writeText(text), text);
try {
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    globalThis.__clipboardCheckBackup = await Promise.all((await clipboard.read()).map(async item =>
      new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
  });
  backedUp = true;
  const page = await app.firstWindow();
  page.setDefaultTimeout(45_000);
  page.on("pageerror", () => {});
  await page.waitForURL(url => url.protocol === "http:", { timeout: 120_000 });
  const origin = new URL(page.url()).origin;
  await page.evaluate(() => localStorage.setItem("pi-locale", "zh-CN"));
  await page.goto(`${origin}/?session=${id}`);
  await page.getByText("Clipboard reply fixture", { exact: true }).waitFor();
  const block = page.locator(".markdown-code-block").first();
  await write("desktop-clipboard-before-copy");
  await block.getByRole("button", { name: "复制", exact: true }).click();
  if (baseline) {
    await page.waitForTimeout(250);
    console.log(JSON.stringify({ baseline: true, codeButtonActuallyCopied: await read() === code }));
  } else {
    await block.getByRole("button", { name: "已复制", exact: true }).waitFor();
    assert.equal(await read(), code, "Code button must write the exact code to the OS clipboard");
    const menu = page.getByRole("menu", { name: "文本操作", exact: true });
    const item = name => menu.getByRole("menuitem", { name: new RegExp(`^${name}`) });
    const rightClick = async locator => { await locator.click({ button: "right" }); await menu.waitFor(); };
    const select = async locator => locator.evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    const checkBounds = async () => {
      const bounds = await menu.boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      assert.ok(bounds.x >= 0 && bounds.y >= 36 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
      assert.equal(await menu.evaluate(element => element.parentElement === document.body), true, "Menu must escape clipping containers");
      assert.equal(await menu.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      }), true, "Canvas and panels must not cover the menu");
    };
    // Transcript copy/select-all, with selection preserved when the menu takes focus.
    const transcript = page.locator('[data-desktop-text-scope="transcript"]');
    await select(transcript);
    await rightClick(page.getByText("Clipboard reply fixture", { exact: true }));
    assert.equal(await item("粘贴").count(), 0);
    await item("复制").click();
    assert.ok((await read()).includes("Clipboard reply fixture"));
    await rightClick(page.getByText("Clipboard reply fixture", { exact: true }));
    await item("全选").click();
    assert.ok(await page.evaluate(() => getSelection().toString().includes("Clipboard transcript fixture")));
    // The input selection survives menu focus; native paste must replace that selection.
    const input = page.locator("textarea.chat-input-textarea");
    await input.fill("replace this draft");
    await input.selectText();
    await write("粘贴到输入框");
    await rightClick(input);
    await item("粘贴").click();
    await page.waitForFunction(() => document.querySelector("textarea.chat-input-textarea").value === "粘贴到输入框", undefined, { polling: 50 });
    assert.equal(await input.inputValue(), "粘贴到输入框");
    await rightClick(input);
    await item("全选").click();
    await rightClick(input);
    await item("复制").click();
    assert.equal(await read(), "粘贴到输入框");
    // A code/document viewer has copy/select-all but no paste.
    const files = page.locator("#session-sidebar-panel-files");
    const fold = files.locator(".sidebar-files-section-toggle");
    if (await fold.getAttribute("aria-expanded") !== "true") await fold.click();
    await files.getByText("clipboard-fixture.txt", { exact: true }).click();
    const viewer = page.locator(".file-viewer-content");
    await viewer.getByText("File selection 中文", { exact: false }).first().waitFor();
    await rightClick(viewer);
    assert.equal(await item("粘贴").count(), 0);
    await item("全选").click();
    await rightClick(viewer);
    await item("复制").click();
    assert.ok((await read()).includes("File selection 中文"));
    // xterm uses its buffer selection and the real native paste event.
    const [created] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/terminal" && response.request().method() === "POST"),
      page.getByRole("button", { name: "打开工作区终端", exact: true }).click(),
    ]);
    const terminal = await created.json();
    await page.locator(".terminal-panel .is-ready").waitFor();
    const host = page.locator(".terminal-xterm-host:visible");
    await rightClick(host);
    await item("全选").click();
    await rightClick(host);
    await item("复制").click();
    assert.ok((await read()).includes("Microsoft Windows"), "Terminal copy must use the xterm buffer selection");
    const command = 'cmd /v:on /c "set PROBE=terminal-context-&echo !PROBE!paste-ok"';
    await write(command);
    await rightClick(host);
    await item("粘贴").click();
    await page.evaluate(async id => { await fetch(`/api/terminal/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "input", data: "\r" }) }); }, terminal.id);
    await page.waitForFunction(() => document.querySelector(".terminal-panel .xterm-rows").textContent.includes("terminal-context-paste-ok"), undefined, { polling: 100 });
    // Portal placement at the window corner, even when the viewer itself clips content.
    await page.locator(".file-panel-expand-button").click();
    await page.waitForFunction(() => {
      const panel = document.querySelector(".right-panel-full-width");
      return panel && Math.abs(panel.getBoundingClientRect().width - innerWidth) < 1;
    });
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.equal(await page.evaluate(({ width, height }) => {
      const target = document.elementFromPoint(width - 12, height - 12);
      return target?.classList.contains("terminal-xterm");
    }, viewport), true, "The viewport corner must exercise the terminal's padding outside the xterm host");
    await page.mouse.click(viewport.width - 12, viewport.height - 12, { button: "right" });
    await menu.waitFor(); await checkBounds();
    const terminalColor = await page.locator(".terminal-panel").evaluate(element => getComputedStyle(element).getPropertyValue("--terminal-header-bg").trim());
    assert.equal(await menu.evaluate(element => getComputedStyle(element).getPropertyValue("--bg").trim()), terminalColor);
    await page.screenshot({ path: join(area, "context-menu-terminal-dark.png") });
    await writeFile(join(area, "context-menu.html"), await menu.evaluate(element => `<html lang="zh-CN"><head><meta charset="utf-8"><style>body {font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif}</style></head><body>${element.outerHTML}</body></html>`));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".desktop-context-menu .sidebar-menu-label" });
    const fonts = nodeId ? await cdp.send("CSS.getPlatformFontsForNode", { nodeId }) : { fonts: [] };
    console.log(JSON.stringify({ chineseMenuFonts: fonts.fonts.map(font => font.familyName) }));
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "终端切换为浅色主题", exact: true }).click();
    await rightClick(host); await checkBounds();
    assert.notEqual(await menu.evaluate(element => getComputedStyle(element).getPropertyValue("--bg").trim()), terminalColor);
    await page.screenshot({ path: join(area, "context-menu-terminal-light.png") });
    await page.keyboard.press("Escape");
    console.log(JSON.stringify({ passed: true, codeClipboardExact: true, transcript: true, input: true, file: true, terminal: true, portalBounds: true, screenshots: area }));
  }
} catch (error) {
  const page = (await app.windows())[0];
  if (page) await page.screenshot({ path: join(area, "failure.png") }).catch(() => {});
  throw error;
} finally {
  try {
    if (backedUp) await app.evaluate(async ({ clipboard }) => {
      const previous = globalThis.__clipboardCheckBackup;
      if (previous.length) await clipboard.write(previous); else clipboard.clear();
      delete globalThis.__clipboardCheckBackup;
    });
  } finally { await app.close(); }
}
