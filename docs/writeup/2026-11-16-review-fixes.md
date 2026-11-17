---
title: Fixes from the 2026-11-16 review
related-design: docs/design/2026-11-13-step-3-rebuild.md
---

# Fixes from the 2026-11-16 review

An outside review of the rebuild (snapshot `de46e3e`) was checked claim by claim; these are the ones that held.

- **The account picture no longer holds up a page.** The server used to ask Gravatar whether a picture exists, on
  every page load, waiting up to 1.5 s and never remembering a failure (from mainland China, often every time). Now
  the server only names Gravatar's address; the browser loads it and shows the learner's initial until it arrives
  within four seconds, or for good when it does not (`lib/account/picture.svelte.ts`). The privacy page says the
  browser, not the server, asks Gravatar.
- **Dates read the same on the server and in the browser.** "Today"/"yesterday" in the lists, dates on pieces,
  announcements, the profile, contributions, the library and the admin's pages, and the week's drink were computed in
  the server's zone (UTC) and then again in the browser's. All of them now go through one clock
  (`lib/time/clock.svelte.ts`, `lib/time/format.ts`): instants in the learner's zone, local days as they are; the
  browser moves the clock on each minute.
- **The learner's time zone follows their device.** It was written once at the welcome and never again. A page
  opened (or brought back into view) in another zone now tells the server (`keepTimeZone`) and asks for everything
  again.
- **Settings say "Saved" only when they are.** Saves were fired and forgotten, so a failure still said "Saved" and two
  quick changes could land in the wrong order. They now go one after another, resolve whether they were kept, and a
  failure is told (`setNotSaved`) and puts back what the server holds. The name in a simulated place reads the
  settings, not the account loaded with the page.
- **A capture can be imported into a scenario.** The dialog used to check the paste and throw it away. Now a thread's
  comments are ticked (a reply brings what it answers) or a chat's entry point is chosen, and Import fills the
  version's opening, its people and what really followed (`lib/admin/capture.ts`, ported from the old app's).
- **Expired exchanges are closed again.** The agent-reply worker wrote a completion reason the database's check does
  not allow (`max_session_age` for `max_age`), so every scan failed and expired exchanges stayed in progress.

Claims that did not hold: the `llm_call → llm_prompt` foreign key is right as it
is, the trusted mail domains and the session cookie cache were dropped on purpose, the places speak exactly the
scenario languages, and the worker's one-second scan is cheap. How reads should scale with history is a separate
proposal: `docs/design/2026-11-16-data-reads-by-history-size.md`.
