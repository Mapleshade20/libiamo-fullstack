---
title: Rebuild audit repairs and the recorded tour restored
related-design: docs/design/2026-11-15-rebuild-reliability.md
---

# What changed

The audit's concrete failures were reproduced with focused tests and fixed at their ownership boundaries:

- Direct HTTP email changes are refused. Settings is the only entry point and verifies the current password, or a
  recent passwordless session, before making Better Auth's internal call. This prevents bypassing reauthentication.
- A long-lived Caller resolves the current key/model before new calls. Recording rereads privacy at completion;
  deduplicated system prompts belong to an account, cascade on deletion and are pruned when no retained call uses
  them. Prompt and call writes share a transaction.
- A revision's actions are serialized per piece; its tape step and snapshot commit atomically. A failed commit
  retires the mutated session rather than letting a later save persist an unrecorded action. Replaced, dropped and
  evicted sessions cannot save through late callbacks. Failed detection/read-back promises are retryable.
- A translation draft pins a validated assignment (including source, original and languages), rather than joining
  mutable source/scenario rows when resumed. Its first save carries the displayed source generation. Source
  availability checks the full input fingerprint; remakes and every generator outcome use generation fencing.
  Imports follow the same rules. Existing unfinished scenarios retain their language.
- Review still advances immediately to other cards, but waits for confirmation before showing the same card again
  or finishing. Failed writes pause visibly; retries reuse an idempotency key. Pending ratings block silent
  navigation; a permanent failure can explicitly discard pending ratings and reload server state.
- Exchange refreshes are serialized with a coalesced follow-up. The notes retry predicate and prompt ownership/
  call-history lookups have matching indexes.

# Tour: original presentation data, not live application content

The original `rehearsal-lab/app` tapes and writing/collecting content were already present. Their parsed tape data
matches the demo; they were not replaced or regenerated. The missing AO3 and Reddit presentation states were copied
from the demo's `src/lib/demo/scenarios.ts` into `src/lib/components/tour/scenarios.json`, in its four languages.
Their ordering is fixed, not dependent on today's issue or live recommendation ranking.

Shelf, scenario and Inbox reads now use sandbox presentation state. Remote-function requests fail closed during
playback. Each chapter resets tape consumption and has a separate lifetime: old responses, collecting timers,
composer continuations and revision callbacks cannot write into the next sandbox or fall through to real calls
after exit. Pages unmount before a chapter's seed is replaced, then playback waits for settled rendering: updating
the old page's awaited derives reproduced Svelte's async-batch invariant (#18895). Focused pages remount per chapter;
exit navigates home before releasing the sandbox. The sandbox's
review progression follows the original demo, including Good/Good graduation.

This is still the original animated interaction replay on real components, not screenshots, a new model run or
seeded production content. Authentication and normal page navigation are not an anonymous/offline application.

# Verification

- `pnpm check`: no Svelte errors/warnings; pre-existing Biome warnings remain.
- `TEST_POSTGRES_URL=postgres://localhost/postgres pnpm test`: 67 files, 433 tests pass, including 11 PostgreSQL
  integration cases. That opt-in suite creates and drops its own database, applies the actual initial migration and
  stubs provider calls, not transactions. Without the variable those 11 cases are explicitly skipped.
- `pnpm build`: succeeds.
- All eleven model baselines match every response, both normally and with `--reload` on the dev server; they also
  match on the production build. No prompts or tapes were changed and no paid provider calls were used.
- Browser: all five tour chapters played without available live scenarios, with no global errors, unhandled promise
  rejections or remote-function data requests during playback after the chapter-transition fix. A motion recording
  was captured outside the repository. Highlighting a tour word
  and exiting before its debounce fired produced no collecting request.
- The production build's actual welcome flow also played all five chapters with no global errors/rejections. Its
  temporary English presentation restored the account's Spanish setting afterwards; normal application reads
  resumed only after playback, rather than supplying the tour's content.
- Browser: a real rating whose response was deliberately lost after commit showed an error, not completion;
  retry succeeded with exactly one review-log row. A delayed response blocked navigation until confirmed.
- Browser: a translation draft survived reload with its original source after the live source and original were
  deliberately replaced in the disposable database.

# Boundaries

The initial migration was regenerated, not stacked, as the prelaunch database policy requires. Verification used
disposable databases; the existing development database was not migrated or reset. Existing development data needs
an explicit rebuild/migration before this schema can be used; old overwritten assignments cannot be reconstructed
from a mutable source FK alone.

This is not a load-test claim. Whole-history piece/notebook reads remain a bounded-scope design concern for a later
pagination/UX decision, not a measured regression fixed by this work. The single-process revision deployment
constraint is unchanged.
