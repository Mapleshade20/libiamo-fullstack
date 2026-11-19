# Deployment

Libiamo ships as a single container image: the SvelteKit (adapter-node) server on
port 3000, serving pages and `/api` from one Node process. TLS, compression and
routing belong to a reverse proxy in front of it.

Images are published to `ghcr.io/mapleshade20/libiamo`.

Two supported ways to run it:

| | Use when |
|---|---|
| **[Podman quadlet](#1-podman-quadlet-recommended)** | Production. Native pod, systemd-managed, rootless. |
| **[Compose](#2-compose)** | Local trials, or Podman < 5.0. Works with `docker compose` and `podman compose`. |

Nothing needs to be cloned on the server — only the complete `deploy/podman/`
directory (including `ops/`) or `docker-compose.yaml`.

---

## 1. Podman quadlet (recommended)

The app and Postgres sit on a private `libiamo` network. Container-name DNS
resolves `libiamo-db`, and the database publishes no port, so it is reachable
only from that network — not from the host. Only port 3000 is published, on
loopback.

> A pod (shared network namespace) would be the more idiomatic Podman topology,
> but Podman 5.x builds the pod's infra container through a "rootfs-overlay" that
> needs unprivileged overlayfs mounts. Kernels before 5.11 — Debian 11's 5.10
> among them — refuse those, and the infra conmon pidfile then never appears, so
> systemd tears the pod down immediately. A network avoids that machinery
> entirely and gives equivalent isolation.

### Requirements

- Linux with systemd, a deployment user (not root) with sudo, and subordinate ids
  for it in `/etc/subuid` and `/etc/subgid` (`adduser` writes them).
- Podman **>= 5.0** (the units were checked on 5.4, Debian 13's, and 5.6). Older
  Debian releases ship an older one; use Compose there or a newer Podman.
- Caddy **>= 2.8** in front, for the access-log integration (`ops/`). Debian 13's
  own package is 2.6 and is refused at validation: install Caddy from its
  repository (caddyserver.com/docs/install). nginx works too, without the
  integration (see the operations README).
- Python 3.9+ and `openssl` (the installer and the operation jobs).

On a fresh Debian 13 server, as root:

```sh
apt install podman uidmap dbus-user-session python3 openssl
# Caddy from caddyserver.com/docs/install (its apt repository), then its site
# block for the app (§3).
adduser deploy && usermod -aG sudo deploy
```

Then log in as that user over SSH (not `su`/`sudo -u`: `systemctl --user` needs
the user's own login session).

### Install

From your workstation:

```sh
scp -r deploy/podman/ user@server:~/libiamo-deploy
ssh -t user@server 'bash ~/libiamo-deploy/install.sh'
```

`install.sh` enables lingering (so services survive logout), generates the
database password and `BETTER_AUTH_SECRET`, installs the quadlet units into
`~/.config/containers/systemd/`, and writes config to `~/.config/libiamo/`. It
never overwrites existing env files, so it is safe to re-run after changing a
unit.

It then stops and lists whatever still says `CHANGE_ME`. Fill those in:

```sh
$EDITOR ~/.config/libiamo/app.env    # ORIGIN, BETTER_AUTH_SECRET, SMTP_*, OAuth
systemctl --user start libiamo-app
```

`ORIGIN` must be your real public URL (`https://libiamo.net`) before you
expose the app — auth and email links are built from it.

The same directory includes portable access logging, monitoring and local backup
jobs. The installer installs their user timers and uses sudo to integrate the
existing Caddy site. Configure private email recipients in
`~/.config/libiamo/ops.json`, take the first backup, test email delivery and run
an isolated restore drill. See [deployment operations](deploy/podman/ops/README.md)
for prerequisites, limits, commands, migration and external-monitoring gaps.
Do not copy only the quadlet files: copy the whole deployment directory.

### Loading the content

A new database has no scenarios. They travel as one content document
(`lab/seed/scenarios.json`: works, name tables, scenarios with their checked
sources, issues), loaded from a checkout on your workstation. The database
publishes no port, so open one on the server's loopback for the length of the
load and reach it through SSH:

```sh
# On the server
podman run -d --rm --name libiamo-db-tunnel --network libiamo \
  -p 127.0.0.1:5433:5432 docker.io/alpine/socat \
  tcp-listen:5432,fork,reuseaddr tcp:libiamo-db:5432
grep POSTGRES_PASSWORD ~/.config/libiamo/db.env

# On the workstation, in the repository
ssh -N -L 5433:127.0.0.1:5433 user@server &
DATABASE_URL=postgres://libiamo:<password>@127.0.0.1:5433/libiamo \
  node --experimental-transform-types lab/seed.ts
kill %1

# On the server
podman stop libiamo-db-tunnel
```

The load replaces what has the same ids and touches nothing else, so it can be
run again after the document changes; edits made in the admin's editor to those
scenarios are replaced with it.

### Operating

```sh
systemctl --user status libiamo-app libiamo-db
podman logs -f libiamo-app                  # container output
journalctl --user -u libiamo-app -f         # unit lifecycle only
curl -fsS http://127.0.0.1:3000/health      # {"status":"ok"}

systemctl --user restart libiamo-app
systemctl --user stop libiamo-app libiamo-db
```

Units are generated from the quadlet files, so `libiamo-app.container` becomes
`libiamo-app.service`. After editing any unit file, run
`systemctl --user daemon-reload`.

Container output goes to `podman logs`, not the journal — the units use the
`k8s-file` log driver because a `conmon` built without journald support fails
outright with `LogDriver=journald`.

The database starts empty; the app's entrypoint creates the schema on first boot.

> The entrypoint retries migrations for ~30s, which covers Postgres still
> starting. Seeing `migration attempt 1 failed, retrying in 3s` once on a cold
> boot is normal and self-correcting.

---

## 2. Compose

```sh
cp .env.docker.example .env.docker
chmod 600 .env.docker
$EDITOR .env.docker                          # fill in every CHANGE_ME

podman compose --env-file .env.docker up -d  # or: docker compose
```

Here the two containers are on a compose network rather than in a pod, so
`DATABASE_URL` uses the **service name** `database` as the host, not
`127.0.0.1`. That is the one setting that differs between the two paths.

To use a Postgres you already run elsewhere, point `DATABASE_URL` at it and start
only the app — `required: false` on the dependency stops Compose from pulling the
bundled database in behind your back:

```sh
podman compose --env-file .env.docker up -d app
```

---

## 3. Reverse proxy

A revision's step or a collected phrase waits on the learner's model, usually
well under a minute, sometimes longer (a slow model, a retried request). The app
answers within 20 seconds as usual; an answer not ready by then begins anyway
and sends a space every 15 seconds until the JSON follows (`src/lib/server/kept-alive.ts`).
Two things follow for the proxy in front:

- **Cloudflare** gives up on a response that has not begun within 100 seconds
  (a 524; the free plan cannot raise it). The spaces keep long answers inside
  it. To check after a deployment, send a revision step that takes longer than
  20 seconds through the public host with `curl -N` and watch the spaces arrive.
  Leave off the features that inject a script into pages (Rocket Loader, Web
  Analytics' automatic snippet, email obfuscation): the app's
  Content-Security-Policy refuses them.
- **The proxy must pass the spaces on as they come.** Caddy does by default
  (checked with `encode gzip zstd`). nginx buffers responses, but honours the
  app's `X-Accel-Buffering: no` on these answers.

### nginx

nginx defaults to a 60s upstream timeout and a 1 MB request body, both of which
are too small here, so these need setting explicitly.

```nginx
server {
    listen 443 ssl http2;
    server_name libiamo.net;

    # ssl_certificate ... ;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # A revision's steps wait on the learner's model and can outlast the
        # 60s default.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

### Caddy

```caddy
libiamo.net {
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {client_ip}
    }
}
```

Caddy's defaults already do the rest of what the nginx block spells out:
automatic TLS, `X-Forwarded-*`, the original `Host` passed upstream, **no**
upstream read timeout, and **no** request body limit. Adding
`transport http { read_timeout … }` here would only *impose* a ceiling that does
not otherwise exist, which is the opposite of what long LLM calls need.

### Visitor address

The app sees the proxy as the socket peer, so the proxy must overwrite
`X-Real-IP` with the address it resolved itself (both blocks above do), and
`ADDRESS_HEADER=X-Real-IP` tells the app to read it. Turnstile and the audit log
use it; without `ADDRESS_HEADER` they go without an address rather than trust a
header the client could have sent. Set the proxy up first: adapter-node throws
when asked for the address of a request that lacks the header.

With Cloudflare in front, `{client_ip}` is Cloudflare's edge unless Caddy is
told to trust it, in the global options block:

```caddy
{
    servers {
        trusted_proxies static <Cloudflare's IPv4 and IPv6 ranges>
        client_ip_headers CF-Connecting-IP
    }
}
```

The per-endpoint rate limits to configure here are listed in
`docs/design/2026-10-03-abuse-protection.md` ("Proxy rate limits").

`ORIGIN` must match the public URL exactly (bare origin, no trailing path). A
mismatch shows up as rejected form posts and broken email links.

### Canonical-host cutover

To move production from `app.libiamo.net` to `libiamo.net`, change the systems
that identify or terminate the public origin in this order:

1. Add the apex DNS record or Cloudflare Tunnel public hostname for
   `libiamo.net`, provision its TLS certificate, and make the reverse proxy serve
   the app for that host.
2. Before switching traffic, add the new OAuth callbacks:
   `https://libiamo.net/api/auth/callback/google` and
   `https://libiamo.net/api/auth/callback/github`. Update the providers' homepage
   or application URL to `https://libiamo.net/about`, and add
   `https://libiamo.net` as a Google authorized JavaScript origin if that field is
   in use. Google redirect URIs are exact matches; GitHub OAuth Apps support
   several callback URLs, so the old one can remain during the transition.
3. Set the runtime `ORIGIN=https://libiamo.net` and restart the app. This changes
   Better Auth's own origin, callback URLs, and verification/reset links. Keep the
   existing `BETTER_AUTH_SECRET`, OAuth client IDs/secrets, and database.
4. Keep a proxied DNS record for `app.libiamo.net` and add a permanent Cloudflare
   redirect to `https://libiamo.net`, preserving the path and query string. Remove
   the old OAuth callbacks only after the redirect has been verified.

Better Auth cookies are host-only in this project. A cookie issued by
`app.libiamo.net` is therefore not sent to `libiamo.net`; existing users will sign
in once on the new host. Do not enable cross-subdomain cookies just for this
one-time move.

Google's production OAuth policy expects the public homepage to describe the app
and link to its privacy policy and terms. `/about` (where the site's address
leads anyone signed out) supplies the product description; set the
consent-screen homepage, privacy and terms URLs to `/about`, `/privacy` and
`/terms` on the public origin before requesting or
renewing Google production verification.

SMTP settings do not change when `SMTP_FROM` already uses a verified sender such
as `@libiamo.net` (or an unrelated mail subdomain). If it uses
`@app.libiamo.net`, register the replacement sender in Alibaba DirectMail first
and publish the SPF, DKIM, DMARC, ownership, and MX records it provides. Never
replace an existing SPF record with a second one; merge authorized senders.

After the cutover, test password sign-in, both OAuth providers, email
verification, password reset, direct protected-route redirects, and the old-host
redirect. Also update uptime checks, analytics, search-console properties, and
any external allowlists that explicitly contain the old hostname.

### Search indexing

Only the public pages (`/about`, `/terms`, `/privacy`, `/changelog`) are indexed: they carry a canonical address and a
description, every other page says `noindex` (`src/lib/seo.ts`). `/robots.txt` keeps crawlers off the signed-in pages
and `/sitemap.xml` lists the public ones; both build their addresses from `ORIGIN` at runtime, so moving the canonical
host changes them with no rebuild. Submit `https://<ORIGIN>/sitemap.xml` to the search consoles after a cutover.

---

## 4. Updating

Migrations are applied at container start, before the server listens.

**Take a database backup before any update carrying a migration** (§6). Drizzle
migrations are not automatically reversible.

### Quadlet

```sh
$EDITOR ~/.config/containers/systemd/libiamo-app.container   # change Image= tag
systemctl --user daemon-reload
systemctl --user restart libiamo-app
journalctl --user -u libiamo-app -n 50
```

Or, if you keep `Image=...:latest` and `AutoUpdate=registry` (both are the
shipped default):

```sh
podman auto-update
podman auto-update --dry-run    # check first
```

`podman auto-update` rolls back automatically if the new image fails to start.
Pinning an explicit version is still the better habit for a production service —
if you pin, drop the `AutoUpdate=registry` line.

### Compose

```sh
$EDITOR .env.docker                              # set APP_IMAGE to the new tag
podman compose --env-file .env.docker pull
podman compose --env-file .env.docker up -d
```

### Rollback

Point the tag back at the previous version and restart. This reverses the *code*
only — if the release applied a destructive migration, restore the backup too.

---

## 5. Publishing a new image

The `Publish image` workflow builds and pushes to GHCR.

```sh
git tag v0.1.0
git push origin v0.1.0
```

Publishes `:0.1.0`, `:0.1`, `:latest` and `:sha-<commit>`. You can also run it
manually from *Actions → Publish image*, choosing the platforms.

Defaults to `linux/amd64`; `linux/arm64` is available but QEMU-emulated and
several times slower.

The first push creates a **private** package. To pull without credentials, set
the package to public under *Packages → libiamo → Package settings*. Otherwise
log in on the server first:

```sh
podman login ghcr.io -u <github-user>    # password = PAT with read:packages
```

The app is served from the root of its host; there is no sub-path deployment.

---

## 6. Backup and restore

The Podman installer now includes daily local backups and weekly isolated
restore drills; see [deployment operations](deploy/podman/ops/README.md).
Local copies alone do **not** protect against loss of the server/disk. The
commands below are manual recovery tools, not a restore-drill procedure.

```sh
# Quadlet
podman exec libiamo-db pg_dump -U libiamo -d libiamo --format=custom \
  > "libiamo-$(date +%F-%H%M).dump"

# Compose
podman compose --env-file .env.docker exec -T database \
  pg_dump -U libiamo -d libiamo --format=custom > "libiamo-$(date +%F-%H%M).dump"
```

Restore (stop the app first, so nothing writes while the tables are replaced):

```sh
systemctl --user stop libiamo-app
podman exec -i libiamo-db pg_restore -U libiamo -d libiamo --clean --if-exists \
  < libiamo-2026-08-30-1200.dump
```

The dump includes `drizzle.__drizzle_migrations`, so restoring does not re-run
migrations.

```sh
systemctl --user start libiamo-app
```

Data lives in the `libiamo-db-data` volume (quadlet) or `libiamo_database-data`
(compose). Removing that volume — or running `compose down -v` — destroys the
database.

> **Postgres 18 note.** The official image changed its layout: the cluster lives
> in `/var/lib/postgresql/18/docker` and the volume is declared at
> `/var/lib/postgresql`, *not* the pre-18 `/var/lib/postgresql/data`. Both setups
> here mount the correct path. If you adapt another project's config, check this —
> mounting the old path silently starts an empty cluster.

### Moving to another server

The learners' saved keys are encrypted under `BETTER_AUTH_SECRET`: the new server
must run with the old `app.env`, or every saved key is unreadable and everyone is
signed out. Run the same image version on both (`podman image inspect
libiamo-app --format '{{.Id}}'` on the old one; pin that tag in the new unit if
`latest` has moved since).

1. Prepare the new server (§1, Requirements) and its Caddy site, with the DNS
   still pointing at the old one.
2. Copy `~/.config/libiamo/{app.env,db.env,ops.json}` from the old server to the
   same place on the new one (mode 600, directory 700), and `deploy/podman/` to
   `~/libiamo-deploy`. Then run `bash ~/libiamo-deploy/install.sh`: it keeps the
   copied files and starts the stack on an empty database.
3. On the old server, stop the app so nothing more is written, and take the last
   dump:
   ```sh
   systemctl --user stop libiamo-app
   podman exec libiamo-db pg_dump -U libiamo -d libiamo --format=custom > last.dump
   ```
4. Copy `last.dump` over and restore it on the new server as above (stop the app,
   `pg_restore`, start the app). Check `/health` and sign in through
   `curl --resolve <host>:443:<new address>` or a hosts entry.
5. Point the DNS (or the Cloudflare Tunnel) at the new server. OAuth callbacks,
   `ORIGIN` and mail settings stay as they are.
6. On the new server take a backup and run a restore drill (the operations
   README). On the old one, stop the timers and the stack so it neither answers
   nor sends alerts, and keep its volume until the new server has run for a
   while:
   ```sh
   systemctl --user disable --now libiamo-backup.timer libiamo-monitor.timer libiamo-restore-check.timer
   systemctl --user stop libiamo-app libiamo-db
   # Quadlet units cannot be disabled; move them away so a reboot does not start them.
   mkdir -p ~/libiamo-retired && mv ~/.config/containers/systemd/libiamo* ~/libiamo-retired/
   systemctl --user daemon-reload
   ```

---

## 7. Configuration reference

| Variable | Required | Notes |
|---|---|---|
| `ORIGIN` | yes | Public origin, no trailing path. Must match the real URL: Better Auth accepts requests only from it and builds mail links from it. |
| `DATABASE_URL` | yes | **secret.** Host is the container name under quadlet, `database` under compose. |
| `DATABASE_POOL_MAX` | – | Default `10`: the most connections the server holds open. Keep it below Postgres's `max_connections` (100 by default). |
| `POSTGRES_DB` / `POSTGRES_USER` | – | Default `libiamo`. Read only at cluster creation. |
| `POSTGRES_PASSWORD` | yes | **secret.** Must match `DATABASE_URL`. |
| `RUN_MIGRATIONS` | – | Default `1`: the entrypoint migrates on every start. `0` to migrate out of band. |
| `BETTER_AUTH_SECRET` | yes | **secret**, 32+ characters. Signs sessions and encrypts learners' keys: changing it logs everyone out and makes saved keys unreadable. |
| `ADMIN_EMAILS` | – | Comma-separated addresses that become admins when they sign in with the address verified. A fresh database needs no SQL. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Google OAuth. Both are required to offer the provider; the secret is sensitive. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | no | GitHub OAuth, likewise. |
| `SMTP_*` | yes | **secret** (`SMTP_PASS`). An account starts by confirming its address. `SMTP_SECURE=1` for implicit TLS (port 465). Mail is sent only when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are all set; otherwise it is printed to the log (development only). |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | no | **secret** (`TURNSTILE_SECRET_KEY`). Cloudflare Turnstile on signing in, signing up, the confirmation mail and password resets, shown only when Cloudflare asks for a click. Both empty turns it off; setting only one refuses to start. |
| `AUTH_AUDIT_LOG` | – | Default `0`. `1` prints one JSON line (`{"type":"auth-audit",...}`) per sign-up, address change (requested and completed), password change or reset, login-method link or unlink, and admin grant. Lines carry addresses and IPs. |
| `ADDRESS_HEADER` | – | Header holding the visitor's address; see [Visitor address](#visitor-address). Empty: none. |
| `OPENROUTER_API_KEY` | – | **secret.** The service's own key, for the calls no learner makes (translation sources). Learners' calls run on the key they saved. |
| `BODY_SIZE_LIMIT` | – | Default `2M` (the largest request, a draft with a captured page, is under 1M); adapter-node's own default is only 512K. |
| `TZ` | – | Default `Asia/Shanghai`. |
| `DB_DEBUG` | – | `1` logs every query. Leave off in production. |

The server checks these when it starts (`src/env.ts`) and refuses to run with a required one missing.

On/off variables take `1`/`0`; `true`/`false`, `yes`/`no` and `on`/`off` work too.

Compose-only: `APP_IMAGE`, `APP_BIND`, `APP_PORT`.

Build args: `NODE_VERSION`
(default `24.22.2`; ts-fsrs needs Node 24).

---

## 8. Troubleshooting

**App restarts, logs show migration failures.** After ~30s of retries the
entrypoint aborts rather than serve against a stale schema. Check that Postgres
is up and `DATABASE_URL` is right — in a pod the host is `127.0.0.1`, under
compose it is `database`.

**`systemctl --user` says "Failed to connect to bus".** The shell is not the
user's own login session (`su`, `sudo -u`), or `dbus-user-session` is missing.
Log in as the deployment user over SSH.

**`systemctl --user` units vanish after logout.** Lingering is not enabled:
`sudo loginctl enable-linger $USER`.

**Quadlet units are not generated.** Needs Podman >= 5.0, and unit files must sit
in `~/.config/containers/systemd/`. Inspect what is produced with
`podman-system-generator --user --dryrun` (under `/usr/lib/systemd/` or
`/usr/local/lib/systemd/`).

**`Error: conmon failed: exit status 1`, exit code 126.** Run the generated
`ExecStart` by hand to see conmon's real message. If it says *"Include journald
in compilation path"*, that conmon was built without journald support and cannot
serve `LogDriver=journald` — these units use `k8s-file` for exactly this reason.

**Container starts but never reports healthy.** An image built in OCI format
loses its `HEALTHCHECK`, so `libiamo-app.container` declares `HealthCmd=`
itself.

**Port already in use on 3000.** Usually a previous non-container deployment.
`ss -tlnp | grep 3000` names the process.

**Form posts fail / cross-site POST errors.** `ORIGIN` does not match the URL in
the browser, scheme included.

**Verification and reset emails point at the wrong host.** Same cause.

**No emails arrive.** `SMTP_PASS` is wrong or unset. Sending is fire-and-forget,
so sign-up still appears to succeed; only the message is lost.

**502, 524 or truncated responses during a revision step.** The proxy timed out
on a long model call, or held back the spaces a long answer sends while it waits
(§3): raise `proxy_read_timeout`, and check that nothing between the app and the
browser buffers responses.

**A page is missing a script, a frame or a picture, and the console says "Content
Security Policy".** The app allows only its own origin, Turnstile and Gravatar
(`vite.config.ts`, `csp`). A proxy or CDN feature that injects its own script
(Cloudflare's Rocket Loader, Web Analytics' automatic snippet, email
obfuscation) is refused: turn it off, or add its source there and to the
privacy policy.
