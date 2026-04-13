## Context

The template table uses a flat, JSONB-heavy structure where objectives, persona pools, and scenario candidates are opaque JSON columns. Enum names (`type`, `duration`) are generic. The `lastScheduledAt` field mixes scheduling concerns into the content model. Background knowledge is stored as HTML. The database has not been initialized yet, so breaking changes have zero migration cost.

Current schema: `template` table has `candidates` JSONB holding `[{slots, context}]`, `objectivesBase` JSONB holding `[{order, text}]`, `agentPersonaPool` JSONB holding persona objects, and `bgKnowledgeHtml` storing HTML. The `task` table has `*Resolved` column suffixes and a `contextResolved` JSONB column.

## Goals / Non-Goals

**Goals:**
- Normalize scenario data by extracting candidates into a `templateVariant` table with proper relational integrity
- Rename enums and columns for clarity (`taskType` → `interactionType`, `taskDuration` → `cadence`, drop `Resolved` suffixes)
- Simplify objectives from JSONB `[{order, text}]` to `text[]` (ordered by array index)
- Move persona logic out of the database into application-layer MBTI-based selection
- Derive scheduling recency from task dates instead of a dedicated template column
- Switch background material from HTML to Markdown (`materialsMd`) with `marked` for rendering
- Add `tags text[]` on template for lightweight topic grouping
- Design per-UI `openingState` Zod schemas for type-safe variant data
- Update admin UI, Zod schemas, and scheduling logic to reflect all changes

**Non-Goals:**
- Implementing the Phase A2 practice session / LLM layer
- Migrating existing data (database not yet initialized)
- Changing the auth schema or user learning profile
- Internationalizing the admin UI (English only; remove existing redundant i18n)

## Decisions

### 1. Enum renames

Rename `taskTypeEnum` → `interactionTypeEnum` with same values (`chat`, `oneshot`, `slow`, `translate`).
Rename `taskDurationEnum` → `cadenceEnum` with same values (`weekly`, `daily`).
Template columns: `type` → `interactionType`, `duration` → `cadence`.
Task columns: no corresponding columns to rename (these are inherited via `template` join).

**Rationale:** `interactionType` describes the communication pattern, not the task itself. `cadence` is more precise than "duration" which implies time length. Since the DB isn't initialized, this is free.

### 2. templateVariant table extraction

New table `templateVariant`:
```
id            serial      PK
templateId    integer     FK → template.id, onDelete cascade
isActive      boolean     default true
slotValues    jsonb       not null, default '{}'
openingState  jsonb       not null, default '{}'
createdAt     timestamp   default now
updatedAt     timestamp   default now, onUpdate now
```

- Template drops the `candidates` column entirely.
- Each variant holds `slotValues` (the `{{slot}}` replacements) and `openingState` (the UI-specific initial state, renamed from `context`).
- Templates without slots still require one active variant with `slotValues: {}`.
- Template + first variant are created in a single database transaction.
- Task records `variantId` (FK → `templateVariant.id`) to track which variant was selected.
- Variants referenced by tasks are never hard-deleted; use `isActive: false` instead. A check constraint or application logic ensures at least one active variant per template.

**Alternatives considered:**
- Keeping candidates as JSONB with a stricter Zod schema: Rejected because it prevents querying/joining on variant data and doesn't support the `variantId` FK from task.
- Separate tables for slots and opening state: Over-normalization for this use case; a single variant row with two JSONB columns is simpler.

### 3. openingState per-UI Zod schemas

Each `uiVariant` has a distinct `openingState` shape, validated at the application layer (not database). The column remains `jsonb` in the DB.

Schemas (defined in `src/lib/schemas.ts`):

- **imessage**: `{ previousMessages: [{ sender: "user" | "agent", text: string }] }`
- **discord**: `{ serverName: string, channelName: string, previousMessages: [{ sender: "user" | "agent", text: string, timestamp?: string }] }`
- **reddit**: `{ post: { title: string, body: string, subreddit: string, author: string, votes?: number }, previousComments?: [{ author: string, text: string, votes?: number }] }`
- **apple_mail**: `{ emails: [{ from: string, to: string, subject: string, body: string, date?: string }] }`
- **ao3**: `{ workTitle: string, chapterTitle?: string, bodyExcerpt?: string, tags?: string[] }`
- **translator**: `{ sourceText: string }`

A discriminated union `openingStateSchema` selects the correct schema based on the template's `ui` value. The admin form validates `openingState` against the template's selected UI when saving a variant.

**Rationale:** Zod validation gives type safety without constraining the database. Each UI's client component can trust the shape of the data it receives.

### 4. Objectives as text[]

Replace `objectivesBase jsonb` (holding `[{order, text}]`) with `objectivesBase text[]` on template.
Replace `objectivesResolved jsonb` with `objectives text[]` on task.
Array index determines order (index 0 = first objective).

**Rationale:** The `order` field was redundant when the array is already ordered. `text[]` is simpler to query, validate, and render. No need for a separate objectives table since objectives don't have independent identity.

### 5. Persona handling — MBTI in application layer

Remove `agentPersonaPool` from the template table entirely.
Define an MBTI type set in TypeScript (e.g., 16 types or a simplified subset).
At task scheduling time, randomly select an MBTI type and prepend it to the `agentPrompt` field on the task row.
The task table's `agentPrompt` column stores the fully composed prompt (base template prompt + MBTI persona prefix).

**Rationale:** Persona variety is a system concern, not a content-authoring concern. MBTI provides consistent personality dimensions without requiring manual persona authoring per template. Keeping it in TS means it can be tuned without schema changes.

### 6. Scheduling recency via task dates

Remove `lastScheduledAt` from the template table.
The scheduling query orders templates by their most recent task date:
```sql
SELECT t.* FROM template t
LEFT JOIN task tk ON tk.template_id = t.id
WHERE t.is_active = true AND t.language = $1 AND t.cadence = $2
GROUP BY t.id
ORDER BY MAX(tk.date) ASC NULLS FIRST
LIMIT $3
```

Templates with no tasks are scheduled first (`NULLS FIRST`).

**Rationale:** Eliminates a denormalized field that required extra writes on every schedule. The query is straightforward and uses the task index.

### 7. Column renames on task table

Drop the `Resolved` suffix from all task columns:
- `titleResolved` → `title`
- `shortObjectiveResolved` → `shortObjective`
- `descriptionResolved` → `description`
- `objectivesResolved` → `objectives` (now `text[]`)
- `agentPromptResolved` → `agentPrompt`
- `contextResolved` → removed (opening state lives on the variant, accessed via `variantId` join)

Add `variantId integer FK → templateVariant.id` to the task table.

**Rationale:** The "Resolved" suffix added noise. Once a task is created, all its fields are resolved by definition. The opening state doesn't need to be copied to the task since it can be joined from the variant.

### 8. Markdown for background material

Rename `bgKnowledgeHtml` → `materialsMd` on template. Store Markdown instead of HTML.
Introduce `marked` package as a dependency. Render Markdown to HTML at display time (in the task detail page and admin preview).

**Rationale:** Markdown is easier to author in a textarea than raw HTML. `marked` is lightweight and well-maintained.

### 9. Tags on template

Add `tags text[]` column on template, default `[]`.
Used for lightweight topic grouping in the admin list view (filterable).
No separate tags table — array column is sufficient for admin-only filtering.

## Risks / Trade-offs

**[Join complexity for opening state]** → The task detail page now requires a join through `variantId` to get `openingState` instead of reading `contextResolved` directly. Mitigation: single indexed FK join; negligible cost.

**[At-least-one-active-variant enforcement]** → PostgreSQL can't easily enforce "at least one active variant per template" as a constraint. Mitigation: enforce in application logic during variant deactivation/deletion. Wrap in a transaction that checks count before allowing deactivation.

**[MBTI persona quality]** → Randomly selected MBTI types may produce less nuanced personas than hand-crafted ones. Mitigation: Start with a curated prompt template per MBTI type that maps personality traits to conversation style. Can be refined iteratively.

**[Markdown rendering XSS]** → Using `marked` + `{@html}` requires sanitization. Mitigation: Use `marked` with `sanitize` option or pair with DOMPurify. Since only admins author content, risk is low but defense-in-depth is prudent.
