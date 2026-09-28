---
title: Multi-party scenes — one generation architecture for every practice surface
type: feature, ux, tech-debt
status: wip
---

# Multi-party scenes

Mail and iMessage are one-to-one today, Discord is a channel where only one person ever answers, and
Reddit/AO3 fake a crowd with one answering person per learner comment. The goal is one
architecture: every surface is a **scene** with a **cast**. One-to-one (iMessage DM, Discord DM,
a plain email) is a cast of one. Group chats, group mail, channels and comment threads are larger
casts. The simulated people should behave like the communities the learner will actually meet.

## What real communities look like

This comes from three samples: DN42 IRC, r/WarriorCats and the CPL Discord.

- **Attention is not on the newcomer.** People answer each other, riff on each other's jokes
  ("my lo is faster than that" → "my loopback can only do like 25Gb/s :D"), and escalate agreement
  in pairs ("I'd be pissed too" → "I'd be starting so much shit" → "burned shit to the GROUND").
  They also pursue their own side thread (MRT dumps, "hope you get well soon").
- **Disagreement has shapes.** There is the counterpoint ("Counterpoint, …", "That's fair, but"),
  the factual correction ("Jake was never Tallstar's mate"), the fence-sitter who does not engage
  ("I don't really compare characters tbh"), the OP defending their thesis, and the person who
  misremembers ("It's been awhile since I read it").
- **Most people say one thing and leave.** A few keep going. Lengths range from three words to a
  paragraph. Some people only react ("FREE HERSON", reactions instead of messages).
- **Restrained register.** Lowercase, irony instead of statements ("certainly doesn't sound like
  overkill at all"), no greetings, no praise for the question, no summarising, no closing question.
  Moderators are terse and defensive ("ok you can now take this to off topic").

Our models do the opposite. They are warm, complete, addressed to the learner, and end with a
question. They all sound like one person.

## Why today's harness cannot produce it

1. **The responder is fixed on the client.** `newCommentMetadata` sets
   `responderName = target.author || owner` when the learner sends, and the contract requires
   exactly one delivery per learner comment, targeted at that comment. The result is a
   learner ↔ responder duet, structurally. Third parties cannot join, NPCs cannot answer each other,
   and nobody can ignore the learner.
2. **One call decides who speaks, what they say and how everyone sounds**, with no representation
   of the cast. The model therefore writes every voice in its own voice.
3. **The world only moves when the learner writes.** Nothing can happen between turns except a
   nudge in one-to-one chats.
4. **No stance or state per person.** Each turn re-infers everyone from the transcript.
5. **The assistant prior.** A prompt whose only real person is the learner pulls every line
   towards serving the learner.

## Decisions

### D1. One scene model

- **Cast.** The cast is everyone the model voices. It is resolved in `lib/practice/` next to
  `resolveCounterpart`, from things the learner can see: opening senders/authors, the authored
  counterpart, and the declared members (iMessage group members, Discord's online members, mail
  recipients). A thread may also gain new commenters, as real threads do. The **counterpart** stays
  the person the learner primarily addresses (DM partner, main recipient, thread owner).
- **Group or not** is a property of the scene:
  - iMessage becomes a group when `members` are declared.
  - Discord is a channel unless `dm: true`.
  - Mail becomes a group when the opening emails or declared recipients involve more than one
    other person.
  - Reddit and AO3 are always groups.
- **Every message has an id and may reply to any other.** Transcript entries of every surface
  carry `id` and `replyTo`, using the existing comment-id scheme on threads.
- **Deliveries.** A delivery is `{ author, replyTo, content }`:
  - `author` is a cast name, never the learner.
  - `replyTo` is any message id, `@n` (the nth delivery of the same response), or null.
  - This replaces `replyToMessageId`, `respondAs` and the client-chosen `responderName`. The server
    decides who answers; the client records only what the learner replied to.
  - One-to-one scenes coerce `author` to the counterpart.

### D2. Social dynamics are designed, not hoped for

Candidate harnesses (H1–H4) are measured against each other (see Experiments). Whatever wins keeps
these principles:

- **Cast cards.** Each person has a stance on the scene's issue, a goal of their own that is not
  "help the learner", knowledge limits, a voice (length, casing, emoji, irony), and relations to
  other cast members. A cast deliberately contains disagreement and indifference.
- **Beats before words.** Who speaks, to whom, and with what move is decided explicitly, from a
  move vocabulary: agree-and-escalate, counterpoint, correct a fact, riff, side thread, react only,
  lurk, leave, moderator line, ask the learner, ignore the learner.
- **Silence is the default** for every person. One person answering the learner for several turns
  in a row is capped.
- **Register.** The prompt:
  - forbids assistant tells: praising the question, point-by-point answers, summaries, a closing
    question, lists, and relentless enthusiasm;
  - carries register anchors, synthetic examples in the target language that were written for
    each platform and never copied from real users;
  - lets code choose target lengths.
- **Learner attention floor.** Realism includes being ignored, but a learner's direct question to
  the group gets an answer from somebody within a bounded number of beats. The floor is lower at
  higher difficulty.

### D3. Time passes in group scenes

The existing idle follow-up batch becomes "time passes" for group scenes. The cast may carry on
among themselves, react to the learner late, or stay silent. It never chases the learner. The
follow-up cap and urgency delays stay; threads gain these events too. One-to-one scenes keep
today's nudge semantics.

### D4. Everything downstream reads the same transcript

Hints, feedback and translation help already share `buildChatTranscript`. They receive
`author`/`replyTo` for free. Transcript roles become `learner` and `cast`; the counterpart is named
in the setting.

## Product owner's answers (2026-09-27)

- Quality first; several calls per turn are acceptable if they are clearly better.
- Casts come from the free-text character prompt, with automatic casting if it helps.
- As real as possible (still no slurs or harassment of the learner).
- Experiments use only the environment model, within $10.

## What the experiments showed

Scene Lab (`/scene-lab`, dev only) simulates sessions. An LLM plays an intermediate learner, with one
persona per seed; the cast is generated by the production generator; deliveries are stored the way the
worker stores them. Every transcript gets metrics and a rubric score. Variants are compared pairwise per
scenario and seed, in both orders (absolute scores from the same model barely separate the variants).
There are ten scenarios: seven group scenes and three one-to-one regressions. About 700 sessions cost
under $4.

| Harness | Pairwise win rate (group scenes) | Notes |
| --- | --- | --- |
| Baseline (old prompt, generalised) | 0.16 | One responder per learner message; enthusiastic, long, identical voices. |
| Guidance only (register + dynamics prompt) | 0.24–0.43 | Better register, but still a duet: 1.6 speakers per session, cast-to-cast replies about 3%. |
| Planned beats in the same call | ≈ floor | No gain over the floor; more output tokens. |
| Casting cards (one extra call per session) | ≤ floor | No measurable gain; dropped. |
| Director + one actor call per message | 0.36–0.40 | Livelier lines but incoherent (self-replies, "written" jokes); 1 + k calls. Dropped. |
| **Floor** (code draws who is around, impulse, attitude, length, habits) | **0.55–0.61** | About 3–5 speakers, cast-to-cast replies around 20%, fewer silent turns, much more varied length. |

Findings that shaped the design:

- **Guidance alone cannot fix it.** However the prompt is worded, a single model answers the learner,
  agrees with them, and writes one voice. What works is taking the social structure out of the model's
  hands: code decides presence and the move, and the model writes the words.
- **Characters beat the draw.** The drawn habits and attitudes erased authored personalities (a joker
  drew "proper sentences, dry"), so what the character notes say about a person now overrides the draw.
- **Context.** The opening plus the last 12 session entries did as well as the full transcript
  (0.59 vs 0.55–0.61): no loss within these session lengths. The independent review later showed the window
  had cut only 6% of turns, so the question is open for long sessions, which the product does not run;
  the full transcript is sent.
- Small code guards: nobody answers themselves (the reply moves to the parent); a Discord quote of the
  message right above is dropped; the learner is never an author; one-to-one authors are coerced to the
  counterpart.

## Decisions taken

- **Single call + guidance + floor** is the production harness, with the seed = batch id (refined in the second round below).
- Idle follow-ups exist on every surface: in group scenes the event is "time passes", which produces
  0.7–1 messages among the cast; one-to-one keeps the nudge.
- Surfaces:
  - iMessage groups (`groupName`, `members`) name every sender and group bubbles by author.
  - Discord shows the cast in the member list, quoted replies, and `dm` mode.
  - Mail threads reply to everyone and show each author as the sender.
  - Reddit and AO3 accept replies from anyone, under any comment.
- `agent_delivery` stores `author` and `reply_to`; `reply_to_message_id` and `thread_metadata` are
  dropped (migration 0025, which also carries this document's later schema changes).
- The feedback conversation is rebuilt from the shared transcript, so real names appear and the
  duplicated tree code is gone.

## Second round: real references and an independent judge

An independent review showed three weaknesses in round one:
- the same-model pairwise judge had position and volume bias;
- the simulated learner wrote like a native speaker;
- the differences between floor variants were noise.

The owner then set the method for round two:
- Reference set: real threads and logs captured with CDP into the gitignored `tmp/scene-refs`, so
  nobody's words enter the repository.
  - r/boardgames: the UKGE AI-art ban; the game nobody says yes to
  - r/WarriorCats: Tallstar vs Crookedstar
  - AO3: a Warriors one-shot's comment section
  - CPL Discord: a suspension dispute
  - DN42 IRC, standing in for Discord
- The learner is one real participant, who replays their real lines (adapted only where the
  conversation diverged). The opening is the real thread up to that point.
- Judge: the local `pi` coding agent (default model). It reads the real conversation and all versions
  of a scenario at once (anonymised, shuffled), scores seven dimensions, and writes `verdict.json`.
- No long sessions (the product does not run them); authored scenes cover one-to-one.

Mean pi score, where 5 is mediocre and 8 is hard to tell from real (24–27 judged versions per
variant per round, chat scenes for the burst comparison):

| Round | Floor | + anchoring | + bursts, model splits | + bursts, code splits | Other |
| --- | --- | --- | --- | --- | --- |
| 1 | 4.94 | 5.14 | 5.34 | 5.32 | guidance only 4.84 |
| 2 | 4.77 | 4.60 | 4.84 | 4.96 | |
| 3 | | | 4.73 | 4.80 | profiles 4.53 · voice pass 4.38 |
| chat scenes, "form" | 5.67 | 5.67 | 6.10 | 6.19 | |

- **Bursts.** Real chat has 21% consecutive same-author messages; the floor alone had 2%. Marking
  people who post in bursts (as the opening shows, else a stable third of chat users) and splitting
  their message in code reaches 21–22%. It raised "form" by about 0.5 and the overall score by
  0.2–0.4 in chat scenes. Code splitting edged out model splitting in both rounds, and it is
  deterministic with no prompt burden, so it ships.
- **Anchoring is neutral in score but fixes a real defect.** Drawn habits no longer override how
  people wrote in the opening, and attitudes are drawn against the person's own stance ("keeps to
  their own view", "grants a small point"), so nobody switches sides.
- **Two approaches were tried and dropped:**
  - Profiles: one extraction call per session describing each opening speaker's stance, interests,
    peeves and voice.
  - Voice pass: each message rewritten by its author, one call per message, from their earlier lines.

  Neither helped; the voice pass made it worse.
- **Discord filler members** join only channels whose opening has fewer than three speakers; an
  authored crowd needs no generic gamer tags.
- **Remaining gap, per pi, in every reference scenario:** "everyone shares one careful, balanced,
  explaining voice", "acknowledge then pivot", and a lack of people with their own memories,
  evidence and agendas. The best versions reach about 5. Neither prompt rules nor structural
  splits moved this with the environment model (gpt-6-luna). The next lever to test is the model
  itself, which the Scene Lab now supports through LLM Lab variants (slots and options).

## Final shape

- One call per turn, plus code:
  - the floor: presence, impulse, attitude against one's own stance, length, habits only for people
    who have not posted;
  - bursts split in code;
  - reply-target guards.
- A reply aimed at one's own message goes under the latest answer someone else gave it.
- The planning, window, reasoning-effort, casting, director/actor, profile and voice switches are
  removed. Scene Lab variants are LLM Lab variants of `practice.agent-reply`.

## Model comparison (same harness, OpenRouter)

The harness was held fixed and only the cast's model changed; the learner stayed on the environment
model. pi judged all four models in one batch per scenario (126 transcripts, 3 seeds each).

| Model | Real references | Authored scenes (mostly one-to-one) | Median / p90 latency per turn |
| --- | --- | --- | --- |
| openai/gpt-6-luna (env) | **4.66** | 6.03 | 1.7 s / 3.8 s |
| deepseek/deepseek-v4-pro-0813 | 4.02 | **7.26** (register 8.1, form 8.1) | 29 s / 49 s |
| z-ai/glm-5.3-flash | 4.05 | 6.03 | 2.7 s / 7.3 s |
| xiaomi/mimo-v2.5-pro | 3.67 | 6.17 | 50 s / 118 s (6 errors) |

- **glm** writes livelier lines but piles up jokes and makes more factual and logic slips.
- **deepseek** sounds the most human in small scenes. In real threads it writes too little, invents
  facts and drifts names. It also amplifies replayed learner lines that no longer fit (an artefact
  of the replay method that penalises realistic reactions).
- **mimo** is the slowest and weakest.
- **Decision:** the environment model stays the default. deepseek is the candidate for one-to-one and
  mail scenes, where its latency is acceptable, if the product wants per-surface models.

## Third round: what the model should see, and how it is called

### What the real threads show

Measured on the captured threads:

| Thread | Messages / authors | After the learner's first line | Direct replies to the learner |
| --- | --- | --- | --- |
| Reddit, AI-art ban | 100 / 78 | 80 | 1 |
| Reddit, game nobody plays | 100 / 86 | 52 | 7 |
| Discord, CPL dispute | 70 / 25 | 68 | 8 quotes (the learner asked the admin 14 things) |
| IRC, dn42 | 189 / 21 | 170 | 4 mentions (the learner wrote 19 lines inside the flow) |

- **Population is long-tailed.** Most people post once, so a cast limited to the opening's people
  always feels like the same few regulars.
- **The learner is not the centre.** Most of what follows is other people's business, and threads
  drift (AI art → mystery boxes, scanning → AWS pricing).
- **Specificity comes from personal facts** ("my stall had one of the signs", "OVH is ~£1k/month").
- **People riff on jokes instead of correcting them**, and they are biased, wrong, rude and sarcastic.

### Product owner's answers (third round)

- The world turns by itself and the learner is one participant. Every turn still guarantees them at
  least one realistic response.
- Tone follows the community, including disagreement, sarcasm and swearing. The cast does not attack
  the learner personally or mock their language.
- Real community excerpts may be used in prompts as a curated, anonymised corpus, kept apart from the
  evaluation threads.
- Cast sheets (concrete facts, biases, voice) are generated when a task is authored, and admins can
  edit them.
- Passers-by get names from a per-platform pool written in code.
- Time: Discord and iMessage run on a clock; Reddit, AO3 and mail advance when the learner posts.
- Thinking on/off is an experimental dimension (not low vs medium).
- **Done** means: the best harness's blind score is within 1 point of the real continuation, and the
  judge's hit rate at spotting the real one drops towards chance.
- English only, a $15 budget. Every harness runs on both gpt-6-luna and deepseek-v4-pro and is
  judged blind in one batch. The judge is pi on `wawapi/gpt-5.6-sol` at medium effort.
  One-to-one scenes get only a small regression run.

### Method: cut points instead of replayed sessions

At several cut points in each real thread (right after the chosen participant speaks), every harness
gets the real history and writes the next stretch. The real next stretch is mixed in as an anonymous
candidate. This removes the replay artefact and the error that compounds over turns. It also calibrates
what "8" means, and gives the judge a spot-the-real test.

### Harnesses

| Id | Design |
| --- | --- |
| H0 | Current recipe (baseline) |
| H1 | H0 plus real corpus excerpts of the same platform |
| H2a | Native document continuation plus corpus; code lists who is around, the model decides who speaks |
| H2b | H2a, but code writes the speaker sequence as a skeleton and the model fills it in |
| H3 | Best H2 with thinking off |
| H4 | World and reaction split: one call writes the others' business, one writes reactions to the learner |
| H5 | Best so far plus authored cast sheets |

### Results (cut-point evaluation, 24 cuts, pi on gpt-5.6-sol)

The real continuation scores 8.6–8.9 in every batch, and the judge picks it out 22–23 times in 24.
Absolute scores drift between batches (H0 on luna: 5.75, 5.03, 5.08, 5.13, 5.34), so only
comparisons within one batch count.

- **Native document continuation (H2a/H2b/H2t) and thinking off (H3a)** lost to the production
  recipe: luna 4.8–5.4, and deepseek 3.8–3.9 with register at about 3.
- **Corpus excerpts (H1, H6c) and cast sheets (H6s)** made no difference (±0.2).
- **Simulated attention events (H6)** raise stances and form. With fixed-probability argument chains
  they beat H1 by 0.9 in one batch, but in direct luna batches they lose to H0 (4.50/4.90 vs 5.13/5.34),
  because register and coherence drop.
- **Per-person writing with a local view (H7)** reads rougher but loses coherence (invented anecdotes,
  misread branches): 4.5.
- **Jev (typesafe/jev-1.13)**:
  - It cannot tell real from AI text (AUC 0.50–0.61, per stretch, per message and as a choice).
  - It predicts weakly who answers back on real Reddit threads (AUC 0.63; 0.68 with time decay,
    versus 0.59 for the best code feature).
  - It predicts weakly who speaks next in chats (top-1 0.41 versus 0.37 for recency; 0.44 mixed).
  - Using it for comebacks (H8) did not change the result against H6.
- **Confound:** H0 writes 1.8 messages per turn where the real stretch has 7.9 (every other
  harness writes 7.9). Much of its register and coherence lead is writing a quarter as much text.

Spend for this round: about $3.8 (OpenRouter), plus Jev at about $0.1.

### Reading from the learner's seat

Reading the top versions against the real threads, without the judge's scores, showed that the judge
reads the whole thread, while the learner mostly sees replies to their own message and their corner
of it:
- On AO3 the real learner experiences one thing: the author's thanks. H0 writes exactly that. H6/H8
  write twelve comments, half of them the author answering years-old comments.
- On Reddit, H6/H8 fill branches the learner never read. For a B1 reader that is a wall of text, not
  a living world.
- In chats everything is visible, so liveliness is felt directly. There H0's single stray line is cold,
  and H8's banter is alive.
- Factors the scores ignored: whether the learner's message lands, whether they get something to
  answer, progress on their objective, reading load, platform norms (AO3 readers do not argue), and
  what several turns in a row feel like.

### Decision (third round)

- **Two layers in `floor.ts`.**
  - People with a reason answer the learner: whoever they answered or named, the owner, and people
    nearby. At most one stranger joins in.
  - How many answer depends on the platform: Reddit 1/2/3 people at 70/25/5%; AO3 mostly the author;
    chats 1–2; group mail 1–3, where greetings count only weakly.
  - People's own business appears only where the learner sees it: chats, and the learner's corner of a
    thread.
- **Takes by platform.** Passers-by get code-drawn names. A joke gets one riff.
- **Live chats.** Discord channels and iMessage groups move on while the learner is silent: up to six
  turns, 60–120 s apart (`follow_up_count` limit raised to 6).
- **Not adopted.** Corpus excerpts, cast sheets, native-log continuation, per-person calls, and Jev.
- **Evaluation.** Small runs, replayed in the Scene Lab player at up to 64× and read from the learner's
  seat. The pi judging was removed from the Lab.

## Fourth round: production readiness

### What really followed (`task.source`)

A task cut from a real conversation can carry how that conversation really went on. The cast gets it
as background (the THE REAL CONVERSATION section); the learner never sees it, and the session page
does not load it.
- **How it was tested.** In the Scene Lab, a variant gave the cast the next 45 real messages, with the
  learner's seat anonymised. The simulated learner improvised its own lines instead of replaying the
  real ones, or the cast would have known the learner's lines in advance.
- **What changed with it.** The cast brought up more concrete, true material:
  - a real channel name for announcements;
  - "MRT dumps already give you the routes";
  - a small publisher's anecdote;
  - a pointer to the author's other fics.

  There was no copying of lines and no replaying of the real replies.
- **Admin editing.** Admins edit it under "Real conversation" in the task form. It is part of the JSON
  export/import but not of contributions.
- **Capturing and cutting.** Writing the continuation by hand is impractical, so tasks are cut from
  captures (`lib/admin/capture.ts`).
  - **Console scripts.** The form offers one per platform, pasted into the developer console on the
    page:
    - Reddit: the post's own JSON, which can also be copied directly from `<post URL>.json`;
    - AO3: one chapter's comments, every page of them, retrying when AO3 rate-limits;
    - Discord: the messages currently loaded in the channel.
  - **Choosing the opening.**
    - Discord: the admin clicks the message where the learner joins, taking its author's place. The
      opening gets the latest 40 lines before it, without that person's messages and the answers to
      them. What follows becomes the background, with the seat anonymised.
    - Reddit and AO3: the admin ticks comments in the tree. Ticking a reply ticks what it answers,
      and unticking a comment unticks its replies, so nothing in the opening hangs off a missing
      parent. Up to 45 of the unticked comments become the background, replies to the opening first.
  - **Times.** Times appear as the platform shows them, in the task's language: Reddit's "2 yr. ago"
    as of the import, Discord's short date and time, and AO3's own dates. AO3 captures also keep the
    chapter, warnings, categories, characters, additional tags and stats.
  - The Scene Lab's reference scenarios run through the same functions.
- **No URL.** A source URL field was dropped: nothing reads it.
- **No Reddit scores.** Reddit scores are gone from openings, the editor and the surface. Learners can
  still up- and downvote for fun, but no numbers are shown.

### Fixes from reading sessions and end-to-end runs

- **Echo in threads.** People who answer the learner kept restating them ("Right, and…"). Every
  message must now bring something of its own. AO3 takes favour moments nobody has mentioned yet, and
  headcanons.
- **Anecdote tic.** That rule first produced "last time I…" stories in every other message. Personal
  stories are now occasional, and never right after someone else told one.
- **Who answers in chats.**
  - Whoever just talked with the learner is favoured to carry on (weight 2), still damped when they
    become a duet.
  - Questions are recognised by full-width `？` too, which Japanese uses.
- **Thread owners.** They keep their identity: the post's author "stays who the post says they are".
- **Character notes.** Task 8's note told everyone, the OP included, to advise from experience and to
  keep asking the learner questions, so the first-time visitor answered like a local and people
  interviewed the learner.
  - What notes should hold: who the people are, what each wants, and who knows what the learner
    needs, as facts. Style, length and who replies are the floor's job.
  - The admin field is now "Character notes (optional)", with that guidance and an example.
  - Rewritten that way, task 8's OP asks as a newcomer again.
- **Japanese scenes** get kana nicknames for passers-by.
- **Live chats.**
  - The tick budget restarts after every reply to the learner.
  - A tick over messages the learner has not seen writes nothing but still spends its share, so a
    learner who returns within minutes finds the room moving, and an abandoned one costs no calls.
  - Public channels never wind down on the model's word (`allowIdleFollowUp` is forced on for open
    live scenes).
- **Client polling.** The session page stopped polling after waking for work that was still composing
  (same due time, so the effect did not re-run). Every live tick was stranded until a reload. Found
  end-to-end, fixed with a wake counter, and covered by a test that fails without it.
- **Reddit scores.** Comments posted during the session start at 1–12 points, not at hundreds.

Checked end to end in Chrome through the worker:
- a Discord channel: replies, ticks landing without reload, a newcomer in the member list, ticks
  passing while the page is closed, recovery on return;
- Reddit: nested and top-level replies;
- an iMessage group with a source;
- the admin source field, and the source absent from page data.

## Looking ahead: custom tasks

The idea: a learner brings a real thread they want to take part in, in one of two ways:
- a screenshot, transcribed by a vision model;
- a console snippet we provide, which extracts the page.

They then draft their comment or post here, get it corrected and improved, optionally let the cast
answer it, and post the final text for real. The errors become review notes as usual.

What the current design already gives it:
- **Imported pages reuse the renderers.** An import becomes an ordinary `openingState` in the
  platform's own shape (post and comment tree, votes, authors), validated by the same per-UI
  schemas, so the surfaces render it unchanged; `buildOpening` already produces it from a capture.
- **Imports reuse the admin pipeline.** Custom tasks can use the admin capture flow as it is:
  - The same console scripts, and the same `parseCapture`, feed it.
  - A screenshot import only needs a vision model that outputs the capture format.
  - `cutCapture` cuts at the comment the learner answers.
  - The continuation stays empty, since the learner is about to post live.
- **Imported threads are the cast's opening.** Nothing in the floor or prompt assumes authored content.

What it will need, decided now so nothing blocks it:
- **Ownership.** Add `task.owner_user_id` (null for catalog tasks). The catalog, lineups and
  recommendations filter `isActive`, so they would also filter `owner_user_id IS NULL` (three call
  sites today: `quest-hall/hall.ts`, `task/lineups.ts` twice).
- **Access.** Every task read goes through `getTaskIdentity` (plus the session route's own query),
  where owned tasks must be checked against the user. This is the security-critical part.
- **Import size.** A real thread can have hundreds of comments. Import must prune it to the post, the
  top comments, and the ancestors and siblings of the comment being answered, or every scene call
  carries the whole thread.
- **Learner as OP.** Writing a new post rather than a comment needs a surface state where the learner
  is the OP (title and body), with the thread starting empty.
- **Draft, then optionally post into the simulation.** The flow is draft → corrections → final text,
  which is closer to the translation workflow (immutable first draft, Diff AST corrections, second
  draft) than to chat. It fits a new interaction type with its own attempt table. Posting the final
  text into the simulated thread would then open an ordinary practice session whose first learner
  message is that text. Attempts stay unique per `(user, task, lineup)` with `lineup` null, which
  suits one import per post.
- **Privacy.** Captures contain other people's names and words. Keep them private to the owner,
  delete them with the account, and remember that LLM traces capture prompts.
