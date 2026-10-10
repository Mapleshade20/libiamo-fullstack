# Issue #97: Arrival-based replies on asynchronous surfaces

Implementation plan for [issue #97](https://github.com/Mapleshade20/libiamo-fullstack/issues/97), following the design document `docs/design/2026-10-07-async-reply-arrivals.md`. Reddit, AO3 and mail move from "one live-chat-style turn per learner message" to response opportunities with independent take-up times. iMessage and Discord keep their current behavior (regression scope).

Out of scope: knowledge-weighted speaker selection (a separate product choice), and restructuring individual task prompts (authoring guidance; the participation contract below covers the failure class generically).

## Context

One batch answers one transcript: every learner message folds into or cancels the single active batch, one generation writes everyone's messages together against one frozen transcript, deliveries pace out at chained typing speed, a second branch's post redirects the whole batch, and a top-level question can only draw the owner and a stranger. The result is reply bursts, vanishing composed replies, cross-branch interference and a collapsed responder pool (issue #97 symptoms 1 to 6).

The fix maps the design's response-opportunity model onto the batch machinery with one structural change: **one batch is one participant's take-up of one conversation target**. Independent participants take up at independently sampled times and generate separately against the transcript live at their claim; dependent continuations happen when a later take-up focuses a message that has already landed.

## Approach

### Terminology and split

- **Async surfaces**: `reddit`, `ao3`, `apple_mail`. New helper `isAsyncSurface(ui)` in `src/lib/practice/scene.ts`.
- **Live-style surfaces** (`imessage`, `discord`): current lifecycle unchanged: single active batch, fold-or-cancel, stale restart with `RE_ENGAGE_DELAY_MS`, one multi-presence generation per turn, chained typing pacing, `WORLD_ON_REPLY` riders, `LIVE_CHAT_TICKS` idle ticks, unwatched-tick skipping.
- **Opportunity** = one `agent_response_batch` row = one participant's take-up. **Composed message** = one `agent_delivery` row. All of a batch's deliveries belong to its one participant.

### Take-up times: independent and dependent

- **Independent takers.** When a learner message opens (or reopens) a conversation, the server creates a taker set: 1 to 3 `reply` batches (count drawn from the existing `RESPONDERS` distribution, moved into an exported `drawTakerCount(ui, seed)` in `floor.ts`; one-to-one scenes always get exactly 1). Each taker gets its own take-up clock: `due_at = message time + sampleReplyDelayMs(urgency)`, sampled independently per taker. Two takers can therefore cross in transit: the one whose clock runs shorter answers first, and the other's claim may or may not see that answer, exactly as two people typing at once.
- **Take-up = claim.** At claim the worker builds the moment from the live transcript for the batch's fixed participant. The claim is the composition boundary: whatever has landed by then is in context; nothing that lands later revises a composing response (and on async there is no stale restart at all; `isStaleGeneration` and `RE_ENGAGE_DELAY_MS` apply only to live-style batches).
- **Dependent continuation.** A later taker's claim-time moment may target an earlier taker's landed message (`does: answers #n`), which is how B answers A after A is published. This is decided against the live transcript, so prerequisite cancellation resolves explicitly: a cancelled opportunity simply never lands, no dependent message is ever generated against it, and the floor re-targets the take-up to the live conversation.
- **Same-author follow-ons.** A quick correction is additional deliveries inside one take-up (the participant noticed something while still posting); a later return is a new opportunity on the sampled clock. The two are distinguished by construction, not inferred from timing.

### Participant allocation: at creation, atomic, identity-preserving

- Participants are drawn **when the taker set is created**, inside the `submitMessage` transaction that already holds the session row lock: sibling allocations cannot race, and no claim-time name drawing exists at all. The draw uses the floor's candidate machinery over the submit-time transcript, seeded by the input message id, and picks **distinct participants within the set** (a repeat across different sets or later messages is a legitimate return; a repeat inside one set is not).
- The drawn name is written to `agent_response_batch.participant` at insert. Generation retries reuse the same batch row and the same participant; re-targeting (below) keeps identities, because the same people are taking up the supplemented question.
- World moments allocate their participant the same way, in the transaction that inserts them (see the world budget for its atomicity).
- The claim-time moment draws only the action (`does`, attitude, length, habits) for the fixed participant, keyed on the live transcript.

### Conversation identity: target and chain, not the top-level root

Conversations are identified by **what the learner's message replies to**, so sibling sub-threads under one top-level comment stay separate:

- `agent_response_batch.target_ref` (text, nullable): the comment ref of the message the conversation serves. For a learner reply it is the target's ref; for a top-level learner message it is the message's own ref; null for world moments, non-threaded surfaces (mail is one conversation) and pre-migration rows.
- New helpers in `src/lib/practice/comment-thread.ts`: `targetRefOf(message)` (from thread metadata) and `ancestorRefs(ui, messages, ref)` (walks parent refs through session messages; an `opening-<path>` ref yields its ancestors by popping path segments).
- **Join rule (the exchange, not the comment box; never a merge)**: a new message with target Y joins a pending conversation iff Y equals that conversation's `target_ref`, or an ancestor of Y is one of the conversation's learner messages (its current input message and the messages folded into it). Ancestor matching is therefore restricted to the learner's own exchange: replying to the same comment again, or to anything that grew from the conversation's learner messages (a cast reply under them, or the learner message itself), supplements the current question and re-targets its pending takers. Replying to a sibling sub-thread opens a new conversation even when the root conversation is pending: with R pending, replies to its children A and B each open their own conversations and never re-target R's takers, while a reply into the learner's own branch under R still joins R's conversation. Replying to the root above an ongoing exchange also opens a new conversation. The predicate matches at most one pending conversation (a learner message belongs to exactly one conversation, and at most one pending conversation exists per target ref); a defensive tiebreak joins the one with the newest head message. The joined conversation keeps its `target_ref`; conversations are never merged or re-anchored. Mail folds by null with null.
- **Addressing a new participant**: if the new message directly addresses a cast participant (reply target, @mention or inferred addressee) who is not among the joined conversation's pending participants, one additional taker is created for that participant, capped by the outstanding-taker limit. Supplementing a question and opening an exchange with someone are thus distinct paths.
- Creation cap: at most 3 outstanding `reply` batches per `target_ref`, checked in the locked transaction.

### Single-participant generation

- The moment for an async batch lists exactly one presence, and the response contract sets the author to that participant. `resolveSceneTurn` drops deliveries written for anyone else, with contract warnings: misattributing another person's words to the drawn participant is the persona-theft failure this issue exists to prevent.
- The presence's `does`, attitude and length are inclinations, not assignments: the prose changes from "each posts once and nobody else posts; what they do" to "this participant takes up the conversation; they may answer, react briefly, ask, carry on, or decline". Partial participation and `no_reply` (silence) are legitimate outcomes, per the design's "Participation includes choosing silence".
- Deliveries within one take-up are that participant's own messages, paced by the existing typing model (`getDeliveryDelayMs`). One person posting their own messages in sequence is typing; two people answering is two take-ups on two clocks.

### The target carried through generation, participation and addressee inference

The opportunity's target is explicit end to end; nothing derives it from the latest learner message:

- `agent_response_batch.input_message_id` is the session message this take-up responds to (the learner message for takers; null for world moments and live batches).
- The prompt's user message gains `moment.target`: the transcript ref of that message. The event prose pins the conversation: "this take-up continues the conversation around <target>", so a batch serving branch A never answers branch B even when B holds the latest learner message.
- `drawSceneMoment` receives the target's transcript entry and keys all branch math (nearby cast, addressed names, the learner's corner) on it instead of `session.findLast(role === "learner")`.
- `inferAddressees` receives the target message id and infers addressees for that message, not the latest one.

### Participation and the author-knowledge contract

- **Eligibility** (symptom 4, acceptance scenario 5): when the learner's message is top-level on a threaded UI, the responder pool includes every authored cast member who posted anywhere in the opening conversation, at any nesting depth, plus authors of later top-level cast comments, at weight 1. Branch replies keep branch scope. Owner weight, quiet member, addressed names (weight 5) and the stranger weight are unchanged.
- **Author-knowledge and disclosed-facts contract**: a new PARTICIPATION section in the async system prompt states, for the drawn participant: what they know (their character notes, their own earlier messages, everything publicly in the transcript); what they do not know (knowledge that other participants' notes establish privately, and the learner's situation beyond what the learner has actually written in the transcript, even when scene notes mention it for consistency); and their exits when information is lacking (ask, speculate with hedging as themselves, share their own experience, react briefly, or decline). Character notes override the drawn inclination. This is what makes acceptance scenario 5's "both respond according to their authored roles" enforceable, and it covers the task #96 failure class (an authored persona asserting the learner's undisclosed save state) generically, whatever a task's free-text notes contain.

### One user message, several outcomes: aggregated result flags

`noReply` and `failed` on the input message's metadata currently drive the client placeholder ("no reply will come") and the per-message retry affordance. With several takers per message these flags must summarize the whole set. New helper `settleUserMessageFlags(tx, messageId)`, called at every terminal transition of a `reply` batch (no_reply persisted, terminal generation failure, and the insertion of the batch's first delivered message), queries the sibling `reply` batches of that input message that belong to the current attempt (see retries below) and applies:

- Any sibling has delivered, or is still pending, processing or delivery-pending: the message is answered or awaiting; clear `noReply` and set nothing.
- All siblings terminal and none delivered anything: if any sibling ended `failed`, set `failed` (the retry affordance); otherwise, if all ended silent (`no_reply` or completed without deliveries), set `noReply`.
- Batches cancelled by session-level guards do not settle flags (the session is over and its display is governed by those guards).

**Folded messages settle with their head.** When a conversation's pending takers are re-targeted to a supplement message, an earlier message can be left with no batches of its own; if the head later goes fully silent, settling only the head would strand the earlier message's waiting placeholder forever. At re-target time, inside the same locked transaction, a message is marked `foldedInto: <head message id>` only when it has neither a delivered reply nor any batch still serving it after the re-target; chains are re-pointed to the new head, so a message folded earlier never dangles. Whatever settlement writes on the head (`noReply`, `failed`, or their clearing) is written identically on every message folded into it. Messages that keep a generating or delivering taker, or that already received a reply, are never folded: their own outcome stands, so a supplement whose takers fail can never brand an answered message as failed. On the client, `messages.ts` treats `foldedInto` as "my wait is the head's wait": no separate pending placeholder and no separate retry affordance while waiting; once a delivery lands in the shared conversation, the existing same-turn reply logic already resolves the folded message's placeholder.

**Serialization.** Every terminal transition of a `reply` batch (the status write, then the settlement) runs in a transaction that locks the session row **before** touching the batch, matching the established session -> batch -> delivery lock order used by `submitMessage` and the delivery path. Two sibling batches ending simultaneously therefore serialize: the second transaction sees the first's committed terminal state, and exactly one of them performs the final settlement. Without this, two simultaneous silences could each read the other as still `processing`, both skip the write, and leave no later event to settle anything.

**Attempt invariant.** Every path that sets or changes a batch's `input_message_id` writes that message's current attempt number in the same statement or transaction: initial taker-set creation, the re-target on a supplement, the addressed-participant addition, the manual retry's new taker, and the preserved mail follow-on (which copies its parent's input message and attempt). A batch's `attempt` therefore always equals the attempt counter of the message it serves, whatever re-targeting happened in between.

Retries: the worker's automatic retry (`retryBackoffMs`, up to `MAX_GENERATION_ATTEMPTS`) is per batch and keeps its participant. The learner's manual retry (the `clientMessageId` revival in `submitMessage`) clears `failed`, increments the input message's `attempt` counter in its metadata, and creates exactly one new taker for that message carrying the new attempt number, drawing a fresh participant and excluding participants who already delivered for it; folded messages offer no retry of their own, the head's retry serves the whole chain. Settlement scopes its sibling query by attempt number, not by timestamps: every batch stores the attempt number of its input message (`agent_response_batch.attempt`, written in the same insert that creates the batch, defaulting to 0 for never-retried messages and legacy rows alike), and settlement considers siblings whose attempt equals the message's current counter. Timestamps would be fragile here, because batch `created_at` comes from the database clock and can tie with or even precede an application-time marker written in the same transaction, which would exclude the just-created retry batch from its own settlement; the attempt number cannot. A fresh attempt therefore concludes normally as a reply, silence or failure instead of inheriting the historical `failed` rows it superseded.

### World activity: start, continuation, resume, budget

World moments are also single-participant opportunities (kind `world`): one person carries on their own business, answers something late, or starts a new top-level comment. The floor's world draw (moved out of the reply path, focus pool widened to recent cast messages anywhere in the thread, including previous world comments and unpicked-up questions) decides what at claim.

- **Start (overlap trigger)**: when the learner posts on an async group scene, one world moment is created with probability 0.3, with its own independently sampled take-up clock. It can therefore land during the pending learner response (acceptance scenario 6).
- **Continuation**: when a world moment's last delivery lands, the next world moment is scheduled with probability 0.5 at the idle cadence (`2 × sampleReplyDelayMs(urgency)`), so a world comment can receive a later reply within the activity budget.
- **Resume (read-triggered wakeup)**: when the learner acknowledges their unread replies (`acknowledgeAssistantMessage`), and the session is an async group scene whose learner is silent with no outstanding reply work and world budget remaining, one world moment is scheduled at the idle cadence. Reading the thread resumes ambient life.
- **Unwatched guard** (generalized from live ticks): at claim, a world moment whose learner still has unread cast replies is skipped without an LLM call and rescheduled at the idle cadence; an abandoned thread spends no calls, and the reschedule chain is bounded by session expiry.
- **Budget, enforced atomically**: at most one outstanding world batch per session, enforced by a partial unique index on `agent_response_batch(session_id) WHERE kind = 'world' AND status IN ('pending', 'processing', 'stale', 'delivery_pending')`; at most 3 world moments that generated (spent a call) per silence window, a learner message resetting the window; none within 5 minutes of session expiry. Every world-moment insertion, including the participant allocation, runs in a transaction that locks the session row (existing session -> batch -> delivery lock order) and checks the window count there, with the index as the hard guard.

### Session end: reply and world treated differently

- **Reply-kind batches keep today's max-turns semantics exactly**: composed replies (processing, delivery-pending) are spared and land into the completed session; the farewell and never-replied logic is unchanged. The max-turns branch's decisions (`nothingWillDeliver`, `hasPending`, `neverReplied`) are computed over `reply` batches only, so outstanding world work cannot distort the farewell or sparing decisions.
- **World-kind batches end with the learner's turn**: at max-turns, pending world batches are cancelled and delivery-pending world deliveries are cancelled; a world batch still processing when the session ends persists as cancelled with no deliveries. In the worker, `hasEndedByMaxTurns` no longer spares world batches (their claim cancels when the session is not `in_progress`), and `shouldDeliverIntoEndedSession` returns false for world kind, so ambient activity never generates into or lands in an ended session. Expiry, abuse termination and user-requested completion already cancel everything and stay as they are.

### Mail

- **Contract**: one email per author per take-up; one-to-one mail sends at most one email per turn. Group-mail recipients participate per their roles, each on their own take-up clock.
- **Validation and recovery** (symptom 6), without body splitting: `parseMailMessage` parses a single email's leading fields and quoted bodies can legitimately contain `To:` or `Subject:` lines, so bodies are never split; leading header lines are already stripped by `stripMailHeaders`, and a body that embeds email structure mid-way is delivered as one email with a contract warning recording the anomaly. For the actual observed failure (one result containing several complete emails): per author, the first complete email is this take-up's delivery; **at most one** further complete email is preserved, and its clock starts only when the first email is actually delivered. At persist, the preserved email is recorded in the parent batch's stored artifacts (`parsedResult`) rather than scheduled; the transaction that inserts the parent's first delivered email then creates the follow-on batch (same participant and input message, status `delivery_pending`, its single delivery pre-filled) with `due_at = that delivery time + sampleReplyDelayMs(urgency)`. The follow-on therefore can never precede the email it follows, and it costs no generation. If the parent's deliveries are all cancelled before any lands, the follow-on is never created: the preserved content stays in the stored artifacts with its warning trail, an explicit outcome for a cancelled predecessor. Any further complete emails and any fragments without a substantive body are dropped with contract warnings; every drop is recorded.
- At delivery time, a delivery whose resolved `replyTo` target is missing (its prerequisite was cancelled) is dropped with a warning on threaded UIs, where delivering it as a top-level comment would change its meaning; on quoted chats it is delivered without the quote.

### Timing summary

No new divisors are introduced. Every opportunity samples the unchanged `sampleReplyDelayMs(urgency)` from its creation; within a take-up the existing typing model paces one participant's own messages; the preserved mail follow-on is spaced by a sampled clock anchored at the first email's actual delivery. Concrete behavior: each sampled clock can fall anywhere from near zero up to the preset's cap (high 1 minute, medium 8 minutes, low 40 minutes), with means of 30 seconds, 2 minutes and 10 minutes, so independent takers cluster near the mean and rarely approach the cap; the only hard floor on any delivery is its own typing time.

### Lifecycle discriminator and migration

Migration `issue_97_async_opportunities`:

- `agent_response_batch.target_ref` (text, nullable), as defined above.
- `agent_response_batch.participant` (text, nullable), written at creation.
- `agent_response_batch.attempt` (integer, not null, default 0): the attempt number of the input message this batch belongs to, written in the same insert (see the aggregated flags); 0 for never-retried messages and legacy rows alike.
- `agent_response_batch_kind` gains `world`; the partial unique index above is added.
- **Lifecycle discriminator**: `isAsyncSurface(task.ui)` decides the lifecycle for every batch on the session, including pre-migration rows; `target_ref` only groups fold matching (equal refs join, null joins null). New mail batches have null target refs and get the new lifecycle from the UI check, not from the ref.
- **Legacy batches complete under defined rules.** A pre-migration `reply` batch has no `participant` and may already be generating under the old multi-author contract. Pending legacy batches get their participant drawn at claim, which is race-free because the old single-active-batch invariant guarantees at most one legacy batch per session; from that claim on they follow the new contract (their `target_ref` stays null, so they join only other null-ref conversations, which on threaded UIs means none until they drain). A legacy batch that was already processing when the deployment landed may return deliveries by several authors: single-author validation is skipped for any batch whose `participant` was still null when it was persisted, a contract warning records the legacy acceptance, and its deliveries proceed under the new arrival pacing and delivery guards. No legacy path survives beyond rows that exist at migration time.

### submitMessage, async path (`session.ts`)

1. Compute the new message's target ref and its ancestor refs.
2. Apply the join rule to find the pending conversation it supplements, and re-target that conversation's **pending** `reply` batches to the new message (`input_message_id`, `input_version + 1`, `attempt` set to the new message's current attempt number, `due_at` unchanged; participants unchanged): they have not taken up yet, so they take up the latest state. The attempt update matters because a batch that served a retried message must not carry the old attempt number into the new message's settlement scope (A retried at attempt 1, its pending batch re-targeted to a fresh supplement B at attempt 0 would otherwise be invisible to B's settlement). A message is marked `foldedInto: <new message id>`, inside this transaction, only when it has neither a delivered reply nor any batch still serving it after the re-target (a message with a generating or delivering taker keeps its own outcome, and a message already answered stays answered); earlier chains are re-pointed to the new head so a message folded before never dangles.
3. If no pending conversation joined, create a new taker set for this conversation (distinct participants allocated here, independent clocks from now, within the outstanding cap). If the message directly addresses a participant not among the joined or created takers, add one taker for them. `processing` and `delivery_pending` batches are never folded into and never cancelled: composed output proceeds, and the new message gets its own takers.
4. The overlap world moment (probability 0.3, async group scenes) is created here under the atomic budget.
5. Pending one-to-one `follow_up` batches are cancelled on a learner message exactly as today; pending world moments are untouched.
6. The max-turns branch keeps its reply-kind semantics (above).

### Polling (`unread.ts`, session page)

`getNextAgentWorkDueAt` and the session page's `outstandingAgentWork` currently read `min(agent_response_batch.due_at)`. With arrival pacing a `delivery_pending` batch has a stale past `due_at` while its deliveries fall due minutes apart, which would force continuous polling. Both queries become the min over pending/processing batch `due_at` and pending delivery `due_at` of delivery-pending batches.

### Call budget

Per learner message on async group scenes: at most 3 taker calls, plus at most 3 world moments per silence window. Only moments skipped before generation (the unwatched guard) cost nothing; a claimed moment that returns `no_reply` has already spent its call. Budgets are enforced at creation, so opportunities created in an earlier window that claim later count against their creation window, and generation retries reuse their batch without consuming a new slot. Worst case with retries (up to `MAX_GENERATION_ATTEMPTS` per batch) is therefore bounded by batches created, not by attempts; typical cost per learner message is under 2 calls.

## Files to modify

- `src/lib/server/db/enums.ts`, `src/lib/server/db/schema.ts` + generated migration (`pnpm db:generate --name issue_97_async_opportunities`): `target_ref`, `participant`, `world` kind, partial unique index.
- `src/lib/practice/scene.ts`: `isAsyncSurface`.
- `src/lib/practice/comment-thread.ts`: `targetRefOf`, `ancestorRefs`.
- `src/lib/practice/messages.ts`: `foldedInto` handling (no separate placeholder or retry affordance; the head's state covers the chain).
- `src/lib/server/practice/agent-replies/floor.ts`: single-presence reply draw keyed on the target entry with a fixed participant, widened top-level eligibility, `drawTakerCount`, distinct-participant allocation helper, world draw with widened focus pool.
- `src/lib/server/practice/agent-replies/prompt.ts`: `moment.target`, single-participant moment prose (inclination, partial participation, silence), PARTICIPATION knowledge-contract section, `eventWorld` slot, mail contract lines, recipe version 5.
- `src/lib/server/practice/agent-replies/generator.ts`: single-author validation, mail recovery policy (per-author first email, one preserved follow-on recorded in artifacts, warned drops), recipe version bump.
- `src/lib/server/practice/agent-replies/worker.ts`: fixed-participant moments at claim (with the legacy claim-time draw), no stale restart on async, watermark advance only for user-message targets, addressee inference target, `settleUserMessageFlags` and its serialized call sites, mail follow-on creation at the parent's first delivered email, world batch end-of-session handling (`hasEndedByMaxTurns`, `shouldDeliverIntoEndedSession`, persist guard), completion hooks (world continuation, one-to-one follow-up unchanged), missing-target delivery rule, world scheduling with atomic budget and unwatched guard.
- `src/lib/server/practice/session.ts`: async submitMessage path (exchange-membership join, re-target with `foldedInto`, taker sets with participant allocation, addressed-participant addition, overlap world moment, follow_up cancel for one-to-one only), reply-only max-turns decisions, manual retry creating one taker and bumping the message's attempt counter.
- `src/lib/server/practice/unread.ts`: read-triggered world resume in `acknowledgeAssistantMessage`; next-work query includes delivery due times.
- `src/routes/(app)/task/[id]/session/+page.server.ts`: outstanding-work query includes delivery due times.

Tests (existing files): `test/lib/practice/comment-thread.test.ts`, `test/lib/practice/scene.test.ts`, `test/lib/server/practice/agent-replies/{floor,worker,prompt,generator}.test.ts`, `test/lib/server/practice/session.test.ts`, `test/lib/server/practice/unread.test.ts`, `test/lib/practice/messages.test.ts`.

## Reuse

- Batch claim/lease/heartbeat machinery, `deliverDueMessages`, `resolveBatchReference`, abuse/expiry guards: unchanged, now serving concurrent single-participant batches.
- `sampleReplyDelayMs`, `getDeliveryDelayMs`, `URGENCY_PRESETS`: unchanged and now the only clocks.
- `floor.ts` seeded `random`/`pick`, candidate weighting, `passersBy`, "nobody has picked up" notes: reused for allocation and moments; the count loop moves to `drawTakerCount`.
- `getParentCommentId`, `getCommentId`, the `opening-<path>` scheme: reused by `targetRefOf` and `ancestorRefs`.
- `stripMailHeaders` (leading header lines already stripped from agent bodies): reused; extended only by the multi-delivery policy.
- `isUnwatchedTick` shape: generalized to the async world guard.
- `contractWarnings` in provider metadata: surfaces every coercion and drop.
- `followUpCount` (reset on learner message for async groups), `inferAddressees` (extended with the target message), the `clientMessageId` revival path (retry now creates one taker), the same-turn reply placeholder logic in `messages.ts` (resolves folded messages once a delivery lands).

## Steps

1. Schema: `world` kind, `target_ref`, `participant`, `attempt`, partial unique index, migration. Verify: migration applies; existing tests pass.
2. `isAsyncSurface`, `targetRefOf`, `ancestorRefs` + unit tests (opening refs at any depth, nested opening paths, session-message chains, cycle guard, exchange-membership selection, sibling sub-thread separation with only the root conversation pending and with conversations pending at both a root and a child).
3. `floor.ts`: distinct-participant allocation, `drawTakerCount`, target-keyed single-presence reply draw, widened top-level eligibility, world draw; `prompt.ts`/`generator.ts`: `moment.target`, PARTICIPATION contract, single-author validation, mail recovery, `eventWorld`, recipe v5.
4. `worker.ts`: fixed-participant moments (with the legacy draw), async/live staleness split, target-aware addressee inference and watermark, `settleUserMessageFlags` under the session lock, mail follow-on creation at first delivery, world end-of-session handling, completion hooks, missing-target delivery rule, world scheduling with atomic budget and unwatched guard.
5. `session.ts`: async submitMessage path with `foldedInto` and reply-only max-turns decisions; `messages.ts`: `foldedInto` client handling.
6. `unread.ts` + session page: next-work queries; read-triggered world resume.
7. Tests covering the acceptance scenarios below; regression pass over imessage/discord tests.

## Verification

- `pnpm check`, `pnpm test`.
- Deterministic unit tests mapped to the design's acceptance scenarios:
  1. **Parallel answers**: two takers with independently sampled clocks, distinct participants allocated atomically at creation, generate separately; the later claim's transcript includes the earlier answer when it landed first, and does not when the clocks crossed.
  2. **Dependent continuation**: a later taker's moment targets an earlier taker's landed message; a cancelled prerequisite produces no dependent message at all (nothing generated against it, the floor re-targets the live conversation); a delivery whose resolved target is missing is dropped with a warning on threaded UIs and delivered unquoted on quoted chats.
  3. **Correction during the wait**: pending takers whose conversation the correction joins re-target to it before claim, and the earlier message is folded only when it has neither a delivered reply nor remaining work of its own (a message with a generating taker stays independent); composing and delivery-pending takers proceed and cross it in transit, uncanceled; a correction addressed to a new participant adds that participant's taker; a supplement sent after a retry re-targets the retried message's pending batch with the new message's attempt number, so it settles within the supplement's scope.
  4. **Separate branches**: two conversations hold independent taker sets; posting on one leaves the other's pending, processing and delivery-pending batches untouched, and each claim's moment names its own target. Includes the sibling case (replying to A then to B under the same root yields two conversations), the root-pending case (only R's conversation pending: replies to its children A and B open their own conversations and never re-target R's takers, while a reply into the learner's own branch under R joins it), and the nested case (conversations pending at both R and A: a reply into A's sub-thread re-targets only A's, never R's).
  5. **Authored knowledge**: a regular introduced in a nested opening exchange is eligible for a top-level question (the task #96 cast shape as fixture, nested); the prompt carries the knowledge contract; deliveries by anyone but the allocated participant are dropped with warnings.
  6. **Overlapping activity**: the overlap world moment created at submit lands during the pending reply wave on its own clock; a continuation world moment replies to it within the budget; the one-outstanding index rejects a concurrent second world moment.
  7. **Same-author follow-on**: within one take-up, one participant's messages are typing-paced; a later return is a new opportunity on the sampled clock.
  8. **Mail**: multi-email output delivers the first per author; the preserved follow-on is created only at the parent's first actual delivery, with its clock anchored there, and is never created when the parent's deliveries are all cancelled first; further extras and fragments are dropped with warnings; bodies are never split; group mail allows one email per author; silence is a valid outcome.
  9. **Result aggregation**: one taker silent while another delivers leaves the message unflagged; all silent sets `noReply` on the head and on every message folded into it; any terminal failure among otherwise-silent siblings sets `failed` likewise; a message whose generating taker succeeds while the supplement's takers fail stays answered (never folded, never branded failed); after a manual retry, settlement scopes by the attempt number so the retried message can end as replied, silent or failed without inheriting superseded failures, and the retry batch, carrying the new attempt number in its own insert, is always inside the settlement scope even when the retry is created and settled within the same flow; two siblings ending simultaneously serialize through the session lock and settle exactly once; the manual retry creates exactly one new taker excluding already-delivered participants.
  10. **Lifecycle**: max-turns spares only reply-kind batches (world pending and delivery-pending cancelled, world never generating into an ended session); legacy batches complete under the defined rules (claim-time participant draw for null-participant pending batches, multi-author output accepted for null-participant persists with a warning); expiry, abuse, user-requested completion, unread receipts and the read-triggered resume hold with concurrent batches; imessage/discord behavior is unchanged (existing worker/session tests).
- Scene Lab replay from the learner's view: correction-during-wait (with the folded message's placeholder resolving), a two-branch session with sibling sub-threads under one root, the task #96 top-level question (a nested regular answers within their authored role), a world comment arriving during a pending response and receiving a later reply.
- On approval, set the design document's status to `wip`.
