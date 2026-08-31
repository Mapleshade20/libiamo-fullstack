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

Trial quota: `TRIAL_TOKEN_BUDGET` in `.env` controls the starting visible-output token grant for new non-BYOK users. Existing user quota balances are stored in the database and are not changed by editing the env var.

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
- admin: create and manage templates and variants, and schedule tasks

Template vs Template Variant vs Task
- Template: the reusable content blueprint. Key columns now include:
  - interactionType (enum: chat, slow, translate)
  - cadence (enum: weekly, daily)
  - objectivesBase (text[] — ordered by array index)
  - materialsMd (Markdown background material)
  - tags

- TemplateVariant: a new per-template row that holds variant-specific data used at scheduling and runtime:
  - slotValues (jsonb): values that replace {{slot}} placeholders
  - openingState (jsonb): UI-specific initial state validated by per-UI Zod schemas

- Task: a scheduled instance created from a template + selected variant. Tasks record variantId and store resolved fields.

Scheduling and recurrence
- Amounts: the app schedules 3 weekly tasks (per-week, date normalized to Monday) and 3 daily tasks (per-day).
- Auto-scheduling: when a user requests tasks for a date and the quota isn't met, the scheduler queries active templates and fills missing tasks. Instead of a denormalized lastScheduledAt column, templates are prioritized by their most recent task date so templates with no recent tasks are scheduled first.
- Variant selection: when creating a task the system selects one active variant at random and resolves slots from variant.slotValues. Templates without explicit slots must still have at least one active variant.

Persona & agent prompt
- Persona selection happens at practice session start: a random MBTI-based persona prefix is prepended to the task's resolved agent prompt and saved in the session prompt snapshot.

Validation and UI
- Opening state shapes are validated in TypeScript with per-UI Zod schemas. AO3 variants support work metadata plus nested `previousComments` so learners can reply at any thread depth.
- Practice UI components live under `src/lib/components/practice-ui/`; Discord, iMessage, and AO3 are implemented for active sessions.
- materialsMd is authored in Markdown and rendered at display time (use a safe renderer / sanitizer in production).

## Features

### Profile Photo

Libiamo uses [Gravatar](https://gravatar.com) to display user profile photos.
