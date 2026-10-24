# UI redesign plan

Implements the design chosen on 2026-10-24 ("Option G" on the
[view-prs UI options canvas](https://claude.ai/artifact/WgYUnuKeybx5LFRakN2PRa)),
and converts each component to TypeScript as it is rewritten. This is the
"presentational components are converted as part of the rework" half of
`AI_MODERNIZATION_PLAN.md` Phase 12D; the state layer is already TypeScript.

Review statistics and Author Insights are out of scope: they only move under
the new top navigation (phase 9). Their redesign is separate work.

## The target design

- **Rows.** Single-line rows in the existing sections, with column headings:
  Signals, Pull request, Who, Review, CHK·MRG, Actions. Long titles wrap
  rather than truncate. Size and Activity columns appear only while the
  detail pane is hidden.
- **Signal icons in fixed slots.** Unread change, needs attention, flagged,
  in review, checks, mergeable, approvals, open conversations, viewed files
  and notes. An empty slot means "no". Every icon shows its full value on
  hover and on keyboard focus (the MRG text explains YES / NO / UNK). Colour
  is always paired with a distinct shape.
- **Inline summary.** The row chevron opens a short, fixed-height summary
  under the row: why it needs attention, the last three events, and the
  first two open conversations. Any number of rows can be open at once.
- **Docked detail pane.** Selecting a row shows that PR in a pane docked to
  the right; there's no separate "open" click. The pane is empty until a PR
  is selected. It can be hidden from the header. Below 900px wide it becomes
  an overlay drawer with a backdrop.
- **Pane tabs.** Overview | Activity | Conversations | Notes, plus a
  hook-output tab only when an insights hook is configured (as decided in
  `ROADMAP.md`). Tab labels carry counts ("Conversations 6 open") and Notes
  shows an unsaved-changes marker. The last tab picked applies to every PR
  opened afterwards, in memory only.
- **Activity tab.**
  - Scope: "since my last review" or all.
  - Event-type filter chips; thread open/resolve hidden by default.
  - Grouped by day, with runs of commits collapsed into one line.
  - Comments are not truncated; long ones fold.
  - The PR author's name and the viewer's are styled.
- **Conversations tab.**
  - A summary line, and Unresolved / Waiting on me / All filters.
  - Threads grouped by file, in collapsible groups.
  - One-line threads that expand to show replies.
  - A "Next unresolved" button.
  - The resolved-by-the-wrong-person callout.
- **Notes tab.** A read view with an edit button per field. Each story shows
  its name with an open-link icon.
- **App shell.**
  - Header: repo, a top nav (Pull requests / Review stats / Authors), an
    "Updated N ago" status pill, refresh (Quick check all), an activity
    button and a settings button.
  - The Management tabs become a Settings drawer.
  - The activity drawer becomes a popover from the header.
  - The view filters become a collapsible filter bar above the table; the
    applied-filter chips stay visible when it's collapsed.

## Ground rules

- **TypeScript as we go.** Every component a phase rewrites or moves is
  written as `.tsx`, with a props interface. The old `.jsx` file is deleted
  in the same change, never kept alongside. New tests are `.test.tsx`.
  Existing tests are updated in place and converted when they're rewritten
  (as Phase 12G allows).
- **Each phase ships on its own.** Each phase is a branch off `development`
  and a PR back into it. Run `npm run check:all` and `npm run test:e2e`
  before opening it. The app works fully after every phase; there are no
  half-old, half-new screens behind flags.
- **e2e selectors follow `e2e/smoke.spec.js`'s rules.** Find elements by
  role and accessible name. Keep existing accessible names where their
  meaning still holds (the "Pull requests" region, sections named by title,
  "Select PR #N", "Ack PR #N", "Update PR #N"). Where a name has to change
  (for example "More insights for PR #N" becoming the summary toggle), update
  the spec's named helpers in the same commit.
- **No new runtime dependencies.** Icons are inline SVGs drawn from a typed
  map of shapes (`components/ui/Icon.tsx`), and tooltips are a small
  component.
- **Docs move with the code.** After each phase, tick the matching
  `ROADMAP.md` items and the Phase 12D list in `AI_MODERNIZATION_PLAN.md`.

## Phases

### Phase 0 - Foundations

- **Design tokens:** colours, spacing, radii and type sizes as CSS custom
  properties in `src/ui/styles/tokens.css`, linked before `index.css`. They
  should support dark mode later, but dark mode isn't part of this plan.
- **Shared primitives** in `src/ui/components/ui/`, each `.tsx` with tests:
  - `Icon` (`<Icon name="flag" />`, typed names)
  - `Tooltip` (hover and focus; attaches its text to the trigger with
    `aria-describedby`)
  - `IconButton` (requires an accessible name)
  - `Button`
  - `Chip` and `ChipGroup` (toggle chips with `aria-pressed`)
  - `Tabs` (the tabs pattern, with arrow-key movement)
- **Full-width page:** the whole page now uses the full window width (not
  just the PR data panel, as first planned), so phase 4's pane has room
  before the shell is rebuilt. On a wide monitor the Management forms
  stretch too, until phase 9 replaces them.

**Progress (2026-10-24).** Done on branch `ui-redesign/phase-0`:

- Added `styles/tokens.css`, `styles/layout.css` and `styles/ui.css`. The
  `body` rule moved out of `index.css` into `layout.css`, without its 1100px
  cap, so the whole page now uses the full window width.
- Added `Icon`, `Tooltip`, `Button`/`IconButton`, `Chip`/`ChipGroup` and
  `Tabs`/`TabPanel`, each with tests.
- ESLint's CSS check now allows the token variables in `src/ui/styles/`,
  since it can't see variables defined in another file.
  `styles/tokens.test.ts` checks instead that every variable used there is
  defined.
- Review fixes:
  - Tooltip bubbles render at `<body>` with fixed positioning, so the
    sections' `overflow: hidden` can't clip them. They flip above or below
    and stay inside the window.
  - The pointer can move onto a bubble without it closing, and Escape
    closes it even when it was opened by hover (WCAG 1.4.13).
  - Only the selected tab has `aria-controls`.
  - `Button`, `IconButton` and `Chip` forward refs.
  - The font tokens use the page's system fonts.

Nothing uses the primitives yet; phase 2 is their first user.

### Phase 1 - Section UI state in React, not the DOM

- New `PrTableUiStateContext` (`.tsx`) holding three things that are now
  local to `PrTableApp` or read from the DOM: open sections, expanded rows
  and the selected PR.
- `ExportTab` and `pr-export.helpers.ts` read the visible PR numbers from
  this context instead of walking `#pr-sections` for `<details open>` and
  the `pr-group-section` / `pr-number-cell` classes. This is what lets
  phases 2-4 change the markup without breaking Export. Export behaviour
  stays the same: it covers rows in expanded sections only.
- Convert `ExportTab` to `.tsx` here, since it's being rewritten anyway.

**Progress (2026-10-24).** Done on branch `ui-redesign/phase-1`:

- `state/PrTableUiStateContext.tsx` and `state/PrTableUiStateProvider.tsx`
  hold section open state (only the user's choices; otherwise each
  section's default), expanded rows, and the selected PR. The Provider
  wraps `AppRoot`.
- `PrTableApp` reports the sections it rendered and their PR numbers. The
  Provider derives the open-section count and the PR numbers in open
  sections from that, in a second context (`PrTableOpenSectionsContext`)
  that only Export reads. So a report doesn't re-render the table, and
  Export only re-renders when the open sections' PRs change. With one
  context, every change of section contents rendered the whole table
  twice.
- `ExportTab.tsx` (converted) reads those instead of walking the DOM, so
  its summary now updates as sections open and close. The DOM walker
  `getVisiblePrNumbersFromSectionsHost` is replaced by the pure
  `getPrNumbersInOpenSections`.
- Fixed a latent bug: closing a section that's open by default (In Review,
  Needs Attention) was recorded as open, because flipping "no choice yet"
  always gave "open". The DOM showed it closed, so nothing noticed until
  Export read state. `PrSection` now passes the new state.
- Sections are no longer rebuilt when one is opened or closed: open state
  isn't an input to building them any more.
- "Jump to PR" (the Auto update paused chips, "View in table") scrolls and
  focuses after every request, including when the row is already
  expanded. It used to rely on the expanded rows always changing; the
  Provider leaves them unchanged when nothing changes, so a request
  counter now triggers it.
- Older bug fixed: "Jump to PR" expanded the row in the first section the
  PR was in, which for a flagged PR is the Flagged group (listed first,
  closed by default), so nothing showed and focus went nowhere. It now
  prefers an open section, opens the section when there's none, and
  focuses the row in that section.
- Tests:
  - Provider tests, including which consumers a report re-renders.
  - The toggle bug (unit and e2e).
  - Export using the open sections (unit and e2e).
  - The table rendering once when a new PR arrives.
  - Jumping to an already-expanded row, and to a flagged PR (unit and e2e).

  Putting each bug back fails a test: the old toggle, removing the
  request counter, picking the first section, unscoped focus, and a
  single context.

### Phase 2 - Rows and cells

- Rewrite `PrTableApp`, `PrSection`, `PrTable` and `PrRow` as `.tsx`. Keep a
  real `<table>` for the rows (the e2e tests and screen readers rely on its
  row semantics) and restyle it to the new design. Section headers get
  their icon, title and count.
- Replace `src/ui/components/cells/*` with new `.tsx` cells:
  - `SignalsCell`
  - `TitleCell` (wraps; the PR number and label follow the title)
  - `AuthorCell` (an avatar with a tooltip)
  - `ReviewCell` (approvals, open conversations, viewed files, notes)
  - `ChecksCell` (CHK and MRG)
  - `ActionsCell` (In review and Flagged as icon toggles, Update, Ack, and a
    More menu holding Add label and View JSON)

  Their tests move with them.
- One notes icon replaces the five note squares; its tooltip lists the
  fields that have content.
- **New helper:** `getNeedsAttentionReasons(row, config)` in
  `pr-needs-attention.helpers.ts`. Today the helper only answers yes/no; the
  tooltip, the summary and the pane all need the reasons as text.

### Phase 3 - Inline summary

- `PrRowSummary.tsx` replaces the inline "More insights" content: why /
  latest activity / open conversations, at a fixed height. The row chevron
  toggles it, and multi-expand stays.
- The full insights content (`PrInsightsRow` and `insights/*`) stays
  reachable through a temporary "Details" control until phase 4 gives it a
  home in the pane.

### Phase 4 - Docked detail pane

- `PrDetailPane.tsx`:
  - Header: title, author, branch with copy button, GitHub link,
    previous/next and close.
  - Actions: Update, Ack, In review, Flag, Label, JSON.
  - The tabs, plus the empty state.
- **Selection:**
  - Clicking anywhere on a row that isn't a control selects it.
  - ↑/↓ move the selection while the table has focus.
  - Esc clears the selection.
  - Clicking the selected row again deselects it.
- **Pane visibility:** the show/hide setting is saved in localStorage, like
  the restored filters.
- **Narrow screens:** below 900px the pane becomes an overlay drawer, with
  a backdrop, focus trapping and Esc to close.
- **Overview tab:** the current key/value rows, grouped as Review / People /
  Changes, with Approval risk and Data freshness as collapsible groups.
  `PrInsightsRow`, `LinesChangedInsight`, `ApprovalRiskSection`,
  `InsightsHookSection` and `CopyIconButton` become `.tsx` here.
- Run `npm run stability:heap-check` after this phase, since selection
  changes remount the pane often.

### Phase 5 - Activity tab

- New pure helper `pr-activity-feed.helpers.ts` (tested). It applies the
  scope and type filters, groups by day, collapses commit runs and marks the
  viewer's last review.
- `ActivityEventsSection` and `ActivityTimelineSummary` are rewritten as
  `.tsx` on top of it.
- This covers these `ROADMAP.md` items:
  - removing thread open/resolve from the activity cards (now a filter that
    is off by default)
  - not truncating activity comments
  - styling the PR author's and the viewer's names
  - the activity height limits (the pane scrolls instead)

### Phase 6 - Conversations tab

- `ReviewThreadsSection` (606 lines) is rewritten as `.tsx`. The
  thread-resolution policy logic (`getThreadResolutionInfo`) moves into a
  tested helper.
- Threads are grouped by file using the comments' `path`/`line`. The script
  already fetches these, so no data change is needed.
- The filters are Unresolved / Waiting on me / All. They replace the current
  unresolved/all toggle, and Unresolved stays the default.
- Add "Next unresolved", and keep the wrong-resolver callout.

### Phase 7 - Notes tab

- `NotesSection` and `NotesStoriesField` are rewritten as `.tsx`: a read
  view, a per-field edit mode, and stories shown as their names with
  open-link icons. This covers the two Notes items in `ROADMAP.md`.
- Keep the `NotesDirty` and auto-render-blocking integration working.

### Phase 8 - Filter bar

- Move the visibility filters out of the Run & Filter tab into a collapsible
  filter bar above the table, as decided in `ROADMAP.md`.
- `TableFilterChips`, `FilterOptionSelect`, `MultiSelectCheckboxList`,
  `ScopeFilterSelect`, `PrNumberFilterInput` and their siblings become
  `.tsx` as they move.
- The Run Script options stay with the settings in phase 9.

### Phase 9 - App shell

Replace the static scaffolding in `index.html` (headings, tab lists and
around 60 portal mount points) with a React-owned `AppShell.tsx`. Panels then
render in place instead of through `createPortal`, and `react-app.jsx`
becomes a small `react-app.tsx`. Done in steps:

- **9a - Header and top navigation:** repo, Pull requests / Review stats /
  Authors (reusing `TabStateProvider`), the status pill, refresh, and the
  auto-update-paused banner.
- **9b - Settings drawer:** a left nav with Run & check, Attention rules,
  Merge commits, Change detection, Script options, Backfill, Action log,
  Actor names and Export. The management panels move in one at a time, each
  converted to `.tsx` as it moves.
- **9c - Activity popover:** the `ActivityDrawer` sections, opened from the
  header button.
- **9d - Clean-up:** delete the empty mount points and the CSS nothing uses
  any more.

### Phase 10 - Wrap-up

- Remove old components and CSS that are no longer referenced.
- Update the README's UI section, and mark `UI_MODERNIZATION_PROPOSAL.md` as
  superseded by this plan.
- List the components still in `.jsx` for Phase 12D. Expected: the Review
  statistics and Author Insights components, which this plan doesn't touch.

## Decisions (2026-10-24)

1. **"Since my last review" (phase 5)** is measured from the viewer's last
   activity on the PR or their last Ack, whichever is later. The chip is
   labelled "Since I last looked".
2. **"Waiting on me" (phase 6)** means an unresolved thread the viewer
   started or replied in, whose latest comment is by someone else or
   mentions the viewer.
3. **Switching PRs with unsaved notes (phases 4 and 7):** ask before
   switching. That covers changing the selection, ↑/↓, previous/next and
   closing the pane.
4. **CSS is split into separate stylesheets** under `src/ui/styles/`, each
   linked from `index.html` (component-imported CSS would only work under
   Vite). New styles go straight into these files. `index.css` is split up
   area by area as each phase rewrites that area, and is gone by phase 10.
5. **Collapsed sections show a summary** in their header, such as "2 need
   attention · 1 failing" (phase 2).

## Order and size

Phases 0-1 are small and remove most of the risk. Phases 2-4 are the core
of the new look. Phases 5-7 are independent of each other once phase 4 is
in. Phase 8 can happen any time after phase 2. Phase 9 is the largest; it
can start in parallel with phases 5-7 because it touches different files.
