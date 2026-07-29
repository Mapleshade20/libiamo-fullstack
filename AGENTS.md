# AGENTS.md

Quick guidance for agents working in this repo.

## Commands

```sh
pnpm build        # production build
pnpm preview      # preview production build
pnpm check        # svelte-check + biome check --write (format included, use this instead of build or format for development)
pnpm test         # run unit tests
pnpm db:generate --name migration_name  # generate a migration script (needs tty)
pnpm db:migrate   # apply migration scripts
```

## Overview

**Libiamo** is a language learning app (en/es/fr/ja) that simulates real scenarios (Reddit, Discord, email, iMessage, AO3). Users complete communication tasks to develop pragmatic language skills.

UI design:

Adopt a premium, silky-smooth retro editorial magazine aesthetic. Use a very light warm paper-colored base. Let headlines and section titles stand out naturally with elegant serif typography, while all body copy, navigation, controls, and functional UI text should use clean sans-serif fonts for readability.

The interface should feel refined, calm, tactile, and highly polished, with appropriate spacing, subtle borders, soft shadows, and muted contrast. Avoid generic modern SaaS styling, loud gradients, harsh colors, or excessive decoration. Utilize smooth, continuous transition animations without abrupt flashes or large layout jumps. The goal is a high-end magazine-like reading experience expressed as a fluid digital interface.

## Key areas

- Routes: `(app)/` authenticated learner pages (home, session, feedback, archive, review, translate, contribute, profile), `(auth)/`, `(admin)/`; `/api/review/` exposes Note-based due/stats/rating endpoints.
- Quest Hall owns both scheduled practice quests and the translation-template catalog. Translation templates appear below This Week; the catalog loads once and creation-month switching stays in client state without URL navigation. `/translate` plus `/task` roots redirect to `/`; their `[id]` routes remain the task detail/workflow entry points.
- Server: `src/lib/server/` for auth (`auth/`), scheduling (`scheduling/`), db, LLM, sessions, feedback, notes, Note-based review/FSRS, archive, translate. `src/lib/admin/` for template/variant action helpers.
- Data model: templates are blueprints; template variants store `slotValues` + UI-specific `openingState`; scheduled tasks store resolved template text and a selected `variantId`; practice sessions/messages store chat runtime state; completed session gets feedback; all feedback paths create FSRS Notes with a target-language `vocab`, target/native dictionary definitions, and four natural bilingual examples in one JSON column; reviewLogs reference Notes directly. There is no Note exercise-variant table or persisted example rotation state. Separate things from this main workflow: templateContributions and translation attempts.
- Scheduling: `src/lib/server/scheduling/tasks.ts` auto-fills 3 weekly + 3 daily non-translation tasks per user language/date; weekly dates normalize to Monday and admin manual weeks use `YYYY-Www`. Cadence values include `weekly`, `daily`, `none`.
- Session prompts: `src/lib/server/session.ts` starts practice sessions, builds scenario context from variant `openingState`, prepends random MBTI persona at session start, enforces target-language replies, and owns session message ordering helpers.
- LLM: calls are centralized in `src/lib/server/llm.ts` and use the official `openai` SDK with `baseURL` for both env and BYOK credentials.
    - `test/lib/server/llm.test.ts` stubs global `fetch`; this still works because the OpenAI SDK uses fetch under the hood.
    - Structured calls use the object-form `chatJson({ schema, messages, ... })`, which returns parsed `value` plus provider metadata and performs at most one targeted repair; truncation is never repaired.
- Translation evaluation LLM contracts live in `src/lib/server/translation-evaluation/` (schemas, prompts, validation, Gen1/verifiers/Gen2, restricted Diff parser). Shared serializable grades/Diff AST types live in `src/lib/translation-evaluation/types.ts`; model Diff markup is never rendered directly.
- Production translation workflow services live in `translation-workflow.ts` and `translation-practice.ts`. The route split is detail `/translate/[id]`, immutable first draft `/attempt`, and phase-driven evaluation `/feedback`; URLs never expose attempt IDs. `translationAttempt.workflowPhase` is authoritative while card, second-draft, and transfer details stay in a versioned tab-scoped snapshot.
- Translation transfer and `/review` choose an ordinary random Note example for each display. Transfer snapshot queue entries hold Note/example indexes; Incorrect moves the Note to the queue tail without an attempt cap, while Pass removes it.
- The dev-only `/translate-eval-live-demo` route runs the production translation-evaluation services without persisting attempts and exposes exact request/response artifacts for qualitative prompt review.
- Correction Verifier uses only the current card's trusted context; Second Draft Verifier instead appends to the successful Generation 1 history. Keep these context strategies separate.
- Detailed translation-evaluation protocol decisions and implementation history belong in `docs/plans/2026-07-15-redesign-translate-eval.md`, not this file.
- Auth: `hooks.server.ts` calls `auth.api.getSession()` and sets `event.locals`. `App.Locals` is in `src/app.d.ts`.
- i18n: custom `t(lang, key)` in `src/lib/i18n.ts` (no external library).
- Validation: Zod schemas live in `src/lib/schemas/` with `index.ts` re-exporting the public API. Admin variant helpers validate slot coverage for `{{slot}}` placeholders.
- Constants: `src/lib/constants.ts` — single source of truth for enum values/types (`UiVariant`, `LanguageCode`, `InteractionType`, `Cadence`), labels, and language display-name helpers. Do not inline enum unions or duplicate language-name maps/helpers elsewhere.
- Markdown: when rendering markdown with Svelte's `{@html}`, use safe `renderMarkdown()` in `src/lib/markdown.ts` (or sanitize and test).
- Practice UI: reusable client code lives under `src/lib/components/practice-ui/`; browser-only helpers live in `src/lib/client/`; shared feedback types live in `src/lib/feedback/`.
- Flashcard study UI: transfer and `/review` share `src/lib/components/review/StudyCard.svelte`; queue categories/counting use `StudyQueueKind` helpers in `src/lib/review.ts`. Keep answer reveal geometry stable by hiding pre-rendered answer slots rather than conditionally mounting them. `/review` uses Anki's default `1m 10m` / `10m` explicit steps and 20-minute Learn ahead: due Learning cards precede the main queue, future in-window Learning cards follow it, and response `due` values drive client reordering until graduation.
- Note browsing and editing lives at `/review/manage`, backed by `src/lib/server/note-management.ts`; it searches and filters all user languages and owns content/example edits, due-day offsets, scheduling reset, and deletion. Archive is an activity history and must not expose Note editing.
- Translation feedback shell: `(app)/+layout.svelte` owns the page's only `<main>`, width, and padding. Feedback/demo pages must not add a nested main or duplicate outer padding; their Waiting/Completed stages use `100dvh - 8rem` for the shell's available height.
- UI: Tailwind v4, shadcn-svelte components, `cn()` for class merging in `src/lib/utils.ts`.
- Navigation transitions: root `+layout.svelte` owns the View Transitions API lifecycle. Navbar links set one-shot directional intent through `src/lib/client/page-transition.ts`; same-path query/hash updates skip document transitions, stable sibling shells can keep named controls fixed while their content fades, and other navigations use the fast fade. App/admin layouts expose the shared `page-content` snapshot name, while session pages remain outside it. Review Study/Manage share their heading, language selector, tabs, and max-width through `routes/(app)/review/+layout.svelte`.
- Notifications: general app/admin/auth interfaces use `ActionNotification`/`ResponsiveNotification`; field-scoped form errors should use `FormErrorFocus` + `handleInvalidField` from `src/lib/client/form-attention.ts`.
- Svelte 5: runes mode (`$state`, `$props`, `$derived`, etc.); do not use Svelte 4 reactive syntax (`$:`, `export let`).

## Codebase conventions

- Use tabs for indentation.
- Refer to `README.md` for core concepts.
- Run `pnpm check` and `pnpm test` before finishing changes. Write essential unit tests for new ts code but don't write too many.
- Tests: `test/` mirrors `src/`. DB tests mock `$lib/server/db` via `vi.hoisted()`.
    - Time-dependent tests: use fixed dates (e.g. `new Date(2025, 5, 11, 12, 0, 0)`) instead of `new Date()` to avoid midnight boundary flakiness.
    - Do not build prompt tests from piles of `toContain()` assertions against fixed prose. Test message roles/order, structured JSON payloads, schemas, and behavioral invariants instead; review qualitative wording through the live-model harness.
- Pre-commit enforces conventional commits (`feat`, `fix`, `chore`, `test`, `ci`, `refactor`, `perf`, `docs`, `style`).
- The repository follows an issue-plan-implement workflow. Issues and plans are at `docs/`. An issue should present "what to do", which is a detailed description of new features to implement and bugs to fix. Its corresponding plan records "how to do", which goes through technical decisions, implementation specs and work stages.
    - Issue's frontmatter: `title`, `type` (bug / feature / ux / performance / accessibility / security / tech-debt / test) `link` (a GitHub issue link), `status` (needs-review / needs-plan / implementing / done),
    - Plan's frontmatter: `title`, `related-issue` (a path of the issue from project root)
