# Deployment operations

Installed automatically by the parent `install.sh`. Requires Linux/systemd,
Python **3.9+**, rootless Podman and an existing Caddy service/site. No pip/npm
dependencies or new network listeners are introduced. The application image and
database need no rebuild or restart.

On a fresh install or while application secrets contain `CHANGE_ME`, install the
operational files without enabling their timers or attempting Caddy integration.
Set ORIGIN/secrets, prepare the Caddy site, and rerun the parent installer. A
subsequent integration failure prints the deployment report and exits nonzero;
it is not silently accepted as a complete setup. Timer units use the Python
executable validated by the installer (3.9+).

The installer invokes sudo to integrate Caddy. Use an interactive SSH session or
`ssh -t` when sudo requires a password. It validates before reload, restores the
previous files on failure, and keeps five private Caddyfile backups. It uses the
running Caddy executable for validation: an old executable elsewhere in PATH must
not determine which plugins/configuration are accepted.

For nginx/externally managed proxies, explicitly set `LIBIAMO_SKIP_CADDY_SETUP=1`
and implement equivalent bounded JSON logging separately. This is **not** a
complete access-logging setup; monitoring reports missing/unreadable logs.

## Files and migration

| Path (relative to deployment user's home unless absolute) | Purpose |
| --- | --- |
| `.config/libiamo/ops.json` | Private, preserved settings; especially `alert_to` |
| `.local/lib/libiamo-ops/operations.py` | Installed operational commands |
| `.config/systemd/user/libiamo-{backup,monitor,restore-check}.{service,timer}` | Automatic jobs |
| `.local/state/libiamo-ops/` | Atomic status/manifests; private, bounded in file count |
| `.local/share/libiamo-backups/` | Private custom-format PostgreSQL archives |
| `/var/log/libiamo-<uid>/access.log` | Private, size-bounded Caddy access log |
| `/etc/caddy/libiamo-<uid>.caddy` | Generated site logging fragment |
| `/etc/caddy/libiamo-<uid>-runtime.caddy` | Global runtime error-log redaction |

Copy **all of `deploy/podman/`**, not just the quadlet files, to a new machine;
run the parent installer. Carry over `app.env`, `db.env` and `ops.json` securely,
restore the database, and perform a fresh restore drill. Paths derive from the
new user's home/UID. Leave `access_log` as `null` to use the new UID automatically.
Configure the destination Caddy site and credentials before running its sudo
integration step. Do not copy old host Caddy credentials or systemd units blindly.

Set `alert_to` to an array of operator email addresses, then:

```sh
python3 ~/.local/lib/libiamo-ops/operations.py test-email
systemctl --user start libiamo-backup.service
systemctl --user start libiamo-restore-check.service
systemctl --user start libiamo-monitor.service
python3 ~/.local/lib/libiamo-ops/operations.py status
systemctl --user list-timers 'libiamo-*'
```

SMTP credentials are read from the app container configuration, with a local
`app.env` fallback if the container is missing. TLS certificate verification is
mandatory; non-implicit TLS SMTP uses STARTTLS, never plaintext authentication.
A successful SMTP test proves provider acceptance, not inbox delivery. Check
the recipients' inbox/spam folders. Missing recipients or delivery failure is
reported in `monitor.json`, not silently counted as delivery.

## Logging

20 MiB active file, up to 10 compressed archives, at most 14 days of archive age.
Count/size win over time: heavy traffic shortens the retained window. The budget
is about 220 MiB before compression and temporary rotation overhead; it is not a
filesystem quota. A Caddy restart may be required when changing parameters of an
already-open log writer; the initial installation only needs reload.

All original request/response headers, TLS details and original URI are removed.
Only decoded path (1,000 characters), User-Agent (256), Ray ID (80) are added.
Queries are never logged; password-reset path tokens are removed, including
percent-encoded paths. Other URL paths still must not be used to carry secrets.
The global runtime-log filter also removes raw request headers/URI from upstream
error messages; otherwise a 502 would duplicate those details into the journal.
Existing custom default runtime loggers require manual filter integration rather
than being silently overwritten.
Both actual socket address and resolved client IP remain: only existing trusted
proxy configuration determines which client IP is authoritative.

The application/database container logs retain their existing 10 MB limits.
This does not change host-wide rsyslog policies or bound database/business data.

## Local backup policy

- Daily at 03:15 host time, with up to 15 minutes randomized delay; persistent
  timers catch missed schedules after startup.
- Keep at most 14 successful archives within a 2 GiB archive budget. Never prune
  old archives in response to a failed dump. Do not delete the newest archive to
  satisfy a misconfigured budget.
- A file-size limit bounds the dump and reserves 1 GiB free space. `.part` files
  are removed after failure/interruption or on the next backup run. A lock
  prevents backup/restore jobs racing with each other.
- Catch-up jobs wait up to 20 minutes for that lock rather than failing
  immediately. The service deadline is 45 minutes, including lock waiting.
- Publish only after `pg_restore --list` succeeds; record size and SHA-256.
- Weekly Sunday 04:15 (plus jitter), restore the latest verified archive into a
  temporary container using the **running DB image ID**, no image pull, network,
  public ports or production mounts. Use a transactional, fail-fast restore and
  query restored public tables, migrations and users. Remove container/volumes in
  `finally`, including on SIGTERM. Host/power failure can still leave a stopped
  test container; inspect `podman ps -a --filter name=libiamo-restore-check-` after
  an abnormal host shutdown.
- Default drill limits: 256 MiB memory and 512 MiB tmpfs. Increase
  `restore_memory`/`restore_tmpfs` as the database grows; failed drills must alert,
  not be skipped to obtain a green result.

Archives include private learner data and encrypted user API-key fields. They
are permission-restricted **but not independently encrypted**, because storing
an encryption key on the same host does not provide independent disaster
recovery. Keep application secrets separately recoverable. Same-disk copies do
not survive disk loss, host compromise or deletion by the deployment user.
Off-site backup remains outstanding. Never restore into the live database as a
"test"; the manual production recovery procedure is in `DEPLOYMENT.md`.

## Monitoring and notification

Every minute after the previous run completes: local readiness (including DB),
public HTTPS readiness observed from this host (with an explicit monitor
User-Agent), access-log freshness,
disk/inodes, memory availability, container health/OOM, observed restart bursts,
recent 5xx, LLM hourly volume, backup freshness, and backup/drill unit failures.
Disk warns at 80%, critical at 90%; inodes warn at 80%; available memory below
10% warns. Backup becomes stale after 30 hours; a drill after 8 days.

Three consecutive failed samples activate an issue; three healthy samples clear
it. Notifications batch all active issues, repeat at most every six hours if
unchanged, and include recovery. SMTP failure retries after 15 minutes and never
advances the delivered watermark. Real alert text contains only check names and
operational summaries, not request bodies, addresses, tokens or user data.

HTTP statistics inspect only bounded recent log data (current file and latest
archive, retaining at most the final 8 MiB of each). Skip the archive if the
current file already covers the window; otherwise stream-decompress the archive
to reach its tail. This bounds memory, not decompression bytes.
`http_sample_limited` means coverage is incomplete;
reported counts are not exact traffic totals. A minimum 20 sampled requests and
20% 5xx triggers an issue. LLM defaults are 500 calls/hour or 2 million output
tokens/hour; adjust for actual use. These are activity thresholds, not dollar
estimates, and tracing opt-outs mean they are not a complete billing ledger.

**This is not independent uptime monitoring.** If the host, SMTP, user manager or
monitor itself is down, on-host alerts cannot be relied upon. On a different
machine/service, configure a one-minute HTTPS `/health` check (require HTTP 200
and `{"status":"ok"}`, use an identifiable monitor User-Agent), alert after
three failures and on recovery. Add an
external dead-man heartbeat if the chosen service supports one. Neither external
service nor third-party account is provisioned automatically.

Only HTTPS origins generate the public probe; HTTP-only installations do not
infer log failure from an otherwise quiet file. Partial recoveries list the
recovered checks even while other alerts remain active.

## Tests

```sh
python3 -m unittest discover -s test/deploy -v
python3 test/deploy/verify_caddy.py deploy/podman/ops/access-log.caddy /path/to/caddy
```

The latter generates synthetic traffic only on a disposable loopback listener;
it never load-tests production. All temporary resources are removed.
