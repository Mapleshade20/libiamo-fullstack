# CLAUDE.md

Quick guidance for agents working in this repo.

## Commands

```sh
pnpm dev       # start dev server
pnpm build     # production build
pnpm preview   # start server on production build
pnpm check     # svelte-check + biome check --write
pnpm lint      # biome lint
pnpm format    # biome format --write
pnpm test      # run unit tests (vitest)
pnpm db:push   # push schema changes to DB (interactively done by user)
```

## Overview

**Libiamo** is a language learning app (en/es/fr/ja) that simulates social platforms (Reddit, Discord, email, iMessage, AO3). Users complete communication tasks to develop pragmatic language skills.

Key areas:

- Routes: `(app)/` (authenticated pages; redirects to `/sign-in`), `(auth)/`, `(admin)/`.
- Server (src/lib/server/): auth, db/schema, db/auth.schema (auto-generated + manual edits), email, tasks (auto-scheduling + admin scheduler).
- Auth: `hooks.server.ts` calls `auth.api.getSession()` and sets `event.locals`. `App.Locals` is in `src/app.d.ts`.
- i18n: custom `t(lang, key)` in `src/lib/i18n.ts` (no external library).
- Validation: Zod schemas in `src/lib/schemas.ts`.
- Constants: `src/lib/constants.ts` — single source of truth for all enum values, types (`UiVariant`, `LanguageCode`, `InteractionType`, `Cadence`), and display labels. All other files import from here; never inline enum unions.
- Markdown: when rendering Markdown with Svelte's `{@html}`, always use the safe `renderMarkdown()` in `src/lib/markdown.ts`. If you intentionally need to allow raw HTML, explicitly sanitize the output (for example with DOMPurify) and add a unit test proving the sanitization.
- UI: Tailwind v4, shadcn-svelte components, `cn()` for class merging in `src/lib/utils.ts`.
- Svelte 5: runes mode (`$state`, `$props`, `$derived`, etc.); do not use Svelte 4 reactive syntax (`$:`, `export let`).

## Notes for agents

- Use tabs for indentation.
- Run `pnpm format`, `pnpm check` and `pnpm test` before finishing changes. Write unit tests for additional "server.ts" code.
- Use context7-mcp tool for svelte or package docs/lookups when stuck on problems.
- Refer to `docs/DB.md`, `docs/ROADMAP.md`, and `README.md` for schema, roadmap, and core concepts.
