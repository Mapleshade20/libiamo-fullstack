#!/usr/bin/env bash
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HOME/.local/lib/libiamo-ops"
UNITS="$HOME/.config/systemd/user"
[ "$(id -u)" -ne 0 ] || { echo 'Run this installer as the rootless deployment user, not root.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python 3.9+ is required.' >&2; exit 1; }
PYTHON="$(python3 -c 'import sys; assert sys.version_info >= (3,9), "Python 3.9+ required"; print(sys.executable)')"
command -v podman >/dev/null || { echo 'Podman is required.' >&2; exit 1; }
umask 077
mkdir -p "$LIB" "$UNITS"
install -m 700 "$SRC/operations.py" "$LIB/operations.py"
python3 "$LIB/operations.py" init
if ! python3 -c 'import json,pathlib,sys; sys.exit(not bool(json.loads((pathlib.Path.home()/".config/libiamo/ops.json").read_text()).get("alert_to")))'; then
	echo 'WARNING: no alert recipients configured; checks run but cannot notify you.' >&2
fi

for command in backup monitor restore-check; do
	unit="libiamo-$command"
	cat > "$UNITS/$unit.service" <<EOF
[Unit]
Description=Libiamo operations: $command

[Service]
Type=oneshot
ExecStart="$PYTHON" %h/.local/lib/libiamo-ops/operations.py $command
TimeoutStartSec=45min
TimeoutStopSec=90s
KillMode=mixed
UMask=0077
Nice=10
EOF
	if [ "$command" = monitor ]; then
		schedule='OnBootSec=2min
OnUnitInactiveSec=1min'
	elif [ "$command" = backup ]; then
		schedule='OnCalendar=*-*-* 03:15:00
RandomizedDelaySec=15min
Persistent=true'
	else
		schedule='OnCalendar=Sun *-*-* 04:15:00
RandomizedDelaySec=15min
Persistent=true'
	fi
	cat > "$UNITS/$unit.timer" <<EOF
[Unit]
Description=Schedule $unit

[Timer]
$schedule

[Install]
WantedBy=timers.target
EOF
done
systemctl --user daemon-reload

if [ "${LIBIAMO_DEFER_CADDY_SETUP:-0}" = 1 ]; then
	echo 'PENDING: first-install configuration is incomplete. Set ORIGIN/secrets, prepare the Caddy site, then rerun install.sh.' >&2
elif [ "${LIBIAMO_SKIP_CADDY_SETUP:-0}" = 1 ]; then
	echo 'WARNING: Caddy access logging was explicitly skipped; configure it separately.' >&2
else
	host="$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlsplit
import shlex
for line in (Path.home()/'.config/libiamo/app.env').read_text().splitlines():
	if line.startswith('ORIGIN='):
		print(urlsplit(' '.join(shlex.split(line.split('=',1)[1]))).hostname or '')
		break
PY
)"
	sudo "$PYTHON" "$SRC/configure-caddy.py" --user "$(id -un)" --host "$host" --template "$SRC/access-log.caddy"
fi
if [ "${LIBIAMO_DEFER_CADDY_SETUP:-0}" != 1 ]; then
	systemctl --user enable --now libiamo-backup.timer libiamo-monitor.timer libiamo-restore-check.timer
fi
echo "Operations installed. Configure alert_to in $HOME/.config/libiamo/ops.json."
echo "Then run: python3 $LIB/operations.py test-email"
echo 'External uptime/dead-man monitoring still requires a separate machine or service.'
