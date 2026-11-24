---
title: Navigation for learners far from the server
type: performance, ux
status: wip
---

# Navigation for learners far from the server

## Problem

Learners in Japan, mainland China and Singapore said moving between pages (the sidebar above all) felt stuck. The
server is in the United States behind Cloudflare; a round trip from Tokyo is about 110–130 ms, from Singapore about
170–200 ms, from mainland China (no Cloudflare node there on our plan) often 200–400 ms with loss.

Measured on the production build with 250 ms added to every request (Chrome's network emulation), clicking sidebar rows:

| | first visit | first visit, 150 ms hover | back to a page | longest frame |
|---|---|---|---|---|
| before | 560–615 ms | 430–470 ms | ~300 ms | ~300 ms |

Three causes, in the order they cost:

1. **The view transition froze the screen for a whole round trip.** The root layout starts a view transition in
   `onNavigate`; its callback waits for the navigation to complete, and with Svelte's async mode that is when the new
   page's awaited queries have answered. A browser paints nothing new during a transition's callback: the sticker's
   animation stopped halfway, the index card waited, then everything moved at once. With reduced motion (no transition)
   the longest frame was 12–37 ms and the page came at the same time.
2. **Every visit waited for its data.** A page's queries were first asked for by its component, so Kit's hover preload
   (code and server loads only) never fetched them, and Kit releases a query once nothing references it, so even a page
   seen seconds ago asked again and waited.
3. **Serial round trips.** A page's code, then its data; the home page also asked the server for its greeting
   (`+page.server.ts`) before its shelf.

## Decision

- **Data before the transition.** Each page that opens on queries names them in its `+page.ts`, through one helper
  (`opening` in `lib/client/refresh.ts`), in the browser only (the server renders with its own answers, and a page
  hydrating asks for nothing). Kit runs a load on the hover or touch before a click (`data-sveltekit-preload-data`), and
  waits for it before `onNavigate`, so the old page stays alive while the answers travel and the transition runs only
  once the new page can be drawn.
- **Kept for the visit, asked again.** The pages' last answers are held in the browser (the latest 32 pages), so going
  back shows them at once; what was held is asked again once the page is up, as `revalidate` did before. Pages that
  must open on the latest (review's deck, a reading's marks, the translation sheet, the after page, suggestions) ask
  again before they open, as they did. An answer obtained less than 5 s ago is not asked again (a hover passing twice,
  a quick trip back), except for those pages.
- **The card moves on the click.** The sidebar's card slides to the row being opened as the navigation begins
  (`beforeNavigate`), back if it is cancelled; `aria-current` still follows the page.
- **Code ahead.** The sidebar's rows preload their pages' code once the app is up (`data-sveltekit-preload-code="eager"`):
  a few small immutable files that Cloudflare's nodes cache.
- **The greeting in the browser.** It is drawn from the page's clock (the server's moment, which the browser hydrates
  with), so the server and the browser draw the same and the home page needs no server load; it changes once a minute
  instead of on every visit.

The tour's sandbox is never left: a load opens nothing while it plays, and the held answers a page opened on are asked
again once, not on every remount.

### Not done

- Kit's experimental `forkPreloads` (rendering the next page in a fork on hover) made a hovered navigation instant, but
  helped little with a short hover or a touch, and asked for each query twice. Not worth an experimental flag.
- Preloading every page's data when the app starts: more requests per visit for pages a learner may not open.
- Infrastructure (Argo, a server in Asia) is outside the app; a server in Asia is what would shorten the round trip
  itself, at the cost of a second region for the database.

## Database traffic

Unchanged or lower: one request per query per visit as before (held answers asked again, missing ones fetched once),
none while a page hydrates, the home page's server load gone. A hover that does not end in a click costs a page's
missing queries once; afterwards they are held.
