---
title: Unify task detail navigation while retaining the catalog-side presentation
type: ux
link: null
status: done
---

Task cards advertised resource URLs but intercepted clicks into a second, query-based
detail interface. Workflow exits selected one of two detail screens using sessionStorage.

Keep the existing book beside the preparation sheet, not the old standalone detail
appearance. Give each task one canonical detail URL. Ordinary activation, new tabs,
refreshes, and workflow exits must agree. Remove persisted scroll coordinates and
the cache-dependent navigation split. Historical tasks must remain directly accessible.

Verification covers SSR, canonical redirects, catalog positioning, action contracts,
desktop/mobile geometry, and browser back/forward.
