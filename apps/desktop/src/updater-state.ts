// Pure state for the self-update channel. Electron-free so it can be unit tested.

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking"; manual: boolean }
  | { kind: "current"; manual: boolean }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string; manual: boolean };

export type UpdateMenuAction = "check" | "install" | null;

export type UpdateMenuEntry = Readonly<{
  label: string;
  enabled: boolean;
  action: UpdateMenuAction;
}>;

// Squirrel.Mac updates any packaged app; on Linux only an AppImage can replace itself.
export function updatesSupported(
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
) {
  if (platform === "darwin") return true;
  if (platform === "linux") return Boolean(env.APPIMAGE);
  return false;
}

export function updateMenuEntry(state: UpdateState): UpdateMenuEntry {
  switch (state.kind) {
    case "checking":
      return { label: "Checking for Updates…", enabled: false, action: null };
    case "downloading":
      return {
        label: `Downloading ${state.version}… ${clampPercent(state.percent)}%`,
        enabled: false,
        action: null,
      };
    case "ready":
      return { label: `Restart to Update (${state.version})`, enabled: true, action: "install" };
    default:
      return { label: "Check for Updates…", enabled: true, action: "check" };
  }
}

// A background check stays quiet; only a click on "Check for Updates…" deserves a dialog.
export function updateDialog(
  state: UpdateState,
  currentVersion: string,
): Readonly<{ title: string; detail: string }> | null {
  if (state.kind === "current" && state.manual) {
    return {
      title: "ClickClack is up to date",
      detail: `Version ${currentVersion} is the newest.`,
    };
  }
  if (state.kind === "error" && state.manual) {
    return { title: "Could not check for updates", detail: state.message };
  }
  return null;
}

// Never let a stale event (a late "not available" after a download finished) hide a ready update.
export function nextUpdateState(previous: UpdateState, next: UpdateState): UpdateState {
  if (previous.kind === "ready" && next.kind !== "ready") return previous;
  return next;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
