---
title: Canonical task details with the Quest Menu presentation
related-issue: docs/issues/2026-09-04-canonical-task-details.md
---

## Route ownership

- Root owns home/catalog query state. Catalog year is validated against populated years.
- Task and translation detail loaders retain their existing authorization/data services
  and form actions, then load the shared Hall presentation data.
- The app layout renders one persistent QuestMenuRoute from typed child page data
  (`App.PageData.questMenu`). Home and detail pages only own their document metadata.
  QuestMenuRoute keys the book by language, never by URL or task ID. The old standalone
  shell and page/pane component modes are removed.
- Legacy root preparation URLs redirect with 308 to the resource URL before loading
  the catalog. No generated link uses the legacy representation.
- Session, attempt, and feedback return links are synchronous derived resource URLs.
  They do not read browser storage.

## Data and lifecycle

The shared serializable preparation union lives in lib/quest-hall/preparation.ts.
The server questHallDetails helper computes a deterministic catalog section/leaf
for the selected resource. Missing membership never discards authorized detail data.
Older translations select their own catalog year.

Preparation is now server-owned route data, not a separate client fetch lifecycle.
Remove the preparation API/resource controller, return-context storage subsystem,
account/date metadata used only by that subsystem, and their obsolete tests.

Catalog browsing retains the native book animator and shallow URL updates.
Entering/leaving a detail uses normal SvelteKit navigation but explicitly skips document
snapshots between book routes. The existing, unchanged motion.ts transitionView timeline
animates the persistent book after route data arrives. Link activation remembers the
origin element without preventing the native navigation or changing the link destination.

The outgoing preparation snapshot survives until reverse animation completion (or resize
settling), so the paper never empties during its exit. A sequence guard rejects stale
async continuations. The live component remembers whether preparation came from home
or catalog and returns through the corresponding reverse timeline; direct detail entry
has a deterministic catalog fallback. No browser storage is involved.

Cross-route history changes animate in afterNavigate; the popstate handler handles only
root shallow-history entries to avoid competing timelines. The book owns focus and
smooth top scrolling for its navigations, disabling SvelteKit's automatic scroll jump.
Initial entry and workflow pages retain ordinary router behavior.

## Verification

- Unit tests cover old URL redirects, base-aware resource serialization, catalog year
  validation, current/historical selection positioning, and SSR of the shared detail shell.
- Existing form-action and workflow tests remain in the full test run.
- Browser checks cover actual catalog link activation, direct detail access, returning
  to catalog, history traversal, desktop side-by-side geometry, and narrow overflow.
- Runtime animation sampling confirms identical book DOM across canonical navigation,
  multiple intermediate transforms, overlapping outgoing/incoming stages, and retention
  of outgoing preparation content until completion. Desktop and narrow layouts use
  the original motion timelines; reduced motion remains handled by the same animator.
- pnpm check and pnpm test are required.
