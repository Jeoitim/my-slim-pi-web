import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const area = await mkdtemp(resolve(".local/desktop-lifecycle-"));
const agent = join(area, "agent");
const work = join(area, "work");
const userData = join(area, "userData");
await Promise.all([
  mkdir(join(agent, "extensions"), { recursive: true }),
  mkdir(work),
  mkdir(userData),
]);
await writeFile(join(agent, "settings.json"), JSON.stringify({ extensions: ["./extensions/hold.mjs"] }, null, 2));
await writeFile(join(agent, "extensions/hold.mjs"), `
export default function (pi) {
  pi.registerCommand("hold", {
    description: "Test-only blocking dialog",
    handler: async (_args, ctx) => {
      await ctx.ui.select("Lifecycle check", ["Continue"]);
    },
  });
}
`);

const environment = {
  ...process.env,
  PI_DESKTOP_TEST_USER_DATA: userData,
  PI_CODING_AGENT_DIR: agent,
  PI_DESKTOP_NODE: process.execPath,
};
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.PI_WEB_PASSWORD;

const app = await electron.launch({
  executablePath: require("electron"),
  args: [resolve("electron/main/index.cjs"), "--desktop-dev"],
  env: environment,
  timeout: 120_000,
});
let origin = "";
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(180_000);
  await page.waitForURL(url => url.protocol === "http:");
  origin = new URL(page.url()).origin;
  await page.evaluate(({ cwd }) => {
    void fetch("/api/agent/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd, type: "prompt", message: "/hold" }),
    });
  }, { cwd: work });

  let runningId = "";
  for (let attempt = 0; attempt < 120 && !runningId; attempt++) {
    const snapshot = await page.evaluate(async () => (await fetch("/api/agent/running")).json());
    runningId = snapshot.runningSessionIds?.[0] ?? "";
    if (!runningId) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(runningId, "the held extension command should make the session active");

  await app.evaluate(({ dialog }) => {
    globalThis.__desktopDialogPrompts = [];
    globalThis.__desktopDialogChoice = 0;
    dialog.showMessageBox = async (...args) => {
      globalThis.__desktopDialogPrompts.push(args.at(-1));
      return { response: globalThis.__desktopDialogChoice, checkboxChecked: false };
    };
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await app.evaluate(({ BrowserWindow }) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window.isVisible()) resolve();
    else window.once("hide", resolve);
  }));
  const closed = await app.evaluate(({ BrowserWindow }) => ({
    visible: BrowserWindow.getAllWindows()[0].isVisible(),
    prompts: globalThis.__desktopDialogPrompts,
  }));
  assert.equal(closed.visible, false, "choosing background must hide the window");
  assert.ok(closed.prompts[0]?.buttons?.includes("继续在后台"), "close must offer background execution");
  assert.match(closed.prompts[0]?.detail ?? "", /后台代理|回合/);

  const stillRunning = await page.evaluate(async () => (await fetch("/api/agent/running")).json());
  assert.ok(stillRunning.runningSessionIds.includes(runningId), "the held task must keep running behind the tray");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  console.log("Close offered background execution and kept the active backend task alive.");
} finally {
  await app.close();
  if (origin) await assert.rejects(fetch(origin));
}
