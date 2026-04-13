## Why

The template table carries too much weight in a single JSONB-heavy row — objectives, persona pools, and scenario candidates are all packed into opaque JSON columns. This makes it hard to query, validate, or reuse data across templates. Enum names (`type`, `duration`) are generic and unclear. The `lastScheduledAt` field on the template is a scheduling concern that doesn't belong in the content model. Background knowledge is stored as HTML, adding friction for content authors. As the template library grows and the AI practice layer (Phase A2) approaches, these structural debts will compound.

## What Changes

- Rename enums: `taskTypeEnum` → `interactionTypeEnum`, `taskDurationEnum` → `cadenceEnum`. Rename corresponding template/task columns.
- Remove the "Resolved" suffix of each column's name (`task` table).
- Rename `context` to `openingState` since it's only related to client-side UI.
- Extract scenario candidates from `candidates` JSONB into a new `templateVariant` table. Each variant row holds JSONB `slotValues` and `openingState` column, and has a `variantId` FK to . Template no longer has `candidates` column.
    - It's possible that a template doesn't need any slots, but it still should have one active variant, whose slot values are `{}`. We need a transaction that creates template + first variant together.
    - Each UI has its own `openingState` schema. It's validated by Zod, not database. Design each ui's schema.
    - Record selected variant id in `task`. No hard delete of variants once referenced-- use `isActive` instead, and there should always be at least one active variant.
- Refactor JSONB objectives (base and resolved) into text[] for simplicity.
- Agent's `persona` is no longer associated with template. It becomes a MBTI tag (logic only exists in ts, not database), randomly selected by system and embedded into `agentPrompt` when deriving a task from its template.
- Remove `lastScheduledAt` from the template table. Scheduling recency is deferred by ordering templates using the task's `date`. (Templates with no tasks are scheduled first (NULLS FIRST))
- Rename `bgKnowledgeHtml` to `materialsMd` (Markdown storage).
- Add a `tags` text array column on the template for lightweight topic grouping.
- Update admin UI (TemplateForm, list/create/edit pages, schedule page) to reflect new schema.
    - Note: Admin UI uses English only. Remove redundant lines of i18n.
- Update Zod validation schemas.
- Update scheduling logic to derive recency from tasks and to select a random variant instead of a random candidate.

## Impact

- **Database**: Database has not been initialized before. Breaking changes don't cost.
- **Docs**: Should update `docs/DB.md` schema documentation.
- **External dependency**: Introduce `marked` package for markdown rendering.
