## ADDED Requirements

### Requirement: Enum renames
The system SHALL rename `taskTypeEnum` to `interactionTypeEnum` retaining values (`chat`, `oneshot`, `slow`, `translate`).
The system SHALL rename `taskDurationEnum` to `cadenceEnum` retaining values (`weekly`, `daily`).
The template table SHALL use column name `interactionType` (was `type`) referencing `interactionTypeEnum`.
The template table SHALL use column name `cadence` (was `duration`) referencing `cadenceEnum`.

#### Scenario: Enum definitions in schema
- **WHEN** the database schema is defined
- **THEN** `interactionTypeEnum` EXISTS with values `chat`, `oneshot`, `slow`, `translate`
- **AND** `cadenceEnum` EXISTS with values `weekly`, `daily`
- **AND** `taskTypeEnum` and `taskDurationEnum` no longer exist

### Requirement: Template columns restructured
The template table SHALL have the following columns:
- `id` serial PK
- `isActive` boolean default true
- `language` languageCodeEnum, not null
- `interactionType` interactionTypeEnum, not null
- `ui` uiVariantEnum, not null
- `cadence` cadenceEnum, not null
- `titleBase` text, not null
- `shortObjectiveBase` text, nullable
- `descriptionBase` text, nullable
- `objectivesBase` text[], default `[]`
- `agentPromptBase` text, nullable
- `materialsMd` text, nullable
- `tags` text[], default `[]`
- `maxTurns` integer, nullable
- `estimatedWords` integer, nullable
- `difficulty` integer, not null, check 1-3
- `pointReward` integer, not null
- `gemReward` integer, not null
- `createdBy` text FK → user.id, nullable
- `createdAt` timestamp, default now
- `updatedAt` timestamp, default now, onUpdate now

The template table SHALL NOT have columns: `agentPersonaPool`, `bgKnowledgeHtml`, `candidates`, `lastScheduledAt`, `type`, `duration`.

#### Scenario: Template creation with new column names
- **WHEN** a template is inserted with `interactionType: "chat"`, `cadence: "weekly"`, `objectivesBase: ["Give a reason", "Be polite"]`, `materialsMd: "# How to decline\n..."`, `tags: ["social", "declining"]`
- **THEN** the row is stored with all fields accessible by the new column names
- **AND** `objectivesBase` is stored as a PostgreSQL text array

#### Scenario: Template without optional fields
- **WHEN** a template is inserted without `materialsMd`, `tags`, `shortObjectiveBase`, `descriptionBase`, `agentPromptBase`
- **THEN** `materialsMd` is null, `tags` defaults to `[]`, `objectivesBase` defaults to `[]`, other nullable columns are null

### Requirement: templateVariant table
The system SHALL have a `templateVariant` table with columns:
- `id` serial PK
- `templateId` integer FK → template.id, onDelete cascade, not null
- `isActive` boolean default true, not null
- `slotValues` jsonb, not null, default `'{}'`
- `openingState` jsonb, not null, default `'{}'`
- `createdAt` timestamp, default now
- `updatedAt` timestamp, default now, onUpdate now

The table SHALL have an index on `templateId`.

#### Scenario: Variant with slot values and opening state
- **WHEN** a variant is created with `templateId: 1`, `slotValues: {"event_type": "a dinner party", "relation": "college friend"}`, `openingState: {"previousMessages": [{"sender": "agent", "text": "Hey!"}]}`
- **THEN** the variant row is stored with both JSONB columns populated

#### Scenario: Variant for template without slots
- **WHEN** a template has no slot placeholders
- **THEN** the template MUST still have at least one active variant with `slotValues: {}`

#### Scenario: Template and first variant created together
- **WHEN** a new template is created
- **THEN** the template and its first variant MUST be inserted in a single database transaction

#### Scenario: Variant deactivation instead of deletion
- **WHEN** a variant is referenced by one or more tasks
- **THEN** the variant SHALL NOT be hard-deleted
- **AND** the variant MAY be set to `isActive: false`

#### Scenario: At least one active variant
- **WHEN** an admin attempts to deactivate a variant
- **AND** it is the last active variant for that template
- **THEN** the system SHALL reject the deactivation

### Requirement: Template relations
The template table SHALL have a `one-to-many` relation to `templateVariant`.
The `templateVariant` table SHALL have a `many-to-one` relation to `template`.

#### Scenario: Cascade delete
- **WHEN** a template is deleted
- **THEN** all its variants are deleted via cascade

### Requirement: Remove persona pool from database
The template table SHALL NOT have an `agentPersonaPool` column.
Persona selection SHALL be handled entirely in the application layer.

#### Scenario: Template has no persona data
- **WHEN** the template table schema is inspected
- **THEN** no column for persona pool exists

### Requirement: Tags column
The template table SHALL have a `tags` column of type `text[]` with default `[]`.
Tags are freeform strings used for admin filtering.

#### Scenario: Template with tags
- **WHEN** a template is created with `tags: ["social", "formal", "declining"]`
- **THEN** the tags are stored as a PostgreSQL text array

#### Scenario: Template without tags
- **WHEN** a template is created without specifying tags
- **THEN** `tags` defaults to an empty array
