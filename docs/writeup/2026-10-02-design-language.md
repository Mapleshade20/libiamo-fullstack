---
title: One design language for the whole app
related-design: docs/design/2026-10-02-design-language.md
---

# One design language for the whole app

## What changed

**Selection has one rule.** `layout.css` makes controls (buttons, `summary`, `select`, svg, control
roles) unselectable and leaves everything else selectable. shadcn `Label` no longer sets
`select-none`. Field labels, headings, table cells and messages can be copied on every page;
double-clicking a button no longer paints a selection anywhere.

**Type is restrained.** Serif is reserved for page titles (`h1`), section headings (`h2`, including
`Card.Title`, now a real heading) and the one large subject of a page. Base styles own heading sizes,
so pages stopped restyling them. About 80 uppercase eyebrows with nine different letter-spacings
became sentence-case `text-xs`/`text-sm` muted labels; serif dates, counters, grades and italic
captions became sans. Arbitrary 10–11px sizes are gone outside practice surfaces.

**Colour comes from tokens.** New `--success` and `--warning` tokens join `--destructive`.
Hand-picked `text-red-600`, `bg-amber-50`, `text-gray-800` and the feedback page's private hex
palette now use them. The accent palette stays on marks, data and illustrations.

**One set of controls**, restyled or added in place:

- `ui/button`: ink primary, white bordered `secondary` (the old `outline` merged into it), `ghost`,
  red-text `destructive`, `destructive-solid` for confirmations; 40px, 44px on touch; press scales
  to 0.97. Seven copy-pasted `buttonClass` strings in the LLM Lab are gone.
- `ui/input`, `ui/textarea`: the white bordered field from the profile page.
- `common/Select` replaces every native `<select>`: a field-styled trigger and a floating-panel list
  (transitions.dev menu timing), with a hidden mirrored native `<select>` so form posts, `required`,
  server field errors, `change`-driven autosave and SSR all keep working. `submitOnChange` serves
  filter bars.
- `common/SegmentedControl` (sliding pill indicator) unifies Study/Manage, Daily/Weekly, the LLM Lab
  tabs, the guide language switch and trace votes.
- `common/Switch` (spring thumb), `common/Checkbox` (drawn tick), `common/ChoiceGroup` (the profile's
  radio cards), `common/Field`, `common/Notice` (tinted message well).
- `Accordion` gains a `plain` variant for use inside cards and lists; every raw `<details>` uses it.
- `ConfirmDialog` is built from `Button`, takes a body snippet and a `tone`, and replaces the admin
  task page's bottom sheets and inline delete confirmations (archive, card manager).

**Pages.** `/review/manage` lost its card-in-card layout, uppercase labels and serif list rows: a plain
filter row, one list card, one editor card with sentence-case fields and scheduling actions behind
confirmations. Profile, admin (tasks, task form, lineups, contributions), the whole LLM Lab, auth,
archive, contribute, chat feedback and translation evaluation follow the same rules.

**Bugs found along the way.** `/review/manage` pagination links ignored `base`. The trace rating note
and the dataset "add case" textarea were formatted with their content on new lines, so saved notes
gained surrounding whitespace.

## Where the rules live

`AGENTS.md` ("Design language") lists the rules agents must follow; the design document explains
them. Practice surfaces, the hint overlay, the Quest Hall book artwork, illustrations and the public
welcome/legal pages are deliberately outside the standard.
