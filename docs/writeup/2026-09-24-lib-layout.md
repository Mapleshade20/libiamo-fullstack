---
title: src/lib reorganized by domain
related-design: docs/design/2026-09-24-lib-layout.md
---

# `src/lib` reorganized by domain

`src/lib` had grown three competing layouts: loose top-level files, a `components/` folder mixing
primitives with whole screens, and a mostly flat `server/` where prefixes stood in for folders. It
now has one rule, written down in `src/lib/README.md`: split by where code runs, then by domain, with
the same domain names in every layer.

```
<domain>/             shared types and rules        e.g. review/queue.ts
components/<domain>/  UI and UI-only state          e.g. components/review/StudyCard.svelte
server/<domain>/      DB, LLM, workflows            e.g. server/review/scheduler.ts
client/               app-wide browser infrastructure only
```

Domains: `task`, `quest-hall`, `practice`, `translation`, `review`, `streak`, `auth`, `account`,
`admin`, plus the cross-cutting `time`, `text` and `app`. The root of `lib/` now holds only folders,
`constants.ts`, `i18n/` and `utils.ts`, and the root of `components/` holds only folders.

## What changed

- **Moves (271 files).** Applied by a codemod that rewrote every import, `vi.mock` path and CSS
  import, in a commit with no other content changes, so history follows the files. Names that
  repeated the folder lost the prefix (`server/translation-workflow.ts` →
  `server/translation/workflow.ts`). Misleading names were fixed: `server/translate.ts` and
  `TranslateModal` are now `server/practice/translation-help.ts` and `TranslationHelpModal.svelte`,
  because they belong to practice quests, not translation quests.
- **Single-consumer code moved to its consumer.** Helpers in `client/` used by one component went
  next to it (streak state, translation drafts and snapshots, quest-hall unread subscription). The
  translation live-demo fixture and the welcome page's evidence data went into their route folders.
- **Consolidations.** Three browser-timezone modules became one shared module plus the client cookie
  sync. The chat session's user model (types, pools, seeded roster) left `discord/` for
  `practice/session/chat-users.ts`, since every platform uses it. `prepareMarkdownText` joined
  `renderMarkdown` in `text/markdown.ts`. Hint generation split out of the session service into
  `server/practice/hints.ts`. camelCase `.ts` files became kebab-case.
- **i18n.** The 1,550-line dictionary is now one file per language. The other languages are typed
  against English's keys, so a missing or stray key is a compile error as well as a test failure.
- **Cleanup.** Removed two empty files, three unused exports, and duplicate `vi.mock` calls.
- **Tests** mirror `test/lib/<same path>`. Misplaced tests were renamed (for example,
  `server/session.test.ts` actually tested `llm.ts` and was folded into `llm.test.ts`). Migration tests
  moved to `test/drizzle/`, the review API test to `test/routes/api/`.
- **Coverage config** now includes all of `src/lib`. The old globs named a non-existent file and only
  matched flat server files.

Behavior and UI are unchanged. `pnpm check`, `pnpm test` (1265 tests) and `pnpm build` pass. A
Chrome pass over the home book, task details, a practice session, the practice evaluation, review,
note management, archive, profile, admin, the welcome and legal pages, and both dev demos rendered
without errors.

## Known follow-ups

- The coverage thresholds in `vite.config.ts` already failed before this work (statements 80.7%,
  branches 73.3%, lines 84.0% on the old scope); with the complete scope they are 78.9%, 72.9% and
  81.7%. Either raise coverage or reset the thresholds deliberately.
- `task/lineup-dates.ts` still uses `dayjs` while `time/local-day.ts` does the same work by hand.
