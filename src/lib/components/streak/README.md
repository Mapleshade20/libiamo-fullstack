# Streak presentation and seasonal art

The server owns quest/review credit. UI components never grant it.

- `StreakHost` lives in the app layout, including fullscreen sessions. It observes authoritative
  records and stores a user-scoped **tab-local** progress receipt in sessionStorage. A first visit
  and day rollover establish a silent baseline; increasing same-day progress queues a reward.
- An empty account-wide layout snapshot is confirmed by a visible host through `POST
  /api/streak/observe`. This passive review credit is silent, including across reloads;
  receipt metadata keeps it separate from concurrent quest rewards. The lab never sends it.
- `StreakCompletion` is the explicit settlement gate: translation mounts it only in `completed`,
  review in its session summary, practice temporarily on feedback entry. Pending progress survives
  hard navigation, and is acknowledged before an effect starts on a **visible** page. Hidden
  completion surfaces keep the reward pending. Extra quests/ratings do not replay it.
- `StreakIndicator` owns the trigger, digits and clipboard. It does not consume completion rewards.
- `StreakWeek` reads actual lit/protected outcomes from the calendar endpoint. Never infer historical
  study days from the aggregate count.
- `StreakFlame` owns the 30-second rest / 10-second movement cadence, visibility and reduced motion.
  Art owns the smooth transition back to its canonical static shape, not a frozen arbitrary frame.

## Replace the art

Change `streakSkin.Art` in `skin.ts` to a Svelte component implementing `StreakArtProps`:

| Input | Meaning |
| --- | --- |
| `appearance` | `gray`, `kindling` (one daily gate), `burn` (both gates) |
| `ignite` | Play the one-shot transition to burning |
| `moving` | Retarget idle motion smoothly; false must settle to static and stop RAF |
| `reduced` | No traveling/morphing/idle animation |
| `speed` | Duration multiplier (lab); 1 in production |
| `onready` | Assets ready, including a static fallback on load failure |
| `onrise` | Flame has reached its upper pose and cleared the calendar area; reveal the week |
| `onigniteend` | Ignition finished; begin the calendar's reading dwell |

A holiday skin can use different geometry and a different ignition duration without modifying
workflows, receipts, calendars or the server. Keep its canvas transparent, provide an SSR static
fallback, avoid globally scoped SVG IDs, and release all animation handles on destruction.

## Default artwork

`art/flame-data.json` and `art/flame-player.js` adapt the verified optimized asset from
`../tmp` in the parent Libiamo workspace (`/Users/maple/dev/libiamo/tmp` at integration time).
They are authored local SVG geometry, not raster traces displayed as images, external network
assets or a Lottie dependency. Both are dynamically imported; the model is shared between instances.

The source model uses sparse contour tracks, periodic cubic splines and temporal deltas. The runtime
reconstructs control handles and interpolates continuous poses. No full-SVG frame table is shipped.
Adaptation changes: ES module export, explicit data parameter instead of browser globals, light-theme
ash palette and a small procedural `gray-motion.ts` deformation (whole-body rocking with recoil). The static
gray/burn SVGs provide SSR/loading fallbacks. Generated art is deliberately excluded from Biome;
do not expand or hand-edit its packed coordinates. Offline generation/visual reference tests remain
with the original flame project, not in the application runtime.

`DefaultFlame` normalizes the different source origins without changing scale at ignition handoff.
Blue kindling shares the player's motion envelope, so stopping does not snap it back. Gradients and
clip IDs remain per instance. Static states stop requesting frames.

`burn-motion.ts` overlaps the final 12 recorded poses with the moving start, bypassing the old
18-frame eased return bridge. The ignition entry is preserved; subsequent wraps match position and
velocity. Burning motion is slightly amplified and carries three staggered procedural sparks.
Celebrations request continuous motion through their exit; the homepage retains its intermittent cadence.

The clipboard uses true daily history from `/api/streak/calendar?month=YYYY-MM`, not aggregate
count extrapolation. See `docs/design/2026-09-18-streak.md` §2.5 for migration/unknown-day rules.
The celebration week reads that same history; today's live completion appears without waiting on it.

## Rehearsal and verification

`/streak-lab` uses the **real masthead, receipt reducer, completion gate and presentation host**.
Only its record, date, speed and reduced-motion preference are overridden. Its receipts are in memory,
isolated from production session/localStorage. Reset starts a fresh rehearsal; leaving clears overrides.
No control writes the account. Existing dev-only server actions are retained for low-level debugging,
but are not invoked by the rehearsal UI.

Micro-motion controls override the idle cadence on the real masthead/clipboard: play immediately,
settle smoothly to static, or restore automatic timing. Reduced motion and page visibility still take
priority. Reset and leaving the lab clear the override; celebration choreography is unaffected.

```sh
pnpm check
pnpm test
pnpm build
```

The repo has no browser harness, so what only a browser can show — both completion orders, the late
calendar reveal and its clearance below the flame, modal focus return and scroll-lock release, and
the exact neutral return after an idle cycle — is checked by hand in `/streak-lab` at reduced speed.
Drive it through the sandbox controls; nothing there writes the account.
