# AGENTS.md

Quick guidance for agents working in this repo. See README.md for what the product is.

## What belongs here

Keep this file selective. Record only technical designs, constraints, and non-obvious details that future work will repeatedly need to use or consider, especially when not knowing them would lead to an incorrect implementation. Do not record every technical detail, completed change, component description, styling choice, or fact readily discoverable from the code. Put implementation history and task-specific detail in design/writeup documentation. Consolidate related rules and remove obsolete or low-value entries instead of continually appending.

## Commands

```sh
pnpm dev          # dev server on 127.0.0.1:5173 (ORIGIN must say so)
pnpm build        # production build
pnpm check        # svelte-check + biome check --write (format included; use for development)
pnpm test         # unit and integration tests
pnpm db:generate --name migration_name  # generate a migration (needs tty)
pnpm db:migrate   # apply migrations
node --experimental-transform-types lab/seed.ts  # works, name tables, scenarios and issues (lab/seed/scenarios.json) into the dev database
pnpm case pull <piece>            # a piece's record into cases/ (git-ignored), its replies into cases/cache (CASE_DATABASE_URL, read only)
pnpm case replay <origin> <piece>|--all|--open  # replay cases on a server with LLM_CACHE_DIR=cases/cache
```

## The rebuild

The app is being rebuilt from the product's demo (rehearsal-lab `app/`, now an archive); the plan, the data model, the order of work and its current state are `docs/design/2026-11-13-step-3-rebuild.md` (§12 is the state). Read it before structural work.

- **The demo is the product.** Its pages, components, copy, colours and motion are the source of truth; match them rather than restyle. Judge looks on the production build beside the demo (`pnpm dev` in rehearsal-lab `app/`, port 4793): the dev server can order CSS differently. Pixel parity is not the goal; no worse experience is.
- **Rendered on the server.** Every page renders on the server and hydrates; the demo's browser storage, its developer settings and the `/lab` pages are gone. Never keep data the server owns in the browser: the browser keeps only the home page's unsent draft, how the week's glass last moved, the address typed between the auth pages (this tab), and the cookies `lang` (the signed-out pages' language) and `side` (the sidebar folded), which the server reads before rendering.
- **The model layer** came from the lab and lives in its domains: the revision in `server/revision` (`revision.ts` is the server side of one revision), the gate in `server/writing`, collecting in `server/notebook`, translation sources and names in `server/translation`, pure text helpers in `text/`. Every model call goes through a `Caller` (`server/llm/caller.ts`: who pays, the purpose, the revision's background lane, the record), never a global; learners' calls run on their own key only (`server/llm/callers.ts`), the gate's too. Typed choices with probabilities go through `server/llm/decide.ts`: the provider's Decisions API where it has one (`decisions` in `lib/llm/providers.ts`; OpenRouter and OpenAI take different request shapes), else the chat model with thinking off. Thresholds over the probabilities do not carry from one model to another: run `lab/gate-probe.ts` after changing the gate's questions or adding a model.
- Long-lived callers resolve the learner's key/model for each new call; recording reads the current privacy setting, not the revision's captured one. System prompts may contain learner text: `llm_prompt` is deduplicated per owner and cascades with that account. `pruneCalls` removes calls after thirty days (except a piece's while an open case holds it), then unreferenced prompts. The admin's sessions never list a learner who does not help improve Libiamo.
- **The replay baseline** (`lab/baseline/`, recorded by `lab/record.mjs`) is the model flow's acceptance test: `lab/replay.mjs` plays its sessions against a dev server answering from `lab/baseline/cache` only (`LLM_CACHE_DIR`, `LLM_CACHE_ONLY=1`; `lab/account.mjs` makes the account). Every response must be identical; a difference is a change in behaviour. A prompt changed on purpose means recording the baseline again (about $0.35). Replay on a freshly started server: after a hot update of server modules the dev server can lose `LLM_CACHE_*` (calls then reach the provider on the account's real key).
- No database is in production yet: until launch the schema is one migration, `drizzle/0000_init.sql`, regenerated (delete `drizzle/`, `pnpm db:generate --name init`) rather than stacked.

## Architecture and invariants

### Access

- `hooks.server.ts` decides who may see a page before anything runs: signed out → `/sign-in` (the site's address → `/about`; `/about` and the documents answer anyone), not set up (`onboarded_at` null) → `/welcome`, `/admin` → 404 unless the role is admin, `/api/*` → 401. Never rely on `redirect()`/`error()` inside a remote query for this: called from the browser it is not honoured (sveltejs/kit#17262).
- Every remote function and endpoint is a public URL whatever page calls it: begin with `learner()` or `admin()` (`server/guard.ts`) and scope rows by the learner's `user_id`.
- Better Auth has no session cookie cache: every request reads the session and user, so settings the app writes hold on the next request. Its `baseURL` is `ORIGIN` alone (it appends `/api/auth`); requests from another origin are refused, so `ORIGIN` must match the browser's URL in development too.

### Data flow

- The app's reads and writes are remote functions (`query`, `command`, `form` in `*.remote.ts`), experimental like Svelte's async mode: Kit and Svelte are pinned to a minor version, and each upgrade reads the changelog's remote-function entries first. Never run two refreshes of one query at once (an older response can overwrite a newer one, sveltejs/kit#17354). `query.live` is not used; the exchange polls.
- **State that belongs to a learner is per request on the server.** Module-level `$state` in shared code is one object for every request the server renders at once, so a learner's account, settings, pieces or shell state there would render into another's page: make it with `learnerState` (`lib/scope.ts`; `hooks.server.ts` keeps one per request). Module state is fine only for what is the same for everyone (the interface strings, the captcha's site key) or only ever set in the browser (the toast, the tour). Browser APIs (`localStorage`, `matchMedia`, `navigator`, `document`) never run at a script's top level: read them in `onMount` or an effect, and render the server's answer first.
- The root layout's server load gives every page who is signed in (`me`), their pieces, the interface strings it speaks and the time and time zone dates are shown in; the universal `+layout.ts` pours them into `account`, `app` (`lib/account/app.svelte.ts`: settings and look) and `writing.list`, on the server and again in the browser. `<html>` (language, direction, theme, backdrop, the sidebar folded) is written by `hooks.server.ts` from the same setup (`server/account/page.ts`); app.html settles a "system" theme before the first paint. `app.save()` / `app.saveLook()` send settings back; `hydrate()` and `refreshWriting()` ask again after anything that changes them (a sign-in goes home with `invalidateAll`). Auth flows call Better Auth's client and return catalog keys for what the page shows.
- The notebook, review and the week are the server's (`lib/notebook/notebook.remote.ts`, `lib/week/week.remote.ts`); pages read them through `notesNow()`, `dueNow()`, `deckNow()`, `weekNow()`, which answer from the tour's sandbox while it plays (`components/tour/sandbox.svelte.ts`: the browser's memory only; it also holds the tour's pieces, readings and week, and nothing it does reaches the server). Notebook queries take the language the page speaks as their argument, so a language switch needs no refresh. A command that changes what a page shows refreshes it in the same response: `week().refresh()` on the server, or `requested(query, n).refreshAll()` for what the client asked for with `.updates()` (Kit 3 fails a requested update the command does not handle).
- The exchange (a scenario's simulated place) is legacy's practice session on new tables: the places in `components/exchange/places` talk to the server only through the `ExchangeApi` the play page builds from `lib/exchange/exchange.remote.ts`, and poll while the cast composes. The cast answers from the agent-reply worker in the server process (`server/exchange/agents`, started in `hooks.server.ts`): batches claimed under leases, lock order exchange → batch → delivery. Everyone who writes in a version's opening must be one of its people (a stray name becomes a second persona the cast voices); passers-by join an open place only when the version's `others` says who may. What an exchange is played in is `settingOf` (`server/exchange/setting.ts`): the scenario and the version in the piece's language, the version's people filled in as the old `counterpartName`/`members`.
- Scenarios are the server's (`lib/scenario/scenario.remote.ts`, `server/scenario/scenarios.ts`): offered in the language being worked in when published and that version is live (a translation also needs its source in the learner's language, checked or confirmed); the pool's ranking is code. What a page receives is built only in `scenarioViewOf`: never a person's notes, `others` or `followed`. Scenarios and issues travel as one content document (`server/scenario/content.ts`, `lab/seed/scenarios.json`). The plan typed on a scenario's page is kept as it is typed (`scenario_plan`) and taken by the piece when the place or the sheet creates it. Something pasted to collect from is kept as a `reading` before anything is highlighted, and opens at `/collect/<reading>`.
- A translation draft pins its complete assignment in `piece.assignment`: source, original, context and languages, never mutable content-table joins. The first save carries the displayed source's generation; an unfinished scenario keeps its original language. Source availability checks the full input fingerprint; every generator write and admin confirmation is fenced by its generation, including same-content remakes. Content imports obey the same identity rules. Sources run on the service key with the work's confirmed name table.
- A finished piece's notebook entries come from the notes call after the revision ends; the server retries it (a sweep in `server/revision/store.ts`, `piece.notes_tries`) and after the third failure files what pass 2 reworked as entries without a meaning. The page only watches.
- Each half of a day (`practice_day`) is written only in the transaction that earned it (`server/week/days.ts` `credit`): the guarded move of a piece to `finished` (`finishPiece`), a write-again, a rating that leaves the queue of its language empty, a visit that finds it empty (`lookAtReviews`). Learning something on a day with nothing to review is the whole day. Days are in the learner's `time_zone`, weeks start on Monday and keep the goal they were held to (`user_week`).
- Review runs on ts-fsrs (`server/review/scheduler.ts`): FSRS-6, steps 1m/10m, relearning 10m, learn ahead 20 minutes (at least the longest step, so an empty queue means the day's reviews are done), review cards due at the start of their local day, new notes from the next local day. The page rates without waiting, from each card's previewed outcomes; ratings are sent one after another. ts-fsrs 6 needs Node 24 (the image's `NODE_VERSION`).
- The revision's protocol (`POST /api/s`, then `/api/s/<id>/<action>`) stays as the demo had it: it is also the tape, the tour's and `case replay`'s format. `<id>` is the piece's: the page that sends a draft in creates the piece (`lib/session/start.ts`) and opens `/live/<piece>`. Two actions are not steps and stay off the tape: `progress` (the page's bookmark, kept in the snapshot) and `resume` (where the revision was, for a reload, a restart or another device). Anything the page alone knows that coming back needs goes into the bookmark.
- Revision mutations are serialized per piece; a tape step and its snapshot commit together. A failed commit retires the in-memory session so later saves cannot persist unrecorded progress. Replaced/dropped sessions lose their callbacks' write authority. Review ratings likewise retain an idempotency key across retries; unconfirmed cards cannot be rated again and pending ratings prevent silent navigation away.
- The tour reads recorded demo fixtures and tapes, never the live scenario pool or learner history. Unmount the previous chapter before replacing its seed, then await settled rendering before continuing (otherwise its awaited derives rebase against the new seed, sveltejs/svelte#18895). Each chapter has a new lifetime: old callbacks must neither enter the next sandbox nor fall through to real requests after exit. Leave focused tour pages before releasing their sandbox.

### Admin

- The admin pages (`routes/(app)/admin`, English) read and write through `lib/admin/*.remote.ts`, each function behind `admin()`; their server side is `server/admin`. A scenario is saved whole and its versions validated by kind and place (`saveScenario`); publishing a translation queues its sources. What waits on the admin (sources to look at, the inbox, open cases) is one query (`waiting`) the commands refresh.
- What learners send (suggestions, feedback) and announcements are tables (§5.3); a learner reads announcements through `lib/account/announcements.remote.ts`.

### Database

- `server/db/schema.ts` follows §5 of the rebuild design: value sets are `text` with a check built from `lib/constants.ts` (no Postgres enums), every time is `timestamptz`, jsonb is validated in code on every write.
- Deleting an account deletes its `user` row: every table that belongs to a learner must reference `user.id` (or a row that does) `on delete cascade`, or deletion leaves their data behind.
- The environment is declared and checked in `src/env.ts` and read from `$app/env/private` (never `$env/*` or `process.env` in app code). Build-time placeholders in the Dockerfile satisfy required variables; add one there when a new required variable is read at module scope.

### Accounts

- Every way a password is set passes Better Auth's `before` hook, which refuses with a catalog key (`auPwShort`, `auPwGuessable`) from `passwordProblem`; pages ask first only to answer sooner. Turnstile guards only the signed-out endpoints, from the `interaction-only` widget in the auth layout.
- Answers never tell whether an address has an account: sign-up, password reset and address changes answer the same either way, and the mailbox is told instead.
- A learner's key is stored AES-GCM-encrypted under `BETTER_AUTH_SECRET` (`server/account/key.ts`) and never sent back to a page.

### Interface strings

- `lib/i18n/catalog/source.json` is written by hand in en and zh-CN; `ui.json` holds every interface language. A new key goes into both, in every language; `test/lib/i18n.test.ts` fails on a key missing anywhere or named nowhere.
- Mails are English (`server/auth/email.ts`) until the catalog has mail strings; without all of `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` they are printed to the console.

## Implementation conventions

- Imports use the subpath alias `#lib/...` with explicit extensions (`#lib/utils.ts`, `#lib/account/account.svelte.ts`).
- Split code by where it runs (`<domain>/` shared, `components/<domain>/`, `server/<domain>/`, `client/`), then by domain; the domains are in §4 of the rebuild design. "Session" alone is never a name: the auth session, a revision and an exchange are three things.
- Svelte 5 runes only, tabs for indentation. Svelte component CSS is unlayered and beats Tailwind utilities regardless of specificity: helper classes in `<style>` must not set properties that responsive utilities need to override.
- Fix Biome's findings in the code; a suppression comment says why.

## Verification and documentation

- Agents must not sign their work: no `Co-Authored-By` trailers, "Generated with" lines or other agent attribution in commits, PRs or files.
- Run `pnpm check` and `pnpm test` before finishing code changes. Write essential tests for new TypeScript behaviour; avoid redundant ones.
- Tests mirror `src/` under `test/`. Mock `$app/env/private` with `vi.mock` and a plain object. Test Better Auth behaviour on `better-auth/test`'s in-memory instance with `createAuthOptions` (`test/lib/server/auth/options.test.ts`), not by calling hooks by hand.
- Test semantics, navigation, accessibility, state and data relationships rather than editorial wording; assert exact text only when it is a contract.
- Check flows end to end in a browser against the dev server (or the built image under compose for deployment changes), and record motion when judging it.
- For big changes, use `docs/design/` for the proposed work and important decisions, then `docs/writeup/` for a concise human-readable account of what changed.
    - Design frontmatter: `title`, `type` (bug / feature / ux / performance / accessibility / security / tech-debt / test; may be multiple), `status` (needs-approval → wip → done; only a human may mark done).
    - Writeup frontmatter: `title`, `related-design` (path from project root).
    - Filename format: `YYYY-MM-DD-some-title.md`.
