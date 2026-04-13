## ADDED Requirements

### Requirement: Template form reflects new schema
The admin template form SHALL use the new field names and types:
- `interactionType` select (was `type`)
- `cadence` select (was `duration`)
- `objectives` as a dynamic list of text inputs (was JSON editor for `objectivesBase`)
- `materialsMd` textarea (was `bgKnowledgeHtml`)
- `tags` as a comma-separated text input or tag input
- Remove `agentPersonaPool` field entirely
- Remove `candidates` JSON editor entirely

#### Scenario: Creating a template with new fields
- **WHEN** an admin fills in the template form with `interactionType: "chat"`, `cadence: "weekly"`, objectives as text list, and materialsMd as markdown
- **THEN** the form submits successfully with the new field names

#### Scenario: Persona pool field removed
- **WHEN** the template form is rendered
- **THEN** there is no field for `agentPersonaPool`

### Requirement: Variant management in template form
The admin template form SHALL include a section for managing variants.
Each variant has:
- `slotValues`: a JSON editor or key-value pair editor
- `openingState`: a JSON editor, validated against the selected UI's schema
- `isActive` toggle

#### Scenario: Adding a variant
- **WHEN** an admin adds a new variant with slot values and opening state
- **THEN** the variant is created in the database linked to the template

#### Scenario: Editing a variant
- **WHEN** an admin edits an existing variant's slot values or opening state
- **THEN** the changes are saved to the database

#### Scenario: Deactivating a variant
- **WHEN** an admin toggles a variant to inactive
- **AND** other active variants exist for the template
- **THEN** the variant is set to `isActive: false`

#### Scenario: Preventing last variant deactivation
- **WHEN** an admin attempts to deactivate the last active variant
- **THEN** the system shows an error and prevents the action

### Requirement: Template list page updates
The admin template list page SHALL display `interactionType` and `cadence` columns (was `type` and `duration`).
The list SHALL support filtering by `tags`.

#### Scenario: List displays new column names
- **WHEN** the admin views the template list
- **THEN** columns show "Interaction Type" and "Cadence" headers

#### Scenario: Filter by tag
- **WHEN** an admin filters by tag "social"
- **THEN** only templates with "social" in their `tags` array are shown

### Requirement: Schedule page updates
The schedule page SHALL function with the new schema:
- Use `cadence` instead of `duration` in queries and display
- The manual scheduling action SHALL select a random active variant from the template

#### Scenario: Manual scheduling with variant
- **WHEN** an admin manually schedules a template for a date
- **THEN** the system selects a random active variant and creates a task with `variantId`

### Requirement: Admin UI uses English only
The admin UI SHALL use plain English strings directly instead of i18n function calls.
All existing `t()` or i18n helper calls in admin routes SHALL be replaced with literal English strings.

#### Scenario: No i18n in admin pages
- **WHEN** admin page source code is inspected
- **THEN** no calls to `t()` or any i18n translation function exist in `(admin)` route files

### Requirement: Markdown preview for materialsMd
The admin template form SHALL render a preview of `materialsMd` using the `marked` library.
The preview shows rendered HTML from the Markdown input.

#### Scenario: Markdown preview renders correctly
- **WHEN** an admin types `# Heading\n\nSome **bold** text` in the materialsMd field
- **THEN** a preview section shows the rendered HTML with heading and bold formatting
