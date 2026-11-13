---
title: Session records replace the LLM Lab
type: feature, tech-debt
status: wip
---

# Session records replace the LLM Lab

## Why the Lab no longer fits

The LLM Lab (`2026-09-24-llm-lab.md`) treats one call as the unit: store its structured input, re-run it under
other slots, models or overrides, rate the outputs. That fitted a product with a dozen independent calls. The revision
session coming from the rehearsal lab makes 20–26 calls per piece, and they form a chain:

- **A call's input is earlier calls' output plus the learner's choices.** A stop's material depends on the analysis,
  the judge, the rebase, the reading the learner picked and the stops already applied. Re-running one call on stored
  inputs tests it in a world that stops existing once an upstream prompt changes.
- **Quality shows in what the learner sees, not in one output.** The 2026-11-10 review found every real defect at the
  session level (a reference repeating its neighbour, a merged stop whose first question answered its second, a judge
  skipping a spot it should have checked); none was visible in a single call.
- **Automatic judging did not hold up.** LLM judges follow the tutor's claim (E13) and stronger models or more samples
  did not help (E10). What worked was reading whole sessions, by the user and by Claude Code, then replaying them.
- **Dev already beats prod for iteration.** Datasets, run grids and per-admin overrides exist to iterate inside
  production. With prod readable (read only) from the dev machine, the loop is: find a bad session in prod, reproduce
  it in dev, fix, replay, commit, deploy.

What the Lab got right stays: capture through one interceptor that can never fail or slow a call, opt-out (every
learner brings their own key since the trial was dropped, 2026-11-13, so anyone may opt out), retention, no keys stored.

## The record

One record per piece of writing (free writing, scenario, translation), in three layers:

| Layer | What | Kept |
|---|---|---|
| **Piece** | inputs (text, background, task/scenario id, languages, detail level, model), final text, git SHA of the code that ran it, times | as long as the piece (the learner's own history) |
| **Steps** (the tape) | every session action in order: what the learner sent (a reading chosen, an attempt, "keep as is", a hint asked) and what the page got back, with latency | with the piece; this is also what lets the learner and the admin see the session again |
| **Calls** | every model call, linked to the step it ran for: purpose (`material s2`), call id, model, effort, request messages (system prompts stored once by hash), output, tokens, cost, latency, state (done, failed, repaired, discarded) | 30 days, unless the session is flagged; not stored for learners who opted out |

The steps are exactly what the demo already writes to `runs/live/<id>.jsonl`, and the format the tour's tapes replay
(`components/tour/tape.ts`); the calls are what its call bubbles show (`src/trace.ts`). The merge moves both into
tables instead of inventing a new format.

## The admin pages

**Sessions** (`/admin/sessions`). A list to review periodically, sortable by signals derived from the steps and
calls, with no extra model call:

- the learner pushed back: "keep as is", "I'll say it myself", "I have a question", three or more failed tries,
  asked for the answer, left mid-session;
- the system struggled: failed or repaired calls, the end check naming a lost point, a gate rewrite, a wait over
  8 s, cost far above the median.

**A session.** Left: the learner's view, played from its tape through the real session components, read only, with a
step scrubber. Right: the steps, each with its calls; opening a call shows its messages (prompt sections folded) and
output (parsed and raw). A flag on any step with a note ("the 'But' here is a real contrast; the tutor misread it")
turns the session into a **case**.

**Cases.** Flagged sessions with their notes and a state: open, fixed (with the commit), won't fix. A flagged
session's calls are kept past 30 days until the case is closed. Cases are the regression set; nothing else is
curated.

## Reproducing a case in dev

Two commands for Claude Code, reading prod read only:

- `pnpm case pull <id>` copies the record into `cases/<id>/` (git-ignored, never committed) and seeds the local model
  cache with the recorded outputs, keyed the way the transport keys requests (model, effort, sample, messages).
- `pnpm case replay <id>` runs the session locally with the learner's recorded actions. Every call whose prompt is
  unchanged gets its recorded output, so the replay reproduces prod exactly and costs nothing; a changed prompt gets
  a fresh call, and everything downstream follows from it. The learner's actions are replayed while the stops still
  match the tape; where they no longer do, the replay stops and reports the step (or hands over to the scripted
  learner from the rehearsal lab's driver). It prints prod against now: stops, questions, readings, references, the
  final text.

`pnpm case replay --open` (or `--all`) replays every case after a change: only calls whose prompt changed cost money.
Fixed, it ships as a normal commit; the case is marked fixed with that commit.

For this to work, a prompt must not contain anything that changes between runs (today's date, random ids); where
one does, the recorded value is replayed.

## What goes

From the main app, at the merge:

- slots and slot templates, variants, `llm_override` and the override marker, the Playground;
- `llm_dataset`, `llm_dataset_case`, `llm_run`, `llm_run_cell`, the run worker, the `lab.judge` recipe, `llm_rating`;
- `LLM_LAB_PROVIDERS`, the floating inspector, `/admin/lab` and its guide.

Production has not launched, so the migration drops these tables and their data without exporting anything (user, 2026-11-11).

What stays: the interceptor and capture policy (`llm_trace_opt_out`, retention, never failing a call), and one entry
point for every model call (timeouts, the learner's key, the call's id and effort). `llm_trace` becomes the calls
layer: it gains the session and step it belongs to and loses `variant`, `override_id` and `run_id`. Recipes keep their
id, effort and output schema; pure, JSON-plain inputs are no longer required for re-runs, since replay works on
recorded messages. AGENTS.md's LLM Lab paragraph is rewritten accordingly.

The privacy policy changes: flagged sessions are kept until their case closes, and are read on a developer's machine
to fix them.

## In the demo, now

Every admin page is drawn in the demo, in its style, from fixtures and with no real actions (user, 2026-11-11): the
main app's pages redesigned for the new product (scenarios, issues instead of lineups, an inbox for suggested
situations and feedback, announcements, name tables) and the new ones (sessions, one session, cases). The tables,
the commands and the migration come with the merge.

## Rejected

- **Keeping per-call re-runs with stored structured inputs**: tests a call against upstream outputs that a change
  invalidates, and needs every pipeline call rewritten as a pure recipe.
- **An LLM judge over sessions to find bad ones**: judges anchor on the tutor (E13); signals from the learner's own
  pushback and from failures point at the same sessions without one.
- **A Langfuse-style generic trace viewer**: shows calls, not what the learner saw, and cannot replay a session.
