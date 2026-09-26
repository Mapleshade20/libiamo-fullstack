---
title: One session foundation for the five practice surfaces
type: tech-debt, bug, ux, accessibility, test
status: wip
---

# One session foundation for the five practice surfaces

Issue #89. Mail, Discord, iMessage, Reddit and AO3 show the same session lifecycle through
deliberately different interfaces. The interfaces stay different; the lifecycle becomes one.

## Problem

- **Mail runs a parallel lifecycle.** It re-implements start, send, retry, completion and polling.
  It polls every 3 s only while a placeholder is visible, so work the server schedules later (paced
  bursts, idle follow-ups) never arrives after a reload. Its rich-text editor, formatting toolbar
  and HTML-to-layout summariser are far larger than the product needs.
- **The shared runtime is not neutral.** `session.svelte.ts` seeds a Discord member pool on every
  hydration and names the agent after a Discord handle, so an iMessage contact without opening
  history is called "ShadowHunter". Discord then seeds the same pool a second time.
- **Server content is not visible during SSR.** Every surface hydrates in `$effect`, so the
  server-rendered page is empty. Each surface then covers it with a 300 ms "Connecting…" splash.
- **Everything around the lifecycle is copied five times.** That covers the hint request state
  machine (about 70 lines each), the finish confirmation (English-only copy), the toast for mock
  controls, the session labels, and `existingSession: any` props.
- **Base path bugs.** Feedback navigation (`window.location.href = "/task/…"`) and the AO3 default
  icon (`/ao3/icon_user.png`) ignore `base`.
- **Layer violations.** `server/practice/*` imports thread and mail helpers from `components/`.
  AO3 and Reddit each have a server send-options module; the two are line-for-line copies.

## Decisions

### Shared contracts live in `lib/practice/`

Pure code that both the server and the surfaces use moves out of `components/`:

| Module | Holds |
| --- | --- |
| `practice/messages.ts` | `PersistedPracticeSession` (the loader's shape), `ChatMessage`, `buildChatMessages`, opening-message mapping. |
| `practice/comment-thread.ts` | Comment ids, reply targets, tree building, and the Reddit/AO3 opening-comment accessors. |
| `practice/mail.ts` | The mail wire format (`To:`/`Subject:` header + body), agent reply parsing, and the seeded fallback contact. |

`PracticeSurfaceProps` is the single prop contract of every root surface. The route renders a
`ui → component` map instead of five copies of the same eight props.

Placeholder messages carry state (`deliveryState`, `error`), not UI copy. Surfaces render their
own words for "reply failed", so a platform can keep its voice without the runtime knowing it.

### The runtime derives, then overlays

`createPracticeSession(() => props)` is platform-neutral: it knows nothing about names, colours or
member lists.

- **Server state is derived synchronously.** `messages` = opening messages + persisted messages,
  computed from props, so SSR and hydration render the same list and no splash is needed.
- **Local state is an overlay.** Optimistic sends (keyed by `clientMessageId`) are shown until the
  server snapshot contains that learner message. Every send, pending or failed, refreshes the
  snapshot, so server truth always wins. While a retry is in flight its failed placeholder is hidden.
- **Paced reveal is derived too.** Agent messages that arrive after mount and are not yet
  acknowledged are held back all but the first; a timer acknowledges them at typing pace. On the
  first render everything is already acknowledged, so reloads never replay history.
- **Polling uses `planAgentWorkPolling`** (placeholder or `nextAgentWorkDueAt`) for every surface,
  Mail included.
- **Completion** goes through one guarded `finish()` (manual confirm or turn-limit auto-finish) and
  `goto(`${base}/task/${id}/feedback`)`. Finishing requires at least one sent turn on every surface.
- The runtime owns the finish confirmation state and a hint controller. Surfaces render
  `FinishSheet` and their own trigger buttons.

Identity is supplied by the surface. The runtime resolves the counterpart from the opening
history and falls back to a name the surface passes in. Discord keeps its seeded member pool in
`ui/discord/`; Mail and iMessage fall back to the seeded contact in `practice/mail.ts`.

### One hint controller, one visible owner

`createHintAssist()` owns everything the five copies duplicated: open owner, trigger origin,
expression query, results, loading, error, and a request token. `toggle(owner, trigger, context)`
opens it for one editor. Opening another editor, closing, or unmounting the owner invalidates the
token, so a late response can never appear in the wrong editor. `HintFloatingPanel` reads the
controller directly and closes itself on outside clicks, so surfaces no longer need
`closest(".hint-…")` window handlers.

### Copy

Lifecycle copy (finish sheet, turns left, retry, reply failed, hints, "unavailable in this
simulation") moves to the global `t(lang, key)` under `practice.*`, rendered in the task language
as before. Per-surface `i18n.ts` files keep only platform vocabulary and lose their dead keys (the
old tutor-report modal strings, for example).

### Mail is rewritten, not migrated

The old Mail interface is replaced by a compact Apple Mail simulation built on the shared runtime:

- Wide screens: mailbox sidebar (Inbox / Sent), message list, reading pane. Medium screens drop the
  sidebar for a segmented mailbox switch. Narrow screens navigate list → message like iOS Mail.
- One composer (sheet on mobile, floating window on desktop) with a read-only recipient, subject,
  a plain-text body, the shared hint, and Send. The draft is kept in `localStorage` per task, as
  before. It is restored only into the composer and never overrides server messages.
- A failed reply shows one inline banner with Retry. Pending replies stay silent, as real mail does.
- **Plain text only.** The editor, the toolbar, `mailBodyHtml` metadata, the HTML layout summary in
  the agent transcript, and the matching prompt rule are removed. Old messages that carry
  `mailBodyHtml` still render from their plain `content`, which has always been stored. No schema
  or scheduling change.

### Surface cleanup

- **AO3:** work header/metadata, the comment form and the recursive comment move into components.
  Kudos, bookmark and hide-comments report "unavailable" instead of silently doing nothing. The
  default icon honours `base`.
- **iMessage:** conversation list, header, bubble list and composer become components. The
  grouping and receipt rules stay in `presentation.ts`.
- **Reddit:** the thread model stays. Editors use the shared hint controller, and the dead
  `replyingToId`/`isAgentTyping` props go. The feed no longer jumps to the page bottom after an
  inline reply.
- **Discord:** the structure stays. It seeds the member pool once from the session id, and message
  colours come from the author name instead of message fields.
- Icon-only controls get accessible names, decorative icons get `aria-hidden`, frequently used
  mobile controls get 44 px targets, and `scroll-smooth` becomes `motion-safe:scroll-smooth`.

### Preparing for guided ("immersive translation") turns

A later mode will tell the learner what to express next inside the same surfaces. This refactor
leaves one seam for it rather than building it now:

- Every surface sends through `session.send(text, options)`, and every composer is an owner of the
  session's assist controller. Guided mode can put a per-turn brief into the same anchored panel,
  and attach the brief id to `send` options, without touching platform markup.
- Session state is derived from the loader, so a per-turn brief added to `PersistedPracticeSession`
  flows to every surface through one type.

## Non-goals

No new platform features, no visual redesign of Discord/iMessage/Reddit/AO3, no change to server
session, scheduling, quota or feedback semantics, no schema change.

## Verification

- Unit tests: runtime overlay/reveal/polling/finish, hint controller ownership and stale
  responses, mail wire format, shared thread send options.
- DOM tests (`*.dom.test.ts`, a jsdom vitest project with browser conditions) mount every root
  surface. They cover SSR-visible state, hydration, submission, pending work, delivered messages
  and completion.
- `pnpm check`, `pnpm test`, `pnpm build`, a `BASE_PATH=/libiamo pnpm build`, `git diff --check`,
  and desktop/mobile browser passes over all five surfaces.
