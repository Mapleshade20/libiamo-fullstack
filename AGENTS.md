# AGENTS.md

Quick guidance for agents working in this repo. See README.md for core concepts.

## What belongs here

Keep this file selective. Record only technical designs, constraints, and non-obvious details that future work will repeatedly need to use or consider, especially when not knowing them would lead to an incorrect implementation. Do not record every technical detail, completed change, component description, styling choice, or fact readily discoverable from the code. Put implementation history and task-specific detail in design/writeup documentation. Consolidate related rules and remove obsolete or low-value entries instead of continually appending.

## Commands

```sh
pnpm build        # production build
pnpm check        # svelte-check + biome check --write (format included; use for development)
pnpm test         # run unit tests
pnpm db:generate --name migration_name  # generate a migration script (needs tty)
pnpm db:migrate   # apply migration scripts
```

## Product and design

**Libiamo** is a language learning app (en/es/fr/ja) that simulates real communication scenarios.

Use a refined retro editorial magazine aesthetic: a light warm paper base, elegant serif headings, and clean sans-serif body text and controls. Prefer calm spacing, subtle borders, soft shadows, and muted contrast. Avoid generic SaaS styling, loud gradients, harsh colors, excessive decoration, and abrupt layout changes.

- Use native Svelte/CSS motion and existing shared components. Honor reduced motion, visible keyboard focus, and 44px interaction targets; clean up timers/listeners.
- Reserve loading and answer-reveal geometry. Use `LoadingReveal.svelte` at loading boundaries; pre-render hidden answer slots rather than conditionally mounting them. Typewriter copy must reserve its full geometry and expose the full sentence to assistive technology.
- Separate scroll ownership from focus (`preventScroll`). Forward menu/detail navigation goes to the top; in-app back must not replay stale browser-restored offsets.

## Architecture and invariants

### Quest Hall and navigation

- The authenticated root `/`, `/task/[id]`, and `/translate/[id]` share the book-beside-sheet interface. The app layout owns a persistent `QuestMenuRoute.svelte` through `App.PageData.questMenu`; page components only render metadata. Never remount or key the book by task/URL.
- Details use server route data. Return links derive synchronously from task identity, with no persisted return-context or scroll offsets. Catalog URLs hold section/leaf/year; deriving a task's catalog position must not require current-edition membership.
- Book-to-book routes skip document view transitions and use the existing book timeline from `afterNavigate`, retaining outgoing preparation until completion/resize. Shallow popstate and cross-route navigation must not start competing timelines. Resize may settle a turn without firing its completion callback, so navigation scrolling must not depend on that callback.
- Static book pages and turning copies must have identical geometry. Disable controls during turns instead of unmounting them, or the sheet handoff will jump.
- Root `+layout.svelte` owns document view transitions; `client/page-transition.ts` owns one-shot navbar intent. Both responsive navigation rails share `main-nav`, whose snapshot stays above `page-content` without crossfading. Keep home-only controls outside the persistent book so details do not inherit them.
- The app layout owns the page's `<main>`, outer spacing, and `--app-bottom-nav-height` (including safe area, zero on wide screens). Fixed study footers must use that offset; pages must not add nested mains or duplicate shell padding.

### Data, review, and streak

- Templates are blueprints; variants supply `slotValues` and UI-specific `openingState`; scheduled tasks store resolved text and the selected variant. Validate coverage of `{{slot}}` placeholders when editing variants.
- Feedback paths create FSRS Notes with target-language vocabulary, target/native dictionary definitions, and four bilingual examples. Review logs reference Notes directly; do not add persisted example rotation or exercise-variant state. Review/transfer choose a random example for display.
- Weekly scheduling normalizes dates to Monday; admin manual weeks use `YYYY-Www`.
- Transfer and `/review` share `StudyCard.svelte` and queue helpers. Review uses Anki's `1m 10m` / `10m` steps and 20-minute Learn ahead: due Learning cards precede the main queue, future in-window Learning cards follow it, and response due times drive client reordering until graduation.
- Every new Note becomes due on the learner's next local day (`insertNotes` requires `availableFrom`). Post-task transfer rates these cards with `rateNote(..., { outOfBand: true })`, which must not pull them into today's review queue. Transfer Incorrect moves a Note to the tail without an attempt cap; Pass removes it. Practice and translation share these rules through `transfer-queue.ts` and `server/transfer.ts`.
- Streak rules in `lib/streak.ts` take `today` explicitly. Only `server/streak.ts` writes streak state, within the transaction that claimed a completion. A day counts when a quest completes **and** the account-wide review queue is observed empty. Missed-day settlement is derived on read and materialized on write; loaders never write.
- Note editing belongs in `/review/manage`; Archive is activity history and must not expose Note editing.

### LLM and translation

- Centralize LLM calls in `server/llm.ts` for both environment and BYOK credentials. Structured calls use `chatJson({ schema, messages, ... })` with at most one targeted repair; never repair truncation.
- Translation evaluation contracts live in `server/translation-evaluation/`; shared grades/Diff AST types live in `translation-evaluation/types.ts`. Never render model Diff markup directly.
- Translation routes use task IDs, never attempt IDs. The first draft is immutable; `translationAttempt.workflowPhase` is authoritative, while card/second-draft/transfer details use a versioned tab-scoped snapshot.
- Correction Verifier uses only the current card's trusted context; Second Draft Verifier appends to successful Generation 1 history. Keep these strategies separate.
- Use `/translate-eval-live-demo` for qualitative prompt review against production services. Detailed protocol decisions belong in `docs/plans/2026-07-15-redesign-translate-eval.md`.

### Read safety and authentication

- Session/feedback GET loaders must never clear unread state: SvelteKit may preload them on hover. Return a snapshot receipt; `ConversationReadReceipt.svelte` acknowledges only on a mounted, visible page through authenticated `POST /api/unread`. Validate message ownership and advance the watermark monotonically without acknowledging newer arrivals.
- Primary login/recovery email is independent of OAuth emails. Verify a new mailbox before changing it. `auth/options.ts` must guard `/change-email` with an authoritative session younger than ten minutes because the built-in endpoint does not check freshness. Keep occupied-email responses non-enumerating; never enable unverified immediate changes.

## Implementation conventions

- Use Svelte 5 runes, not `$:` or `export let`. Use tabs for indentation.
- SSR-visible values must derive synchronously from server props; do not initialize them only in `$effect`/`onMount`. Browser-only sessionStorage restoration is separate from server-known state.
- Use `lib/display-clock.ts` for rendered dates/day comparisons and explicit timezones for timestamps. Its request-time snapshot and validated browser timezone prevent SSR/hydration disagreement; do not render from ambient `new Date()` or the machine's default timezone.
- Every internal URL and pathname comparison must include `base` from `$app/paths`. This includes links, form actions, fetches, and redirects. Better Auth needs the full mount point (`baseURL: ${ORIGIN}${base}/api/auth`, `basePath: "/"`); it only appends its default auth path when the base URL has no path.
- `lib/constants.ts` is the single source for enum values/types, labels, and language display-name helpers. Do not duplicate enum unions or language maps. Use the existing `t(lang, key)` localization API.
- Markdown passed to `{@html}` must use safe `renderMarkdown()` from `lib/markdown.ts` or be sanitized and tested.
- Reuse existing UI primitives: Tailwind v4, shadcn-svelte, `cn()`, and `ActionNotification`/`ResponsiveNotification`. Field errors use `FormErrorFocus` and `handleInvalidField` from `client/form-attention.ts`.

## Verification and documentation

- Run `pnpm check` and `pnpm test` before finishing code changes. Write essential tests for new TypeScript behavior; avoid redundant tests.
- Tests mirror `src/` under `test/`; DB tests mock `$lib/server/db` via `vi.hoisted()`. Use fixed dates for time-dependent tests to avoid midnight flakiness.
- Test semantics, navigation, accessibility, state behavior, and data relationships rather than freezing editorial/UI wording. Prompt tests should verify roles/order, structured inputs, schemas, and behavioral contracts rather than prose fragments or arbitrary words. Assert exact text only when it is a product/protocol contract.
- For big changes, use `docs/design/` for the proposed work and important decisions, then `docs/writeup/` for a concise human-readable account of what changed.
    - Design frontmatter: `title`, `type` (bug / feature / ux / performance / accessibility / security / tech-debt / test; may be multiple), `status` (needs-approval → wip → done; only a human may mark done).
    - Writeup frontmatter: `title`, `related-design` (path from project root).
    - Filename format: `YYYY-MM-DD-some-title.md`.
