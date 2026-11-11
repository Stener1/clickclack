import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, forkAppVersion } from "./brando-version.mjs";

test("fork tags map to plain, increasing app versions", () => {
  assert.equal(forkAppVersion("v0.9.4-b.1"), "0.9.401");
  assert.equal(forkAppVersion("v0.9.4-b.12"), "0.9.412");
  assert.equal(forkAppVersion("v0.10.0-b.1"), "0.10.1");
  assert.ok(compareVersions(forkAppVersion("v0.9.4-b.2"), forkAppVersion("v0.9.4-b.1")) > 0);
  assert.ok(compareVersions(forkAppVersion("v0.9.5-b.1"), forkAppVersion("v0.9.4-b.99")) > 0);
  assert.ok(compareVersions(forkAppVersion("v0.10.0-b.1"), forkAppVersion("v0.9.99-b.99")) > 0);
});

test("anything but a fork tag is refused", () => {
  for (const tag of ["v0.9.4", "0.9.4-b.1", "v0.9.4-b.0", "v0.9.4-b.100", "v0.9.4-rc.1", ""]) {
    assert.throws(() => forkAppVersion(tag), /tag|build number/);
  }
});
