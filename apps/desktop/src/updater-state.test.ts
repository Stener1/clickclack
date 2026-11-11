import assert from "node:assert/strict";
import test from "node:test";
import { nextUpdateState, updateDialog, updateMenuEntry, updatesSupported } from "./updater-state";

test("self-update runs on macOS and AppImage only", () => {
  assert.equal(updatesSupported("darwin", {}), true);
  assert.equal(updatesSupported("linux", { APPIMAGE: "/home/me/ClickClack.AppImage" }), true);
  assert.equal(updatesSupported("linux", {}), false);
  assert.equal(updatesSupported("win32", {}), false);
});

test("the menu offers a check, shows progress, then offers the restart", () => {
  assert.deepEqual(updateMenuEntry({ kind: "idle" }), {
    label: "Check for Updates…",
    enabled: true,
    action: "check",
  });
  assert.deepEqual(updateMenuEntry({ kind: "checking", manual: true }), {
    label: "Checking for Updates…",
    enabled: false,
    action: null,
  });
  assert.equal(
    updateMenuEntry({ kind: "downloading", version: "0.9.402", percent: 41.6 }).label,
    "Downloading 0.9.402… 42%",
  );
  assert.equal(
    updateMenuEntry({ kind: "downloading", version: "0.9.402", percent: Number.NaN }).label,
    "Downloading 0.9.402… 0%",
  );
  assert.deepEqual(updateMenuEntry({ kind: "ready", version: "0.9.402" }), {
    label: "Restart to Update (0.9.402)",
    enabled: true,
    action: "install",
  });
  assert.equal(
    updateMenuEntry({ kind: "error", message: "offline", manual: false }).action,
    "check",
  );
});

test("only a manual check answers with a dialog", () => {
  assert.equal(updateDialog({ kind: "current", manual: false }, "0.9.401"), null);
  assert.equal(updateDialog({ kind: "error", message: "offline", manual: false }, "0.9.401"), null);
  assert.deepEqual(updateDialog({ kind: "current", manual: true }, "0.9.401"), {
    title: "ClickClack is up to date",
    detail: "Version 0.9.401 is the newest.",
  });
  assert.deepEqual(updateDialog({ kind: "error", message: "offline", manual: true }, "0.9.401"), {
    title: "Could not check for updates",
    detail: "offline",
  });
});

test("a downloaded update is never hidden by a later event", () => {
  const ready = { kind: "ready", version: "0.9.402" } as const;
  assert.equal(nextUpdateState(ready, { kind: "current", manual: false }), ready);
  assert.equal(nextUpdateState(ready, { kind: "error", message: "x", manual: false }), ready);
  const newer = { kind: "ready", version: "0.9.403" } as const;
  assert.equal(nextUpdateState(ready, newer), newer);
});
