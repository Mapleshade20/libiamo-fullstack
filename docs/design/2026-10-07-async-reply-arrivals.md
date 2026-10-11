---
title: Arrival-based replies on asynchronous surfaces
type:
    - bug
    - ux
status: done
---

# Arrival-based replies on asynchronous surfaces

Issue: [#97](https://github.com/Mapleshade20/libiamo-fullstack/issues/97).

Scope: Reddit, AO3 and mail adopt separately scheduled replies. iMessage and Discord keep their existing reply lifecycle. Removing the learner's private task brief from role prompts applies to all five platforms.

## User-visible problem

A long initial wait can end in several readers' replies arriving within seconds of each other. A learner clarification during that wave cancels the queued replies and starts fresh generation after two seconds. Posting on another branch also shifts active work to the latest message. Fresh top-level questions can draw answers from the owner and a stranger while authored regulars fall outside the pool.

Other activity shares this response wave: a newcomer's separate top-level comment can land alongside the learner's answers, while subsequent idle work follows the learner's branch. Mail applies the same pacing to several complete emails returned by one generation.

The [issue's symptom descriptions](https://github.com/Mapleshade20/libiamo-fullstack/issues/97#symptoms-and-triggering-conditions) specify the triggering conditions and timing for verification.

## Design decisions

### One person, one scheduled reply

Each reply batch belongs to one participant and one conversation. Participants are chosen when work is scheduled; retries keep the batch's participant. A group conversation can have up to three outstanding replies, each with its own delay drawn from the existing urgency settings. One-to-one scenes schedule at most one at a time.

When generation starts, the participant sees the current published conversation. Later messages do not restart that generation or erase its composed output. A participant can answer someone else's reply only after it has been published. Deliveries by an author other than the allocated participant are dropped with a recorded warning.

Separate schedules do **not** mean parallel model calls: the existing one-generation-per-learner limit remains, across all sessions. A slow call can delay other participants and the learner's live chats; delivery can still overlap later generation. The 150-second request timeout bounds each call, not the entire reply wave. This resource constraint remains a timing tradeoff to review, not a guarantee of independent actual start times.

### Supplements and separate branches

A supplement joins only the pending conversation it addresses, including replies inside that conversation's learner branch. Sibling branches remain separate, even under the same top-level comment. Mail shares one conversation.

Only work that has not started can move to the supplement, keeping its participants and scheduled times. Earlier messages share the supplement's wait only if they have neither received a reply nor retained work of their own. Already composing or delivering replies proceed unchanged.

If no participant can take a new message up, it settles as unanswered rather than waiting forever. The message is not queued for a future vacancy.

### Participation and knowledge

Top-level questions can draw authored participants introduced anywhere in the opening thread, including nested comments. Directly addressed participants can receive their own reply slot within the same cap. Knowledge-weighted speaker selection is outside this change.

The allocated participant follows their authored role and what they can see in the conversation. Missing learner details should prompt questions, not invented answers. Across all platforms, the learner's private task brief is omitted from role prompts to avoid revealing facts they are meant to communicate. Public setting and character notes remain available.

### Outcomes, retries and compatibility

The result of a new asynchronous message summarizes its current set of reply attempts: a delivered reply resolves the wait; outstanding work keeps it pending; all-silent outcomes settle as unanswered; failure is shown only when no reply landed and no work remains. Messages sharing that wait settle together.

Manual retries use a new attempt number so superseded failures cannot affect the new result. Settlement follows the existing session-before-batch lock order. Live messages retain their own batch's result instead of aggregating old retries. Historical messages keep the old positional waiting rule; pending legacy batches acquire a participant when claimed, while already-running legacy multi-author output can finish with a compatibility warning.

### Background activity, mail and closure

Asynchronous group scenes can schedule separate background comments while replies are pending, then continue or resume activity after reading. There is at most one outstanding background batch and a budget of three per learner-silence window. Unread replies suspend new background generation without spending a call; no new background work is scheduled within five minutes of expiry.

One mail reply is a complete email. If the model returns extras, at most one complete follow-on is preserved and scheduled only after the first email actually lands; further extras are dropped with warnings. Mail bodies are never split at embedded header lines.

At the turn limit, composed learner replies retain their existing delivery rules, but background activity ends. Expiry, abuse termination and explicit completion retain their guards. Missing reply targets cause threaded deliveries to be dropped rather than moved to an unrelated branch. Polling considers actual delivery times as well as generation times; read receipts load full history only where background resumption needs it.

## Verification

Use deterministic tests for supplements during generation, sibling branches, current-attempt settlement, empty allocation, legacy history, background budgets and closure, and mail follow-on dependencies. Keep live-chat retry and lifecycle regression coverage.

Qualitative replay must cover corrections during a wait and background comments crossing pending replies. Scene Lab currently supports single-participant generation and background events, but still completes a reply wave before the next learner message; it does not yet prove those timing scenarios.

Implementation and verification results: [writeup](../writeup/2026-10-10-async-reply-arrivals.md).
