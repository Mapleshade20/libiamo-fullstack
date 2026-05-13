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

## Building

To create a production version of your app:

```sh
pnpm build
```

You can preview the production build with `pnpm preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Core Concepts

Roles
- learner: browse tasks, view background materials, and complete sessions
- admin: create and manage templates and variants, and schedule tasks

Template vs Template Variant vs Task
- Template: the reusable content blueprint. Key columns now include:
  - interactionType (enum: chat, oneshot, slow, translate)
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
- Opening state shapes are validated in TypeScript with per-UI Zod schemas.
- materialsMd is authored in Markdown and rendered at display time (use a safe renderer / sanitizer in production).

## Features

### Profile Photo

Libiamo uses [Cravatar](https://cravatar.cn) (a Gravatar mirror) to manage user profile photos. Users only need to create their profile on Gravatar and then it will be automatically synced here.
