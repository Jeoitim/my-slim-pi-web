import assert from "node:assert/strict";
import test from "node:test";
import { permissionModeFromStatuses, isPermissionMode, PERMISSION_MODES } from "./permission-mode.ts";
test("permission modes use only exact authoritative status values", () => {
  for (const mode of PERMISSION_MODES) {
    assert.equal(isPermissionMode(mode), true);
    assert.equal(permissionModeFromStatuses([{key:"timrt-permission-mode",text:mode}]), mode);
  }
  for (const text of ["AUTO", "auto ", "◈ AUTO", "\x1b[32mauto", "审批中", "invalid"]) {
    assert.equal(permissionModeFromStatuses([{key:"timrt-permission-mode",text}]), null);
  }
  assert.equal(permissionModeFromStatuses([{key:"pi-permission-suite",text:"AUTO"}]), null);
  assert.equal(permissionModeFromStatuses([]), null);
});
