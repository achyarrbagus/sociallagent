#!/usr/bin/env bash
set -euo pipefail

# Run on the target as the dedicated deployment user. Never print the env file.
release_id="${1:?release SHA required}"
[[ "$release_id" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid release SHA' >&2; exit 1; }
base="${SOCIALAGENT_DEPLOY_DIR:-$HOME/sociallagent}"
release="$base/releases/$release_id"
archive="$base/incoming/$release_id.tar.gz"
envfile="$base/shared/production.env"
test -f "$archive" && test -f "$envfile" || { echo 'Release archive or shared/production.env missing' >&2; exit 1; }
test ! -e "$release" || { echo 'Release already exists' >&2; exit 1; }
command -v bun >/dev/null && command -v pm2 >/dev/null || { echo 'Bun and PM2 are required' >&2; exit 1; }
mkdir -p "$base/releases" "$base/shared/data"
mkdir "$release"
tar -xzf "$archive" -C "$release"
test -f "$release/server/dist/index.js" && test -f "$release/ui/dist/index.html" || { echo 'Build output missing' >&2; exit 1; }
previous="$(readlink "$base/current" || true)"
ln -sfn "$release" "$base/current"
cd "$base/current"
set -a
# Operator-owned configuration. Store credentials with permissions 600.
source "$envfile"
set +a
export NODE_ENV=production HOST=127.0.0.1 PORT="${PORT:-3100}" SERVE_UI=true
export PAPERCLIP_HOME="${PAPERCLIP_HOME:-$base/shared/data}"
if pm2 describe sociallagent >/dev/null 2>&1; then
  pm2 delete sociallagent >/dev/null
fi
pm2 start "$base/current/server/dist/index.js" --name sociallagent --interpreter "$(command -v bun)" --cwd "$base/current/server" --update-env
healthy=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" | grep -q '"status":"ok"'; then healthy=true; break; fi
  sleep 2
done
if [ "$healthy" != true ]; then
  echo 'Health check failed; restoring previous release if available' >&2
  pm2 delete sociallagent >/dev/null 2>&1 || true
  if [ -n "$previous" ] && [ -f "$previous/server/dist/index.js" ]; then
    ln -sfn "$previous" "$base/current"
    pm2 start "$base/current/server/dist/index.js" --name sociallagent --interpreter "$(command -v bun)" --cwd "$base/current/server" --update-env
  else
    rm -f "$base/current"
  fi
  exit 1
fi
pm2 save >/dev/null
rm -f "$archive"
echo "SocialAgent release $release_id healthy"
