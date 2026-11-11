#!/usr/bin/env bash
# Brando fork release: build, sign and publish one tag with no CI.
#
#   brando-release.sh v0.9.4-b.1 [--mac unsigned|signed|notarized] [--skip-mac] [--skip-linux] [--dry-run]
#
# Runs on Linux (the devbox). Builds the Linux AppImage here and the macOS app on a Mac over SSH
# (BRANDO_MAC_HOST, default "mini"), then publishes a GitHub release on the fork. The release stays
# a draft until every file is up, and the update feeds (latest-*.yml) are uploaded last, so an
# installed app never sees a feed that points at a missing file. No credentials leave the Mac:
# signing uses its keychain, notarization its notarytool keychain profile.
#
# Env:
#   BRANDO_REPO                        GitHub repo for releases (default Stener1/clickclack)
#   BRANDO_MAC_HOST                    ssh host of the Mac (default mini)
#   CLICKCLACK_MAC_IDENTITY_QUALIFIER  "Name (TEAMID)" of the Developer ID (signed, notarized)
#   NOTARYTOOL_KEYCHAIN_PROFILE        notarytool profile on the Mac (notarized; default brando-notary)
set -euo pipefail

repo_slug=${BRANDO_REPO:-Stener1/clickclack}
mac_host=${BRANDO_MAC_HOST:-mini}
mac_mode=unsigned
build_mac=1
build_linux=1
dry_run=0
tag=""

while (($#)); do
  case "$1" in
    --mac) mac_mode=${2:-}; shift 2 ;;
    --skip-mac) build_mac=0; shift ;;
    --skip-linux) build_linux=0; shift ;;
    --dry-run) dry_run=1; shift ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) tag=$1; shift ;;
  esac
done

die() { echo "brando-release: $*" >&2; exit 1; }
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-b\.[0-9]+$ ]] || die "usage: $0 v<major>.<minor>.<patch>-b.<n> [options]"
[[ "$mac_mode" =~ ^(unsigned|signed|notarized)$ ]] || die "--mac must be unsigned, signed or notarized"
[[ "$(uname -s)" == Linux ]] || die "run this on Linux (the devbox); the Mac build runs over SSH"
if [[ "$mac_mode" != unsigned && $build_mac == 1 ]]; then
  [[ -n "${CLICKCLACK_MAC_IDENTITY_QUALIFIER:-}" ]] || die "--mac $mac_mode needs CLICKCLACK_MAC_IDENTITY_QUALIFIER"
fi
notary_profile=${NOTARYTOOL_KEYCHAIN_PROFILE:-brando-notary}

desktop=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
root=$(cd "$desktop/../.." && pwd)
cd "$root"

# The tree must be exactly the tag: what ships is what is in git.
git rev-parse -q --verify "refs/tags/$tag" >/dev/null || die "tag $tag does not exist locally"
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "$tag^{commit}")" ]] || die "HEAD is not $tag"
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || die "working tree is not clean"

version=$(node "$desktop/scripts/brando-version.mjs" "$tag")
feed="https://github.com/$repo_slug/releases/latest/download"
echo "brando-release: $tag → app version $version (feed $feed)"

# Never publish a version at or below what the feed already announces.
for platform in mac linux; do
  current=$(curl -fsSL "$feed/latest-$platform.yml" 2>/dev/null | sed -n 's/^version: *//p' || true)
  if [[ -n "$current" ]]; then
    node -e '
      const [a, b] = process.argv.slice(1).map((v) => v.split(".").map(Number));
      for (let i = 0; i < 3; i++) if (a[i] !== b[i]) process.exit(a[i] > b[i] ? 0 : 1);
      process.exit(1);
    ' "$version" "$current" || die "feed latest-$platform.yml already has $current (>= $version)"
    echo "brando-release: $platform feed is at $current"
  fi
done

out="$desktop/release-brando/$tag"
rm -rf "$out"
mkdir -p "$out"
publish_flags=(
  --publish never
  "--config.publish.provider=generic"
  "--config.publish.url=$feed"
  "--config.extraMetadata.version=$version"
)

if ((build_linux)); then
  echo "brando-release: building Linux AppImage"
  pnpm install --frozen-lockfile
  (cd "$desktop" && pnpm build && pnpm exec electron-builder --linux AppImage --x64 \
    "${publish_flags[@]}" "--config.directories.output=$out/linux")
fi

if ((build_mac)); then
  echo "brando-release: building macOS ($mac_mode) on $mac_host"
  # Flags travel as arguments, not as code, so nothing from this side is evaluated remotely.
  ssh -o BatchMode=yes "$mac_host" bash -s -- "$tag" "$version" "$mac_mode" "$feed" \
    "${CLICKCLACK_MAC_IDENTITY_QUALIFIER:-}" "$notary_profile" "https://github.com/$repo_slug.git" <<'REMOTE'
set -euo pipefail
tag=$1 version=$2 mode=$3 feed=$4 qualifier=$5 profile=$6 remote=$7
node_dir="$HOME/.local/opt/node24"
if [[ ! -x "$node_dir/bin/node" ]]; then
  v=$(curl -fsSL https://nodejs.org/dist/index.json | /usr/bin/python3 -I -c 'import json,sys;print(next(r["version"] for r in json.load(sys.stdin) if r["version"].startswith("v24.") and r["lts"]))')
  f="node-$v-darwin-arm64.tar.gz"
  mkdir -p "$HOME/.local/opt" && cd "$HOME/.local/opt"
  curl -fsSLO "https://nodejs.org/dist/$v/$f"
  curl -fsSL "https://nodejs.org/dist/$v/SHASUMS256.txt" | grep " $f\$" | shasum -a 256 -c -
  tar -xzf "$f" && rm "$f" && ln -sfn "node-$v-darwin-arm64" node24
fi
export PATH="$node_dir/bin:$PATH"
corepack enable --install-directory "$node_dir/bin" >/dev/null 2>&1 || true
dir="$HOME/work/clickclack-release"
[[ -d "$dir/.git" ]] || git clone -q "$remote" "$dir"
cd "$dir"
git fetch -q --force --tags "$remote"
git checkout -q --detach "$tag"
git reset -q --hard "$tag"
git clean -q -fdx -e node_modules -e '**/node_modules'
pnpm install --frozen-lockfile
cd apps/desktop
pnpm build
rm -rf release-brando
args=(--mac dmg zip --x64 --arm64 --publish never
  "--config.publish.provider=generic" "--config.publish.url=$feed"
  "--config.extraMetadata.version=$version" "--config.directories.output=release-brando")
case "$mode" in
  unsigned)
    # Ad-hoc signature: Apple Silicon refuses to run a fully unsigned app.
    CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder "${args[@]}" "--config.mac.identity=-"
    ;;
  signed)
    CSC_NAME="$qualifier" CLICKCLACK_MAC_IDENTITY_QUALIFIER="$qualifier" \
      pnpm exec electron-builder "${args[@]}" "--config.mac.identity=$qualifier"
    for app in release-brando/mac*/*.app; do CLICKCLACK_MAC_IDENTITY_QUALIFIER="$qualifier" bash scripts/verify-macos-app.sh "$app"; done
    ;;
  notarized)
    CSC_NAME="$qualifier" CLICKCLACK_MAC_IDENTITY_QUALIFIER="$qualifier" \
      CLICKCLACK_OFFICIAL_MACOS_RELEASE=1 NOTARYTOOL_KEYCHAIN_PROFILE="$profile" \
      pnpm exec electron-builder "${args[@]}" "--config.mac.identity=$qualifier"
    for app in release-brando/mac*/*.app; do CLICKCLACK_MAC_IDENTITY_QUALIFIER="$qualifier" bash scripts/verify-macos-app.sh --require-notarized "$app"; done
    ;;
esac
REMOTE
  mkdir -p "$out/mac"
  ssh -o BatchMode=yes "$mac_host" \
    'cd "$HOME/work/clickclack-release/apps/desktop/release-brando" && tar -cf - *.dmg *.zip *.blockmap latest-mac.yml' |
    tar -xf - -C "$out/mac"
fi

mapfile -t payload < <(find "$out" -maxdepth 2 -type f \( -name '*.AppImage' -o -name '*.dmg' -o -name '*.zip' -o -name '*.blockmap' \) | sort)
mapfile -t feeds < <(find "$out" -maxdepth 2 -type f -name 'latest-*.yml' | sort)
((${#payload[@]})) || die "nothing was built"
for f in "${feeds[@]}"; do
  grep -qx "version: $version" "$f" || die "$f does not announce $version"
  # Every file a feed points to must be in this release.
  while read -r name; do
    printf '%s\n' "${payload[@]}" | grep -q "/$name\$" || die "$f points at $name, which was not built"
  done < <(sed -n 's/^ *- url: *//p; s/^path: *//p' "$f" | sort -u)
done
printf 'brando-release: built\n'; printf '  %s\n' "${payload[@]#"$out/"}" "${feeds[@]#"$out/"}"

if ((dry_run)); then
  echo "brando-release: dry run, nothing published ($out)"
  exit 0
fi

git ls-remote --exit-code --tags "https://github.com/$repo_slug.git" "refs/tags/$tag" >/dev/null ||
  die "push $tag to $repo_slug first (git push fork $tag)"
gh release create "$tag" -R "$repo_slug" --draft --verify-tag \
  --title "ClickClack $tag (Brando)" \
  --notes "Brando build of ClickClack ${tag%-b.*}, app version $version. macOS: $mac_mode."
gh release upload "$tag" -R "$repo_slug" "${payload[@]}"
gh release upload "$tag" -R "$repo_slug" "${feeds[@]}"
gh release edit "$tag" -R "$repo_slug" --draft=false --latest

for f in "${feeds[@]}"; do
  name=$(basename "$f")
  live=$(curl -fsSL "$feed/$name" | sed -n 's/^version: *//p')
  [[ "$live" == "$version" ]] || die "$feed/$name announces '$live', expected $version"
  echo "brando-release: $name live at $version"
done
