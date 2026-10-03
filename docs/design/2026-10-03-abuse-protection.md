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

- **Cloudflare Turnstile** on sign-in, sign-up, both forgot-password steps and Profile's change email/change password
  dialogs (`TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`; both empty turns it off). Form actions verify
  the widget token themselves. Direct HTTP calls to `/sign-in/email`, `/sign-up/email`, `/request-password-reset`,
  `/reset-password`, `/send-verification-email`, `/change-email` and `/change-password` must carry the token in
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
- **Audit log**: `AUTH_AUDIT_LOG=true` prints one JSON line (`type: "auth-audit"`) for
  `auth.sign_up`, `auth.email_change_requested`, `auth.email_changed`, `auth.password_changed`,
  `auth.password_reset` (which also covers an OAuth-only account setting its first password),
  `auth.account_linked` and `auth.account_unlinked`, with user id, addresses or provider and the
  client IP (`X-Real-IP`, see below). A provider account created with a new user is the sign-up, not
  a link; the unlink is logged from the last-login-method guard, which deletes the row itself.

## Password strength

Every password must score at least 2 on zxcvbn (`lib/auth/password-strength.ts`, `zxcvbn-typescript`).
The Better Auth `before` hook checks `/sign-up/email`, `/reset-password` and `/change-password`, with
the name and email as user inputs, and rejects with `WEAK_PASSWORD` carrying zxcvbn's warning. Forms
run the same check on submit, nothing live; the estimator (~800 KB of dictionaries) is imported
lazily on both sides and prefetched when a password field gets focus. zxcvbn's warnings are English,
so non-English Profile pages show a localised general message instead.

New passwords are capped at 64 characters (`AUTH_PASSWORD_MAX_LENGTH`, also Better Auth's
`maxPasswordLength`). The hook runs before Better Auth's own length and token checks, and zxcvbn is
synchronous and superlinear (a 512-character run blocks the event loop for seconds), so
`checkPasswordStrength` itself refuses longer input without scoring it. Sign-in and Profile's current
password accept up to 128, Better Auth's former default, so earlier passwords still work.

## Proxy rate limits

Rate limiting is left to the reverse proxy, per endpoint and client IP. Paths below are relative to
`BASE_PATH`. Form actions are told apart by their query, so `hooks.server.ts`
(`server/auth/action-url.ts`) refuses a POST to these pages unless its action is spelled exactly
`?/name`: Caddy's `query` matcher does not match a query it cannot parse (an unescaped `;`) and the two
decode keys differently, either of which would let a request run the action without matching the rule.

| Endpoint | Why |
| --- | --- |
| `POST /sign-in` | Password guessing; resends verification mail to unverified accounts. |
| `POST /sign-up` | Account creation and verification mail. |
| `POST /forgot-password?/requestReset` | Sends mail. |
| `POST /forgot-password?/resetPassword` | Reset-token guessing. |
| `POST /profile?/changeEmail` | Sends mail. |
| `POST /profile?/changePassword` | Current-password guessing. |
| `POST /profile?/sendPasswordSetup` | Sends mail. |
| `POST /profile?/linkSocialAccount`, `?/unlinkSocialAccount` | Login-method changes. |
| `POST /api/auth/sign-in/email`, `/sign-up/email`, `/sign-in/social` | The same flows called directly. |
| `POST /api/auth/request-password-reset`, `/reset-password`, `/send-verification-email` | Mail and reset tokens. |
| `POST /api/auth/change-email`, `/change-password`, `/verify-password`, `/delete-user` | Account takeover with a stolen session, password oracle. |
| `POST /api/auth/link-social`, `/unlink-account`, `/update-user` | Login-method and profile changes. |
| `GET /api/auth/verify-email`, `/reset-password/*`, `GET,POST /api/auth/callback/*` | Token and OAuth-state guessing. |

The proxy must resolve the visitor's address itself (behind Cloudflare: `trusted_proxies` with
Cloudflare's ranges and `client_ip_headers CF-Connecting-IP`) and pass it on as `X-Real-IP`, which
`ADDRESS_HEADER` points adapter-node at; Turnstile's `remoteip` and the audit log read it.

New actions or endpoints that send mail or change credentials belong in this table, and new pages
with such actions in `RATE_LIMITED_ACTION_ROUTES`.

## Not done here

Binding `generateExpressions`/`evaluateTranslation` to a task remains open.
