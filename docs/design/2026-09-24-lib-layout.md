---
title: Reorganize src/lib by domain
type: tech-debt
status: wip
---

# Reorganize `src/lib` by domain

## Problem

`src/lib` has ~300 files and no single rule tells you where a file belongs. Three layouts are
mixed together:

- **Flat top-level files** (`note.ts`, `review.ts`, `streak.ts`, `streak-history.ts`,
  `task-attempts.ts`, `unread.ts`, `quest-hall.ts` next to `quest-hall/`, …) with no grouping.
- **`components/`** mixes app-wide primitives (`Accordion`, `ModalDialog`), app chrome (`Navbar`),
  domain screens (`TaskForm`, `ProfileNameEditor`) and feature folders, and uses several names for
  one domain: `translate/`, `translate-evaluation/`, and tests under `translation-evaluation/`;
  `task/TaskPreparation` is the *practice* preparation screen; `learning-feedback/` is practice
  feedback only.
- **`server/`** is mostly flat with prefixes standing in for folders: `translation.ts`,
  `translation-workflow.ts`, `translation-practice.ts`, `translation-preparation.ts` beside
  `translation-evaluation/`; `note.ts` / `note-management.ts` / `review.ts` / `transfer.ts` /
  `vocabulary-note-rules.ts` are one domain spread across five names.

Concrete traps a newcomer falls into today:

| Symptom | Example |
| --- | --- |
| Same name, different things | `server/translate.ts` is the *practice* chat translation helper (`TranslateModal`), not translation tasks (`interactionType: "translate"`). |
| Same concept, three files | `browser-timezone.ts`, `client/browser-timezone.ts`, `server/browser-timezone.ts` (the server one is a pure 3-line cookie read). |
| Same name, no layer rule | `streak-presentation.ts` and `client/streak-presentation.svelte.ts` are unrelated modules; nothing says what a top-level file owes its `server/` namesake. |
| Domain code inside another domain's folder | Generic chat session (`session.svelte.ts`) imports `ChatUser`/`initUserPool` from `practice-ui/discord/`. |
| `client/` is a dumping ground | Holds app-wide infrastructure (`form-attention`) next to single-consumer helpers used by exactly one component (`hover-marquee`, `translation-highlight`, four `streak-*`). |
| Generic buckets | `components/utils/{emoji,markdown,message,session}Utils.ts` all serve only the practice chat UIs. |
| Dev-only / route-only code in `lib` | `translation-evaluation/live-demo-fixture.ts` (only the demo route), `welcome/product-evidence.ts` (only `/welcome`). |
| Inconsistent file naming | `chatMessages.ts`, `apiService.ts`, `mailUtils.ts`, `requestLifecycle.ts` vs kebab-case everywhere else. |
| Dead code | `lib/index.ts` (template comment), `components/practice-ui/types.ts` (comment only), `clearAcknowledgedStreak`, `ExpressionItem`, `Generation1Card`. |
| Stale config | `vite.config.ts` coverage includes `src/lib/schemas.ts`, which does not exist. |

Tests mirror the confusion (`test/lib/components/learning-flashcards.test.ts`,
`practice-ui/userPool.test.ts` testing `practice-ui/discord/userPool.ts`, `server/email.test.ts`
outside `server/auth/`, `components/translation-evaluation/` for `translate-evaluation/`).

## Principles

1. **Layer first, then one domain vocabulary in every layer.** SvelteKit only enforces server-only
   code for `$lib/server/**`, so the top split stays by runtime. Inside each layer the *same* domain
   folder names appear, so "where is the X for review?" always has the same answer shape:

   | Layer | Holds | Must not |
   | --- | --- | --- |
   | `lib/<domain>/` | Isomorphic types, rules, pure functions. Safe to import from server, client, tests. | Touch DB, `$env`, DOM, storage, Svelte context. |
   | `lib/components/<domain>/` | Svelte components **and** helpers only that UI uses (`*.svelte.ts` state, motion, sessionStorage snapshots). | Be imported by `lib/server`. |
   | `lib/server/<domain>/` | DB access, LLM calls, workflows. | Be imported by client code (SvelteKit enforces). |
   | `lib/client/` | App-wide browser infrastructure any page may use. | Hold single-domain helpers — those live with their components. |

2. **Domains** (fixed list; add one only when it clearly doesn't fit):
   `task` (content, lineups, attempts) · `quest-hall` · `practice` (chat quests: sessions, platform
   UIs, hints, agent replies, feedback) · `translation` (translation quests) · `review` (Notes, FSRS
   review, transfer, note management) · `streak` · `auth` · `account` (profile, avatar, trial quota) ·
   `admin`. Cross-cutting utilities: `time`, `text`, `app`.
3. **The folder carries the domain; the file name doesn't repeat it.** `server/translation/workflow.ts`,
   not `server/translation-workflow.ts`. A domain with one file in a layer may stay a single file named
   after the domain (`server/streak.ts`, `server/archive.ts`); it becomes a folder when a second file
   appears.
4. **Root of `lib/` holds only folders plus three well-known entry points**: `constants.ts` (single
   source for enums, per AGENTS.md), `i18n` (`t()`), `utils.ts` (shadcn `cn()`, fixed by
   `components.json`). **Root of `components/` holds only folders.**
5. **Naming**: directories and `.ts` files kebab-case; components PascalCase; rune modules
   `*.svelte.ts`. No new `utils`/`helpers` buckets above a single feature folder.
6. **Code used by exactly one route lives in that route folder**, not in `lib`.
7. **Tests mirror `src/` exactly**: `test/lib/<same path>.test.ts`; multiple test files for one
   module use `<module>.<aspect>.test.ts`.

## Target layout

```
src/lib/
├── constants.ts              enums, labels, language helpers (unchanged)
├── i18n/                     index.ts (t), en.ts, es.ts, fr.ts, ja.ts — `$lib/i18n` unchanged
├── utils.ts                  cn() for shadcn (unchanged)
├── assets/
├── app/                      document-language.ts, load-dependencies.ts
├── time/                     local-day.ts, display-clock.ts, browser-timezone.ts
├── text/                     markdown.ts, marked-text.ts
├── schemas/                  zod form/JSON schemas (unchanged)
├── admin/                    opening-state.ts, task-actions.ts
├── auth/                     social.ts
├── task/                     attempts.ts
├── quest-hall/               quest.ts, menu.ts, navigation.ts, preparation.ts
├── practice/                 feedback.ts, reply-timing.ts, ui-variants.ts, unread.ts
├── translation/              evaluation.ts
├── review/                   note.ts, queue.ts, transfer-queue.ts, manage.ts
├── streak/                   rules.ts, history.ts, presentation.ts
├── client/                   form-attention, page-transition, scroll-lock, browser-timezone,
│                             auto-grow-textarea, hover-marquee
├── components/
│   ├── ui/                   shadcn-generated (unchanged)
│   ├── common/               shared primitives (Accordion, FloatingPanel, ModalDialog, …)
│   ├── shell/                Navbar, HomeMasthead, nav/, brand mark, public page switcher
│   ├── auth/  account/  admin/
│   ├── quest-hall/           the book (flattened from quest-hall/quest-menu/)
│   ├── practice/
│   │   ├── session/          chat session engine shared by every platform UI
│   │   ├── ui/               ao3/ discord/ imessage/ mail/ reddit/
│   │   ├── hint/
│   │   └── feedback/         practice evaluation page pieces
│   ├── translation/
│   │   └── evaluation/
│   ├── review/
│   └── streak/
└── server/
    ├── db/  auth/  admin/    (unchanged)
    ├── llm.ts                (unchanged)
    ├── archive.ts  streak.ts (unchanged)
    ├── account/              gravatar.ts, trial-quota.ts
    ├── task/                 context.ts, lineups.ts, lineup-dates.ts
    ├── quest-hall/           hall.ts, details.ts, greetings.ts
    ├── practice/             session.ts, hints.ts, feedback.ts, evaluation.ts, preparation.ts,
    │                         translation-help.ts, unread.ts, prompt-context.ts,
    │                         send-options*.ts, agent-replies/
    ├── translation/          sources.ts, workflow.ts, practice.ts, preparation.ts, evaluation/
    └── review/               notes.ts, note-rules.ts, scheduler.ts, manage.ts, transfer.ts
```

## Move map

Every entry is a `git mv`; import specifiers are rewritten by a codemod. Entries marked **(edit)**
also change content, and are done in a separate commit from the pure moves.

### Isomorphic (`lib/`)

| From | To |
| --- | --- |
| `i18n.ts` | `i18n/index.ts` + `i18n/{en,es,fr,ja}.ts` **(edit: split per language; the other languages are typed against English's keys)** |
| `document-language.ts`, `load-dependencies.ts` | `app/` |
| `local-day.ts`, `display-clock.ts` | `time/` |
| `browser-timezone.ts` + `server/browser-timezone.ts` | `time/browser-timezone.ts` **(edit: merge; `getBrowserTimezone` is a pure cookie read)** |
| `markdown.ts`, `marked-text.ts` | `text/` |
| `task-attempts.ts` | `task/attempts.ts` |
| `quest-hall.ts` | `quest-hall/quest.ts` |
| `agent-replies/timing.ts` | `practice/reply-timing.ts` |
| `feedback/types.ts` | `practice/feedback.ts` |
| `unread.ts` | `practice/unread.ts` |
| `components/practice-ui/implementedUi.ts` | `practice/ui-variants.ts` (used by server and quest hall) |
| `translation-evaluation/types.ts` | `translation/evaluation.ts` |
| `note.ts` | `review/note.ts` |
| `review.ts` | `review/queue.ts` |
| `transfer-queue.ts` | `review/transfer-queue.ts` |
| `note-management.ts` | `review/manage.ts` |
| `streak.ts`, `streak-history.ts`, `streak-presentation.ts` | `streak/rules.ts`, `streak/history.ts`, `streak/presentation.ts` |
| `translation-evaluation/live-demo-fixture.ts` | `routes/(app)/(demo)/translate-eval-live-demo/fixture.ts` |
| `welcome/product-evidence.ts` | `routes/welcome/product-evidence.ts` |
| `notifications.ts` | `components/common/notifications.ts` (types of the notification components) |

### Client infrastructure

`client/` keeps `form-attention.ts`, `page-transition.ts`, `scroll-lock.ts`, `browser-timezone.ts`
(cookie sync, needs `$app/navigation`), `auto-grow-textarea.ts`, `hover-marquee.ts`. Everything else
moves next to its only consumers:

| From | To |
| --- | --- |
| `client/quest-hall/unread-subscription.ts` | `components/quest-hall/` |
| `client/quest-hall/preparation-actions.ts` (only `TranslationPreparation` uses it) | `components/translation/` |
| `client/streak-acknowledged.ts`, `streak-day.svelte.ts`, `streak-presentation.svelte.ts`, `streak-preview.svelte.ts` | `components/streak/acknowledged.ts`, `day.svelte.ts`, `presentation-state.svelte.ts`, `preview.svelte.ts` |
| `client/translation-draft.ts`, `client/translation-feedback-snapshot.ts` | `components/translation/draft-storage.ts`, `feedback-snapshot.ts` |
| `client/translation-highlight.ts` | `components/translation/evaluation/highlight.ts` |
| `client/practice-transfer-snapshot.ts` | `components/practice/feedback/transfer-snapshot.ts` |

### Components

| From | To |
| --- | --- |
| `Accordion`, `FloatingPanel`, `ModalDialog`, `ConfirmDialog`, `LoadingReveal`, `Typewriter`, `MarkdownRenderer`, `ActionNotification`, `ResponsiveNotification`, `FormErrorFocus`, `interaction-motion.css` | `common/` |
| `learning-feedback/MarkedText.svelte` (shared by practice and translation) | `common/MarkedText.svelte` |
| `Navbar`, `HomeMasthead`, `LanguageFlag`, `PublicPageSwitcher`, `WineGlassIcon`, `nav/**` | `shell/` (`nav/` kept as `shell/nav/`) |
| `ProfileNameEditor` | `account/` |
| `TaskForm`, `OpeningStateEditor` | `admin/` |
| `quest-hall/QuestMenuRoute.svelte`, `quest-hall/quest-menu/*` | `quest-hall/` (flattened) |
| `task/TaskPreparation.svelte` | `practice/TaskPreparation.svelte` |
| `translate/TranslateModal.svelte` | `practice/TranslationHelpModal.svelte` |
| `ConversationReadReceipt`, `practice-ui/TurnsLeftMobileBadge` | `practice/` |
| `practice-ui/session.svelte.ts`, `chatMessages.ts`, `commentThread.ts`, `chatFlowController.ts`, `apiService.ts`, `messageTransformer.ts` | `practice/session/session.svelte.ts`, `chat-messages.ts`, `comment-thread.ts`, `message-submission.ts`, `form-actions.ts`, `opening-messages.ts` |
| `utils/messageUtils.ts` | `practice/session/message-format.ts` |
| `utils/markdownUtils.ts` (`common/MarkdownRenderer` depends on it) | `lib/text/markdown.ts` **(edit: merge beside `renderMarkdown`)** |
| `utils/sessionUtils.ts`, `utils/emojiUtils.ts` | `practice/session/turns.ts`, `practice/ui/discord/emoji.ts` |
| `practice-ui/discord/types.ts` + `discord/userPool.ts` + `discord/data.ts` | `practice/session/chat-users.ts` **(edit: the session engine's user model, used by every platform, not Discord-only)** |
| `practice-ui/{ao3,discord,imessage,mail,reddit}/` | `practice/ui/<same>/`; camelCase `.ts` → kebab-case (`mailUtils.ts` → `mail-content.ts`, `userPool.ts` → `contacts.ts`) |
| `reddit/utils.ts` | `practice/ui/reddit/format.ts` (display formatting; distinct from the comment-tree `helpers.ts`, so renamed rather than merged) |
| `EmojiPicker`, `ResizeableTextarea` (Discord-only) | `practice/ui/discord/` |
| `practice-ui/hint/*` | `practice/hint/` (`requestLifecycle.ts` → `request-lifecycle.ts`) |
| `learning-feedback/SelectionActionBubble`, `TutorQuestionPanel`, `types.ts` | `practice/feedback/` |
| `translate/TranslationPreparation.svelte` | `translation/` |
| `translate-evaluation/*` | `translation/evaluation/` |
| `note/NoteCard.svelte` | `review/` |
| `review/*`, `streak/*`, `auth/*`, `ui/*` | unchanged |

### Server

| From | To |
| --- | --- |
| `task-context.ts`, `lineups.ts`, `scheduling/dates.ts` | `task/context.ts`, `task/lineups.ts`, `task/lineup-dates.ts` |
| `quest-hall.ts`, `quest-hall-details.ts`, `greetings.ts` | `quest-hall/hall.ts`, `quest-hall/details.ts`, `quest-hall/greetings.ts` |
| `session.ts` | `practice/session.ts` + `practice/hints.ts` **(edit: split the ~160-line hint generator out)** |
| `feedback.ts`, `practice-evaluation.ts`, `task-preparation.ts`, `unread.ts`, `prompt-context.ts` | `practice/feedback.ts`, `evaluation.ts`, `preparation.ts`, `unread.ts`, `prompt-context.ts` |
| `translate.ts` | `practice/translation-help.ts` |
| `practice-ui/send-options.ts`, `ao3.ts`, `reddit.ts` | `practice/send-options.ts`, `send-options-ao3.ts`, `send-options-reddit.ts` |
| `agent-replies/*` | `practice/agent-replies/*` |
| `translation.ts`, `translation-workflow.ts`, `translation-practice.ts`, `translation-preparation.ts` | `translation/sources.ts`, `workflow.ts`, `practice.ts`, `preparation.ts` |
| `translation-evaluation/*` | `translation/evaluation/*` |
| `note.ts`, `vocabulary-note-rules.ts`, `review.ts`, `note-management.ts`, `transfer.ts` | `review/notes.ts`, `note-rules.ts`, `scheduler.ts`, `manage.ts`, `transfer.ts` |
| `gravatar.ts`, `trial-quota.ts` | `account/` |
| `db/`, `auth/`, `admin/`, `llm.ts`, `archive.ts`, `streak.ts` | unchanged |

### Deleted

`lib/index.ts`, `components/practice-ui/types.ts`, empty folders left behind
(`agent-replies/`, `feedback/`, `welcome/`, `translation-evaluation/`, `components/utils/`,
`server/scheduling/`, `server/practice-ui/`), unused `clearAcknowledgedStreak`, `ExpressionItem`,
`Generation1Card`. `vite.config.ts` coverage globs are rewritten for the new layout (the current list
references a non-existent file and only covers flat `server/*.ts`). Thresholds are unchanged: they
already failed before this work (statements 80.7%, branches 73.3%, lines 84.0%) and are out of scope.

## Documentation

- Add `src/lib/README.md`: the layer table, domain list and the "where does a new file go" rules
  above, in under a screen. This is what a colleague reads first. It also states that a same-named
  file in `<domain>/` and `server/<domain>/` is a shared contract and its server implementation.
- Update every path in `AGENTS.md` and `README.md`. Past design/writeup docs are history and keep
  their original paths.

## Execution

Work on a new branch off the current `refactor/task-model` HEAD, in reviewable commits:

1. **Cleanup**: delete dead code, fix the coverage config.
2. **Pure moves**: one scripted commit. A one-off Node codemod applies the move map with `git mv`,
   then resolves every import specifier in `src/` and `test/` (`$lib/…`, relative paths, `import()`,
   `vi.mock()`, CSS `@import`) to a file, maps it through the table, and writes it back in the same
   style (alias stays alias, relative stays relative). No other content changes, so `git log --follow`
   and rename detection keep working.
3. **Test mirror**: move tests to match, merging or renaming the non-mirroring ones.
4. **Consolidating edits**: the **(edit)** rows above, each small and separately tested.
5. **Docs**: `src/lib/README.md`, AGENTS.md, README.md; writeup.

Each commit must pass `pnpm check` and `pnpm test`; the last also `pnpm build` and a Chrome smoke pass
over `/`, a practice session, a translation task and its feedback, `/review`, `/review/manage`,
`/archive`, `/profile`, and `/admin`. Behavior and UI must not change.

## Risks

- **Merge conflicts with in-flight work.** Any open branch touching these files must be rebased;
  `origin/refactor/ui-discord` is currently unmerged and touches `practice-ui/discord/`. Git's rename
  detection handles pure moves well, which is why moves and edits are separate commits. Best landed
  when few branches are open.
- **Test mocks bound to paths.** `vi.mock("$lib/server/…")` strings are rewritten by the codemod; the
  merged `time/browser-timezone.ts` exports more than the old server module, so its three mocks must
  spread `importOriginal()`.
- **Server-only boundary.** Nothing moves out of `lib/server/` into an isomorphic folder except the
  pure cookie read; SvelteKit will fail the build if a client path reaches server code.

## Non-goals

- Splitting `constants.ts`, `llm.ts`, `server/practice/feedback.ts` or other large files further.
- Changing route structure, public URLs, DB schema, or any behavior.
- Unifying `dayjs` (`task/lineup-dates.ts`) with `time/local-day.ts`; noted as follow-up.
- Removing `export` from symbols used only in their own file.

## Decisions to confirm

1. The domain list and names above, in particular `review` as the home of Notes and transfer
   (matching `/review` and `/review/manage`), and `task` singular (matching the table and `/task/[id]`).
2. Domain browser state lives with components rather than in `client/<domain>/`.
3. `schemas/` stays a separate layer rather than being scattered into domains.
4. Renaming `translate.ts`/`TranslateModal` to "translation help" to end the clash with translation
   tasks.
