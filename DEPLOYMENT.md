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

Nothing needs to be cloned on the server — only `deploy/podman/` (about 7 small
files) or `docker-compose.yaml`.

---

## 1. Podman quadlet (recommended)

Both containers live in one pod, so they share a network namespace: the app
reaches Postgres at `127.0.0.1:5432`, and Postgres is **not** reachable from the
host at all. Only port 3000 is published, on loopback.

### Requirements

Podman **>= 5.0** — `.pod` quadlet units do not exist before that.

```sh
podman --version
```

Debian 13 (trixie) ships Podman 5.x. Debian 12 ships 4.3; install from
`bookworm-backports` or use the [compose path](#2-compose) instead.

### Install

From your workstation:

```sh
scp -r deploy/podman/ user@server:~/libiamo-deploy
ssh user@server 'bash ~/libiamo-deploy/install.sh'
```

`install.sh` enables lingering (so services survive logout), generates the
database password and `BETTER_AUTH_SECRET`, installs the quadlet units into
`~/.config/containers/systemd/`, and writes config to `~/.config/libiamo/`. It
never overwrites existing env files, so it is safe to re-run after changing a
unit.

It then stops and lists whatever still says `CHANGE_ME`. Fill those in:

```sh
$EDITOR ~/.config/libiamo/app.env    # ORIGIN, SMTP_*, OPENAI_API_KEY
systemctl --user start libiamo-app
```

`ORIGIN` must be your real public URL (`https://app.libiamo.net`) before you
expose the app — auth and email links are built from it.

### Operating

```sh
systemctl --user status libiamo-app libiamo-db
journalctl --user -u libiamo-app -f
curl -fsS http://127.0.0.1:3000/health      # {"status":"ok"}

systemctl --user restart libiamo-app
systemctl --user stop libiamo-pod           # stops the whole pod
```

Units are generated from the quadlet files, so `libiamo-app.container` becomes
`libiamo-app.service`. After editing any unit file, run
`systemctl --user daemon-reload`.

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

Two settings matter more than the rest: LLM calls run long, and streamed
responses must not be buffered.

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name app.libiamo.net;

    # ssl_certificate ... ;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Feedback generation and the translation-evaluation chain make
        # multi-step LLM calls that outlast the 60s default.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # Token streaming must not sit in a buffer.
        proxy_buffering off;
    }
}
```

### Caddy

```caddy
app.libiamo.net {
    reverse_proxy 127.0.0.1:3000 {
        transport http {
            read_timeout 300s
        }
        flush_interval -1
    }
    request_body {
        max_size 20MB
    }
}
```

`ORIGIN` must match the public URL exactly (bare origin, no trailing path). A
mismatch shows up as rejected form posts and broken email links.

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
manually from *Actions → Publish image*, choosing platforms and a `base_path`.

Defaults to `linux/amd64`; `linux/arm64` is available but QEMU-emulated and
several times slower.

The first push creates a **private** package. To pull without credentials, set
the package to public under *Packages → libiamo → Package settings*. Otherwise
log in on the server first:

```sh
podman login ghcr.io -u <github-user>    # password = PAT with read:packages
```

### Base path

`BASE_PATH` is compiled into the client bundle by SvelteKit — it **cannot** be
changed at runtime. The published image is built with `BASE_PATH=""` and serves
from the root of a domain. To host under a sub-path, rebuild:

```sh
podman build --build-arg BASE_PATH=/app -t libiamo:app .
```

Then proxy *without* stripping the prefix, because the Node server expects to see
`/app` on every request.

---

## 6. Backup and restore

```sh
# Quadlet
podman exec libiamo-db pg_dump -U libiamo -d libiamo --format=custom \
  > "libiamo-$(date +%F-%H%M).dump"

# Compose
podman compose --env-file .env.docker exec -T database \
  pg_dump -U libiamo -d libiamo --format=custom > "libiamo-$(date +%F-%H%M).dump"
```

Restore:

```sh
podman exec -i libiamo-db pg_restore -U libiamo -d libiamo --clean --if-exists \
  < libiamo-2026-08-30-1200.dump
```

The dump includes `drizzle.__drizzle_migrations`, so restoring does not re-run
migrations.

Data lives in the `libiamo-db-data` volume (quadlet) or `libiamo_database-data`
(compose). Removing that volume — or running `compose down -v` — destroys the
database.

> **Postgres 18 note.** The official image changed its layout: the cluster lives
> in `/var/lib/postgresql/18/docker` and the volume is declared at
> `/var/lib/postgresql`, *not* the pre-18 `/var/lib/postgresql/data`. Both setups
> here mount the correct path. If you adapt another project's config, check this —
> mounting the old path silently starts an empty cluster.

---

## 7. Configuration reference

| Variable | Required | Notes |
|---|---|---|
| `ORIGIN` | yes | Public origin, no trailing path. Must match the real URL. |
| `DATABASE_URL` | yes | **secret.** Host is `127.0.0.1` in a pod, `database` under compose. |
| `POSTGRES_DB` / `POSTGRES_USER` | – | Default `libiamo`. Read only at cluster creation. |
| `POSTGRES_PASSWORD` | yes | **secret.** Must match `DATABASE_URL`. |
| `RUN_MIGRATIONS` | – | Default `true`. Set `false` to migrate out of band. |
| `BETTER_AUTH_SECRET` | yes | **secret.** Changing it logs everyone out. |
| `SMTP_*` | yes | **secret** (`SMTP_PASS`). Sign-up requires email verification. |
| `OPENAI_API_KEY` | yes | **secret.** |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | yes | OpenAI-compatible endpoint. |
| `TRIAL_TOKEN_BUDGET` | – | Default `50000`. Output-token budget for non-BYOK users. |
| `BODY_SIZE_LIMIT` | – | Default `20M`; adapter-node's own default is only 512K. |
| `TZ` | – | Default `Asia/Shanghai`. |
| `LLM_DEBUG` / `DB_DEBUG` | – | Verbose logging. Leave off in production. |

Compose-only: `APP_IMAGE`, `APP_BIND`, `APP_PORT`.

Build args: `BASE_PATH` (compiled in; `""` = domain root), `NODE_VERSION`
(default `22.23.2`).

---

## 8. Troubleshooting

**App restarts, logs show migration failures.** After ~30s of retries the
entrypoint aborts rather than serve against a stale schema. Check that Postgres
is up and `DATABASE_URL` is right — in a pod the host is `127.0.0.1`, under
compose it is `database`.

**`systemctl --user` units vanish after logout.** Lingering is not enabled:
`sudo loginctl enable-linger $USER`.

**Quadlet units are not generated.** `.pod` support needs Podman >= 5.0, and unit
files must sit in `~/.config/containers/systemd/`. Check with
`/usr/lib/systemd/system-generators/podman-system-generator --user --dryrun`.

**Form posts fail / cross-site POST errors.** `ORIGIN` does not match the URL in
the browser, scheme included.

**Verification and reset emails point at the wrong host.** Same cause.

**No emails arrive.** `SMTP_PASS` is wrong or unset. Sending is fire-and-forget,
so sign-up still appears to succeed; only the message is lost.

**502 or truncated responses during feedback / translation evaluation.** The proxy
timed out on a long LLM call. Raise `proxy_read_timeout` and disable buffering
(§3).

**Assets 404 under a sub-path.** The image was built with the wrong `BASE_PATH`,
or the proxy strips the prefix. See §5.
