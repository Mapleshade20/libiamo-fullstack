---
title: Navigation for learners far from the server
related-design: docs/design/2026-11-24-navigation-far-from-the-server.md
---

# Navigation for learners far from the server

Moving between pages no longer freezes while the data crosses the ocean.

- Pages name the queries they open on in a `+page.ts` (`opening`, `lib/client/refresh.ts`): fetched on the hover or
  touch before the click, waited for before the view transition, held for the visit and asked again when shown. The
  component's own `revalidate` lists became `refreshHeld(data.opened)`; collect's refresh-before-marking moved into its
  load.
- The sidebar's card moves on the click; its pages' code is preloaded once the app is up.
- The home page's greeting is drawn in the browser from the page's clock; `(app)/+page.server.ts` is gone.

Measured on the production build with 250 ms added to every request:

| | first visit | first visit, 150 ms hover | back to a page | longest frame | card moves |
|---|---|---|---|---|---|
| before | 560–615 ms | 430–470 ms | ~300 ms | ~300 ms | with the page |
| after | 300–340 ms | 160–180 ms | ~50 ms | 28–53 ms | ~10 ms |

The home page went from two serial round trips to none on a return. Hydrating a page asks for nothing it did not
before; every client navigation sends one request per query; the tour, started from home or another page, runs to its
end without touching live data; on a phone a tap preloads from the touch and the drawer closes as before.
