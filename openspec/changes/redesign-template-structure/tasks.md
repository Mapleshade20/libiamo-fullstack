## 1. Database Schema — Enums & Template Table

- [ ] 1.1 Rename `taskTypeEnum` → `interactionTypeEnum` in `src/lib/server/db/enums.ts`
- [ ] 1.2 Rename `taskDurationEnum` → `cadenceEnum` in `src/lib/server/db/enums.ts`
- [ ] 1.3 Update template table: rename `type` → `interactionType`, `duration` → `cadence` columns
- [ ] 1.4 Replace `objectivesBase` (jsonb) with `objectivesBase` (text[]) on template
- [ ] 1.5 Rename `bgKnowledgeHtml` → `materialsMd` on template
- [ ] 1.6 Add `tags` text[] column (default `[]`) on template
- [ ] 1.7 Remove `agentPersonaPool` column from template
- [ ] 1.8 Remove `candidates` column from template
- [ ] 1.9 Remove `lastScheduledAt` column from template
- [ ] 1.10 Update template relations

## 2. Database Schema — templateVariant Table

- [ ] 2.1 Create `templateVariant` table in `src/lib/server/db/schema.ts` (id, templateId FK, isActive, slotValues jsonb not null default '{}', openingState jsonb not null default '{}', createdAt, updatedAt)
- [ ] 2.2 Add templateVariant relations (many-to-one with template)
- [ ] 2.3 Add template → variants one-to-many relation

## 3. Database Schema — Task Table

- [ ] 3.1 Rename task columns: drop `Resolved` suffix (`titleResolved` → `title`, etc.)
- [ ] 3.2 Replace `objectivesResolved` (jsonb) with `objectives` (text[])
- [ ] 3.3 Remove `contextResolved` column from task
- [ ] 3.4 Add `variantId` FK → templateVariant.id on task
- [ ] 3.5 Update task relations (add variant relation)

## 4. Zod Validation Schemas

- [ ] 4.1 Update `templateSchema` in `src/lib/schemas.ts`: rename `type` → `interactionType`, `duration` → `cadence`, `bgKnowledgeHtml` → `materialsMd`, objectives to `z.array(z.string())`, add `tags`, remove `agentPersonaPool`, remove `candidates`
- [ ] 4.2 Create `variantSchema` (slotValues, openingState, isActive)
- [ ] 4.3 Create per-UI `openingState` Zod schemas (imessage, discord, reddit, apple_mail, ao3, translator)
- [ ] 4.4 Create `validateOpeningState(ui, data)` discriminated helper function

## 5. Scheduling Logic

- [ ] 5.1 Refactor `ensureTasksForDate` to order templates by `MAX(task.date) ASC NULLS FIRST` instead of `lastScheduledAt`
- [ ] 5.2 Refactor `insertTask` to query active variants and select one at random (replacing JSONB candidates selection)
- [ ] 5.3 Update slot resolution to use `variant.slotValues` instead of `candidate.slots`
- [ ] 5.4 Update `resolveObjectives` to accept and return `string[]` instead of `{order, text}[]`
- [ ] 5.5 Implement MBTI persona types and prompt mapping in TypeScript
- [ ] 5.6 Inject MBTI persona prefix into task `agentPrompt` during scheduling
- [ ] 5.7 Remove `lastScheduledAt` update from `insertTask`
- [ ] 5.8 Record `variantId` on the task row
- [ ] 5.9 Update `scheduleTaskManually` to use new variant-based flow

## 6. Admin UI — Template Form

- [ ] 6.1 Update `TemplateForm.svelte`: rename form fields (`interactionType`, `cadence`, `materialsMd`)
- [ ] 6.2 Replace objectives JSON editor with dynamic text input list
- [ ] 6.3 Add tags input (comma-separated or tag input)
- [ ] 6.4 Remove `agentPersonaPool` field from form
- [ ] 6.5 Remove `candidates` JSON editor from form
- [ ] 6.6 Add variant management section (list, add, edit, deactivate variants)
- [ ] 6.7 Add Markdown preview for `materialsMd` using `marked`
- [ ] 6.8 Add `marked` package dependency

## 7. Admin UI — Server Actions

- [ ] 7.1 Update template create action: use transaction for template + first variant, use new field names
- [ ] 7.2 Update template edit action: use new field names, handle variant CRUD
- [ ] 7.3 Update template list query: use new column names
- [ ] 7.4 Add variant create/update/deactivate server actions
- [ ] 7.5 Enforce at-least-one-active-variant rule in deactivation action

## 8. Admin UI — Pages

- [ ] 8.1 Update template list page: display `interactionType` and `cadence` columns, add tag filter
- [ ] 8.2 Update template detail/edit page for new schema
- [ ] 8.3 Update schedule page: use `cadence` instead of `duration`, integrate variant selection for manual scheduling
- [ ] 8.4 Remove any i18n `t()` calls from admin routes; use plain English strings

## 9. App UI — Task Detail

- [ ] 9.1 Update task detail `+page.server.ts`: join through `variantId` to get `openingState`, use `materialsMd` instead of `bgKnowledgeHtml`
- [ ] 9.2 Update task detail `+page.svelte`: render `materialsMd` via `marked`, update field references
- [ ] 9.3 Update type labels map: rename `type` references to `interactionType`

## 10. Documentation & Cleanup

- [ ] 10.1 Update `docs/DB.md` with new schema (enums, template, templateVariant, task)
- [ ] 10.2 Push schema with `pnpm db:push`
- [ ] 10.3 Run `pnpm check` to verify types and lint
