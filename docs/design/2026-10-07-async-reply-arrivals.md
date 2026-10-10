---
title: Arrival-based replies on asynchronous surfaces
type:
    - bug
    - ux
status: wip
---

# Arrival-based replies on asynchronous surfaces

Issue: [#97](https://github.com/Mapleshade20/libiamo-fullstack/issues/97).

Reddit, AO3 and mail use participant response opportunities to represent when someone takes up a conversation, what information they have seen and when their message is composed. The learner can continue posting and participate in several branches while other people respond.

## User-visible problem

A long initial wait can end in several readers' replies arriving within seconds of each other. A learner clarification during that wave cancels the queued replies and starts fresh generation after two seconds. Posting on another branch also shifts active work to the latest message. Fresh top-level questions can draw answers from the owner and a stranger while authored regulars fall outside the pool.

Other activity shares this response wave: a newcomer's separate top-level comment can land alongside the learner's answers, while subsequent idle work follows the learner's branch. Mail applies the same pacing to several complete emails returned by one generation.

The [issue's symptom descriptions](https://github.com/Mapleshade20/libiamo-fullstack/issues/97#symptoms-and-triggering-conditions) specify the triggering conditions and timing for verification.

## Current implementation

One generation writes a batch from a single transcript. `worker.ts::persistGenerationOutcome` schedules successive deliveries using text-length delays. `prompt.ts` permits replies to earlier deliveries in the batch, giving some messages causal dependencies.

A newer learner message cancels delivery-pending output in `session.ts` or restarts a stale generation in `worker.ts::processClaimedBatch`. Additional messages share the active-batch machinery across branches.

The responder floor draws nearby authors from the learner's branch and quiet members from cast members yet to speak. A fresh top-level comment can consequently draw its responders from the owner and a stranger. World activity can accompany a reply, and idle scheduling waits for active batches to finish.

These paths are under `src/lib/server/practice/`.

## Response lifecycle

### Response opportunity

An opportunity identifies a participant, conversation and relevant target. When the participant takes it up, the response uses the context available at that point. Relevant additions and corrections enter that context. Each branch retains its targets.

Several participants can hold independent opportunities concurrently. Participation includes choosing silence when the exchange has wound down or the person has little to add.

### Composed message

A composed message retains the context it was written against and proceeds through delivery. It can cross a newer learner message in transit. Publication fixes the message's content.

Session completion, expiry and abuse termination apply their delivery guards. Context, targets and dependencies stay consistent across pending, processing and delivery-pending states.

### Dependent continuation

A participant answering another message takes up that response after the target is published and available. Prerequisite cancellation triggers dependency resolution. Persisted comment IDs and the existing reference scheme identify targets.

Generation can group opportunities sharing suitable context. Decisions concerning subsequent conversation use that conversation when taken up. The generation strategy operates within an explicit call budget.

## Participation

The server chooses speakers using authored roles, relevant knowledge and the message being addressed. Top-level questions can reach relevant cast members introduced anywhere in the opening conversation. Direct replies give their recipients a reason to respond; other participants join according to their relationship to the exchange.

For example, a scene may contain an owner asking for help and a regular with relevant experience. The regular is eligible to answer using that experience, while the owner responds from their own role and knowledge. The floor accounts for these roles when choosing speakers.

Reddit and AO3 scenarios receive separate participation review, covering discussions among readers, readers addressing a work's author and nested exchanges.

## Timing and visible activity

Independent opportunities have separate schedules. Timing supports short intervals and long gaps according to the scenario. Same-author follow-ons distinguish a quick correction from a later return.

Visible activity can overlap learner responses. Each action has a participant, reason, target and schedule, and can receive subsequent responses. An activity budget defines duration, volume and stopping conditions.

Urgency configures the scheduling model. Timing parameters receive review alongside learner-visible behavior and generation cost.

## Mail

One-to-one opportunities support silence or a complete email response. A correction or additional information can motivate a subsequent email. Output validation distinguishes separate emails and handles malformed output explicitly while preserving substantive content.

Group-mail participation follows recipients and relevant context. Each recipient responds according to their role in the exchange. The mail representation retains this recipient context through generation and delivery.

## Implementation decisions

The runtime scope covers Reddit, AO3 and mail. Regression verification covers iMessage and Discord.

The implementation design specifies:

1. The composition boundary and context available at each lifecycle state.
2. Representation of opportunities, branches and causal dependencies, including concurrency and reference resolution.
3. Authored-role handling in server-side participation.
4. The visible-activity budget and stopping conditions.
5. Timing parameters, generation strategy and call budget.

## Acceptance scenarios

1. **Parallel answers:** A and B independently answer a top-level question through separate opportunities and schedules.
2. **Dependent continuation:** B answers A after A's message is published and available. Reference resolution handles intervening messages and prerequisite cancellation.
3. **Correction during the wait:** B receives a relevant correction when taking up a response after that correction. A's already composed response retains its context while crossing the correction in transit.
4. **Separate branches:** learner posts on two branches retain each branch's outstanding opportunities, composed messages and targets.
5. **Authored knowledge:** a knowledgeable regular introduced in a nested opening exchange is eligible for a top-level question. Both the regular and an owner asking for help respond according to their authored roles.
6. **Overlapping activity:** a visible top-level comment arrives during a pending learner response and receives a later reply within the activity budget.
7. **Same-author follow-on:** quick corrections and later contributions follow schedules appropriate to their context.
8. **Mail:** the lifecycle supports silence, a complete response and a separately motivated subsequent email. Output validation handles malformed results explicitly. Group recipients participate according to their roles.
9. **Lifecycle:** closure, expiry, abuse guards, unread receipts, activity budgets and persisted references pass verification. Live surfaces pass regression checks.

Verify mechanics with deterministic lifecycle and dependency tests. Replay correction, branch, participation and overlapping-activity scenarios in Scene Lab from the learner's view.
