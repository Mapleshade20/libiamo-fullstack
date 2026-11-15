# Libiamo

A writing tutor for what learners really write in another language: a post, a comment, an email. The learner pastes
what they are about to send, and a tutor goes through it with them twice, first to make it right, then to make it sound
like they meant it. What they work out is kept as notes and comes back in review. Scenarios add writing for real
places (an AO3 comment thread, a Reddit post, a Discord channel, an iMessage group, a mail thread), played against
simulated people, and translations of real texts.

Every model call runs on the learner's own key (OpenRouter, DeepSeek, OpenAI or GLM).

The application is being rebuilt from the product's demo; the plan, the data model and the state of the work are in
[docs/design/2026-11-13-step-3-rebuild.md](./docs/design/2026-11-13-step-3-rebuild.md).

## Stack

- SvelteKit 3 and Svelte 5 (runes, async mode), adapter-node; remote functions for the app's data
- PostgreSQL 18 through drizzle-orm and postgres.js
- Better Auth (address and password with a confirmation mail, Google, GitHub), Cloudflare Turnstile
- Tailwind 4, bits-ui, lucide
- zod, the OpenAI SDK for every provider, Vitest, Biome, pnpm

## Developing

```sh
cp .env.example .env   # a database, ORIGIN, BETTER_AUTH_SECRET; leave SMTP_PASS empty to read mails in the console
pnpm install
pnpm db:migrate
pnpm dev               # http://127.0.0.1:5173
```

`pnpm check` (types and Biome) and `pnpm test` must pass before a change is done.

`TEST_POSTGRES_URL=postgres://localhost/postgres pnpm test` also runs the PostgreSQL regression suite. The connection
must be allowed to create databases: the suite creates and drops its own database and never touches the development
database. Without that variable the PostgreSQL cases are explicitly skipped.

`lab/replay.mjs` replays the recorded revisions in `lab/baseline/` against the dev server, answering every model call
from their cache (`LLM_CACHE_DIR`, `LLM_CACHE_ONLY=1`), so a change in behaviour shows as a differing response and
nothing is spent.

## Deploying

Libiamo ships as a container image published to `ghcr.io/mapleshade20/libiamo`.

Production uses rootless Podman with systemd-managed quadlet units: the app and Postgres 18 share a private network,
and only loopback port 3000 is published:

```sh
scp -r deploy/podman/ user@server:~/libiamo-deploy
ssh -t user@server 'bash ~/libiamo-deploy/install.sh'
```

A Compose file is also provided for local trials and for Podman < 5.0:

```sh
cp .env.docker.example .env.docker   # then fill in every CHANGE_ME
podman compose --env-file .env.docker up -d
```

The Podman installer also installs monitoring, local backup and restore-drill timers, and a sudo-managed Caddy logging
integration. Either way the schema is created on first boot. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the reverse
proxy, updates and rollback, backups and every variable.

Profile pictures are [Gravatar](https://gravatar.com)'s for the account's address.
