#!/usr/bin/env bash
set -euo pipefail
umask 077

release_id="${1:?Release ID required}"
[[ "$release_id" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]]
base="$HOME/sociallagent"
release="$base/releases/$release_id"
archive="$base/incoming/$release_id.tar.gz"
env_file="$base/shared/production.env"
app=sociallagent-next

if [[ ! -r "$env_file" ]]; then
  echo "Missing shared/production.env" >&2
  exit 1
fi
command -v pm2 >/dev/null
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)'
mkdir -p "$base/releases" "$base/shared/storage"

mkdir "$release"
tar -xzf "$archive" -C "$release"
cd "$release"
test -s .next/BUILD_ID
test -f node_modules/next/dist/bin/next
test -f node_modules/prisma/build/index.js
test -f scripts/start-production.mjs

previous="$(readlink "$base/current-next" || true)"
case "$previous" in
  "") ;;
  "$base/releases/"*) test -f "$previous/scripts/start-production.mjs" ;;
  *) echo "Unexpected previous release path" >&2; exit 1 ;;
esac
if [[ -z "$previous" ]] && curl -sS --max-time 2 http://127.0.0.1:3101/ >/dev/null 2>&1; then
  echo "Port 3101 is already in use" >&2
  exit 1
fi

node --env-file="$env_file" node_modules/prisma/build/index.js migrate deploy

start_app() {
  pm2 start "$1/scripts/start-production.mjs" --name "$app" \
    --cwd "$1" --interpreter "$(command -v node)" -- "$env_file"
}

if pm2 describe "$app" >/dev/null 2>&1; then
  pm2 delete "$app"
fi

if start_app "$release" && curl --fail --silent --show-error --retry 15 \
  --retry-connrefused --retry-delay 1 --max-time 5 http://127.0.0.1:3101/ >/dev/null; then
  ln -sfn "$release" "$base/current-next"
  pm2 save
  unlink "$archive"
  echo "Release $release_id is serving on 127.0.0.1:3101"
else
  pm2 delete "$app" >/dev/null 2>&1 || true
  if [[ -n "$previous" ]]; then
    start_app "$previous"
    pm2 save
  fi
  echo "Startup check failed. Prisma migrations remain applied." >&2
  exit 1
fi
