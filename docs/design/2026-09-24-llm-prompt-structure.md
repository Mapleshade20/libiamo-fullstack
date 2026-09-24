---
title: Consistent LLM prompt structure and task context
type: tech-debt
status: wip
---

# Consistent LLM prompt structure and task context

## Problem

Every LLM call site had grown its own prompt shape. An audit found:

- **System and user mixed up.** Feedback annotation put the whole conversation (learner text) in the system message and sent a dummy user message ("Please review and annotate this conversation."). The feedback follow-up put the learner's selected text and question in the system message as well. Reddit/AO3/mail turns persisted prompt wrappers (“Reply as X with only the comment text…”, the learner's profile name and mail-layout notes) as the learner's message `content`, so the agent read instructions as if the learner had written them. Translation candidates put the trusted task context in the user message (`This is in the context of [...]`).
- **Irregular task context.** Each call described the task differently: the agent got only a scenario dump and the author's prompt, hints got a `- `-joined list of goals, feedback got objectives without the task, expressions got a quoted title/description/UI label, and notes got a 3000-character raw `[role] content` snippet of the conversation. Opening messages were rendered as scenario facts in the system prompt and again as history, so some calls saw them twice in different formats.
- **Unclear roles.** The agent was told only “You MUST reply in X”; it was not told who the learner is, that it must not teach, or how thread targets work beyond per-message wrappers. The hint and follow-up tutors did not know the learner's level or task.
- **Duplication.** Note rules existed twice (practice Notes and translation Generation 2) and had drifted apart. The correction verifier sent the displayed hint's text alongside the same `initialHint`/`deeperHint` fields. The archive follow-up sent the Note's definitions both as `itemText` and as context.
- **Needless structure.** The follow-up answer was one string wrapped in `{ "answer": ... }`, which models often dropped for prose, costing a repair round trip.

## Decisions

### One shared context format (`server/prompt-context.ts`)

- `renderTaskBrief` renders the author-written task (title, difficulty, goal, description, optionally the objectives and materials) in one `<task>` block. It does not repeat the interface or target language; each prompt's role and setting state those.
- `renderScenarioSetting` renders only the static setting (surface, channel, post, work metadata) in one `<setting>` block.
- `buildChatTranscript` renders one chronological transcript: opening messages first (`opening: true`), then the session, with roles relative to the learner (`learner` / `counterpart` / `other`), comment ids and reply targets for threads, mail headers, and the learner's mail layout. Opening messages are conversation and appear only here.
- Learner text is read from `displayContent` when present, so legacy rows that stored prompt wrappers still show the learner's own words.

### System vs user

- The system message holds the role, rules, output contract and trusted task facts; the user message is the variable input for this call. No dummy user messages, and no learner-authored text in a system message.
- Practice turns now persist only what the learner wrote. Thread targets, the responder and mail layout already live in message metadata and are rendered at generation time, so the `promptContent` send option and the per-UI prompt wrappers are gone.
- Few-shot pairs remain only where the protocol requires them (translation Generation 1).

### Per call site

- **Agent replies** (`agent-replies/prompt.ts`): named system sections: ROLE, CHARACTER (the author's `agentPrompt`, verbatim), SETTING, LEARNER'S BRIEF (without objectives, so the counterpart does not steer the learner), MESSAGE STYLE per interface, TRANSCRIPT FORMAT, CURRENT EVENT (reply or idle follow-up), RESPONSE CONTRACT. The user message is `{ learner: { name }, transcript }`. The sections are a list, so learner-filled slots can later be added as one more section. A short output reminder opens and closes the prompt, because the in-character framing tempts models to answer with bare message text. `replyToMessageId` tolerates a missing key or a numeric string, which is not worth a repair.
- **Hints** (`session.ts`): system = tutor role, task with objectives, setting, the learner's self-assessed level and native language, input description, and per-mode output contract. User = `{ transcript, replyingTo, currentDraft, intendedMeaning? }`, with the transcript trimmed from the oldest end.
- **Feedback annotation** (`feedback.ts`): system = role, task with objectives, setting, input format, instructions and XML format. User = the numbered conversation and the learner ids to annotate. The partner is named as the learner saw them.
- **Feedback follow-up**: system = tutor role, the task (when the item came from a session), and instructions. User = `{ item, context, question }`. The call is `chatText`; a reply that still arrives wrapped in `{ "answer": ... }` is unwrapped.
- **Notes** (`note.ts`): system = contract, the source task brief instead of a raw conversation snippet, and a short input description. User = the items. Shared vocabulary rules live in `vocabulary-note-rules.ts` and are used by translation Generation 2 too. Selection notes teach what makes a selection worth learning, not incidental dates or names.
- **Translation help** (`translate.ts`, `task/[id]` actions): expressions receive the task brief, objectives, setting, opening messages and learner level as input. The translation evaluation takes the target language from the task rather than the form, and judges register against the task.
- **Translation candidates** (`translation.ts`): the translation context moves into the system message, and the user message is `{ paragraphs: [{ paragraphIndex, text }] }`. The two format few-shot exchanges are removed; the JSON shape alone was enough in testing.
- **Translation evaluation** (`translation-evaluation/*`): Generation 1 is unchanged. Its few-shot pairs carry each example's own context in the user payload, so the real task keeps the same shape. The Correction Verifier still sends only the current card's trusted context. Its payload now lists the card fields in order, names the shown hint (`shownHint: "initialHint" | "deeperHint"`) instead of repeating its text, and ends with `learnerRevision`. The Second Draft Verifier still appends its system/user turn to the successful Generation 1 history.

### Constraints kept

- No DB schema changes. Output schemas are unchanged except the follow-up call, which now returns plain text internally; its public result is still `{ answer }`.
- All calls go through `server/llm.ts`; structured calls use `chatJson` with at most one targeted repair and never repair truncation.

## Open questions for review

- The Correction Verifier does not see the task's translation context (for example “Reddit r/WarriorCats”) even though `fullyNatural` asks for contextual fit. The protocol limits it to the current card, so this is left unchanged.
- The content hint is a single string but still uses `chatJson`. On `openai/gpt-6-luna` about 1 in 12 first-turn hints came back as bare text and needed a repair. It could move to `chatText` like the follow-up.
- Generation 1 keeps the translation context in the user payload so that it matches its few-shot examples, rather than moving it to the system message.
