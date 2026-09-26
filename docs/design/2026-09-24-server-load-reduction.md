---
title: Reduce per-request and polling load on the server and database
type: performance
status: wip
---

# Reduce per-request and polling load on the server and database

## Problem

An audit of `src/routes/api/` and the loads around it found work that repeats far more often than
the data it reads changes:

- `hooks.server.ts` resolves the Better Auth session from the database on every request, including
  every poll.
- The `(app)` layout load read `event.url.pathname` for the signed-out redirect, so it re-ran on
  every client navigation: API key, trial balance, streak record and the account-wide queue probe.
  The chat and mail UIs also invalidated `TRIAL_QUOTA_DEPENDENCY` on every 3 s poll while a reply
  was pending, re-running the same layout load each time.
- `/` and `/task/[id]` each called `loadQuestHallData` (lineups, sessions with every message, the
  full translation catalog and attempts), so moving between the catalog and a task's details
  reloaded the whole book.
- The Hall polled `GET /api/unread` every 12 s whether or not any reply could arrive, and the inbox
  query joined every message of every session before filtering in JavaScript.
- `GET /api/review/due` had no caller. `GET /api/review/stats` computed per-language stats nobody
  read (with a server-timezone "today") before the per-language counts the streak sheet uses, and
  both scans pulled every Note's FSRS JSON into Node.
- Every rating (review and transfer) opened a transaction that inserted, locked and re-read the
  streak row, even though a queue with cards left can never change the record.
- `POST /api/unread` checked ownership and then updated in two statements.

## Decisions

### Session cookie cache

Enable Better Auth `session.cookieCache` for 5 minutes (compact, HMAC-signed). `updateUser` rewrites
the cookie, so language and profile changes are immediate; direct database writes to session-visible
user fields (role) surface within 5 minutes; `/change-email` already reads
`getAuthoritativeSessionFromCtx`, which bypasses the cache. The app offers no remote session
revocation, so the 5 minute window does not weaken an existing feature.

### App layout refreshes by dependency, not navigation

Read the pathname through `event.untrack`. The layout then re-runs only on `TRIAL_QUOTA_DEPENDENCY`,
`STREAK_DEPENDENCY` or `invalidateAll`. Freshness that navigation used to supply by accident becomes
explicit:

- `refreshTrialQuota()` (`components/account/trial-quota.ts`) invalidates the balance after each
  LLM-backed action: hints, translation help, Note follow-ups, feedback Tutor/Note actions, the
  translation verifiers. It is a no-op for learners on their own key. Chat and mail polling
  refresh only the conversation, and refresh the balance once when outstanding agent work settles.
  The translation draft submit redirect invalidates the balance and streak.
- The empty-queue probe depends on the layout's queue snapshot, so `StreakHost` invalidates the
  streak once when the local day rolls over, and Note management invalidates it after reschedule,
  reset or delete. Ratings already observe the queue server-side.

### Hall data belongs to a `(hall)` layout

Move `/` and `/task/[id]` into `(app)/(hall)/`. Its layout server load returns `{ hall }` and reads
neither URL nor params, so it runs on entering the Hall and on `QUEST_HALL_DEPENDENCY`, never on
moves inside it. Pages assemble `questMenu` in a universal `+page.ts` through `parent()`; on the
client that reuses the cached layout data. Server loads must not call `parent()` for it: SvelteKit
re-executes the parent server load on the server whenever a child server load awaits it, even when
the client did not invalidate that layout. `questHallDetails` moves to `lib/quest-hall/details.ts`
so the universal load can run it. The task page's server load returns only its `preparation`.

`QuestMenu` invalidates the Hall once per new local day (on tab return or the next Hall navigation),
because the persistent data would otherwise keep yesterday's lineup.

### Unread inbox follows outstanding agent work

- A partial index `session_message_unread_idx (session_id, id) WHERE role = 'assistant'`; the inbox
  joins only replies past each watermark, and the Hall's lineup read counts them with a correlated
  subquery instead of loading every message. (Drizzle's relational `extras` remap every column to the
  root alias, so that read uses a core `select`.)
- `GET /api/unread` also returns `nextAgentWorkDueAt`, the earliest outstanding response batch across
  the learner's sessions. `planAgentWorkPolling` moves to `lib/practice/agent-work-polling.ts` and
  the subscription follows it: poll every 12 s while a reply is due within 30 s, wake once at a later
  due time, and stay silent otherwise; a failed read retries at the interval; returning to the tab
  refreshes. Server-sent events were rejected: self-hosted proxies buffer, and polling would remain
  as a fallback.
- `POST /api/unread` becomes one `UPDATE … WHERE EXISTS (owned assistant message) RETURNING`.

### Review endpoints and the rating fast path

Delete `/api/review/due`, `getReviewStats` and `getAvailableCardsByLanguage`. Replace
`/api/review/stats?byLanguage=1` with `GET /api/review/available`, a `GROUP BY language` count
sharing one SQL predicate with `isReviewQueueEmpty` (still pinned by the equivalence test).
`recordReviewObservation` first probes the queue without a lock and returns when cards remain; an
empty queue is rechecked under the lock before it counts.

## Out of scope

The conversation page's own 3 s poll while a reply is pending reloads the whole conversation; it is
bounded by `maxTurns` and only runs while work is outstanding, so it stays.
