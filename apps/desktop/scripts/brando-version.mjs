// Brando fork: map a release tag to the app version electron-updater compares.
// v0.9.4-b.3 → 0.9.403. A plain semver (no prerelease part) keeps electron-updater on the
// "latest" channel, and upstream's next patch (0.9.5 → 0.9.501) sorts above every 0.9.4 build.
export function forkAppVersion(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)-b\.(\d+)$/.exec(tag);
  if (!match) throw new Error(`tag ${tag} is not v<major>.<minor>.<patch>-b.<n>`);
  const [, major, minor, patch, build] = match.map(Number);
  if (build < 1 || build > 99) throw new Error(`build number ${build} must be 1-99`);
  return `${major}.${minor}.${patch * 100 + build}`;
}

// Compare two plain x.y.z versions numerically.
export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${forkAppVersion(process.argv[2] ?? "")}\n`);
}
