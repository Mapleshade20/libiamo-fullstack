---
title: Flat tasks and decoupled lineups
related-design: docs/design/2026-09-23-task-model-simplification.md
---

# Flat tasks and decoupled lineups

Before this change a chat task was a copy. An admin wrote a *template*, gave it *variants* with
`{{slot}}` values, and every day or week the scheduler picked a variant, resolved the slots and
inserted a fresh `task` row. Translation lived in a separate `translation_template` table and had
its own URLs. Sessions then snapshotted the agent prompt, urgency and max turns, and prefixed a
random MBTI persona.

Now there are three layers, and each one does a single job.

## Content: `task`

One flat table holds both kinds of task. `interactionType` decides which columns apply, and a
check constraint enforces it:

- **Chat** tasks carry the agent prompt, UI, opening state, urgency and max turns.
- **Translation** tasks carry reference paragraphs and translation context.

Tasks are static and edited in place. Sessions read them live, so fixing a typo in an agent prompt
reaches sessions that are already running. There are no more snapshots, slots, personas, points or
gems. Contributions keep their own `task_contribution` table, which mirrors the task fields.

## Distribution: lineups

A `lineup` is a dated list for one language and kind (daily, or weekly starting on Monday), and
`lineup_task` lists its tasks. Nothing is copied. When a learner opens the Quest Hall, the current
lineups are created on demand and auto-filled to three tasks. Candidates come from
`lineup_rotation`, least recently lined up first. The lineup row is locked while it fills, so two
concurrent loads cannot overfill it. Admins add tasks by hand on `/admin/lineups`.

The names are deliberately neutral. A future "issue" publishing model, or putting translation
tasks into lineups, only needs more lineup kinds or metadata. The task and attempt tables would not
change.

## Attempts

`practice_session` and `translation_attempt` store `task_id` plus a nullable `lineup_id`, which
references the lineup entry the attempt was started from. Completion is unique per
`(user, task, lineup)`. A task that shows up again in a later lineup is therefore *Ready* again,
while the earlier lineup keeps its finished attempt.

URLs name only the task: `/task/[id]`, `/task/[id]/session`, `/task/[id]/feedback`,
`/task/[id]/translation` and `/task/[id]/translation/feedback`. The server works out which attempt
to show:

- A `?lineup=` parameter pins that lineup's attempt. Archive and unread links always pin.
- Otherwise an unfinished attempt wins.
- Otherwise it shows the attempt in the current lineup.

The `/translate/*` routes are gone.

## Admin

`/admin/tasks` replaces templates, variants and the slot editor. It has one form per task, a
rotation setting, activate/deactivate, delete (only while no learner has worked on the task), and
JSON export/import (version 4). `/admin/lineups` replaces the schedule page.

## Migration `0022`

The migration truncates learner data (sessions, attempts, notes, review logs, streaks,
contributions) because nothing is public yet. It then converts content:

- Each chat template × variant becomes one task with its slots resolved.
- Templates without variants become inactive tasks. Placeholders such as `{{title}}` stay visible
  in their titles until an admin edits them.
- Valid translation templates become translation tasks.
- A template's cadence becomes the task's rotation.

Finally it drops the old tables and enums.

## Verified

`pnpm check` and `pnpm test` pass. In the browser I checked:

- The Quest Hall and the book's daily/weekly/translation sections.
- A chat task through a real agent reply. The session is recorded against today's daily lineup.
- The start of a translation draft.
- The admin task list, editor save, and lineup add.
- Pinned `?lineup=` URLs, and 404s for unknown tasks.
