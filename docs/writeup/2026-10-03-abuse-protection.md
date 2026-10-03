---
title: Defense against bulk sign-ups and trial overspending
related-design: docs/design/2026-10-03-abuse-protection.md
---

# Defense against bulk sign-ups and trial overspending

Shared-key LLM calls now hold 4096 trial tokens (configurable with `TRIAL_TOKEN_HOLD`) under a row
lock before reaching the provider and settle the real usage afterwards, refunding the hold on
failure. Against Postgres, 20 simultaneous calls on a 10,000-token balance produced four holds
(3000 × 3 + 1000) and 16 refusals, where previously all 20 would have run.

New accounts must use a trusted mail domain, pass Cloudflare Turnstile when it is configured, and
receive the trial in thirds over 48 hours. Sign-ups and email changes can be logged as JSON lines
for monitoring with `AUTH_AUDIT_LOG=1`. Migration `0027_trial_release` backfills existing learners
as fully released.

Passwords set through sign-up, reset or Profile's new change-password dialog must score at least 2
on zxcvbn, checked on submit and again in Better Auth's hook; the estimator loads only when needed.
New passwords are capped at 64 characters, refused before the estimator runs. Profile's email and
password changes and the password reset now pass Turnstile too. The design lists every endpoint the
reverse proxy should rate-limit, and those pages refuse action URLs a proxy rule could fail to match.
