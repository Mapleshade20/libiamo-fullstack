---
title: Close the rebuild's security, persistence and replay boundaries
type: bug, security, tech-debt, test
status: wip
---

# Scope

Validate the rebuild audit against executable regressions, then fix confirmed defects without changing the demo's
visual design or model prompts. The original rebuild design remains the architectural baseline.

- Enforce email-change reauthentication at the public API boundary, not only in the settings command.
- Give deduplicated prompts an owner and retention; consult current key and privacy settings for new model calls.
- Fence revision lifetimes, serialize mutations and commit each tape step with its snapshot. Failed persistence must
  not acknowledge progress. Background saves remain observable and retryable.
- Pin a translation draft's complete assignment; invalidate stale generated sources and fence superseded generators.
  An existing unfinished scenario keeps its language rather than mixing languages.
- Keep immediate review navigation, but never rate a card with unconfirmed outcomes or claim completion before writes
  succeed. Surface failed submissions and permit a safe recovery rather than silently dropping ratings.
- Restore the rehearsal-lab tour's recorded content and presentation state. Sandbox reads and writes must never fall
  through to real remote functions; normal authenticated navigation is distinct from tour data. Unmount the old
  chapter before replacing its seed, then await settled rendering before animating the new one.
- Serialize exchange refreshes and index the notes retry queue. Do not introduce speculative pagination changes in
  this repair: unbounded historical lists need their own UX/data-flow design.

# Verification

Add focused failure, lifecycle and concurrency tests. Use Better Auth's real in-memory test harness for auth, and
PostgreSQL for transaction/foreign-key verification where available. Run check, tests and build, then exercise the
tour and changed client flows in a browser with network evidence. No learner-paid provider calls are needed.
