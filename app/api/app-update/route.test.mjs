import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

test("the fork reports its own version without contacting the upstream registry", async (t) => {
  const previous = process.env.NEXT_PUBLIC_APP_VERSION;
  process.env.NEXT_PUBLIC_APP_VERSION = "0.12.2-jeoitim.1";
  t.after(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_VERSION;
    else process.env.NEXT_PUBLIC_APP_VERSION = previous;
  });
  const fetchMock = t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected upstream request"); });
  const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, moduleCache: false });
  const { GET } = await jiti.import("./route.ts");
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    currentVersion: "0.12.2-jeoitim.1",
    latestVersion: "0.12.2-jeoitim.1",
    updateAvailable: false,
    releaseUrl: "",
  });
  assert.equal(fetchMock.mock.callCount(), 0);
});
