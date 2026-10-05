---
title: Hall announcements, a one-quest daily lineup and languages opening soon
type: [feature, ux]
status: wip
---

# Hall announcements, a one-quest daily lineup and languages opening soon

## Daily lineup

`LINEUP_SIZE` becomes per kind: daily lineups hold one quest, weekly ones keep three. Lineups
already filled keep what they hold. The space a second daily quest would take (the right page of
the first spread, the second card on narrow screens) shows a faint "Custom quests · Coming soon"
card. It is not a menu item: it has no key, no link and no place in narrow navigation, so the book's
paging and recommendations are unchanged. `showsUpcomingCustomQuests` decides where it appears.

## Announcements

- **Data.** `announcement` (title, Markdown body, nullable `expires_at`, author) and
  `announcement_read` (one row per learner and announcement). An announcement is live until it
  expires or is deleted; deleting cascades its reads. The Hall's layout load returns every live
  announcement with the learner's `read` flag, so it refreshes with the book and needs no polling.
- **Admin.** `/admin/announcements` publishes (expiry is a `datetime-local` wall time in the admin's
  browser timezone, optional) and deletes behind a confirmation. The list shows status and read count.
- **Inbox.** Unread announcements stack above the reply cards in `QuestMenuInbox`, in the same
  position and with the same card. Opening one grows that card in place into an island holding the
  whole notice: width and height follow a damped spring (`linear()` easing), the rest of the stack
  steps back. Its height is measured once at its final width, so the spring is not re-targeted per
  frame. Long notices scroll inside the island. Escape, Close or a tap outside shrink it back.
- **Acknowledging.** "Got it" posts `POST /api/announcements/[id]/read` and plays three steps
  (`announcement-motion.ts`): the card clips down to a wine dot where it sits, the dot is thrown
  along a ballistic arc (constant horizontal speed, parabolic height) into the collection, and the
  collection's two quotes each dip, overshoot and settle, the second 75 ms after the first and tilted
  the other way, like a folder taking a file. Only then does the card leave the stack and the next
  one rise into its place. Under reduced motion every step is skipped.
- **Collection.** The wine glasses beside the greeting become the favicon's two quotes, without the
  tile. They are a button opening a `FloatingPanel` with every read, live announcement. Unread ones
  are not listed there: they are still in the inbox.
- Read state shown on the page is the server's `read` plus a per-visit overlay in `QuestMenu`; a
  failed acknowledgement only means the notice comes back on the next Hall load.

## Languages opening soon

`DISABLED_LANGUAGES` (comma-separated codes) is parsed by `disabledLanguages()` in `server/env.ts`;
unknown codes are dropped and a list naming every language is ignored. Only the two places a
learning language is chosen honour it, in their UI and in their actions: sign-up (email and OAuth)
and the Hall's switcher. The options stay visible; pressing one shows an "Opening soon" `SideTip`
beside it. `Select` gains a `hint` on disabled items for this. Learners already studying a disabled
language are not affected.
