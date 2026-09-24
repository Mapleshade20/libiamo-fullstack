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

- The authenticated root `/` and `/task/[id]` (chat and translation alike) share the book-beside-sheet interface. The app layout owns a persistent `QuestMenuRoute.svelte` through `App.PageData.questMenu`; page components only render metadata. Never remount or key the book by task/URL.
- Quest progress has one vocabulary for both task types: `questState`/`translationState` in `quest-hall/menu.ts` map to ready / active (conversation or draft) / reviewing (unfinished evaluation page) / finished / stopped. Recommendations, catalog and both details pages render it only through `QuestMenuStatusMark`; do not add per-surface badges. Unfinished evaluation pages offer no link back to the task.
- Details use server route data. Return links derive synchronously from task identity, with no persisted return-context or scroll offsets. Catalog URLs hold section/leaf/year; deriving a task's catalog position must not require current-lineup membership.
- Book-to-book routes skip document view transitions and use the existing book timeline from `afterNavigate`, retaining outgoing preparation until completion/resize. Shallow popstate and cross-route navigation must not start competing timelines. Resize may settle a turn without firing its completion callback, so navigation scrolling must not depend on that callback.
- Static book pages and turning copies must have identical geometry. Disable controls during turns instead of unmounting them, or the sheet handoff will jump.
- Root `+layout.svelte` owns document view transitions; `client/page-transition.ts` owns one-shot navbar intent. Both responsive navigation rails share `main-nav`, whose snapshot stays above `page-content` without crossfading. Keep home-only controls outside the persistent book so details do not inherit them. The navbar sweep's old/new snapshots share `--page-sweep-duration`/`--page-sweep-ease` so both pages travel as one strip at a constant offset; the curve must start fast, since an eased-in start is indistinguishable from a delay after the click. The sweep slides less than a page, so the two snapshots always overlap: keep `--page-enter-fade`/`--page-exit-fade` short and keep the page snapshot's own `bg-background` paper, or the outgoing page stays legible through the incoming one.
- The app layout owns the page's `<main>`, outer spacing, and `--app-bottom-nav-height` (including safe area, zero on wide screens). Fixed study footers must use that offset; pages must not add nested mains or duplicate shell padding.

### Data, review, and streak

- Content, distribution and attempts are separate layers. `task` is flat, static and edited in place; sessions read it live (agent prompt, UI, urgency, max turns), so never snapshot task content into attempts. `lineup`/`lineup_task` distribute tasks and must not copy them; keep distribution vocabulary kind-agnostic so translation tasks can join lineups later.
- Attempts (`practice_session`, `translation_attempt`) carry `task_id` plus a nullable `lineup_id` referencing the `lineup_task` entry; completion is unique per `(user, task, lineup)`, which is what lets a reappearing task be redone. Resolve which attempt to show only through `resolveRequestLineup` + `pickShownAttempt`: `?lineup=` pins exactly that entry (Archive/unread links must pin), otherwise unfinished attempts win over the current lineup's.
- Feedback paths create FSRS Notes with target-language vocabulary, target/native dictionary definitions, and four bilingual examples. Review logs reference Notes directly; do not add persisted example rotation or exercise-variant state. Review/transfer choose a random example for display.
- Weekly lineups start on Monday of the learner's browser-timezone ISO week; admin manual weeks use `YYYY-Www`. Auto-fill locks the lineup row, so concurrent loaders cannot overfill it.
- Transfer and `/review` share `StudyCard.svelte` and queue helpers. Review uses Anki's `1m 10m` / `10m` steps and 20-minute Learn ahead: due Learning cards precede the main queue, future in-window Learning cards follow it, and response due times drive client reordering until graduation. Review cards are day-granular: every scheduling write aligns their due to the start of the learner's local day, and Learn ahead must cover the longest learning step, so an empty queue means the whole day's reviews are done.
- Every new Note becomes due on the learner's next local day (`insertNotes` requires `availableFrom`). Post-task transfer rates these cards with `rateNote(..., { outOfBand: true })`, which must not pull them into today's review queue. Transfer Incorrect moves a Note to the tail without an attempt cap; Pass removes it. Practice and translation share these rules through `transfer-queue.ts` and `server/transfer.ts`.
- A practice quest completes when its evaluation page reaches `evaluationPhase = "completed"` (after the final card pass), not when the conversation ends; credit only from the guarded transitions in `server/practice-evaluation.ts`. Both evaluation pages drive the pass through `TransferPass.svelte`.
- Streak rules in `lib/streak.ts` take `today` explicitly. Only `server/streak.ts` writes streak state, within the transaction that claimed a completion. A day counts when a quest completes **and** the account-wide review queue is observed empty. Missed-day settlement is derived on read and materialized on write; loaders never write.
- Note editing belongs in `/review/manage`; Archive is activity history and must not expose Note editing.

### LLM and translation

- Centralize LLM calls in `server/llm.ts` for both environment and BYOK credentials. Structured calls use `chatJson({ schema, messages, ... })` with at most one targeted repair; never repair truncation.
- Translation evaluation contracts live in `server/translation-evaluation/`; shared grades/Diff AST types live in `translation-evaluation/types.ts`. Never render model Diff markup directly.
- Translation routes use task IDs, never attempt IDs. The first draft is immutable; `translationAttempt.workflowPhase` is authoritative, while card/second-draft/transfer details use a versioned tab-scoped snapshot.
- Correction Verifier uses only the current card's trusted context; Second Draft Verifier appends to successful Generation 1 history. Keep these strategies separate.
- Development-only demos live in the `(app)/(demo)` route group (URLs unchanged) and each 404s outside `dev` in its own load and actions. Use `/translate-eval-live-demo` for qualitative prompt review against production services. Detailed protocol decisions belong in `docs/plans/2026-07-15-redesign-translate-eval.md`.

### Read safety and authentication

- Session/feedback GET loaders must never clear unread state: SvelteKit may preload them on hover. Return a snapshot receipt; `ConversationReadReceipt.svelte` acknowledges only on a mounted, visible page through authenticated `POST /api/unread`. Validate message ownership and advance the watermark monotonically without acknowledging newer arrivals.
- Primary login/recovery email is independent of OAuth emails. Verify a new mailbox before changing it. `auth/options.ts` must guard `/change-email` with an authoritative session younger than ten minutes because the built-in endpoint does not check freshness. Keep occupied-email responses non-enumerating; never enable unverified immediate changes.

## Implementation conventions

- Use Svelte 5 runes, not `$:` or `export let`. Use tabs for indentation.
- SSR-visible values must derive synchronously from server props; do not initialize them only in `$effect`/`onMount`. Browser-only sessionStorage restoration is separate from server-known state. Slow third-party probes are the exception (`/profile/avatar-status`): self-hosted reverse proxies buffer, so streamed `load` promises cannot be relied on. Probe from a client endpoint and resolve every failure to a definite value instead of stranding the pending copy.
- Use `lib/display-clock.ts` for rendered dates/day comparisons and explicit timezones for timestamps. Its request-time snapshot and validated browser timezone prevent SSR/hydration disagreement; do not render from ambient `new Date()` or the machine's default timezone.
- Every internal URL and pathname comparison must include `base` from `$app/paths`. This includes links, form actions, fetches, and redirects. Better Auth needs the full mount point (`baseURL: ${ORIGIN}${base}/api/auth`, `basePath: "/"`); it only appends its default auth path when the base URL has no path.
- `lib/constants.ts` is the single source for enum values/types, labels, and language display-name helpers. Do not duplicate enum unions or language maps. Use the existing `t(lang, key)` localization API.
- Markdown passed to `{@html}` must use safe `renderMarkdown()` from `lib/markdown.ts` or be sanitized and tested.
- Reuse existing UI primitives: Tailwind v4, shadcn-svelte, `cn()`, and `ActionNotification`/`ResponsiveNotification`.
- Expand/collapse disclosures must use `Accordion.svelte`; anchored dropdowns/popovers must use `FloatingPanel.svelte` and its `floating-menu-item` styles. These own the transitions.dev motion recipes, reduced-motion behavior and accessible interaction; do not copy local animations or click-outside handlers.
- All invalid-submission feedback must use `client/form-attention.ts`: root layout handles native constraints, `FormErrorFocus` handles server field errors, and `showValidationIssues`/`validateBeforeSubmit` handle custom/schema editors. Associate inline messages with `data-field-error="fieldName"` and nested controls with `data-feedback-name`. Errors shake on rejection and fade on editing, including repeated identical failures. Never shake inputs for provider/network/permission/workflow errors.

## Verification and documentation

- Run `pnpm check` and `pnpm test` before finishing code changes. Write essential tests for new TypeScript behavior; avoid redundant tests.
- Use chrome to debug and verify changes.
- Tests mirror `src/` under `test/`; DB tests mock `$lib/server/db` via `vi.hoisted()`. Use fixed dates for time-dependent tests to avoid midnight flakiness.
- Test semantics, navigation, accessibility, state behavior, and data relationships rather than freezing editorial/UI wording. Prompt tests should verify roles/order, structured inputs, schemas, and behavioral contracts rather than prose fragments or arbitrary words. Assert exact text only when it is a product/protocol contract.
- For big changes, use `docs/design/` for the proposed work and important decisions, then `docs/writeup/` for a concise human-readable account of what changed.
    - Design frontmatter: `title`, `type` (bug / feature / ux / performance / accessibility / security / tech-debt / test; may be multiple), `status` (needs-approval → wip → done; only a human may mark done).
    - Writeup frontmatter: `title`, `related-design` (path from project root).
    - Filename format: `YYYY-MM-DD-some-title.md`.
