---
title: Flat tasks, decoupled lineups
type:
    - tech-debt
    - feature
status: wip
---

# Flat tasks, decoupled lineups

Replace the `template → variant → scheduled task copy` derivation with one static, unique **task**
per piece of content, fold translation templates into the same table, and move everything about
*how tasks reach learners* into a separate, replaceable **lineup** layer. The daily/weekly
rotation keeps working exactly as today, but it becomes one lineup strategy among possible future
ones (for example periodical issues), and changing it no longer touches task storage or learner
history.

## 1. Problems with the current model

- **Content is copied per schedule.** Scheduling picks a random variant, resolves `{{slot}}`
  placeholders, and inserts a new `task` row with the resolved text. Seven templates had produced
  271 task rows locally. A task id means "this template on this date", so content identity,
  distribution, and completion scope are one concept.
- **Variants are really separate tasks.** Each variant carries its own `openingState` (the Reddit
  post, the email thread) and slot values that match it (`{{title}}` is the AO3 work's title). The
  slot mechanism exists only to mass-produce similar scenarios.
- **Translation is a second system.** Translation "tasks" are template rows (`/translate/[templateId]`),
  never scheduled, completed per template, and their context overloads `agentPromptBase`.
- **Distribution is baked into content.** `template.cadence` decides eligibility and the task row
  carries `date`/`cadence`/`origin`. A different distribution idea would need a schema rewrite and
  a migration of every attempt.
- **Live reads and snapshots disagree.** Sessions snapshot the system prompt, persona, UI and turn
  limit, but feedback and the session page read the variant's `openingState` live.

## 2. Decisions

| Question | Decision |
|---|---|
| Can a learner redo a task that appears again (another day, another lineup)? | Yes. Completion is scoped to the lineup entry, never shared across lineups. |
| Is a task editable after creation? | Yes. Edits are rare and small, so nothing is snapshotted: every consumer reads the task live. |
| Existing session snapshots (system prompt, scenario context, UI, turn limit, urgency) and the MBTI persona | Removed entirely. The agent's system prompt is built from the task on every call. |
| URLs | Unified under `/task/[id]` for both kinds. `/translate/*` is removed without redirects (not publicly released). |
| Contributions | Stay in their own table (`task_contribution`), reshaped to mirror a task. |
| Data | Not released publicly. Only template content is worth keeping. The migration wipes all learner activity and converts templates into tasks. |
| Rewards | `pointReward` and `gemReward` are removed everywhere. |
| Translation distribution | Translation tasks are not rotated into daily/weekly lineups yet and stay in the yearly catalog, but the lineup layer already supports them. |
| Name of the distribution layer | Neutral `lineup`, not a publishing-specific name, since the future distribution idea is still undecided. |
| Learner-filled slots | Out of scope (a later phase). The old admin slot mechanism is removed; nothing here blocks adding learner slots later. |

## 3. Data model

Three layers. Each layer only references the one below it.

```
content      task                     static, unique, knows nothing about distribution
distribution lineup, lineup_task,     replaceable strategy for putting tasks in front of learners
             lineup_rotation
attempts     practice_session,        learner work; references task_id + nullable lineup_id
             translation_source_set,
             translation_attempt
```

### 3.1 `task`

| Column | Notes |
|---|---|
| `id` serial | |
| `interaction_type` (`chat`/`translate`) | Discriminator. `ui = 'translator'` ⇔ `translate` (check constraint). |
| `language`, `ui`, `is_active`, `difficulty` (1–3) | |
| `title`, `short_objective`, `description`, `objectives text[]`, `materials_md`, `tags text[]` | Shared content, no `Base` suffixes, no placeholders. |
| `estimated_words` | Nullable. |
| chat: `urgency`, `max_turns`, `agent_prompt`, `opening_state jsonb` | `urgency` and `opening_state` are required for chat and null for translate (check constraint). `max_turns` null means no limit. |
| translate: `reference_paragraphs jsonb string[]`, `translation_context` | Required for translate, null for chat (check constraint). |
| `created_by`, `created_at`, `updated_at` | `created_at` still dates the translation catalog. |

Kind-specific columns live on the one table with check constraints, not in extension tables:
every read wants the whole task, and the shared columns dominate.

### 3.2 Lineups (distribution)

```
lineup           id, language, kind (lineup_kind: daily | weekly), starts_on date, created_at
                 unique (language, kind, starts_on)
lineup_task      lineup_id → lineup (cascade), task_id → task (cascade), position, origin (manual | auto)
                 PK (lineup_id, task_id)
lineup_rotation  task_id PK → task (cascade), kind (lineup_kind)
```

- Today's daily list for a language is the `daily` lineup whose `starts_on` is the learner's local
  date. The weekly list is the `weekly` lineup starting on that week's Monday. Lineups are shared
  by all learners of a language, as scheduled tasks are today.
- `lineup_rotation` is the auto-fill pool that `template.cadence` used to be. It belongs to the
  distribution layer, so dropping the daily/weekly idea drops this table and leaves tasks
  untouched. The admin task editor exposes it as an "Auto rotation" field for convenience.
- Auto-fill keeps today's policy: three tasks per daily and per weekly lineup, drawn from active
  rotation tasks of that kind and language, least recently lined up first. Filling locks the
  lineup row inside a transaction so concurrent hall loads cannot overfill.
- A future periodical would add a `lineup_kind` value plus presentation columns (title, editor's
  note, style) or a sibling table. Attempts and tasks do not change.

### 3.3 Attempts

- `practice_session`: gains `lineup_id` (nullable). A composite FK `(lineup_id, task_id) →
  lineup_task` (MATCH SIMPLE, so null lineups pass) with `ON DELETE RESTRICT` protects history.
  The unique key becomes `(user_id, task_id, lineup_id) NULLS NOT DISTINCT`. The columns
  `agent_prompt_snapshot`, `max_turns_snapshot`, and `urgency` are dropped.
- `translation_source_set`: `template_id` becomes `task_id`. It is still unique per
  `(task_id, prompt_language, content_fingerprint)`, so editing the reference text or context
  regenerates candidates.
- `translation_attempt`: gains `task_id` (FK to the source set's `(id, task_id)` for consistency)
  and `lineup_id` (same composite FK as sessions). At most one unfinished attempt per
  `(user_id, source_set_id, coalesce(lineup_id, 0))`. Retaking a completed translation stays allowed.
- Notes, review logs, streak, and unread watermarks are unchanged: they hang off sessions and
  attempts, not tasks.

### 3.4 Attempt context resolution

URLs identify only the task (`/task/[id]`). The server resolves which lineup a new attempt
belongs to and which attempt a workflow page shows (`server/task-context.ts`):

1. **Context lineup**: an explicit `?lineup=` owned by the task if given (used by the Archive),
   otherwise the current lineup containing the task (today's daily or this week's weekly in the
   learner's timezone), otherwise the most recent lineup containing it, otherwise none.
2. **Shown attempt**: an explicit `?lineup=` pins exactly that entry's attempt (Archive and unread
   links must show the attempt they name). Otherwise any unfinished attempt of the learner for this
   task, then the attempt in the context lineup. If the context is "no lineup", the latest attempt
   is shown.
3. **Starting** creates the attempt in the context lineup. A task reappearing in a new lineup is
   therefore `ready` again, while past lineups keep their finished attempts.

The Quest Hall does not need resolution: each hall entry is a `(lineup, task)` pair and reads its
attempt directly.

### 3.5 Contributions

`template_contribution` becomes `task_contribution`. It keeps its own review columns (`status`,
`created_by`, `reviewed_by`, `review_notes`, `submitted_at`), and its content columns mirror the
task (including `opening_state`, `reference_paragraphs`, `translation_context`). Approval still
goes through the admin "new task from contribution" form, which creates a task and marks the
contribution approved in one transaction.

## 4. Runtime behavior

- **Agent prompt**: `buildAgentSystemPrompt(task)` builds the system prompt, including a
  scenario-context summary of `opening_state`, from the live task. The reply worker, hints, and
  feedback call it (or its scenario-context part) on every use. The persona prefix is gone.
  Turn limit, UI, and reply urgency are read from the task.
- **Feedback and hints** read `opening_state`, objectives, and descriptions from the task.
- **Task-details helper actions** (expression suggestions) load the task context server-side
  instead of trusting form fields posted by the client.
- **Quest Hall**: `loadQuestHallData` ensures and reads today's daily and this week's weekly
  lineup, loads per-entry session state by `(task_id, lineup_id)`, and lists active translation
  tasks by creation month as before. `HallQuest` drops the `template*` prefixes and rewards.

## 5. Routes

| Route | Kind | Was |
|---|---|---|
| `/task/[id]` | both (preparation) | `/task/[id]`, `/translate/[id]` |
| `/task/[id]/session` | chat | same |
| `/task/[id]/feedback` | chat | same |
| `/task/[id]/translation` | translate (first draft) | `/translate/[id]/attempt` |
| `/task/[id]/translation/feedback` | translate (evaluation) | `/translate/[id]/feedback` |
| `/admin/tasks`, `/admin/tasks/new`, `/admin/tasks/[id]` | admin | `/admin/templates…` |
| `/admin/lineups` | admin | `/admin/schedule` |

A route opened for the wrong kind returns 404. Quest menu item keys stay
`${section}-${taskId}`. `translation` remains a catalog section, not a route family.

## 6. Admin

- The task editor edits one task with its opening state inline. Variants, slot extraction, and
  `SlotEditor` are removed.
- JSON import/export becomes a single-task document (`{ "version": 2, "task": { … } }`).
- Deleting a task is allowed only while no attempt references it (enforced by the FKs). Otherwise
  the admin deactivates it. Inactive tasks leave the rotation and the translation catalog, but
  stay in lineups they already appear in.
- The lineup page shows a language's daily/weekly lineup for a date or ISO week (`YYYY-Www`) and
  lets an admin add an active task to it manually (`origin = manual`), creating the lineup if
  needed.

## 7. Migration (`0022`)

One hand-edited migration, generated for the final schema:

1. Wipe learner activity: practice sessions (with messages, batches, deliveries), translation
   attempts, answers and source sets, notes, review logs, streak days and streak rows, old
   scheduled tasks, and contributions.
2. Create `task`, `lineup`, `lineup_task`, `lineup_rotation`. The old `task` table is renamed out
   of the way first.
3. Convert every chat `template × template_variant` into one task, with the variant's slot values
   substituted into title, short objective, description, objectives, agent prompt, and materials.
   The task is active only if both the template and the variant were. A chat template without
   variants becomes an inactive task with an empty opening state. Every translation template becomes
   one translate task (`translation_reference → reference_paragraphs`, `agent_prompt_base →
   translation_context`). `max_turns = 0` and `estimated_words = 0` become null. The resulting
   active chat tasks join `lineup_rotation` with their template's cadence.
4. Re-point attempt tables at the new structure and drop `template`, `template_variant`, the old
   task table, and the `cadence` enum.

Teammates keep all of their authored content by running `pnpm db:migrate`.

## 8. Out of scope

- Learner-filled slots (a later phase: task-level slot definitions plus per-session values).
- Any new distribution strategy (issues, back catalogs). The lineup layer is shaped for it.
- LLM prompt quality. A follow-up pass audits every LLM call after this refactor lands.
