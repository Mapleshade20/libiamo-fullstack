#!/usr/bin/env bash
set -euo pipefail

# Optional local-only config file. Do NOT commit this file.
if [ -f .env.deploy ]; then
  set -a
  . ./.env.deploy
  set +a
fi

: "${DEPLOY_TARGET:?DEPLOY_TARGET is required, e.g. libiamo-prod SSH alias}"
: "${DEPLOY_BASE:=/var/www/libiamo}"
: "${DEPLOY_SERVICE:=libiamo}"
: "${MIGRATE_ENV_FILE:=/etc/www/libiamo/migrate.env}"

APP="libiamo"
RELEASE="$(date +%Y%m%d%H%M%S)"
ARCHIVE="$APP-$RELEASE.tar.gz"

SSH_ARGS=()
SCP_ARGS=()

if [ -n "${DEPLOY_SSH_PORT:-}" ]; then
  SSH_ARGS+=("-p" "$DEPLOY_SSH_PORT")
  SCP_ARGS+=("-P" "$DEPLOY_SSH_PORT")
fi

cleanup() {
  rm -rf .deploy
}
trap cleanup EXIT

echo "Building release: $RELEASE"

rm -rf .deploy
mkdir -p ".deploy/$RELEASE"

pnpm install --frozen-lockfile
pnpm build

cp drizzle.prod.config.ts ".deploy/$RELEASE/"
cp -R build ".deploy/$RELEASE/build"
cp -R drizzle ".deploy/$RELEASE/drizzle"
cp package.json ".deploy/$RELEASE/"
cp pnpm-lock.yaml ".deploy/$RELEASE/"
cp pnpm-workspace.yaml ".deploy/$RELEASE/"

tar -C .deploy -czf ".deploy/$ARCHIVE" "$RELEASE"

echo "Uploading artifact..."
scp "${SCP_ARGS[@]}" ".deploy/$ARCHIVE" "$DEPLOY_TARGET:/tmp/$ARCHIVE"

echo "Activating remote release..."
ssh "${SSH_ARGS[@]}" "$DEPLOY_TARGET" bash -s -- \
  "$APP" \
  "$DEPLOY_BASE" \
  "$RELEASE" \
  "$ARCHIVE" \
  "$DEPLOY_SERVICE" \
  "$MIGRATE_ENV_FILE" <<'REMOTE'
set -euo pipefail

APP="$1"
BASE="$2"
RELEASE="$3"
ARCHIVE="$4"
SERVICE="$5"
ENV_FILE="$6"

RELEASE_DIR="$BASE/releases/$RELEASE"

mkdir -p "$BASE/releases"
tar -xzf "/tmp/$ARCHIVE" -C "$BASE/releases"
cd "$RELEASE_DIR"

pnpm install --prod --frozen-lockfile

set -a
. "$ENV_FILE"
set +a

pnpm db:migrate:prod

ln -sfn "$RELEASE_DIR" "$BASE/current"

sudo -n systemctl restart "$SERVICE"

ls -1dt "$BASE"/releases/* | tail -n +5 | xargs -r rm -rf
rm -f "/tmp/$ARCHIVE"

echo "Activated release: $RELEASE"
REMOTE

echo "Deployment complete: $RELEASE"
