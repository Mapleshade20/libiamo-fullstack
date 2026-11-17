---
title: Data reads that do not grow with a learner's history
type: performance
status: wip
---

# Data reads that do not grow with a learner's history

## The load to design for

Two kinds of learner at once: **100 who have written 400 pieces each** and **500 who have written 30**. Reasoned from
the code and from row sizes in the development database (no load test):

| Per learner | Heavy (400 pieces) | Light (30 pieces) | Everyone |
|---|---|---|---|
| `piece` | 400 | 30 | 55,000 |
| `note` (about 4 per finished piece, plus collected) | ~1,500 | ~120 | ~210,000 |
| `piece_step`, the tape (~18 steps, ~21 KB compressed per piece) | ~7,200 rows, ~8 MB | ~540 rows, ~0.6 MB | ~1M rows, ~1.2 GB |
| `piece_revision` (~19 KB, only while a piece is open) | a few | a few | a few thousand |
| `review_log` (heavy learners review ~30 cards a day) | ~10,000 a year | ~500 | ~1.2M a year |
| `practice_day` | ≤ 365 a year | ≤ 60 | |
| `llm_call` (kept 30 days) | ~1,000 | ~300 | ~100,000, steady |

None of this is big for Postgres: every per-learner query has an index on `user_id`, and at most a few thousand rows
sit under one learner. The database is not what breaks first. What breaks first is **reads whose size follows the
learner's whole history**, because they are read on every page, or shipped to the browser, or both. A heavy learner
then costs 10–15 times what a light one costs on the very same page, and it keeps growing.

## Where history leaks into a request today

| Read | When | Heavy learner today | Light learner today |
|---|---|---|---|
| Root layout `pieces()`: every piece in every language, with `learned` and the rewritten text | every full page load, into the HTML | ~400 items, ~250–400 KB | ~30 items, ~25 KB |
| `notebook(lang)`: every entry with usage, examples and the review face built for each | /notebook, and /profile and /scenario/[id] (for a count and four phrases) | ~1,500 entries, ~2 MB, and faces built for all | ~120 entries, ~150 KB |
| Client derivations over the full list: `followUp`, the sidebar's open count and recent six, the profile's finished count, a scenario's open piece | every page | needs the whole list above | |
| Admin `users()`: five unconditional `GROUP BY`s over `piece`, `note`, `llm_call`, `session` | each view, each delete | scans ~270k rows | |
| Admin `sessions()`: 200 pieces with every step's body and response | each view | ~4 MB of JSON parsed | |
| Admin scenario list: written counts per scenario | each view | scans all finished pieces (no index on `scenario_id`) | |

Already bounded and fine: review (`due` is a count plus two, the sitting is capped at 200), the week and the profile's
26 weeks, one piece's page, the exchange (indexed by exchange), the worker's scans and the sweeps (indexed on status or
a partial index), `me()`, the auth session lookup, `llm_call` (30-day window).

## Rules

1. **What every page reads is bounded by constants, not by history.** The shell needs the open pieces (a handful),
   the six most recent, at most one follow-up and a few counts; it must not need the whole list.
2. **A list is per language, slim, in index order, and read a page at a time** (keyset: `created_at, id` below the
   last one shown). The page size (100) is above what a light learner has, so they never see paging; a heavy learner
   gets the first hundred at once and the rest as they scroll.
3. **Counts and "is there one" are SQL**, never `.length` of a fetched list.
4. **Detail is read where it is shown.** Usage, examples and review faces on a note's page; `learned`, the rewritten
   text and the result on a piece's page; the tape on the admin's session page.
5. **What an admin list needs from big JSON is written small when the piece ends**, not recomputed from tapes on
   every view.
6. **Every hot query's index starts with its equality filters and continues with its order**, and every foreign key
   to `user` has a non-partial index, so deleting an account does not scan the big tables.

## The changes

### The shell (root layout)

- `pieces()` gives way to `shelves()` (`server/writing/pieces.ts` `shelvesOf`): per language, the unfinished pieces,
  the six most recent (not abandoned), the follow-up and how many are finished. The follow-up's candidates are the
  newest due piece of each kind per language (`DISTINCT ON`), picked by the rule in `lib/writing/follow-up.ts`, which
  the tour's sandbox also uses. Slim items only (id, title, place, language, state, created/finished/asked/again
  times, scenario id, whether posted): ~200 bytes each, a few KB in all for anyone. The layout loads it beside `me()`.
- The sidebar, the shelf, a scenario's page (its open piece) and the profile (finished count) read it; nothing reads a
  full list any more. `refreshWriting()` refreshes this one query. A language switch is instant: every language the
  learner has written in is in it.

### My writing

- `/writing` reads `piecesInPage({ lang, after })`: the slim items of one language, newest first, 100 at a time, and asks
  for more at the end of the list. Heavy: ~18 KB per page; light: everything in the first.

### The notebook

- `notebook({ lang, from, after })`: slim rows (id, phrase, gloss, own/collected, where, due or days to next), filtered
  on the server, 100 at a time. No faces, examples or usage: those are `noteById`, which the entry's page already
  reads. Heavy: ~15 KB per page instead of ~2 MB.
- The profile's phrase count is a `count(*)` and the scenario page's phrases a `limit 4` query, both `glance(lang)` (later ranked by fit, as
  §12 of the rebuild design notes).

### Admin

- Users: 50 to a page, newest first, searched on the server (name, address or id; the search is never a pattern); the
  aggregates scoped to that page's ids (each an index lookup by user). A user's page reads that one account.
- Sessions: the list stays the 200 most recent (tapes now last thirty days, so it is a month at most), but reads only
  the few fields its signals need from each step (which stop, passed, the learner's own, how many issues or stops),
  extracted in SQL, instead of every step's documents; `signalsOf` is unchanged. The session page still reads one tape
  whole.
- Scenario list: written counts use a partial index on `piece(scenario_id)`.

### Indexes (folded into `drizzle/0000_init.sql`, which is regenerated until launch)

| Table | Now | Becomes | For |
|---|---|---|---|
| `piece` | `(user_id, language, updated_at)` | `(user_id, language, created_at desc, id)` | the shelf, My writing's pages, a scenario's progress |
| `piece` | | `(scenario_id) where scenario_id is not null` | written counts, "has anyone written in it" |
| `note` | `(user_id, due) where deleted_at is null` | `(user_id, language, due) where deleted_at is null` | due count, the sitting (both filter the language) |
| `note` | | `(user_id, language, created_at desc, id) where deleted_at is null` | notebook pages |
| `note` | | `(user_id)` | account deletion (the partial ones cannot serve it) |
| `review_log` | `(note_id)` | `(note_id)`, `(user_id)` | account deletion |

### Storage

- The tape is the biggest table (~21 KB a piece). Nothing a learner sees reads it once the piece is finished (its page
  reads the piece's row); only the admin and `case pull` do, and a replay also needs the model calls, which go after
  thirty days. So a finished piece's tape is kept as the calls are (decided 2026-11-16): thirty days, held by an open
  case, and not at all for a learner who does not help improve Libiamo (nobody reads theirs). At this load that is
  about a month of activity (~100 MB) instead of ~1.2 GB and growing.
- A finished piece's revision snapshot is dropped once its notes are filed. Replays and a page that never asks for
  notes leave it behind (105 of them in the development database); the six-hourly prune also deletes snapshots of
  pieces finished more than a day ago.

### Unfinished pieces (decided 2026-11-16)

Left unfinished, a piece costs little (its snapshot and tape, no memory after thirty minutes) but used to stay "open"
for ever, and one whose revision could no longer be opened (its snapshot gone, or written by an older version)
silently sent the learner home. Now such a piece is **abandoned**: its revision and tape go, what was written stays.

| Kind, where it is | Abandoned when |
|---|---|
| Any, in its revision | the snapshot is thirty days old, missing, or of an older version (also the moment a page fails to open it) |
| A scenario's conversation, its place closed (the worker closes it after 48 hours) | at once if the learner wrote nothing in it; else thirty days after it closed or was taken up again |
| A translation taken up again and left on its sheet | thirty days after |

Its page shows what was written and "Start again", which goes where it was before its revision: the learner's own text
into a fresh revision; a translation back to its sheet; a conversation back to the after page. When the scenario
already has another unfinished piece, or the conversation holds nothing of the learner's, the scenario starts again.

### Drafts stay on the device (decided 2026-11-16)

A learner comes back to an unsent draft on the same device, so the server is not told until it is sent. The
translation sheet and the plan typed before a scenario were saved to the server as they were typed (a write every
pause); both now live in one bounded browser store (`lib/client/drafts.ts`, with a mail in the email place): thirty
days untouched goes, twenty at most, emptied on signing out. "Done" on the sheet is the one save, and creates the
piece with its pinned assignment and the plan; entering a place sends the plan. `scenario_plan` is gone. The
revision's bookmark is still saved after each answer: it is where a reload, a restart or another device comes back to.

## Not changed, on purpose

- The agent-reply worker's one-second scan: each query is an index range on a status with few live rows, the same
  cost for 600 learners as for one; delivering on time is what makes the chat feel alive.
- No session cookie cache (settings must hold on the next request), no Redis, no read replica: nothing at this load
  needs them.
- Light learners: everything above is designed so their requests look the same as today.

## Order of work (all done 2026-11-16)

1. Indexes and the snapshot prune (no behaviour change); tapes kept as model calls are.
2. The notebook's slim pages, the profile's count, the scenario's four phrases.
3. The shelf query and My writing's pages; `followUp` on the server. Unfinished pieces abandoned; drafts on the device.
4. The admin pages.

Each step: `pnpm check`, `pnpm test`, the replay baseline unchanged, and the pages checked in the browser with an
account seeded to 400 pieces (a dev seed, not a load test).
