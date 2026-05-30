# AGENTS.md

Quick guidance for agents working in this repo.

## Commands

```sh
pnpm build        # production build
pnpm preview      # preview production build
pnpm check        # svelte-check + biome check --write (format included, use this instead of build or format for development)
pnpm test         # run unit tests (vitest) (use this for development)
pnpm db:push      # push schema changes to DB (interactively done by user)
```

## Overview

**Libiamo** is a language learning app (en/es/fr/ja) that simulates real scenarios (Reddit, Discord, email, iMessage, AO3). Users complete communication tasks to develop pragmatic language skills.

UI design:

Adopt a premium, silky-smooth retro editorial magazine aesthetic. Use a very light warm paper-colored base. Let headlines and section titles stand out naturally with elegant serif typography, while all body copy, navigation, controls, and functional UI text should use clean sans-serif fonts for readability.

The interface should feel refined, calm, tactile, and highly polished, with appropriate spacing, subtle borders, soft shadows, muted contrast, and smooth transitions. Avoid generic modern SaaS styling, loud gradients, harsh colors, or excessive decoration. The goal is a high-end magazine-like reading experience expressed as a fluid digital interface.

Key areas:

- Routes: `(app)/` authenticated learner pages (home, session, feedback, archive, review, translate, contribute, profile), `(auth)/`, `(admin)/`; `/api/review/` for review card CRUD.
- Server: `src/lib/server/` for auth, db, email, LLM, sessions, tasks, dates, MBTI, feedback, notes, review-cards (FSRS), archive, translate. `src/lib/admin/` for template/variant action helpers.
- Data model: templates are blueprints; template variants store `slotValues` + UI-specific `openingState`; scheduled tasks store resolved template text and a selected `variantId`; practice sessions/messages store chat runtime state; completed session gets feedback; feedback produces notes; notes spawn reviewCards (FSRS); reviewLogs track history. Separate things from this main workflow: templateContributions, translationAttempts.
- Scheduling: `src/lib/server/tasks.ts` auto-fills 3 weekly + 3 daily non-translation tasks per user language/date; weekly dates normalize to Monday and admin manual weeks use `YYYY-Www`. Cadence values include `weekly`, `daily`, `none`.
- Session prompts: `src/lib/server/session.ts` starts practice sessions, builds scenario context from variant `openingState`, prepends random MBTI persona at session start, and enforces target-language replies.
- LLM: calls are centralized in `src/lib/server/llm.ts` and use the official `openai` SDK with `baseURL` for both env and BYOK credentials.
    - `test/lib/server/llm.test.ts` stubs global `fetch`; this still works because the OpenAI SDK uses fetch under the hood.
- Auth: `hooks.server.ts` calls `auth.api.getSession()` and sets `event.locals`. `App.Locals` is in `src/app.d.ts`.
- i18n: custom `t(lang, key)` in `src/lib/i18n.ts` (no external library).
- Validation: Zod schemas in `src/lib/schemas.ts`, including admin form schemas and per-UI `openingState` schemas. Admin variant helpers validate slot coverage for `{{slot}}` placeholders.
- Constants: `src/lib/constants.ts` — single source of truth for enum values/types (`UiVariant`, `LanguageCode`, `InteractionType`, `Cadence`), labels, and language display-name helpers. Do not inline enum unions or duplicate language-name maps/helpers elsewhere.
- Markdown: when rendering markdown with Svelte's `{@html}`, use safe `renderMarkdown()` in `src/lib/markdown.ts` (or sanitize and test).
- Practice UI: reusable client code lives under `src/lib/components/practice-ui/`.
- UI: Tailwind v4, shadcn-svelte components, `cn()` for class merging in `src/lib/utils.ts`.
- Notifications: general app/admin/auth interfaces use `ActionNotification`/`ResponsiveNotification`; field-scoped form errors should use `FormErrorFocus` + `handleInvalidField` from `src/lib/form-attention.ts`.
- Svelte 5: runes mode (`$state`, `$props`, `$derived`, etc.); do not use Svelte 4 reactive syntax (`$:`, `export let`).

## Notes for agents

- Use tabs for indentation.
- Refer to `README.md` for core concepts.
- Run `pnpm check` and `pnpm test` before finishing changes. Write essential unit tests for new ts code but don't write too many.
- If stuck on a problem after 2-3 failed attempts, do not brutely retry. Search the web for solutions and come up with new approaches.
- Tests: `test/` mirrors `src/`. DB tests mock `$lib/server/db` via `vi.hoisted()`.
- **Time-dependent tests:** use fixed dates (e.g. `new Date(2025, 5, 11, 12, 0, 0)`) instead of `new Date()` to avoid midnight boundary flakiness.
- Pre-commit enforces conventional commits (`feat`, `fix`, `chore`, `test`, `ci`, `refactor`, `perf`, `docs`, `style`).
