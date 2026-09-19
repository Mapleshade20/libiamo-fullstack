---
title: One note lifecycle and a shared post-task transfer stage
type:
    - feature
    - tech-debt
status: wip
---

# One note lifecycle and a shared post-task transfer stage

Today a translation attempt ends with a card pass over the notes it produced (the `transfer` phase),
while a practice session produces notes during feedback and then drops the learner on the page with
no pass at all. The transfer queue, its snapshot, and its server calls live inside
`translation-practice.ts`, so giving practice the same stage means either duplicating them or
sharing them properly.

Two rules come out of that, and the streak design
(`docs/design/2026-09-18-streak.md`) depends on the first one.

## 1. A note is due from the learner's next local day

**Every note is created with `due` at the start of the learner's next local day**, in state New,
instead of `due = now` as `createEmptyCard()` gives today.

Why: a note created by finishing a task should not join the same day's `/review` workload. The task
that produced it already practises it in its own transfer stage (§2); spaced repetition starts the
day after. Without this, the notes a task just generated make the review queue non-empty the instant
the task ends, which is both confusing in `/review` and fatal to the streak's review gate.

- `insertNotes` gains a required `availableFrom: Date` argument (the next local midnight, derived
  from the request's browser timezone) and uses it as the new card's `due`. Every creation path
  passes it: `createNotes`, `createNotesBatch`, `createNotesFromSelectionBatch`,
  `createNoteFromSelectionQA`, and `generateTranslationPractice`.
- `/review/manage` keeps its current behaviour: due-day offsets and scheduling resets are explicit
  learner overrides and may put a note back into today.
- No migration for existing notes. Notes already created with `due <= now` are already visible; they
  keep their scheduling.

### 1.1 The transfer pass rates cards that are not due

A due date in the future collides head-on with `rateNote`'s admission guard
(`review.ts:231`): `isReviewCardAvailable` is false for a New card due tomorrow, so **without a
second change the first Incorrect/Pass of every transfer pass throws `ReviewCardNotDueError`** — the
step that is supposed to unblock the streak would break translation's existing flow instead.

`rateNote`'s trailing positional arguments therefore become one options object, and it gains one
explicit option used only by the transfer path:

```ts
rateNote(noteId, userId, rating, elapsedSeconds, { random?, now?, outOfBand?: true })
```

- It skips the availability guard. `/review` keeps the guard exactly as it is — an out-of-band
  rating is a deliberate capability of the pass, not a relaxation of the study queue.
- When the rated card **was not available**, the stored `due` becomes `max(scheduledDue,
  previousDue)`. For a note created today that is tomorrow's midnight, so the pass cannot drag its
  own cards back into today's queue. No timezone and no `createdAt` are needed, and `/review`
  ratings are untouched, including Again on a learn-ahead card (which must stay at its 1-minute
  step).
- FSRS state and `reviewLog` are unchanged; only the stored `due` is raised.
- Repeats *inside* a pass are unaffected either way: an Incorrect answer returns the card through
  the client-side queue tail, never through `due`.

One case is deliberately left alone: a pass resumed the day *after* its notes were created rates
cards that are genuinely due today, so they land in normal learning steps and stay in today's queue
until they graduate. That is the correct reading — those cards are today's review workload — and the
streak's gate should be satisfied by clearing them, not by exempting them.

## 2. Both task types end with the same transfer stage

### 2.1 Shared pieces

| new location | what moves there |
| ------------ | ---------------- |
| `src/lib/transfer-queue.ts` | `TransferQueueItem`, `advanceTransferQueue` (Incorrect → tail with a fresh example, Pass → drop), `transferQueueNotes` (queue resolved against loaded notes), snapshot validation — lifted verbatim from `translation-feedback-snapshot.ts` |
| `src/lib/components/review/TransferStage.svelte` | the `StudyCard` wiring: queue counts, reveal, Incorrect/Pass actions, completion callback |
| `src/lib/server/transfer.ts` | `listTransferNotes(userId, source)`, `rateTransferNote({ userId, source, noteId, rating, elapsedSeconds, timeZone })`, `completePracticeTransfer(userId, sessionId)` over `type TransferSource = { type: "practice"; sessionId: number } \| { type: "translation"; attemptId: number }` |

Completion stays split on purpose. The note-level pieces — listing, ownership, rating, the streak
observation — are shared, but *finishing* a translation attempt is a transition of that attempt's
own state machine, guarded by its phase and version and now carrying the quest credit, so
`completeTranslationTransfer` remains in `translation-practice.ts`. Only the practice side, whose
completion is a single nullable column, lives in `transfer.ts`.

`rateTransferNote` is the single place that passes `outOfBand: true` (§1.1) and, after the rating
lands, the single place the streak's review observation is triggered for this path (see the streak
design §2.3). It takes the request's timezone for that reason alone.

`translation-practice.ts` keeps its Generation-2 note *creation* and its phase guards, and delegates
the pass itself to the shared module. The visible translation flow does not change.

Ratings stay Incorrect / Pass (`1` / `3`) on both sides, so one queue, one card UI, one rating
contract.

### 2.2 Practice sessions

- `practiceSession` gains `transfer_completed_at timestamp null`. No change to the `session_status`
  enum, which archive, unread, and the reply worker all read.
- Practice notes are collected by the learner during feedback (selection and batch actions), so the
  set is not fixed until they say so. The feedback page gets an explicit end-of-page action —
  "practise these N cards" — that enters the stage over the notes with
  `sourceSessionId = this session` at that moment, mirroring `enterTranslationTransfer`.
- A session where the learner collected no notes has nothing to practise. `transfer_completed_at` is
  written **only** by the POST that finishes a pass — with no notes there is no action to click and
  no request to write it, so "nothing to practise" is derived from the note count, not recorded.
  The column answers "was the pass done", not "is the session finished".
- The stage lives inside `/task/[id]/feedback` as a phase of that page, the way translation's
  transfer is a phase of `/translate/[id]/feedback` — not a new route.
- Its snapshot follows the existing pattern: versioned, tab-scoped, holding only the queue
  (`src/lib/client/practice-transfer-snapshot.ts`). It also stores the note ids the pass started
  over, so collecting another note after starting discards the stale queue rather than drilling a
  set that no longer matches.

### 2.3 What stays separate

Do not unify further. Translation's correction and second-draft phases, its evaluation snapshot
schema, and practice's note-from-selection creation are genuinely different workflows; only the card
pass and the note lifecycle are shared.

## 3. Consequences for other features

- **Streak.** The review gate becomes observable: after §1, finishing a task can leave the queue
  empty, so "quest done *and* reviews cleared" is reachable in one sitting. See the streak design.
- **Archive.** Unchanged: a practice session is still an activity at `completed`/`evaluated`.
- **`/review` counts.** Notes created today stop appearing in today's New count. `getReviewStats`
  needs no change — it already derives `dueToday` from `isReviewCardAvailable`.

## 4. Tests

- `test/lib/transfer-queue.test.ts` — the moved queue helper keeps its behaviour (Pass drops,
  Incorrect re-queues at the tail with the given example, empty queue is a no-op).
- `test/lib/server/note.test.ts` — notes are inserted with `due` at the given next-day boundary.
- `test/lib/server/review.test.ts` — `rateNote` rejects an unavailable card by default, accepts it
  with `outOfBand`, raises its `due` to the previous one in that case, and leaves an ordinary
  `/review` rating (including Again on a learn-ahead card) byte-identical to today's behaviour.
- `test/lib/server/transfer.test.ts` — `completeTransfer` is idempotent per source and rejects a
  note that does not belong to the source.

## 5. Work order

1. §1 in `note.ts` / `review.ts` plus the callers and their tests.
2. Lift the queue helper and `TransferStage.svelte`; re-point translation at them with no visible
   change (this is the refactor checkpoint — translation must still pass its tests untouched).
3. `transfer.ts` with the `TransferSource` union; migrate `translation-practice.ts` onto it.
4. `practiceSession.transfer_completed_at`, the feedback-page entry action, and the practice stage.
