---
title: One session foundation for the five practice surfaces
related-design: docs/design/2026-09-25-practice-session-foundation.md
---

# One session foundation for the five practice surfaces

Mail, Discord, iMessage, Reddit and AO3 still look like themselves. Underneath, they now run one
session lifecycle instead of one and a half, and each surface is only its interface.

## What changed for learners

- **Mail is new.** It is a compact Apple Mail simulation. Wide screens show mailboxes, a list and a
  reader. Medium screens swap the sidebar for an Inbox/Sent switch. Phones move from list to
  message like iOS Mail. The composer is a proper modal dialog with plain text (recipient,
  subject, body, hint, Send), and an unsent draft is kept per task. Replies that arrive while Sent
  is open raise an unread count on Inbox in every layout, and screen readers announce it. Replies
  scheduled after a reload now arrive: Mail used to poll only while a placeholder was visible.
- **Conversations are in the first paint.** Surfaces used to hydrate in effects and hide the empty
  page behind a 300 ms "Connecting…" splash. Messages now render on the server and the splash is
  gone.
- **Consistent controls.** The finish sheet, turn counter, Retry, "reply failed" and "unavailable
  in this simulation" copy are shared and localized in the task language. The old finish sheet
  was English-only. Icon buttons have names, frequent mobile controls are 44 px, focus is visible,
  and every animation stops under reduced motion.
- **Smaller fixes.** Feedback navigation and the AO3 default icon honour `BASE_PATH`. Starting a
  session, finishing it, and going back to the task all keep a pinned `?lineup=`. The surface is
  also re-created when the attempt changes, so no local state carries over. Discord no longer
  clips its composer on phones, and Reddit no longer jumps to the bottom after an inline reply.
  AO3's kudos, bookmark and hide-comments buttons now say they are unavailable instead of doing
  nothing.

## How it is built

`createPracticeSession(() => props, { fallbackAgentName })` derives the conversation from the
loader's `PersistedPracticeSession` and overlays three kinds of local state:

1. optimistic sends, shown until the server snapshot contains that `clientMessageId`;
2. failed placeholders, hidden while their retry is in flight;
3. agent replies held back so a burst reads as live typing.

It also polls through `planAgentWorkPolling` and finishes through one guarded path. It owns the
finish confirmation and a hint controller that is open for one editor at a time. Stale hint
responses are dropped by a request token.

Everything the server and the surfaces both need moved to `lib/practice/`. `messages.ts` covers
messages and placeholders. `comment-thread.ts` covers Reddit/AO3 ids, targets and trees, and
replaces two copied server modules. `mail.ts` holds the mail wire format. `server/` no longer
imports from `components/`.

Mail's rich-text editor went with the rewrite, and so did the HTML layout summary the agent
prompt used to receive. Old messages still render from their stored plain text.

Root surfaces take one typed `PracticeSurfaceProps`, and the route picks the component from a map.
AO3 and iMessage were split along their existing boundaries: work header, comment form and
comment for AO3; conversation list, header, bubbles and composer for iMessage.

## Where guided turns will plug in

A later "immersive translation" mode tells the learner what to express next. Every composer
already sends through `session.send` and owns the session's hint panel. A per-turn brief can use
that same anchored panel and travel in `send` options. The brief itself can arrive through the
shared `PersistedPracticeSession` type, so no surface markup has to change.

## Tests

`*.dom.test.ts` files now run in a jsdom Vitest project. They mount the runtime, covering sending,
rejection, retry, paced reveal (including an identical poll that must not restart the pacing),
polling, finishing and auto-finish. They also mount every surface for hydration, sending,
delivery, Retry and finishing. A server-render test checks that every surface puts the stored
conversation into the HTML.
