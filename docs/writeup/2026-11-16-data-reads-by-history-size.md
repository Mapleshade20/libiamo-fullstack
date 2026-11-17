---
title: Reads that do not grow with a learner's history
related-design: docs/design/2026-11-16-data-reads-by-history-size.md
---

# Reads that do not grow with a learner's history

Designed for 100 learners with 400 pieces each beside 500 with 30. The database was never the problem at that size;
what grew with a learner's history was what every page read and what the browser was sent. Now a request costs what
the page shows.

- **Every page** used to carry all of a learner's pieces, with what each taught and its rewritten text (a few hundred
  KB for a heavy learner). It now carries a shelf per language: the unfinished pieces, the six most recent, at most
  one follow-up (picked on the server) and how many are finished: a few KB for anyone.
- **My writing and the notebook** read a hundred at a time, newest first, and ask for more as the end of the list comes
  near; the notebook filters on the server and sends only what a row shows (an entry's examples and review face are on
  its own page). A learner who writes now and then never sees a second page. The profile counts phrases with a
  `count(*)`; a scenario's page takes the latest four.
- **The admin's users** come fifty at a time, searched on the server, with their counts taken for that page only.
  **Sessions** read a handful of fields of each step for their signals instead of every step's documents.
- **Indexes** follow the queries (learner, language, then uuidv7 id for newest first), and every table that belongs to
  a learner can be emptied by user when an account is deleted.
- **What is kept**: a finished piece's tape goes as its model calls do (thirty days, or while a case is open; at once
  for a learner who does not help improve Libiamo; an abandoned piece's once no case is open), and snapshots finished pieces left behind are pruned.
- **Unfinished pieces** nobody will finish are abandoned after thirty days (a conversation with nothing of the
  learner's at once, and a revision that can no longer be opened the moment it is tried): the revision goes, what was
  written stays, and its page offers to start again where it was. A learner who comes back while the sweep runs keeps
  their piece: why it is abandoned is checked again in the piece's turn, and an open revision is never abandoned.
- **Drafts stay on the device.** The translation sheet and the plan before a scenario were saved to the server at every
  pause in typing. They now live in one browser store with the email place's draft (thirty days, twenty at most,
  emptied on signing out); the server hears of them when they are sent. `scenario_plan` is gone.

Checked: the unit tests, the PostgreSQL suite (shelf, pages, abandonment, taking up, tape and snapshot pruning, admin
pages), the replay baseline (identical, also reloading every step from its snapshot), and the pages in the browser with
an account seeded to 131 pieces and 130 notebook entries.
