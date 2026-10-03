---
title: Less repeated server and database work
related-design: docs/design/2026-09-24-server-load-reduction.md
---

# Less repeated server and database work

Much of the app's database traffic came from work repeated on every request, navigation or poll
rather than when the underlying data changed. This change removes those repeats.

**Sessions.** Better Auth now caches the session in a signed cookie for five minutes, so resolving
the signed-in user no longer queries the database on every request.

**App layout.** The layout's streak, queue and trial-balance reads used to re-run on every
navigation and every 3 s while a chat reply was pending. They now re-run only when something changes
them: after an AI action (which refreshes the balance, and does nothing for learners on their own
key), when a reply finishes arriving, when a Note is rescheduled or deleted, and once at local
midnight.

**Quest Hall.** `/` and `/task/[id]` now share a `(hall)` layout that loads the book once on entering
the Hall. Opening a task's details or returning to the catalog asks the server only for that page's
own data. Each page places the book through a small universal `+page.ts`. The book reloads itself
once if a tab stays open past midnight.

**Unread replies.** The Hall used to poll the inbox every 12 seconds. It now polls only while a reply
is actually on its way, wakes once for replies scheduled later, and refreshes when the tab regains
focus. A new partial index lets unread counts read just the unread replies, both in the inbox and on
the Hall's cards. Acknowledging a reply is a single statement.

**Review.** The unused `/api/review/due` endpoint and its stats function are gone. The streak sheet's
per-language counts come from `/api/review/available`, counted in SQL with the same rule as the
streak's queue check. A rating that leaves cards in the queue no longer locks and rewrites the
streak row.

Apply migration `0023_unread_reply_index` when deploying.
