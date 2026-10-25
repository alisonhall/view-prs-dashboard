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

Phase 2 is done in steps on branch `ui-redesign/phase-2`, each leaving the
app working:

- **2a - row display helpers.** Done (2026-10-24):
  - `getNeedsAttentionReasons` is now the one definition of "needs
    attention", and `shouldShowNeedsAttention` means "has a reason". A
    test keeps a copy of the old rules and checks both agree on every
    combination of section, status, pending comments and setting.
  - The reasons are only what the rules check: unsubmitted pending
    comments, a change since the last ack (one reason per change-reason
    token: unanswered threads, thread replies, comments, reviews,
    commits, ack cleared), or no recent activity (worded for the
    no-activity mode). Reasons in the design mockups such as "Author
    resolved a thread you started" are not attention rules.
  - New `pr-row-signals.helpers.ts`: what each signal slot shows (checks,
    mergeable, viewed files, notes, size, activity) as an icon, a tone
    and the tooltip text.
  - `PrData` gains `checkState`, `mergeState`, `additions`, `deletions`
    and `updatePending`. The old date cell's `pr.updatedAt` fallback is
    dropped: PR data has no such field (only the entry does).
- **2b - a `MenuButton` component** for the row's More actions (Add label,
  View JSON). Done (2026-10-24), following the WAI-ARIA menu-button
  pattern, portaled to `<body>` like the tooltip. A tooltip now has a
  `disabled` option: while a button's menu is open, its tooltip used to
  take the menu's Escape.
- **2c - the new cells, rows, table and section headers.** Done
  (2026-10-24):
  - `PrSection`, `PrTable` and `PrRow` are `.tsx`. The cells are Signals,
    Pull request, Who, Review, CHK·MRG, Size, Activity and Actions, plus
    the selection checkbox. They use `styles/pr-table.css` and new
    `Signal` and `Avatar` components. The row's More menu holds View PR
    JSON details and Add label.
  - Every value the old cells showed has a place:

    | Old cell / value | Now |
    | --- | --- |
    | Status (CHANGED / NO_CHANGE / NO_ACTIVITY / other) | Signals: a dot for changed (its tooltip lists what changed), a ring for no recent activity, nothing for no change, an info icon naming any other status (e.g. NO_LOCAL_DATA for a notes-only PR) |
    | Status: viewed files | Review: viewed-files icon with "3/4" (green once all are viewed) |
    | Status: last checked ("↻ 5m ago") | Activity: in the tooltip, with a dotted underline on the age when an open PR's check is stale |
    | Status: "Update queued" | Pull request: an "Update queued" note on the second line |
    | Attention / flagged icons | Signals: needs attention (reasons in the tooltip), flagged, in review |
    | PR number and busy / queued spinner | Pull request: the #number link after the title, and a busy icon while refreshing or queued |
    | Approved: YES/NO (count) | Review: approvals icon with the count, green once approved; approvers by name in the tooltip |
    | Approved: assigned users | Review: small avatars after the slots, the viewer ringed; the viewer also appears when a requested reviewer but not assigned |
    | Approved: open conversations | Review: conversations icon with the count ("with you" in the tooltip when that's what's counted) |
    | Title, copy button, lifecycle badge (smart groups), target branch, pending comments | Pull request: the title wraps; copy button on hover/focus; a PR-state icon in smart groups; non-main target branch, pending comments and "Update queued" on a second line |
    | Labels | Pull request: chips after the title |
    | Author and co-authors, notes marker | Who: the author's avatar and "+N" for others with non-merge commits (names in the tooltip); notes moved to Review |
    | CHK | CHK·MRG: checks icon; mergeability is new here (it was only in the insights) |
    | Date: last activity, your last activity | Activity: the age, with both times in the tooltip |
    | Date: the five note-field squares | Review: one notes icon listing the fields that have content |
    | Actions: In Review / Flagged checkboxes | Actions: toggle buttons (aria-pressed) with the same names |
    | Actions: Update, Ack | Actions: icon buttons |
    | Actions: JSON, "+ Label" select | Actions: the More menu (View PR JSON details, Add label) |
    | Insights toggle | Pull request: the row chevron (phase 3 turns it into the row summary) |

    An integration test caught NO_LOCAL_DATA going missing at first: the
    old Status column showed it as text.
  - Collapsed sections summarise attention, failing checks, conflicts and
    unread changes in their header.
  - Fixed two older bugs:
    - Section attention counts are judged by each PR's own lifecycle
      section, the same check as the row icon, so smart groups (Flagged,
      In Review) count their rows; they never did.
    - A smart-group row's last-checked staleness is judged the same way.
  - Review fixes:
    - **Keyboard:** each signal cell (Signals, Review, CHK·MRG) is one
      keyboard stop (`SignalGroup`: a named group whose focus tooltip and
      description list every value). The icons and avatars in it keep
      their own hover tooltips. A busy row went from about 20 Tab stops to
      15.
    - **Headers:** abbreviated column headers ("CHK·MRG", "Who"...) give
      screen readers the full name, with the abbreviation hidden from
      them and a hover tooltip.
    - **Change reasons:** the unread dot's tooltip lists what changed for
      every changed PR. They were only in the attention tooltip, which
      only exists when the section counts the change.
    - **Approvers:** listed by name only, without the insights text's
      "at" and approval time ("at -" when there is none).
    - **One shared tooltip:** `tooltip-controller.ts` is one bubble with
      document-level listeners, driven by `data-tip` attributes. A
      `Tooltip` is a lightweight wrapper with no state of its own, and a
      signal inside a group isn't a component instance at all.
    - **Row memoization:** `PrTableApp`'s handlers are stable and
      `actorsMap` is the same object between renders, so memoized rows
      can skip re-rendering.
    - **Ages keep moving:** a shared clock (`NowContext`, one timer for
      the table) ticks once a minute.
    - **Menu events:** the More menu keeps its clicks and keys from
      reaching the row (React bubbles portal events through it), ready
      for phase 4's clickable rows.
- **2d - `PrTableApp` to `.tsx`.** Done (2026-10-24), finishing phase 2:
  - Its handlers, state, refs and event listeners are typed;
    `PrDataPayload` gains the user state's `ackByRepo`, `flaggedByRepo`
    and `inReviewByRepo` maps, and `PrRow`'s `onDataRefresh` takes a
    payload.
  - Typing it found a bug: "Open PRs I'm Involved In" read comments' and
    reviews' `author.login`, which the data doesn't have (they carry
    `authorLogin`), so a PR you had only commented on or reviewed was
    missing from it. Fixed, with a test.
  - An action result with no payload now keeps the table as it is (the
    provider's rule for a missing payload); it used to blank the table
    back to "Loading". Tested.
  - The section-grouping helpers are created once with lazy `useState`
    instead of a ref. The unused `renderRows` read is gone, and so is the
    section configs' `lastCheckedAt`, which the payload never had (rows
    take their check time from their own `updatedAt`).
  - One `PrFlagsByRepo` type, in `types/pr-data.ts`; the smart-groups
    helper had its own looser copy. `index.html.test.js` no longer sets
    two `window` helper globals nothing reads.
- **2e - tests and old CSS.** Done (2026-10-24):
  - New `.tsx` tests replace each old cell's tests, carrying over every
    behaviour that still applies.
  - `index.html.test.js` and the e2e tests use the new names (In Review is
    a toggle button; JSON and labels are in the More menu; the busy
    indicator only exists while busy).
  - 118 rules for the old table are removed from `index.css`.

### Phase 3 - Inline summary

- `PrRowSummary.tsx` replaces the inline "More insights" content: why /
  latest activity / open conversations, at a fixed height. The row chevron
  toggles it, and multi-expand stays.
- The full insights content (`PrInsightsRow` and `insights/*`) stays
  reachable through a temporary "Details" control until phase 4 gives it a
  home in the pane.
- **Done (2026-10-25):**
  - The chevron is now "Show summary for PR #N" and opens a summary row
    (`PrRowSummary.tsx`) in the design's three columns:
    - "Why it's here": the attention reasons, then Flagged / In review
      (which put the row in those groups), or "Nothing needs your
      attention", over a status line ("Checks failing · Has conflicts · 1
      approval · 3 of 4 files viewed").
    - "Latest activity": the newest three events (who, what, a one-line
      snippet, and the age with the full time on hover).
    - "Open conversations": the two most recently active unresolved
      threads (file and line linking to the thread, with the latest
      comment), "+N more open", or "None open".
  - Events and threads are one line each, cut off with an ellipsis, so the
    summary keeps its height; a cut-off snippet shows in full on hover.
    Snippets are plain text: HTML tags and markdown syntax go, images read
    `[image]`, and only paired emphasis is unwrapped, so `user_id` and
    `2 * 3` stay as written.
  - The columns are labelled groups, not regions, so open rows don't add
    landmarks. Closing a summary closes its details too.
  - "Show details" in the summary opens the full insights row under it.
    Which rows have their details open lives in `PrTableUiStateProvider`
    (`detailRows`) next to the expanded rows, so "View in table" and the
    "Auto update paused" chips open both, and focusing an unsaved Notes
    save button still works.
  - The activity feed (`buildActivityEvents`) moved from
    `ActivityEventsSection` into `pr-activity-events.helpers.ts`, now
    tested, and the summary and the section share it (phase 5 builds on
    it). The status line and the thread picks are
    `pr-row-summary.helpers.ts`.
  - `ReviewThread` and its comments gain the schema's `latestCommentAt`,
    `resolvedByLogin`, `isOutdated`, `path`, `line` and `originalLine`.
  - Tests: the helpers, `PrRowSummary`, the rows' summary and details
    state through the Provider, `PrTable`, `PrRow` and `PrTableApp`
    (including navigation opening the details); `index.html.test.js`
    opens insights through an `openRowInsights` helper, and the e2e spec
    through `openFirstRowDetails`.

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
- **Done (2026-10-25)** on branch `ui-redesign/phase-4`:
  - `components/pane/PrDetailPane.tsx`, docked in a new workspace layout
    beside the sections (`styles/pane.css`), named "PR #N: title". Header,
    actions (named without the PR number, since the pane is about one PR),
    tabs with counts (every activity event; open conversations, "with you"
    when that's what's counted) and an unsaved-notes marker, and the empty
    state. Its content is keyed by the PR, so each PR gets fresh Notes and
    Conversations state, as each row's insights did - kept across a switch,
    one PR's unsaved notes would show, and save, under the next.
  - Custom insights is a tab only when the hook returns HTML for the PR
    (`components/insights/InsightsHook.tsx`, which replaced
    `InsightsHookSection`). The server runs the script for every request,
    so the pane asks only after its selection has been still for 300ms,
    and remembers each PR's answer per data version (not failures).
  - State in `PrTableUiStateProvider`: the selection (selecting the same PR
    keeps the same object), pane visibility (localStorage, per browser:
    the "restored filters" are saved on the server, but showing a side pane
    depends on the screen), and the tab (in memory). The temporary details
    row and its `detailRows` state are gone; the summary's "Show details"
    now opens the PR in the pane, showing the pane if it was hidden.
  - Selection: row click (anywhere but a control - the Signals and Review
    cells' focusable groups count as the row - or after a text selection),
    click again to deselect, ↑/↓ in a table (`PrTable`, focus follows to
    the row's link), Esc in the table or the docked pane. Rows are marked
    `aria-current`. Previous/next step through the open sections' PRs in
    display order.
  - Unsaved notes (decision 3): selecting another PR, ↑/↓, previous/next,
    closing and hiding the pane ask first (`window.confirm`).
  - Below 900px (`useMediaQuery`) the pane is a modal drawer
    (`useFocusTrap`: focus moves to the dialog itself, so no button tooltip
    takes the first Esc; Tab is kept inside; Esc and the backdrop close
    it; focus goes back to what opened it). Closing the docked pane moves
    focus to the PR's row, in a section that's open.
  - Size and Activity hide while the pane is docked; the `Detail pane`
    button above the table shows or hides it (the header arrives in
    phase 9).
  - "View in table" and the "Auto update paused" chips select the PR
    (opening a section it's in if needed) and focus its row, or with a
    chip the Notes tab's Save button.
  - Overview tab: `pane/PrOverview.tsx` replaces `PrInsightsRow` (deleted)
    with Review / People / Changes groups, then Approval risk details and
    Data freshness collapsed. The activity timeline moved to the Activity
    tab; the branch copy button is in the header only. The
    STATUS/CHK/MRG badges went with `PrInsightsRow` (their values are the
    Review group's first rows), and so did their helper and CSS.
  - Converted to `.tsx`: `CopyIconButton`, `LinesChangedInsight`,
    `ApprovalRiskSection`, `InsightSection` (with `defaultOpen`, so a
    tab's section starts open) and the insights hook. `PrMetricsApproval`
    and `PrData` gain the schema fields they read.
  - Heap check (200 cycles, now also swapping the selected PR and tab each
    cycle; its In review step looked for a checkbox that has been a
    button since phase 2, and now uses the button): 1.18x, under the 1.5x
    limit.
  - The integration harness now mounts the same Providers as
    `PrTablePortal` (`PrInsightsDisplayProvider`,
    `ReviewConversationsUiStateProvider`); the Conversations tab's
    remount showed it was missing them.

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
