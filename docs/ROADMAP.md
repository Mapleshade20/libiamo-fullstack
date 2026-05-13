### Phase A1

(auth) — minimal layout, no nav
/sign-in
/sign-up
/verify
/forgot-password

(app) — authenticated layout with nav + language switcher
/ — Task Hall (home)
/task/[id] — Task detail + background material

(admin) — admin role required
/admin/templates — template list (filterable)
/admin/templates/new — create template
/admin/templates/[id] — view / edit template
/admin/schedule — view + manage task scheduling

### Phase A2

(app)
/task/[id]/session — active practice session (LLM chat/write UI)
/task/[id]/session/[sessionId] — resume or review a past session
/history — user's practice session history

## Phase A1 Scope

- Auth: signup, login, email verification, password reset
- Task Hall: display weekly/daily tasks for current active language
- Task detail: view background material and objectives
- Profile: update settings, switch active language
- Admin - Templates: list, create, edit, soft-delete (isActive=false)
  - Variant editor: slot-aware SlotEditor + per-UI OpeningStateEditor components
  - Server-side validation: opening state validated against per-UI Zod schemas, slot coverage checked
  - Dirty detection: unsaved variant changes block template save
  - First variant created inline with template in create mode
  - Helpers consolidated in `src/lib/admin/variant-helpers.ts` (parse, slot extraction, opening state transforms)
- Admin - Scheduling: manual task scheduling, view scheduled tasks

## Phase A2 Scope

Practice sessions:
- Start session: create practiceSession, randomly select MBTI persona, snapshot full system prompt
- Session UI: render platform-specific interface (imessage, reddit, etc.)
- Send message: user sends message, LLM agent responds (for chat/slow types)
- Request hint: ask tutor agent for help without consuming turns
- Complete session: mark complete, trigger evaluation
- Tutor feedback: LLM evaluates conversation against objectives
- Rewards: grant points and gems on first completion

Session states:
- in_progress: active session
- completed: user finished, awaiting evaluation
- evaluated: feedback generated
- abandoned: user left without completing

Turn counting:
- Each user message = 1 turn
- maxTurns limits total user messages
- Hints don't consume turns
