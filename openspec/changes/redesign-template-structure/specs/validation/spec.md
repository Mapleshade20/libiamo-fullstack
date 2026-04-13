## ADDED Requirements

### Requirement: Template Zod schema updated
The `templateSchema` in `src/lib/schemas.ts` SHALL validate:
- `interactionType` enum (`chat`, `oneshot`, `slow`, `translate`) — was `type`
- `cadence` enum (`weekly`, `daily`) — was `duration`
- `objectivesBase` as an array of strings (was JSONB `objectivesBase` with `[{order, text}]`)
- `materialsMd` as optional string (was `bgKnowledgeHtml`)
- `tags` as an array of strings, default empty
- Remove `agentPersonaPool` validation
- Remove `candidates` validation

#### Scenario: Valid template submission
- **WHEN** form data includes `interactionType: "chat"`, `cadence: "daily"`, `objectivesBase: ["Be polite", "Stay concise"]`, `tags: ["social"]`
- **THEN** validation passes

#### Scenario: Legacy field names rejected
- **WHEN** form data includes `type` instead of `interactionType`
- **THEN** validation fails (field not recognized)

### Requirement: Variant Zod schema
A `variantSchema` SHALL validate individual variant data:
- `slotValues` as `Record<string, string>`, required
- `openingState` as jsonb, not null, default `{}`; validated against the UI-specific schema when UI is known
- `isActive` as boolean, default true

#### Scenario: Valid variant data
- **WHEN** variant data has `slotValues: {"relation": "friend"}`, `openingState: {"previousMessages": [{"sender": "agent", "text": "Hey!"}]}`
- **THEN** validation passes

### Requirement: Per-UI openingState Zod schemas
The system SHALL define a Zod schema for each `uiVariant`'s `openingState`:

**imessage**:
```
{ previousMessages: [{ sender: "user" | "agent", text: string }] }
```

**discord**:
```
{ serverName: string, channelName: string, previousMessages: [{ sender: "user" | "agent", text: string, timestamp?: string }] }
```

**reddit**:
```
{ post: { title: string, body: string, subreddit: string, author: string, votes?: number }, previousComments?: [{ author: string, text: string, votes?: number }] }
```

**apple_mail**:
```
{ emails: [{ from: string, to: string, subject: string, body: string, date?: string }] }
```

**ao3**:
```
{ workTitle: string, chapterTitle?: string, bodyExcerpt?: string, tags?: string[] }
```

**translator**:
```
{ sourceText: string }
```

A discriminated helper function `validateOpeningState(ui, data)` SHALL select the correct schema based on the UI variant and validate the data.

#### Scenario: Valid iMessage opening state
- **WHEN** opening state is `{"previousMessages": [{"sender": "agent", "text": "Hey!"}]}` for UI `imessage`
- **THEN** validation passes

#### Scenario: Invalid opening state for UI
- **WHEN** opening state is `{"sourceText": "hello"}` for UI `imessage`
- **THEN** validation fails (missing `previousMessages`)

#### Scenario: Empty opening state
- **WHEN** opening state is `{}` (empty object) for any UI
- **THEN** validation passes (defaults to empty object, not null)

### Requirement: Schedule manual schema unchanged
The `scheduleManualSchema` SHALL remain unchanged: `templateId` (positive integer) and `date` (YYYY-MM-DD string).

#### Scenario: Manual schedule validation
- **WHEN** data has `templateId: 5`, `date: "2025-03-15"`
- **THEN** validation passes

### Requirement: Objectives validation as string array
Template objectives SHALL be validated as `z.array(z.string())` instead of `z.array(z.object({order, text}))`.

#### Scenario: Objectives as string array
- **WHEN** form data includes `objectivesBase: ["Be clear", "Be polite"]`
- **THEN** validation passes

#### Scenario: Legacy objectives format rejected
- **WHEN** form data includes `objectivesBase: [{"order": 1, "text": "Be clear"}]`
- **THEN** validation fails (expected strings, not objects)
