## ADDED Requirements

### Requirement: Scheduling recency from task dates
The scheduling system SHALL determine template recency by querying the most recent task date for each template, NOT by reading a `lastScheduledAt` column.
Templates with no tasks SHALL be scheduled first (NULLS FIRST).

#### Scenario: Auto-scheduling selects least-recently-used templates
- **WHEN** `ensureTasksForDate` runs for a language and cadence
- **THEN** it selects active templates ordered by `MAX(task.date) ASC NULLS FIRST`
- **AND** does NOT read or write a `lastScheduledAt` field

#### Scenario: New template with no tasks is prioritized
- **WHEN** a new template has never been scheduled
- **THEN** it appears first in scheduling order due to `NULLS FIRST`

### Requirement: Random variant selection
When scheduling a task, the system SHALL select a random active variant from the template's variants instead of a random candidate from a JSONB array.

#### Scenario: Variant selected at schedule time
- **WHEN** a task is being created from a template
- **THEN** the system queries active variants (`isActive: true`) for that template
- **AND** selects one at random
- **AND** uses its `slotValues` to resolve template placeholders
- **AND** records its `id` as the task's `variantId`

#### Scenario: No active variants
- **WHEN** a template has no active variants
- **THEN** the system SHALL skip that template during scheduling (log a warning)

### Requirement: MBTI persona injection
At task scheduling time, the system SHALL randomly select an MBTI personality type and embed it into the task's `agentPrompt`.
The MBTI types and their prompt mappings SHALL be defined in TypeScript, not in the database.

#### Scenario: Persona prepended to agent prompt
- **WHEN** a task is created from a template with `agentPromptBase: "You are the user's {{relation}}..."`
- **THEN** the task's `agentPrompt` includes an MBTI persona prefix before the resolved prompt
- **AND** the persona prefix describes personality traits derived from the selected MBTI type

#### Scenario: Template without agent prompt
- **WHEN** a template has no `agentPromptBase`
- **THEN** no MBTI persona is injected and `agentPrompt` on the task is null

### Requirement: Slot resolution from variant
The `resolveSlots` function SHALL read `slotValues` from the selected `templateVariant` row instead of from a JSONB `candidates` array element.

#### Scenario: Placeholders resolved from variant slotValues
- **WHEN** a variant has `slotValues: {"event_type": "a dinner party", "relation": "college friend"}`
- **AND** the template has `titleBase: "The Gracious {{relation}}"`
- **THEN** the task's `title` is `"The Gracious college friend"`

### Requirement: Objectives resolved as text array
The `resolveObjectives` function SHALL accept `objectivesBase` as `text[]` input and return `text[]` as the resolved task objectives with `{{slot}}` placeholders replaced.

#### Scenario: Objectives resolved from text array
- **WHEN** template `objectivesBase` is `["Convince your {{relation}}", "Stay polite"]` and slots are `{"relation": "friend"}`
- **THEN** task objectives are `["Convince your friend", "Stay polite"]`
