---
title: Step 3, the rebuild: data model, data flow and the order of work
type: feature, tech-debt
status: needs-approval
---

# Step 3: the rebuild

Step 1 designed the two-pass revision (rehearsal-lab `src/`), step 2 drew the whole product as a demo
(rehearsal-lab `app/`). Step 3 makes it a real application in this repository: a new data model, the server side the
demo fakes, and the demo's pages on real data. The old application is not evolved; it is a parts bin.

Decided by the user, 2026-11-13: same repository from a clean slate with the old history kept (tag `legacy`, branch
`rebuild`); the model layer lives only here and rehearsal-lab becomes an archive; a revision session resumes at
checkpoints; production switches once, when everything is done. Earlier decisions this builds on: rehearsal-lab
`docs/step2/2026-11-13-before-step-3.md` (every old field's fate) and `2026-11-11-session-records.md` beside this file.

## 1. Ground rules

- **The demo is the product.** Pages, components, copy, motion and the model calls move as they are. Where the demo
  has no answer (resuming a session, a richer opening for the simulated places), this document says what is added.
- **No baggage.** One fresh migration, a wiped production database, no compatibility code, no renamed-but-kept
  concepts. A table or module exists because the new product needs it.
- **Each phase ends with an application that runs**, checks and tests green.
- **Nothing is called done on trust**: the model flow is replayed against the demo's recordings, pages are compared
  with the demo side by side (§7).

## 2. What comes from where

| From | What | How |
|---|---|---|
| This repo, kept | `Dockerfile`, compose, `deploy/`, CI, `test/deploy`, the base-path test, the error template, Biome and pre-commit | unchanged except the environment list and docs |
| rehearsal-lab `app/` | every page and component, `layout.css`, fonts, the i18n catalog, the tour, the session's client (`lib/session`) | moved; `lib/demo/*` (localStorage) replaced by loads and actions |
| rehearsal-lab `src/` | the model layer and its tests; fixtures, the simulated learner and `play` as dev tools | moved; globals removed (§6.1) |
| `legacy`, moved as is | the five simulated places and `createPracticeSession`, the hint panel, `lib/practice` contracts, `floor`/`prompt`/`generator`/`prompt-context`/`addressee`, `lib/admin/capture.ts`, `form-attention`, the display clock, safe markdown, their tests | renamed to the new vocabulary |
| `legacy`, rewired | `server/practice/session.ts`, the agent-reply worker, unread, send options, hints; the Better Auth options, mail and captcha; key encryption and verification; the FSRS scheduler and queue helpers; Scene Lab | onto the new tables |
| `legacy`, dropped | Quest Hall, lineups, the old translation flow, the chat feedback page, the transfer pass, the trial quota, the LLM Lab, the archive, the flame, 31 migrations, the old docs | not carried over |

## 3. Stack

SvelteKit 3 with Svelte 5 and `adapter-node`, server-rendered (the demo's `ssr = false` goes; the session's hand-drawn
post stays a browser-only component inside a rendered page). Tailwind 4, bits-ui, lucide. Postgres 18 through
drizzle-orm and postgres.js. The app's data moves through remote functions (§6.8). Better Auth. zod. The OpenAI SDK as the one client for every provider. ts-fsrs. Vitest
(node and jsdom projects), Biome. Every package is taken at its current version in phase 1 and only if something
imports it; `dependencies` holds only what the runtime image must have outside the bundle (drizzle-kit, drizzle-orm).

## 4. Code layout

The rule from `src/lib/README.md` stays: split by where code runs (`<domain>/` shared, `components/<domain>/`,
`server/<domain>/`, `client/`), then by domain. The domains are new:

| Domain | Covers |
|---|---|
| `account`, `auth` | profile, languages, the learner's key; sign-in, mail, captcha |
| `writing` | pieces: the composer, the gate, My writing, the piece's page, follow-ups |
| `revision` | the two-pass session: the model calls (`server/revision/pass1`, `pass2`, `pipeline`), the server session and its snapshot, the page's state machine and post |
| `scenario` | scenarios, issues, the pool's ranking, the scenario page, suggestions |
| `exchange` | the simulated conversation of a scenario: the five places (`components/exchange/places/<place>/`), agent replies, the floor, unread |
| `translation` | the answering sheet, sources and their checks, name tables |
| `notebook` | notes, readings, collecting |
| `review` | FSRS scheduling, the queue, card faces, answer checks |
| `week` | the day's two halves, the week's aim, the glasses |
| `llm` | providers, the transport, lanes, call records, cases |
| `admin` | the editors and the session viewer |
| `tour` | the director, the script, tapes and stand-in data |

Cross-cutting: `text/` (words, diff, edits, residue, markdown), `time/`, `i18n/`, `components/common`, `components/ui`,
`components/shell`, `server/db`. "Session" alone is never a name: the auth session, a **revision** and an **exchange**
are three things (the old code had `practice_session`, the lab `LiveSession`).

Dev tools from the lab live in `lab/` at the repository root (fixtures and gold, the simulated learner, `play`, the
whole-session run per model, `case pull`/`case replay`); nothing in `src/` imports it and the image does not ship it.

## 5. Data model

Conventions: `text` with a check generated from `lib/constants.ts` instead of Postgres enums (values will move);
`timestamptz` everywhere; jsonb is validated by a zod schema in code on every write; "Local" is a jsonb object keyed by
language. Rows a learner sees in a URL (`piece`, `note`, `reading`) have `uuid` ids from `uuidv7()`; scenarios and
issues have admin-given text ids (`ao3-fic`), as the demo's URLs do; the exchange tables keep integer ids, which the
comment-id scheme embeds.

### 5.1 Account

| Table | Columns |
|---|---|
| `user` (Better Auth) | `id`, `name`, `email`, `email_verified`, `role` (`learner`/`admin`), `native_language`, `learning_languages text[]`, `active_language` (one of them), `tutor_language` (`native`/`target`), `weekly_goal` 1–7 default 3, `time_zone`, `help_improve` default true, `onboarded_at`, `pending_email`, timestamps. Better Auth's `image` column exists and is never written or read (pictures are Gravatar's). |
| `session`, `account`, `verification` | Better Auth's own |
| `user_key` | `user_id` pk, `provider` (`openrouter`/`deepseek`/`openai`/`glm`), `model`, `encrypted_key` (AES-GCM), timestamps |

`help_improve` replaces the `llm_trace_opt_out` table. `time_zone` is the browser's validated zone, kept so server work
(a note's first due day, the day a finish counts for) does not depend on a request. An account whose verified address
is in `ADMIN_EMAILS` becomes an admin when it signs in, so a fresh database needs no manual SQL.

**Deleting an account** (decided by the user, 2026-11-13) deletes the `user` row, and every table that belongs to a
learner references it `on delete cascade` (`llm_call` too: its messages hold their writing), so nothing of theirs stays
and there is no `deleted_at`. Settings offers it at the right end of its last row (the links); the dialog asks for a
press, then the address typed by hand, pasting refused.

### 5.2 The week

| Table | Columns |
|---|---|
| `practice_day` | `user_id`, `day date`, `learned_at`, `reviewed_at`; pk `(user_id, day)` |
| `user_week` | `user_id`, `week_start date`, `goal`; pk `(user_id, week_start)` |

A day counts when both halves are set. Each half is written only in the transaction that earned it (the guarded move
of a piece to `finished`, a write-again, a rating that leaves the queue empty or a visit that observes it empty).
Weeks in a row and "met your aim" are derived on read.

### 5.3 Scenarios

| Table | Columns |
|---|---|
| `scenario` | `id text`, `kind` (`exchange`/`translation`), `place` (`ao3`/`reddit`/`email`/`discord`/`imessage`/`translation`), `status` (`draft`/`published`/`withdrawn`), `minutes`, `urgency`, `max_turns`, `work_id` (translations: whose name table), `versions jsonb`, `created_by`, `published_at`, timestamps |
| `scenario_source` | `id`, `scenario_id`, `language` (the version translated into), `native` (the learner language it is written in), `text`, `glossary jsonb`, `state` (`pending`/`checked`/`notes`/`confirmed`/`failed`), `notes jsonb`, `original_hash`, `made_at`; unique `(scenario_id, language, native)` |
| `work` | `id text`, `title`, `wikidata`, `wikis jsonb`, `manual jsonb` |
| `name_rendering` | `work_id`, `locale`, `term`, `kind` (`name`/`term`), `rendering`, `status` (`pending`/`confirmed`), `origin`, `url`, `why`, `candidates jsonb`; pk `(work_id, locale, term)` |
| `issue` | `id text`, `date`, `title` Local, `line` Local, `tone`, `deep`, timestamps |
| `issue_scenario` | `issue_id`, `scenario_id`, `position`; pk `(issue_id, scenario_id)` |
| `suggestion` | `id`, `user_id`, `place`, `language`, `situation`, `capture jsonb`, `purpose`, `mine`, `status` (`pending`/`live`/`unused`), `reason`, `scenario_id`, `created_at`, `resolved_at` |
| `feedback` | `id`, `user_id`, `kind` (`idea`/`bug`/`other`), `text`, `page`, `browser`, `created_at`, `done_at` |
| `announcement` | `id`, `title` Local, `body` Local, `published_at`, `expires_at`, `created_by`, `created_at` |
| `announcement_read` | `user_id`, `announcement_id`, `read_at` |

`scenario.versions[language]`: `{ draft?, title, line, introduction?, goals[], you, people: { name, who, notes }[],
others, opening, followed: { author, text }[] }`, or for a translation `{ draft?, title, line, introduction, original,
where, readers, terms[] }`.

**The opening is the place's full opening state, not the demo's `Situation`.** The demo's type is what its scenario
page draws (an AO3 work has five fields); the real places need what the old `openingState` held (an AO3 comment tree,
tags and stats; a Discord server and channel or a DM; an iMessage group name; a mail thread). `opening` is therefore
the old per-place schema without `counterpartName` and `members`, which `people` replaces. The scenario page's
quieter drawing is a projection of it (`situationOf(opening)`), and the admin's opening editor gains the missing
fields in the demo's admin style. This is the one place the admin UI grows beyond what the demo drew.

`people`, `others` and `followed` replace `agent_prompt`: the agents' prompt input changes, so the exchange is judged
again in Scene Lab from the learner's seat before phase 4 ends. Only `toLearnerScenario()` builds what a page
receives; it drops `notes`, `others` and `followed`.

### 5.4 Pieces

| Table | Columns |
|---|---|
| `piece` | `id uuid`, `user_id`, `language`, `kind` (`own`/`scenario`/`translation`), `scenario_id`, `source_id`, `place`, `title`, `text`, `background`, `context`, `tutor_language` (the language code in force), `detail` (`needed`/`more`), `provider`, `model`, `state` (`writing`/`revising`/`finished`/`set_aside`), `final`, `closing`, `reader`, `leftovers jsonb`, `authentic`, `learned jsonb`, `finished_at`, `notes_requested_at`, `posted` (`yes`/`not_yet`/`no`), `asked_at`, `again_text`, `again_at`, `sha`, timestamps |
| `piece_revision` | `piece_id` pk, `version`, `state jsonb`, `updated_at` |
| `piece_step` | `piece_id`, `seq`, `action`, `body jsonb`, `response jsonb`, `error`, `ms`, `at`; pk `(piece_id, seq)` |

`writing` is a translation on its sheet or a scenario still being played; `revising` is inside the two passes. At
most one unfinished piece per learner and scenario (a partial unique index), so `/scenario/<id>/play` needs no piece
in its URL and the shelf's "continue" card is one row. A scenario can be written again once the last piece is finished
or set aside. Only the guarded move to `finished` credits the day.

`piece_revision` is the server session's snapshot (§6.2), apart from `piece` so lists never read it; it is deleted
once the piece is finished and its notes are filed. `piece_step` is the tape: every action the page sent and what it
got back.

### 5.5 The exchange (from `practice_session` and its three tables)

| Table | Was | Changes |
|---|---|---|
| `exchange` | `practice_session` | gains `piece_id` (unique) and `scenario_id`; loses `lineup_id`, `tutor_feedback`, `evaluation_phase`, `evaluation_completed_at`, the per-lineup uniqueness |
| `exchange_message` | `session_message` | as it is |
| `agent_batch` | `agent_response_batch` | as it is |
| `agent_delivery` | `agent_delivery` | as it is |

The floor, the lock order, the claim leases, the comment-id scheme and every invariant in the multiparty design carry
over. The place token inside ids follows `scenario.place` (`email`, not `apple_mail`); the database is new, so no
stored id has to keep matching.

### 5.6 Notebook and review

| Table | Columns |
|---|---|
| `reading` | `id uuid`, `user_id`, `language`, `text`, `place`, `created_at` |
| `note` | `id uuid`, `user_id`, `language`, `kind` (`own`/`collected`), `piece_id`, `reading_id`, `phrase`, `meaning`, `meaning_language`, `usage`, `register`, `why`, `examples jsonb` (`{ t, n?, span? }[]`), `sentence`, `marked`, `was`, `also text[]`, `fsrs jsonb`, `due`, `deleted_at`, timestamps; index `(user_id, due)` where not deleted |
| `review_log` | `id`, `note_id`, `user_id`, `rating` 1–4, `verdict`, `elapsed_seconds`, `prev jsonb`, `next jsonb`, `reviewed_at` |

`due` repeats the card's due time as a column so the queue is an index scan. A new note is due from the learner's next
local day. Which face a card shows follows from its review count; no rotation is stored.

### 5.7 Calls and cases

| Table | Columns |
|---|---|
| `llm_call` | `id uuid`, `user_id`, `piece_id`, `step_seq`, `purpose`, `tag`, `provider`, `model`, `effort`, `state` (`done`/`failed`/`repaired`/`discarded`), `background`, `prompt_hash`, `messages jsonb`, `output`, `error`, `prompt_tokens`, `completion_tokens`, `reasoning_tokens`, `cache_read`, `cache_write`, `cost_usd`, `latency_ms`, `created_at` |
| `llm_prompt` | `hash` pk, `text` (a system prompt, stored once) |
| `session_case` | `id`, `piece_id`, `step_seq`, `note`, `created_by`, `status` (`open`/`fixed`/`wontfix`), `commit`, `created_at`, `closed_at` |

`llm_call` replaces `llm_trace`; the operations monitor's hourly query (`deploy/podman/ops/operations.py`) is changed
with it. A row's numbers are always written; `messages` and `output` only when the learner has `help_improve` on, and
they are cleared after 30 days unless the piece has an open case.

## 6. Data flow

### 6.1 A model call

```
call site (tag, effort, schema)
   → Caller (who pays, what for: piece, step, purpose, lane)
       → lanes (a revision's two background slots; promote, discard)
       → transport (provider table, one OpenAI client per key, timeout, retries, one JSON repair)
       → records (llm_call row, written after the fact; a failure here never reaches the call)
```

- **No globals.** The lab's `config.task`, the `chipN` counter, `process.env`, the UI strings read at import and the
  disk cache become parameters or per-session state. Every function of the model layer takes a `Caller`.
- **Who pays.** A learner's call uses `user_key` and nothing else; without one it stops with `nokey`, a refused key
  with `refused`, anything else `error`: the three the demo's `LimitNotice` already shows. The environment key serves
  the gate's decision call, translation sources at publish, name tables and Scene Lab.
- **Providers** are a table in `lib/llm/providers.ts` (base URL, how effort is sent, whether cost is reported, the
  one-press setups). `SceneSchema.target` and every other language list come from the constants.
- **Lanes and records are two things.** The lab's `trace.ts` holds both the session's scheduling (product logic) and
  the debug bubbles; here the lanes are `server/llm/lanes.ts`, the bubbles read `llm_call` rows of the admin's own
  piece.
- **A cache only for dev.** The lab's cache key (model, effort, sample, messages) stays as an optional `ModelCache`
  used by tests, replays and `case replay`; production has none.
- The old recipe/slot machinery goes. The exchange's prompts (`agent-reply`, the two hints) keep their text exactly
  and become plain calls through the `Caller`.

### 6.2 A revision

The page drives; the server answers one action at a time. The protocol is the demo's (`POST /api/s`, then
`/api/s/<id>/<action>`), because it is also the tape's format, the tour's and `case replay`'s. `<id>` is the piece's.

**Where the state lives.** A `RevisionSession` object per piece in the server's memory (the deployment is one
process), a snapshot in `piece_revision`:

- every model result the session holds becomes a value that can be stored (the detection, the analysis, the outline,
  each stop's material, hints, the ending); a call still running when the snapshot is taken is simply not in it and
  starts again if asked for;
- what follows from inputs is computed again on load (the position maps from the applied edits, the base from the
  rewrite);
- the snapshot is written with each action's `piece_step` row, and again when a background call settles; shutdown
  flushes; an idle session leaves memory after 30 minutes.

A snapshot is not a replay of the tape: after a deploy that changes a prompt, replayed calls would no longer match
what the learner already did.

**Coming back** (a reload, a restart, another device): the page asks `resume` and lands on a checkpoint:

| The session had reached | The learner sees |
|---|---|
| the scene | the scene card, as inferred |
| pass 1 | pass 1 from its start, their answers so far filled in |
| pass 2 | the post as it stands; finished stops greyed in the thread; the first open stop ready |
| say-it-again or the end | that step |

Two additions to the protocol: `resume`, and `pass1progress` (the answers so far, which the demo sends only when pass
1 ends). Nothing is typed again and no finished call is made twice.

**Ending.** `end` moves the piece to `finished` in one transaction with the day's half, stores `final`, `closing`,
`reader`, `leftovers`, `learned`. The notes call runs after it on the server; if the page never asked for it (the tab
closed), the piece's page asks again when it finds none.

### 6.3 The ways in

- **Own writing.** The composer posts to the gate (code prechecks, then one decision call on the environment key);
  a pass creates the `piece` (`revising`) and the page moves to `/live/<piece>`, the box growing into the scene card
  as now. The handoff in session storage goes: the piece is the handoff.
- **A scenario.** The scenario page creates the piece (`writing`) and its `exchange`; `/scenario/<id>/play` is the
  real place. When the exchange ends, code builds the lab's `Exchange` from its messages (who said what, in reply to
  what, the people, the goals), the piece's `text` becomes the learner's turns, and the revision starts from the
  after page.
- **A translation.** The sheet saves the draft to `piece.text` (`writing`); done starts the revision with the pinned
  `scenario_source` and the original.
- **Collecting.** A pasted passage becomes a `reading`; each highlight a `note` (`collected`) filled by one call.

### 6.4 Publishing a translation

Publishing creates a `pending` `scenario_source` for each learner language. A runner in the server process makes each
(terms once, source, blind back-translation, drift check, one repair) on the environment key and leaves it `checked` or
`notes`; pending rows are picked up again after a restart. A scenario is offered to a learner once the source in their
language is `checked` or `confirmed`.

### 6.5 Review

The legacy scheduler (ts-fsrs, Anki's learning steps, learn-ahead, day-aligned review cards) drives the sitting in
place of the demo's fixed table; the demo's card faces, typed answers and code verdicts are the page. The buttons'
intervals come from the scheduler's preview.

### 6.6 The tour

The tour keeps its director, script and content. Its data is typed as the pages' own `PageData`: a universal load on
each page the tour visits returns the sandbox's data while the tour plays, and the tape answers every request the
pages send (the session's actions, the gate, collecting, form actions). No tour request reaches the database or a
model.

### 6.7 Access

Every load, action and endpoint under the app requires the signed-in learner and scopes rows by `user_id`; admin
routes check the role in their layout and again in every action. Loaders never write (the read-receipt rule stays).
Turnstile, the password check, the non-enumerating answers, the ten-minute freshness for changing the address and the
proxy's rate-limit list carry over; the trusted mail domains do not.

### 6.8 Remote functions

Decided by the user, 2026-11-13, after a survey of the maintainers' plans and the community's reports: the app's reads
and writes are remote functions (`query`, `command`, `form` in `*.remote.ts`), the direction SvelteKit is going, rather
than `load` and form actions. They and Svelte's async mode are experimental, so:

- Kit and Svelte are pinned to a minor version; each upgrade reads the changelog's remote-function entries first.
- Signing in and the admin role are enforced in `hooks.server.ts`, before any page or query runs (a `redirect()` thrown
  inside a query called from the browser is not honoured, sveltejs/kit#17262).
- Every remote function is a public endpoint: each begins with the one `learner()` (or `admin()`) guard and scopes rows
  by its `user_id`.
- No two refreshes of the same query run at once (an older response can overwrite a newer one, sveltejs/kit#17354).
- The revision's own protocol (`/api/s`) and Better Auth's endpoints stay as they are.
- `query.live` is not used: its transport is still changing and a proxy's 502 stops it for good (sveltejs/kit#17655,
  #16422). The exchange keeps the legacy polling.

## 7. Verification

- **The model flow against the demo.** `lab/replay.mjs` feeds a recorded session's actions (the lab's
  `runs/live/<id>.jsonl`) to the server and compares every response with the recorded one, with the lab's call cache
  read only (`LLM_CACHE_DIR`, `LLM_CACHE_ONLY=1`), so nothing is spent and a difference is a porting bug. Only
  recordings made with the current prompts replay (older ones miss the cache), so phase 2 starts by recording a
  baseline with the code as imported: every way in, both tutor languages, a few cents.
- **Snapshots.** The same replays, with the session thrown away and loaded from its snapshot between every two
  actions, must give the same responses.
- **Pages.** The demo on port 4793 beside the new app: desktop and phone, light and dark, recordings for motion.
- **The exchange.** Scene Lab replays, read from the learner's seat.
- **The pipeline.** The image is built and started under compose with an empty database in phase 1 and at every phase
  end.

## 8. Order of work

| Phase | Ends when |
|---|---|
| 0. This document | approved |
| 1. Ground | the tree is cleared; new packages; one migration; `/health`; the image builds and boots; sign-up, sign-in, verify, reset, the welcome, settings and the key work on real accounts |
| 2. The loop | transport, lanes, records; the model layer and the session moved; the replays pass, also through snapshots; composer, gate, `/live`, the piece's page, My writing, the sidebar |
| 3. What comes back | notebook, collecting, review on FSRS, the week and its glasses, follow-ups, write-again |
| 4. Scenarios | the library, issues, the scenario page; the exchange on the new tables in the five places; the after page into the revision; the translation sheet, sources and names |
| 5. Admin | scenarios, issues, names, inbox, announcements; sessions, a session, cases; `case pull` and `case replay` |
| 6. First run | the tour on real pages; the public pages; the privacy policy |
| 7. Launch | the whole app verified; deployment docs; the production reset; `v1.0.0` |

**How the demo comes in.** It is brought in whole and kept running: the app starts as the demo on its browser
storage, and each phase replaces a part of `lib/demo` with loads and actions, page by page turning rendering on. The
model layer arrived as `src/model` and was distributed over the domains in phase 2. The work is done
when `lib/demo`, the root `ssr = false`, the `/lab` pages and the dev panel are gone. SvelteKit, Vite,
Vitest and TypeScript are a major version behind (the demo's versions were kept so the import changes nothing); the
upgrade is its own step in phase 1, with the migration guides read first.

## 9. The production switch

Once, at phase 7: a last dump of the old database, stop both units, remove the database volume, start the new image
(its entrypoint runs the single migration), sign up, take a backup. The order matters: `podman auto-update` pulls
`latest` by itself, and the new migration cannot run against the old tables.

## 10. Where this departs from the field-by-field plan

| Plan (2026-11-13) | Here | Why |
|---|---|---|
| `streak_day.state` `learned`/`reviewed`/`both` | `practice_day.learned_at`, `reviewed_at` | each half is written on its own; no read-modify-write of a state |
| `piece.session jsonb` | `piece_revision` | lists never load it; it is deleted when the piece is finished |
| `llm_trace_opt_out` table | `user.help_improve` | one switch, one column |
| `llm_trace` keeps its name | `llm_call` | it is the calls layer; the monitor's query changes with it |
| `situation` is the demo's union | `opening` is the place's full state | the real places need more than the scenario page draws |
| name tables keyed by a work named in code | a `work` table | a new fandom should not need a deploy |
| `case` | `session_case` | `case` is a reserved word |

## 11. Open

- **`help_improve` off.** Proposed: the call's numbers are kept, its messages and output are not, and the admin's
  session pages do not list that learner's pieces. To confirm.
- **The public welcome page** describes the old product (lineups, the book). It needs new content before launch.
- **Models.** Everything was tuned on Claude Haiku through OpenRouter; DeepSeek Flash, GPT Luna and GLM have not run a
  whole session. One fixture run each before their setups are offered.
- **A long exchange.** How many turns pass 2 may take on before it must choose (iMessage allows 20).

## 12. State of the work

Kept current as the work goes; the history is in the commits.

**Done (2026-11-13):** the import (Biome's findings fixed in the code; the lab's control specimens left in the archive);
the base path removed; every package at its current major (SvelteKit 3, Vite 8, Vitest 5, TypeScript 6, since Kit 3 and
svelte-check cannot use 7 yet); remote functions and async Svelte switched on (§6.8); Postgres through drizzle 0.45 and
postgres.js 4, `src/env.ts` declaring the environment (Kit 3's replacement for `$env`), the account tables (§5.1) in
`drizzle/0000_init.sql`, `/health`, and the pool closed on `sveltekit:shutdown`.

| Check | State |
|---|---|
| `pnpm check` | 0 errors; about 100 Biome warnings (non-null assertions, CSS specificity order), left for when the pages are touched |
| `pnpm test` | 21 files, 109 tests pass |
| replay | the lab's 2026-11-12 session: 14 steps identical, then `notes` differs by the `was` field the lab added after recording |
| pages | the production build matches the demo pixel for pixel on 32 of 36 screenshots (desktop and phone); the rest differ by subpixels or data |
| container | builds and boots under `podman-compose` on an empty database: the migration applies, `/health` is ok, SIGTERM closes the pool |

The dev server's CSS can order a global sheet after a page's scoped rules where the build does not (an admin row's line
height differs by a pixel in dev only); judge looks on the build.

**Phase 1 is done** (2026-11-13): accounts below; `AGENTS.md`, `README.md`, `DEPLOYMENT.md`, the abuse-protection
rate-limit table and every environment list describe what exists.

**Phase 2, the loop: done** (accepted 2026-11-14, with phase 1 checked again).

- **The baseline** (2026-11-14). The lab's recordings did not replay (of 270, 149 miss the cache because their prompts
  changed, 64 crashed the server, 52 differed at the first step), so a new one was recorded with the code as imported:
  `lab/record.mjs` plays eleven cases (`lab/baseline/cases.json`: own writing in English and in Spanish, the mail,
  Discord, Reddit and AO3 places, a translation; both tutor languages) on Claude Haiku with a scripted learner whose
  choices rotate, so between them they send every action of the protocol. $0.35. The sessions and the cache are in
  `lab/baseline/`; `lab/replay.mjs` with `lab/account.mjs` replays them.
- **Calls** (done). `server/llm`: the provider table (`lib/llm/providers.ts`, shared with the key form), the transport,
  the dev cache, per-revision lanes and debug calls, `llm_call` records, and the `Caller` every model function takes.
  Learners' calls run on their saved key only ("nokey" without one, "refused" when the provider says so, both shown by
  the page's notice); the gate runs on `OPENROUTER_API_KEY`. The server logs an unhandled rejection instead of exiting.
- **The model layer distributed** (done). `src/model` is gone: the revision in `server/revision` (`RevisionSession` in
  `revision.ts`), the gate in `server/writing`, collecting in `server/notebook`, sources and names in
  `server/translation`, `text/` for words and diffs, the fixtures with the developer panel in `server/dev`. The lab's
  experiments went with it (the whole-session runner, the simulated learner, the analysis and pass-1 variants, the
  task/stage globals, the vet); the chip counter is per revision. The baseline replays identically after each step.
- **Pieces, the tape and snapshots** (done). A revision belongs to its piece: every action is a `piece_step` row and
  the snapshot is written with it (and when a background call settles); an idle revision leaves memory after 30
  minutes, shutdown writes every snapshot. The baseline replays identically, also with the revision thrown away and
  loaded from its snapshot before every step, and across a server restart.
- **Coming back** (done). The composer, a scenario's after page and the translation sheet create the piece and open
  `/live/<piece>` (the setup also handed over in memory, so the page does not ask for it); a reload asks `resume` and
  lands on §6.2's checkpoints: the scene card, pass 1 typed out at once up to the first card not answered, the end of
  pass 1, pass 2 with the spots behind the learner greyed in the thread and the next one ready. Instead of
  `pass1progress`, one `progress` action carries the page's bookmark (pass 1's answers; once pass 2's plan is agreed,
  the plan, what became of each spot and the conversation about it), because pass 2 also has facts only the page
  knows (how much help a spot took, for say-it-again and the notes). Neither action is a step on the tape. A spot
  left half done starts again from its beginning; its materials, grades and hints come back from the revision's
  memos (an own reading or a question asked again is a new call).
- **Finishing and the lists** (done). `end` finishes the piece with what pass 2 reworked standing in as `learned`, and
  carries the notes request (the parts reworked, theirs first, and pass 1's changes not made unaided); the server then
  makes the notes call itself (a step on the tape), files the entries and drops the revision. The piece's page looks
  again every two seconds while they are on their way, and after two minutes asks once more (`askNotes`). The piece's
  page, My writing, the sidebar and the shelf read the learner's pieces from the server (`pieces`, `pieceById`);
  posted and written-again are commands. The demo's stand-in pieces and the clean-ups of older builds' local data are
  gone; this device keeps only a scenario set aside before its revision (phase 4) and the tour's sandbox.
- The operations monitor's hourly volume check reads `llm_call`.
- **Checked in the browser** (2026-11-14, headless Chromium on the baseline cache): coming back at each checkpoint of
  own writing (pass 1 part answered and at its end, pass 2 after the plan and after a spot), the composer into
  `/live/<piece>` with its view transition, and the whole loop of the translation case on the dev server and on the
  production build: pass 1, three spots, the end, the piece's page with its entries filed by the server. No page
  changed its look beyond a place left out of My writing's line when a piece has none yet.
- **Accepted before phase 3** (2026-11-14). Accounts end to end in the browser with Turnstile on (Cloudflare's
  click-to-pass test key): sign-up, the link from the console, the welcome, a key saved in settings, a new address
  confirmed by its link, sign-out, a password reset by mail, sign-in with both new, the account deleted with nothing
  left behind. The image built and booted under `podman compose` on an empty database (migration, `/health`, sign-in,
  a piece, `resume`, `nokey` without a key, SIGTERM). The production build beside the demo, desktop and phone, light
  and dark: home, My writing, the piece's page, the scene card, pass 1, pass 2. Found and fixed on the way: the
  Turnstile widget never rendered (the site key came after the widget looked for it), so no signed-out form could be
  sent with captcha on; mail went out with a host but no password instead of being printed; the call bubbles, the
  developer settings, `/api/fixtures` and `/lab` showed to every learner in a production build (now development and
  admins only).

**Phase 3, what comes back: built** (2026-11-15), waiting for the user's acceptance.

- **Tables.** `note`, `reading`, `review_log`, `practice_day`, `user_week` as §5.2 and §5.6, in the one migration. `note.sentence`
  is an own entry's sentence as settled (with `was`, what was first written there) or a collected one's sentence as read
  (with `marked`, the words highlighted). Deleting an entry sets `deleted_at` and keeps its review history.
- **Notes.** Filed when a piece's notes call lands (`fileNotes` → `fileOwn`, once per piece, in the transaction that
  writes `piece.learned`), and as each collected highlight is filled in (`/api/collect/explain` keeps the reading once
  and an entry per phrase; a mark undone or changed takes its entry away). New entries are due from the next local day.
  Which face a card shows is its review count over its faces (`noteFaces`: own sentence, then examples; a collected
  one's sentence, then its example; bare when the phrase is in none).
- **Review.** ts-fsrs 6 with FSRS-6, not the package's FSRS-7 default: FSRS-7's first intervals are far longer (a first
  Easy almost two months, Good-Good five days) and its model overrides the learning steps, which breaks "an empty
  queue is the day done"; the review log keeps every rating with the card before and after, so a later move to FSRS-7
  can replay history. Labels follow the demo ("10m", not Anki's "<10m"). ts-fsrs 6 needs Node 24: the image moved to
  `node:24.22.2-alpine`.
- **The week.** The glasses, the popover and the profile's history read the server; the demo's stand-in history is
  gone. The queue that counts for a day is the language's being worked in (the one the learner sees).
- **Follow-ups and write-again** were already the server's (phase 2); writing again now credits the day.
- **Checked** (2026-11-15): the baseline replays identically (all eleven); three pieces finished with notes filed
  (seventeen entries, due the next day); in the browser on the dev server: the shelf's review row and the sidebar count,
  the notebook list, filters, an entry, editing and deleting it, a whole sitting of six cards (thirteen ratings, the
  buttons' intervals from the scheduler), the glass filled after it, the profile, collecting two phrases with one live
  call (one removed again), write-again crediting the day. The image on Node 24 built and booted under `podman compose`
  on an empty database (the migration with the new tables, `/health`, a card reviewed and the day's half written,
  SIGTERM).
- **Open.** Review's "Is mine OK too?" still answers with the demo's stand-in replies (the demo says the app would ask
  the tutor); a real call is a new prompt, for the user to decide.

**Accounts (done 2026-11-13).** Better Auth 1.7 behind the demo's sign-in, sign-up, confirm, forgot-password, welcome
and settings pages; the account reaches the pages through `me` (a remote query) poured into the `account` and
`app.prefs` the pages already read, and writes go through remote commands. Decisions taken on the way:

- No session cookie cache: every request reads the session and user, so what the app writes (finishing the welcome, a
  granted role) holds on the next request. Hooks redirect by `onboarded_at` and `role`.
- Turnstile guards only the signed-out endpoints (the signed-in ones stand behind a session that passed it), rendered
  `interaction-only` in the auth layout; a signed-in learner asking for the link that sets a first password skips it.
- A new address needs the current password, or a sign-in under ten minutes old for an account without one;
  `pending_email` holds it until the link is opened, and cancelling only forgets it (the mailed link works until it
  expires).
- A saved key is not tried against its provider: the demo has no place for that error, and a refused key surfaces at
  the first call as `LimitNotice`'s "refused", with its way to the key.
- An address that already has an account gets the sign-up's answer, and its mailbox a "you already have an account" mail
  (`onExistingUserSignUp`).
- Mails are English and plain until the catalog has mail strings; without `SMTP_HOST` they print to the console.
- Better Auth's own `deleteUser` stays off: the app's `deleteAccount` command deletes the row (§5.1).
- Four strings joined the catalog in every language: `auSomethingWrong`, `auCaptchaFailed`, `acWrongPw`,
  `auSocialFailed`.

### Decided by the user after the handover (2026-11-13)

**No base path.** The app is only ever served from the root of its host; sub-path deployment goes, and the demo's bare
`"/…"` URLs stay as they are. Remove, together:

- `svelte.config.js`: `BASE_PATH`, `paths.base` and `paths.relative`; the error template no longer needs
  materialising, so `src/error.html` loses `%libiamo.base%` and `scripts/error-template.mjs` and its test go;
- `test/base-path.test.ts`;
- `Dockerfile`: the `BASE_PATH` build argument and both `ENV`s, and its use in the `HEALTHCHECK` URL;
- `docker-compose.yaml` and `.env.docker.example`: the `BASE_PATH` build argument;
- `.github/workflows/publish-image.yml`: the `base_path` input and build argument;
- `deploy/podman/ops/operations.py`: the public probe is `ORIGIN + /health` (and its test in `test/deploy`);
  `libiamo-app.container`: the comment about appending the base path to `HealthCmd`;
- `DEPLOYMENT.md`, `README.md`, `AGENTS.md`: every mention, including the rule that internal URLs go through `base`;
- when Better Auth comes back from `legacy`: `baseURL` is `ORIGIN` (Better Auth appends its default `/api/auth`; spelling the path out
  makes it match `/api/auth/api/auth`), and the cookie path is the default `/`.

**The package upgrade, done properly.** Bring every package to its current major (SvelteKit 3, Vite 8, Vitest 5,
TypeScript 7, adapter-node 6, vite-plugin-svelte 7, tailwind-variants 4, and whatever else is behind; bits-ui was
pinned at 2.16.4 in the demo for a reason, so check that reason before moving it). How:

1. One sonnet subagent, and only one, finds out from the migration guides and changelogs (the web, or the packages'
   own docs) what each major version changed and what it added.
2. Apply the breaking changes to this project.
3. Think about which new features are worth using here (for instance anything that replaces hand-written loads,
   actions or endpoints, typed server calls, streaming, new routing or transition APIs). Do not adopt any on your own:
   for each one worth it, ask the user with the ask-user tool, saying what it would replace and what it costs.

The upgrade is its own commit after the import, so a change in behaviour can be told from a change in the port. Check
the same things after it as before: `svelte-check`, the tests, the dev server, the replay.
