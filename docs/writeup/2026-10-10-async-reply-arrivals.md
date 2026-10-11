---
title: Separately scheduled replies for Reddit, AO3 and mail
related-design: docs/design/2026-10-07-async-reply-arrivals.md
---

# Separately scheduled replies for Reddit, AO3 and mail

[PR #99](https://github.com/Mapleshade20/libiamo-fullstack/pull/99) addresses [issue #97](https://github.com/Mapleshade20/libiamo-fullstack/issues/97). Reddit, AO3 and mail now schedule each participant separately instead of generating everyone's replies as one burst.

## What changed

- Supplements update only replies that have not started in the same conversation. Replies already being written or delivered survive new learner messages, and sibling branches no longer redirect each other's work.
- Authored participants from nested opening comments can answer top-level questions. Generation is restricted to the selected participant, who can also choose silence.
- Group scenes have separately scheduled background activity, bounded by an activity budget and suspended while replies remain unread. Reading can resume it.
- Mail delivers one complete email per reply. One extra complete email can be preserved for later delivery, anchored to the first email's actual arrival.
- Polling follows pending delivery times, avoiding repeated wakeups for a batch whose generation time is already past. Ordinary read receipts avoid loading the full conversation for background resumption.
- The learner's private task brief is no longer sent to counterpart roles on **any** platform. This is a deliberate cross-platform prompt change; iMessage and Discord otherwise keep their existing reply lifecycle.

## Review fixes

Messages with no available reply slot now settle as unanswered rather than waiting forever. Live-chat retries no longer inherit a superseded failure, and old Reddit/AO3 history keeps its original waiting rule. Shared helpers centralize message references, combined waits and mail-header handling.

Scene Lab now passes the selected participant and conversation target and can generate background events. It still finishes each reply wave before the next learner message, so correction-during-wait and overlapping-background scenarios remain outside its faithful replay coverage.

## Migration and verification

`drizzle/0030_async_reply_opportunities.sql` adds the participant, conversation target and retry attempt to reply batches, plus background-work support and its outstanding-work uniqueness guard. After rebasing onto main, its snapshot follows `0029_announcements`; the SQL is byte-identical to the replaced branch migration.

Review verification on 10 October 2026:

- `pnpm check`: no errors or warnings; no formatting changes.
- `pnpm test`: 179 files, 1441 tests passed.
- Migration snapshot ancestry and increasing journal timestamps checked; no database migration execution or end-to-end timing replay performed.

The one-generation-per-learner limit remains across sessions. Reply schedules are sampled independently, but model calls queue behind one another; slow asynchronous replies can delay Discord/iMessage replies too. This timing tradeoff and Scene Lab's remaining replay gaps are not resolved by passing unit tests.
