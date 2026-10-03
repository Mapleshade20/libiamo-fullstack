---
title: Defense against bulk sign-ups and trial overspending
type: security
status: wip
---

# Defense against bulk sign-ups and trial overspending

Issue #93, items 1 and 2.

## Trial quota: hold, then settle

The old flow checked `trialTokensLeft > 0` before a call and debited after it, so N concurrent calls
all passed on the same positive balance. Instead, each env-provider call:

1. `reserveTrialQuota` locks the `user_quota` row and moves `min(left, TRIAL_TOKEN_HOLD)` (default
   4096, a little above a typical call) out of the balance. A balance of zero refuses the call.
2. `settleTrialQuota` adds the hold back and debits the provider-reported output tokens. The balance
   may go negative: other holds are already out of it, so flooring at 0 would forget an overspend
   and a later refund would make it spendable again. The debt blocks new calls until refunds or
   releases cover it; readers see 0. Migration 0027 drops the non-negative check for this.
3. `refundTrialQuotaHold` gives the hold back in full when the call fails.

A burst can now overspend by at most one call's worth per hold the balance could cover, not by the
number of requests. BYOK and explicit (Lab) routes are untouched. No rate limiting, by decision.

## Sign-up and email change

- **Cloudflare Turnstile** on sign-up and forgot-password (`TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`;
  both empty turns it off). Form actions verify the widget token themselves. Direct HTTP calls to
  `/sign-up/email`, `/request-password-reset` and `/send-verification-email` must carry the token in
  `x-captcha-response`; the Better Auth `before` hook checks it only when `ctx.request` is present,
  because internal `auth.api` calls have none (Profile's password-setup mail stays unchallenged).
  Verification fails closed.
- **Trusted mail domains** (`lib/auth/email-domain.ts`): a fixed provider list plus `*.edu` and
  `*.edu.<country>`. Enforced in `databaseHooks.user.create.before` (covers email and OAuth sign-up)
  and the `/change-email` hook; the sign-up schema and Profile action repeat it for field errors.
- **Staged trial**: `user_quota` gains `trial_tokens_released` and `trial_release_started_at`
  (the user's `createdAt`). A third is released at sign-up, a third 24 h later and the rest at 48 h,
  materialised idempotently on read. Existing rows are backfilled as fully released. Sign-up, the
  masthead pill, Profile and the depleted notification tell the learner when the next part arrives;
  "low" no longer fires while a part is still to come.
- **Audit log**: `AUTH_AUDIT_LOG=on` prints one JSON line (`type: "auth-audit"`) for
  `auth.sign_up`, `auth.email_change_requested` and `auth.email_changed`, with user id, addresses and
  the forwarded client IP.

## Not done here

Binding `generateExpressions`/`evaluateTranslation` to a task, and captcha on sign-in (which can
resend verification mail for an unverified account), remain open.
