## ADDED Requirements

### Requirement: Task column renames
The task table SHALL use the following column names (dropping `Resolved` suffix):
- `title` text, not null (was `titleResolved`)
- `shortObjective` text, nullable (was `shortObjectiveResolved`)
- `description` text, nullable (was `descriptionResolved`)
- `objectives` text[], default `[]` (was `objectivesResolved` jsonb)
- `agentPrompt` text, nullable (was `agentPromptResolved`)

The task table SHALL NOT have columns: `titleResolved`, `shortObjectiveResolved`, `descriptionResolved`, `objectivesResolved`, `agentPromptResolved`, `contextResolved`.

#### Scenario: Task fields use short names
- **WHEN** a task is created from a template
- **THEN** resolved values are stored in `title`, `shortObjective`, `description`, `objectives`, `agentPrompt`
- **AND** no `*Resolved` columns exist

### Requirement: Task references variant
The task table SHALL have a `variantId` column: integer FK → templateVariant.id, not null.
This records which variant was selected when the task was scheduled.

#### Scenario: Task stores variant reference
- **WHEN** a task is scheduled from a template
- **THEN** `variantId` is set to the ID of the randomly selected variant

#### Scenario: Opening state accessed via variant join
- **WHEN** the task detail page loads
- **THEN** `openingState` is retrieved by joining task → templateVariant on `variantId`
- **AND** the task table does NOT store opening state directly

### Requirement: Task objectives as text array
The task table SHALL store objectives as `text[]` (not JSONB).
Array index determines display order (index 0 = first objective).

#### Scenario: Objectives resolved to text array
- **WHEN** a task is created from a template with `objectives: ["Give a reason", "Be polite"]` and slots `{"reason": "work"}`
- **THEN** task `objectives` is `["Give a reason", "Be polite"]` (with any `{{slot}}` placeholders resolved)

### Requirement: Task table full schema
The task table SHALL have the following columns:
- `id` serial PK
- `templateId` integer FK → template.id, not null
- `variantId` integer FK → templateVariant.id, not null
- `language` languageCodeEnum, not null
- `date` date, not null
- `origin` scheduleOriginEnum, not null
- `title` text, not null
- `shortObjective` text, nullable
- `description` text, nullable
- `objectives` text[], default `[]`
- `agentPrompt` text, nullable
- `createdAt` timestamp, default now

Indexes:
- UNIQUE on `(date, templateId)`
- INDEX on `(language, date)`

#### Scenario: Full task creation
- **WHEN** a task is inserted with all fields
- **THEN** the row is stored with the correct types and constraints
- **AND** the unique constraint on `(date, templateId)` is enforced
