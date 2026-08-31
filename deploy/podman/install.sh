#!/usr/bin/env bash
#
# Install Libiamo as rootless Podman quadlet units.
#
# Copy this directory to the server and run it there:
#   scp -r deploy/podman/ user@server:~/libiamo-deploy
#   ssh user@server 'bash ~/libiamo-deploy/install.sh'
#
# Idempotent: existing env files are never overwritten, so re-running it after an
# update to the unit files is safe.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="${HOME}/.config/containers/systemd"
CONF_DIR="${HOME}/.config/libiamo"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31merror: %s\033[0m\n' "$*" >&2; exit 1; }

# --- Preconditions ------------------------------------------------------------
command -v podman >/dev/null || die "podman is not installed"

PODMAN_VERSION="$(podman --version | awk '{print $3}')"
PODMAN_MAJOR="${PODMAN_VERSION%%.*}"
if [ "$PODMAN_MAJOR" -lt 5 ]; then
    die "podman $PODMAN_VERSION found, but .pod quadlet units need >= 5.0.
     Debian 12 ships 4.3; install from backports or use the compose path
     (docker-compose.yaml) instead."
fi
say "podman $PODMAN_VERSION"

command -v systemctl >/dev/null || die "systemd is required for quadlet"

# --- Keep services running when logged out ------------------------------------
if ! loginctl show-user "$USER" --property=Linger 2>/dev/null | grep -q 'Linger=yes'; then
    say "Enabling linger so the services survive logout"
    loginctl enable-linger "$USER" \
        || warn "could not enable linger; run: sudo loginctl enable-linger $USER"
fi

# --- Config -------------------------------------------------------------------
mkdir -p "$UNIT_DIR" "$CONF_DIR"
chmod 700 "$CONF_DIR"

gen_secret() { openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40; }

FRESH_INSTALL=false
if [ ! -f "$CONF_DIR/db.env" ] && [ ! -f "$CONF_DIR/app.env" ]; then
    FRESH_INSTALL=true
    say "Generating database password and auth secret"
    DB_PASSWORD="$(gen_secret)"
    AUTH_SECRET="$(openssl rand -base64 32)"

    sed "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASSWORD}|" \
        "$SRC/db.env.example" > "$CONF_DIR/db.env"

    sed -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://libiamo:${DB_PASSWORD}@127.0.0.1:5432/libiamo|" \
        -e "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=${AUTH_SECRET}|" \
        "$SRC/app.env.example" > "$CONF_DIR/app.env"

    chmod 600 "$CONF_DIR/db.env" "$CONF_DIR/app.env"
else
    say "Keeping existing env files in $CONF_DIR"
fi

# --- Units --------------------------------------------------------------------
say "Installing quadlet units into $UNIT_DIR"
for unit in libiamo.pod libiamo-db.volume libiamo-db.container libiamo-app.container; do
    install -m 644 "$SRC/$unit" "$UNIT_DIR/$unit"
    echo "    $unit"
done

systemctl --user daemon-reload

# --- Report -------------------------------------------------------------------
REMAINING="$(grep -l CHANGE_ME "$CONF_DIR"/*.env 2>/dev/null || true)"
if [ -n "$REMAINING" ]; then
    warn "
Secrets still need filling in before the app will start:
$(grep -Hn CHANGE_ME "$CONF_DIR"/*.env | sed 's/^/    /')

Edit them, then start the stack:
    \$EDITOR $CONF_DIR/app.env
    systemctl --user start libiamo-app"
else
    say "Starting"
    systemctl --user start libiamo-app
    sleep 5
    systemctl --user status libiamo-app --no-pager --lines=15 || true
fi

cat <<EOF

Config:   $CONF_DIR/{db,app}.env
Units:    $UNIT_DIR
Logs:     journalctl --user -u libiamo-app -f
Status:   systemctl --user status libiamo-app libiamo-db
Health:   curl -fsS http://127.0.0.1:3000/health
EOF

if [ "$FRESH_INSTALL" = true ]; then
    cat <<EOF

This is a fresh install: the database starts empty and the entrypoint creates the
schema on first boot. Set ORIGIN in app.env to your real public URL before
exposing it, or auth and email links will point at the wrong host.
EOF
fi
