---
title: Multi-party scenes on every practice surface
related-design: docs/design/2026-09-27-multiparty-scenes.md
---

# Multi-party scenes on every practice surface

Every practice surface is now a scene with a cast. iMessage and mail support group conversations,
Discord supports direct messages, and on Reddit and AO3 anyone can answer anyone, under any comment.

## What changed for learners

- **iMessage groups** (`groupName`, `members` in the opening state) show the group name, name every
  sender, and group bubbles by author.
- **Discord**:
  - `dm: true` gives a direct-message layout.
  - Channels list everyone in the scene as members and show quoted replies.
  - The typing indicator names who is about to post.
- **Mail threads** with `members` go to everyone. Each reply shows its real sender and is sent to the
  rest of the thread.
- **Reddit and AO3**: the learner only chooses what they reply to. Who answers, where, and whether
  anyone does is the server's decision. Others may join, answer each other, or open new threads.
- In group scenes, idle follow-ups mean time passes: the cast may carry on among themselves.
  One-to-one scenes keep the nudge.

## How replies are generated

One call writes each turn. Code decides the social structure first (`agent-replies/floor.ts`):
- **When the learner posts**, a few people with a reason answer: whoever they answered or named, the
  owner of the place, people nearby, and at most one stranger. How many depends on the platform.
- **People's own business** shows only where the learner can see it: in chats, and around the
  learner's corner of a thread.
- **Takes follow platform norms** (AO3 readers praise; they do not argue). Passers-by get realistic
  names from code.
- **People who already posted** keep their voice and stance. People who post in bursts get their
  message split into several.
- **Live chats**: Discord channels and iMessage groups move on while the learner is silent, a turn
  every one to two minutes, up to six per silence. Nothing is written while the learner is not
  looking, and public channels never go quiet for good.
- **Real sources**: a task cut from a real conversation can carry how it really went on
  (`task.source`). The cast draws its facts and topics from it; the learner never sees it. Admins
  capture the real page with a console script (Reddit, an AO3 chapter, a Discord channel), paste it
  into the task form, then click where the learner joins a chat, or tick the comments a thread's opening
  shows (parents come along); the rest becomes the cast's background.

A turn's deliveries are `{ author, replyTo, content }` (`agent_delivery.author`, `reply_to`;
migration 0025). The worker resolves `@n` references to messages of the same batch when it delivers
them. The same migration lets a session take six follow-ups and adds `task.source`.

The admin field "Agent Prompt" is now "Character notes (optional)": who the people are, what each
wants and who knows what, as a few facts. How they write and who replies is handled by the floor, and
instructions like "ask the learner questions" work against it.

The session page keeps polling after waking up for work that is still being written, so live
messages appear without a reload. Reddit shows no scores anymore; the vote arrows only
toggle.

Hints, feedback and translation help read the same numbered transcript. The feedback conversation
is now built from it: real names instead of "You"/"Agent", and the duplicated tree code is gone.

## How it was decided

- **The Scene Lab** (`/scene-lab`, development only) replays sessions with the product's timing, in a
  player that runs at up to 64×. For real Reddit, AO3, Discord and IRC threads, one real participant
  replays their own lines as the learner.
- **Earlier rounds** used an AI judge (`pi`) that compared whole threads against the real
  conversation. It rewarded texture the learner never sees and penalised answering the learner.
  Across about 1,500 simulated sessions and continuations, none of these helped:
  - prompt rules, planned beats, casting cards;
  - director and actor calls, per-person calls, voice passes;
  - real corpus excerpts, cast sheets, native-log continuation, and a decision model (Jev).
- **The final design** came from reading sessions from the learner's seat: whether their message
  lands, whether they get something to answer, progress on their objective, reading load, and
  platform norms.
