---
title: Hall announcements, a one-quest daily lineup and languages opening soon
related-design: docs/design/2026-10-05-hall-announcements.md
---

# Hall announcements, a one-quest daily lineup and languages opening soon

- **Daily lineups hold one quest.** The freed right page (or second card on phones) advertises
  custom quests as coming soon.
- **Announcements.** Admins publish and delete them at `/admin/announcements`, with an optional
  expiry. Learners find unread ones at the top of the Hall inbox; tapping one grows the card into an
  island with the full text. "Got it" shrinks it to a dot that is tossed into the new collection mark
  (the favicon's two quotes, replacing the wine glasses), which bounces quote by quote as it takes
  it, and the next notice rises into place. The mark opens a panel of read announcements.
- **`DISABLED_LANGUAGES`.** Learning languages listed there are shown but refused at sign-up and in
  the Hall's language switcher, with an "Opening soon" note beside the choice.
- Migration `0028_announcements` adds `announcement` and `announcement_read`.

## Review fixes

- Language availability is enforced at the account-creation hook, including direct HTTP sign-ups
  and implicit OAuth sign-ups from Sign In. OAuth defaults to the first available language; existing
  learners can still sign in without changing their stored language.
- On touch and keyboard, the first activation of a collapsed announcement expands the inbox stack,
  like a reply card; a second activation opens the notice. Arrow Down also expands the stack, so
  other notices and replies are reachable without acknowledging anything.
- "Opening soon" tips use their measured size, fall below wide anchors when neither side fits,
  and stay within the viewport. Regression coverage exercises real auth flows, DOM navigation,
  placement at viewport edges, repeated tips and timer cleanup.
