# Brando fork of ClickClack

`Stener1/clickclack` is Brando's build of [openclaw/clickclack](https://github.com/openclaw/clickclack): the same chat, plus a desktop app that updates itself from this fork's releases and opens `https://chat.mykvare.com` by default. Tracked in Linear BRA-3395 (fork and updates: BRA-3396).

## Branches and tags

- `origin` = `openclaw/clickclack`, `fork` = `Stener1/clickclack`.
- `brando` = an upstream release tag plus our merged branches. Upstreamable work branches from `origin/main` and goes to `openclaw/clickclack` as a PR as well.
- Release tags are `v<upstream>-b.<n>` (for example `v0.9.4-b.1`). The app version is `<major>.<minor>.<patch*100+n>` (`0.9.401`): a plain semver keeps the updater on its `latest` channel, and the next upstream patch always sorts higher.

## Releasing (no CI)

GitHub Actions is off on this fork, and GitHub holds no credentials. One script on the devbox builds and publishes:

```
git tag -a v0.9.4-b.2 -m "v0.9.4-b.2" && git push fork brando v0.9.4-b.2
apps/desktop/scripts/brando-release.sh v0.9.4-b.2 --mac unsigned   # or signed / notarized
```

- Linux AppImage: built on the devbox. macOS (x64 + arm64): built on the Mac Mini over SSH, signed from its keychain (`CLICKCLACK_MAC_IDENTITY_QUALIFIER="Name (TEAMID)"`) and notarized with its `notarytool` keychain profile (`NOTARYTOOL_KEYCHAIN_PROFILE`, default `brando-notary`).
- The release stays a draft until every file is uploaded; `latest-mac.yml` and `latest-linux.yml` go up last, and the script refuses to publish a version the feed already has.
- Installed apps check `https://github.com/Stener1/clickclack/releases/latest/download/latest-*.yml` at start and every 6 hours. macOS only accepts updates signed by the same Developer ID as the installed app, so unsigned builds must be reinstalled by hand.

## What differs from upstream

- `apps/desktop/src/updater.ts`, `updater-state.ts` (+ test): the self-update (electron-updater, generic feed), with a "Check for Updates…" / "Restart to Update" item in the app and tray menus.
- `apps/desktop/src/contract.ts`: the default server is `https://chat.mykvare.com`.
- `apps/desktop/scripts/after-sign.mjs`, `verify-macos-app.sh`: the expected Developer ID can be set with `CLICKCLACK_MAC_IDENTITY_QUALIFIER`; without it they behave exactly as upstream.
- `apps/desktop/scripts/brando-release.sh`, `brando-version.mjs` (+ test): the local release.
