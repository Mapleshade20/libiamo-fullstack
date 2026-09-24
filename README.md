# Libiamo

Language learning app that simulates real social interactions (Reddit, Discord, email, etc.) using LLM agents. Users complete communication tasks to develop pragmatic language skills.

## Tech Stack

- Fullstack with SvelteKit (SSR, MPA architecture) and Svelte 5
- pnpm
- Biome (format + lint)
- Zod (validation)
- Drizzle ORM + PostgreSQL
- TailwindCSS v4 + shadcn-svelte
- better-auth (email/password, SMTP for signup verification emails)

## Developing

Once you've created a project and installed dependencies with `pnpm install`, start a live server:

```sh
pnpm dev
```

Optional LLM debugging: set `LLM_DEBUG=true` in `.env` to print OpenAI-compatible request and response bodies to the server console. API keys are not logged.

Trial quota: `TRIAL_TOKEN_BUDGET` in `.env` controls the starting output-token grant for new non-BYOK users. Provider-reported completion usage is deducted in full, including reasoning or thinking tokens. Existing user quota balances are stored in the database and are not changed by editing the env var.

## Building

To create a production version of your app:

```sh
pnpm build
```

You can preview the production build with `pnpm preview`.

## Deploying

Libiamo ships as a container image published to `ghcr.io/mapleshade20/libiamo`.

Production uses rootless Podman with systemd-managed quadlet units — the app and
Postgres 18 share one pod, and nothing but port 3000 is exposed:

```sh
scp -r deploy/podman/ user@server:~/libiamo-deploy
ssh user@server 'bash ~/libiamo-deploy/install.sh'
```

A Compose file is also provided for local trials and for Podman < 5.0:

```sh
cp .env.docker.example .env.docker   # then fill in every CHANGE_ME
podman compose --env-file .env.docker up -d
```

Either way the schema is created on first boot. See [DEPLOYMENT.md](./DEPLOYMENT.md)
for reverse-proxy configuration, updates and rollback, and backups.

## Core Concepts

Roles
- learner: browse tasks, view background materials, and complete sessions
- admin: create and manage tasks, and curate lineups

Quest Hall
- The authenticated root `/` presents the current daily and weekly lineups, translation tasks, and unread replies through the responsive Quest Menu.
- Chat and translation tasks share the book-beside-sheet Quest Menu presentation at their canonical `/task/[id]` URL; the translation workflow lives under `/task/[id]/translation`. Workflow exits always return to that resource; there is no storage-dependent detail routing or persisted scroll position.
- Catalog section, page, and translation year are URL state. Detail-to-catalog navigation derives the selected task's catalog position. The `/task` root redirects to Quest Hall; legacy root preparation queries redirect to canonical details.
- Each target language stores a self-assigned proficiency level: level 1 corresponds to A2–B1, level 2 to B2–C1, and level 3 to C2+. Recommendations preserve unread and in-progress work, then prefer tasks closest to the active language's level.

Task, lineup, and attempt
- Task: a flat, static, editable piece of content. `interactionType` (chat, translate) decides which fields apply: chat tasks carry the agent prompt, UI opening state, urgency, and max turns; translation tasks carry reference paragraphs and context. Edits apply live; nothing is snapshotted into sessions.
- Lineup: a dated distribution of tasks (`lineup` + `lineup_task`), currently one per language for each day and each ISO week. Missing slots are auto-filled up to 3 tasks from `lineup_rotation`, least recently lined up first; admins can add tasks manually. A task may appear in many lineups.
- Attempt: practice sessions and translation attempts reference the task and, optionally, the lineup entry they were started from. Completion is scoped to that entry, so a task that reappears in a later lineup can be done again. `?lineup=` pins a task URL to one entry's attempt.

Validation and UI
- Opening state shapes are validated in TypeScript with per-UI Zod schemas. AO3 opening states support work metadata plus nested `previousComments` so learners can reply at any thread depth.
- Practice UI components live under `src/lib/components/practice/ui/`; Reddit, Apple Mail, Discord, iMessage, and AO3 are implemented for active sessions.
- materialsMd is authored in Markdown and rendered at display time (use a safe renderer / sanitizer in production).

## Features

### Profile Photo

Libiamo uses [Gravatar](https://gravatar.com) to display user profile photos.
