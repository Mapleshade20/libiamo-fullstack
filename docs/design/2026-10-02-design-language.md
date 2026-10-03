---
title: One design language for the whole app
type: ux, accessibility, tech-debt
status: done
---

# One design language for the whole app

## Problem

Every page invented its own controls, so the app reads as several apps stitched together.

- **Selection is arbitrary.** shadcn `Label` and `Button` set `user-select: none`; hand-written
  `<label>`/`<button>` do not. A field label on `/admin/tasks/3` cannot be selected, while the same
  label on `/admin/lab/traces` can. Note rows on `/review/manage` wrap their whole content in a
  `<button>`.
- **Serif, uppercase and letter-spacing are used as decoration.** About 80 uppercase "eyebrows" use
  nine different tracking values (`tracking-wider` … `tracking-[0.22em]`) at 10px, 11px, 0.62rem and
  12px. Serif appears on dates, counters, italic captions and list rows. `/review/manage` stacks all
  three on one screen.
- **Five native-select styles**, seven copy-pasted `buttonClass` constants in the LLM Lab, raw
  `<details>` with the browser triangle, three different segmented controls (Study/Manage,
  Daily/Weekly, Lab tabs), hand-rolled badges in ad-hoc green/red tints.
- **Colours drift.** About 135 hex colours and 120 Tailwind palette colours (`text-red-600`,
  `bg-amber-50`, `text-gray-800`) stand in for tokens.

## Reference

claude.ai's settings (inspected over CDP) is the model for restraint: one sans family; two text tones
(ink and muted); no uppercase or letter-spacing; 14px UI text, 12px muted group labels; 32px
controls with 8px radius; translucent ink fills (5%, 10%, 20%) for hover, selection and tracks; a
segmented control for short modes, a borderless select trigger for settings rows, switches for
immediate on/off. Content text is selectable everywhere; icons and segmented options are not.

transitions.dev supplies the motion: menus open in 250ms and close in 150ms on
`cubic-bezier(0.22, 1, 0.36, 1)` from scale 0.97; a pill indicator slides between tabs in 250ms; a
switch thumb travels 350ms on `cubic-bezier(0.34, 1.35, 0.64, 1)`; a checkbox draws its tick in 350ms;
accordions grow on `grid-template-rows`.

Libiamo keeps its own character (warm paper, Playfair display headings, ink rather than blue), but
uses it sparingly.

## The standard

### Text selection

Content is selectable; controls are not. Users copy words, definitions, titles, error messages,
IDs and table values. Nobody wants a double-click on a button to paint a selection. Browsers also
disagree on whether button text is selectable, so the rule is set explicitly in one place
(`layout.css`):

- `user-select: none`: `button`, `[role=button|tab|switch|radio|checkbox|option|menuitem]`,
  `summary`, `select`, the shared segmented/switch/checkbox/select primitives and icons.
- Everything else, including labels, headings, descriptions, table cells and badges, stays
  selectable. Never add `select-none` to text.
- Do not put content that users may want to copy inside a control. A clickable row puts its title
  in the row's link/button, and keeps the copyable detail outside it or in the detail view.

### Typography

| Role | Style |
| --- | --- |
| Page title (`h1`) | Serif, `text-3xl`, medium, `tracking-tight`. One per page. |
| Section heading (`h2`) | Serif, `text-xl`, medium. A card's title is its section heading. |
| Group heading (`h3`) | Sans, `text-base`, semibold. |
| Body / UI | Sans `text-sm` (forms, tables, tools); `text-base` for reading prose. |
| Meta, help, captions | Sans `text-xs` or `text-sm`, `text-muted-foreground`. Never below 12px. |
| Code, IDs, model names | `font-mono`. |

- **Serif** is display type: `h1`, `h2`, and the single subject a page is about when shown large
  (the vocabulary on a study card, a quest title on its card). Never on labels, list rows, table
  cells, numbers, dates, buttons, badges, captions or form fields. No italic serif.
- **Case**: sentence case everywhere: titles, buttons, labels, table headers, status. No `uppercase`.
  Codes keep their own case (`EN`, `B2`). The Quest Hall book's print artwork (masthead, folios,
  ribbons) and the public welcome page are illustrations and keep their own type.
- **Letter-spacing**: none, except `tracking-tight` on serif headings.
- **Weights**: 400 text, 500 labels/buttons/emphasis, 600 headings and `strong`.
- **Text colour**: `foreground` or `muted-foreground`. `destructive` for errors and destructive
  actions, `success` / `warning` for status words. The accent palette (yellow, blue, sage, rose,
  wine, flame) colours marks, dots and illustrations, never running text. No hex or Tailwind
  palette colours (`text-red-600`, `text-gray-800`) outside practice surfaces.

### Surfaces

- Paper (`background`) is the page. A **card** (`Card` from `ui/card`) is `bg-card`, `rounded-xl`,
  1px border, faint shadow, and has a title (`h2`) when it is a section.
- **Never nest cards.** Inside a card, separate items with dividers (`divide-y`) or a quiet well
  (`bg-muted/60 rounded-lg`, no border).
- Messages that need attention use `Notice` (info / success / warning / danger): a tinted well with
  an icon, never hand-picked `bg-red-50` boxes.
- Empty states: muted sentence in the place the content would be, optionally with one action.
  No dashed boxes.

### Controls

Sizes: **md** is 40px (`h-10`) and the default. **sm** is 32px (`h-8`) for dense rows, table actions
and toolbars. On coarse pointers, md grows to 44px and sm to 40px (`pointer-coarse:`). Radius: `rounded-lg`
for buttons and fields, `rounded-full` for pills (badges, segmented controls, switches),
`rounded-xl` for cards and popovers.

| Need | Component |
| --- | --- |
| Action | `Button` (`ui/button`): `default` (ink), `secondary` (ink tint), `ghost`, `destructive` (red text), `link`. Icon-only buttons use `size="icon"`/`"icon-sm"` and `aria-label`. |
| Text entry | `Input`, `Textarea` (`ui/`): white field, border, ink ring on focus. |
| Label + help + error | `Field` (`common/Field.svelte`): label above, help below, error via `data-field-error`. |
| One of 5+ options, or long labels | `Select` (`common/Select.svelte`): field-styled trigger, floating panel list, check on the chosen item. `variant="ghost"` for toolbar pickers. No native `<select>`. |
| One of 2–5 short modes or views | `SegmentedControl` (`common/SegmentedControl.svelte`): pill track with a sliding indicator; items can be links (sub-navigation) or values (filters, form choices with `name`). |
| One of a few options that need a description | `ChoiceGroup` (`common/ChoiceGroup.svelte`): radio cards with a visible dot. |
| On/off that applies immediately | `Switch` (`common/Switch.svelte`). |
| On/off submitted with a form, or picking several items | `Checkbox` (`common/Checkbox.svelte`). |
| Show/hide a section | `Accordion` (`common/Accordion.svelte`). No `<details>`. |
| Anchored menu or popover | `FloatingPanel` / `floating-menu-item`. |
| Status label, code, count | `Badge` (`ui/badge`): `secondary` (default tone), `outline`, `success`, `warning`, `destructive`. Sentence case, `text-xs`. |
| Positive/negative state in a sentence | A 6px dot plus words (`StatusDot` pattern from profile), never colour alone. |

Rules every control follows:

- **States.** Hover changes only colour (fill or border), over 150ms. Press scales buttons to 0.97
  over 150ms. Focus shows `ring-3 ring-ring/50` (fields also turn their border to `ring`) on
  `:focus-visible` only. Disabled is 50% opacity with no hover. Selected means **ink**: an ink
  indicator, ink border, or ink fill. Never a lighter fill, never blue.
- **Motion.** Opening is 250ms and closing is 150ms, both on `--ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`).
  Spring overshoot (`--ease-spring`) is only for the switch thumb. Animate `transform`, `opacity`
  and `grid-template-rows`; never `transition-all`. Every animation stops under reduced motion.
- **Width.** In forms, fields fill their column; related short fields sit in `sm:grid-cols-2/3`
  grids and stack below `sm`. In toolbars and filters, controls size to content (`w-auto`) and the
  row wraps. Long option labels truncate in the trigger with the full label in the list.
- **Placement.** In page forms, actions sit left-aligned below the fields with the primary first. In
  dialogs and sheets, actions sit right-aligned with the primary last, and stack full-width
  (primary on top) below `sm`. Destructive actions ask first (`ConfirmDialog`).
- **Copy.** Buttons are verbs in sentence case ("Save card", "Add to lineup").

### Navigation inside a page

- Sub-pages of one section (Study/Manage, Daily/Weekly, LLM Lab tabs) use `SegmentedControl` with
  link items and `aria-current`.
- Vertical section nav (admin sidebar) uses `nav-item`: muted text, `bg-foreground/[0.06]` and ink
  text when current, `bg-foreground/[0.04]` on hover.
- Back links: `ghost` `Button` with a left arrow, sentence case.

## Implementation

1. Tokens in `layout.css`: `--success`, `--warning` (+ foregrounds), `--ease-out`, `--ease-spring`;
   base rules for `h1`/`h2`/`h3`, selection and `nav-item`.
2. Restyle the shadcn primitives (`button`, `input`, `textarea`, `label`, `badge`, `card`, `table`)
   in place. They stay the API; only their class tables change. `components/ui` remains the
   home for generated primitives; Libiamo-specific compositions live in `components/common`.
3. New primitives in `components/common`: `Field`, `Select`, `SegmentedControl`, `ChoiceGroup`,
   `Switch`, `Checkbox`, `Notice`, built on bits-ui where it provides behaviour (select, switch,
   checkbox, radio group).
4. Migrate every page and component outside practice surfaces, the Hall book artwork and the
   welcome page. Start with `/review/manage`, `/profile` and admin.
5. Record the rules in `AGENTS.md`.
