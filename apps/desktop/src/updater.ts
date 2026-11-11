// Brando fork: self-update from the fork's release feed (electron-updater, generic provider).
// The feed URL is baked into app-update.yml by electron-builder.brando.yml at build time.
import { app, dialog, Notification, type MenuItemConstructorOptions } from "electron";
import {
  nextUpdateState,
  UPDATE_CHECK_INTERVAL_MS,
  updateDialog,
  updateMenuEntry,
  updatesSupported,
  type UpdateState,
} from "./updater-state";

type Updater = typeof import("electron-updater").autoUpdater;

type UpdaterHooks = Readonly<{
  // Called whenever the menu label should change.
  onChange: () => void;
  // Called right before quitAndInstall, so close-to-tray does not veto the quit.
  beforeInstall: () => void;
}>;

let updater: Updater | null = null;
let hooks: UpdaterHooks | null = null;
let state: UpdateState = { kind: "idle" };
let manualCheck = false;
let notifiedVersion = "";

export function startUpdates(nextHooks: UpdaterHooks): void {
  if (!app.isPackaged || !updatesSupported(process.platform, process.env)) return;
  hooks = nextHooks;
  void import("electron-updater")
    .then(({ autoUpdater: instance }) => {
      configure(instance);
      updater = instance;
      hooks?.onChange();
      void check(false);
      setInterval(() => void check(false), UPDATE_CHECK_INTERVAL_MS).unref();
    })
    .catch((error: unknown) => console.warn("clickclack: updater unavailable:", error));
}

export function updateMenuItems(): MenuItemConstructorOptions[] {
  if (!updater) return [];
  const entry = updateMenuEntry(state);
  return [
    {
      label: entry.label,
      enabled: entry.enabled,
      click: () => {
        if (entry.action === "install") install();
        else if (entry.action === "check") void check(true);
      },
    },
  ];
}

function configure(instance: Updater) {
  instance.autoDownload = true;
  instance.autoInstallOnAppQuit = true;
  instance.allowPrerelease = false;
  instance.allowDowngrade = false;
  instance.on("checking-for-update", () => set({ kind: "checking", manual: manualCheck }));
  instance.on("update-not-available", () => set({ kind: "current", manual: manualCheck }));
  instance.on("update-available", (info) =>
    set({ kind: "downloading", version: info.version, percent: 0 }),
  );
  instance.on("download-progress", (progress) => {
    if (state.kind === "downloading") set({ ...state, percent: progress.percent });
  });
  instance.on("update-downloaded", (info) => set({ kind: "ready", version: info.version }));
  instance.on("error", (error) =>
    set({ kind: "error", message: error?.message ?? String(error), manual: manualCheck }),
  );
}

async function check(manual: boolean) {
  if (!updater || state.kind === "checking" || state.kind === "downloading") return;
  if (state.kind === "ready") {
    if (manual) install();
    return;
  }
  manualCheck = manual;
  try {
    await updater.checkForUpdates();
  } catch (error) {
    set({ kind: "error", message: error instanceof Error ? error.message : String(error), manual });
  }
}

function set(next: UpdateState) {
  state = nextUpdateState(state, next);
  hooks?.onChange();
  const message = updateDialog(state, app.getVersion());
  if (message) {
    manualCheck = false;
    void dialog.showMessageBox({ type: "info", message: message.title, detail: message.detail });
  }
  if (state.kind === "ready" && notifiedVersion !== state.version && Notification.isSupported()) {
    notifiedVersion = state.version;
    const notice = new Notification({
      title: "ClickClack update ready",
      body: `Restart to use version ${state.version}.`,
    });
    notice.on("click", install);
    notice.show();
  }
}

function install() {
  if (!updater || state.kind !== "ready") return;
  hooks?.beforeInstall();
  updater.quitAndInstall(false, true);
}
