# CLAUDE.md

Quick guidance for agents working in this repo.

## Commands

```sh
pnpm build     # production build
pnpm preview   # start server on production build
pnpm check     # svelte-check + biome check --write
pnpm format    # biome format --write
pnpm test      # run unit tests (vitest)
pnpm db:push   # push schema changes to DB (interactively done by user)
```

## Overview

**Libiamo** is a language learning app (en/es/fr/ja) that simulates real scenarios (Reddit, Discord, email, iMessage, AO3). Users complete communication tasks to develop pragmatic language skills.

Key areas:

- Routes: `(app)/` authenticated learner pages, `(auth)/`, `(admin)/`; `/translate` is a separate learner flow for `interactionType: "translate"`/`ui: "translator"`.
- Server: `src/lib/server/` for auth, db schemas, email, LLM, sessions, tasks, dates, MBTI prompts. `src/lib/admin/` holds shared admin template/variant action helpers.
- Data model: templates are blueprints; template variants store `slotValues` + UI-specific `openingState`; scheduled tasks store resolved template text and a selected `variantId`; practice sessions/messages store chat runtime state; translation attempts are separate from scheduled tasks.
- Scheduling: `src/lib/server/tasks.ts` auto-fills 3 weekly + 3 daily non-translation tasks per user language/date; weekly dates normalize to Monday and admin manual weeks use `YYYY-Www`. Cadence values include `weekly`, `daily`, `none`.
- Session prompts: `src/lib/server/session.ts` starts practice sessions, builds scenario context from variant `openingState`, prepends random MBTI persona at session start, and enforces target-language replies.
- Auth: `hooks.server.ts` calls `auth.api.getSession()` and sets `event.locals`. `App.Locals` is in `src/app.d.ts`.
- i18n: custom `t(lang, key)` in `src/lib/i18n.ts` (no external library).
- Validation: Zod schemas in `src/lib/schemas.ts`, including admin form schemas and per-UI `openingState` schemas. Admin variant helpers validate slot coverage for `{{slot}}` placeholders.
- Constants: `src/lib/constants.ts` — single source of truth for enum values/types (`UiVariant`, `LanguageCode`, `InteractionType`, `Cadence`) and labels. Do not inline enum unions.
- Markdown: when rendering markdown with Svelte's `{@html}`, use safe `renderMarkdown()` in `src/lib/markdown.ts` (or sanitize and test).
- Practice UI: reusable client code lives under `src/lib/components/practice-ui/`; Discord is the implemented chat UI, with other UI variants scaffolded/validated.
- UI: Tailwind v4, shadcn-svelte components, `cn()` for class merging in `src/lib/utils.ts`.
- Svelte 5: runes mode (`$state`, `$props`, `$derived`, etc.); do not use Svelte 4 reactive syntax (`$:`, `export let`).

## Notes for agents

- Use tabs for indentation.
- Run `pnpm format`, `pnpm check` and `pnpm test` before finishing changes. Write essential unit tests for new ts code but don't write too many.
- If stuck on a problem after 2-3 failed attempts, do not brutely retry. Search the web for solutions and come up with new approaches.
- Refer to `docs/ROADMAP.md` and `README.md` for roadmap and core concepts.
