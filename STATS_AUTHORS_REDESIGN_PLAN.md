# Review stats and Authors redesign plan

`UI_REDESIGN_PLAN.md` left these two views out ("their redesign is separate
work"): they only moved under the header's tabs. Their components are
TypeScript already (`AI_MODERNIZATION_PLAN.md` 12D-1 and 12D-2), and they
follow the light and dark themes, so this is design work, not conversion.

Looked at on 2026-11-06, in light and dark, at 1280px and 600px wide, with
the e2e data (three PRs, no reviewer activity, so the stats table is empty).

## What's wrong now

### Both views

- **A box inside a box.** The view's panel (`.data-tab-panel`) holds a
  second bordered, shaded box (`.stats-panel`, `.author-insights-panel`).
  The Pull requests view has one.
- **No heading.** Nothing names the view or says what it's for; the
  header's tab is the only clue.
- **Controls aren't the app's.** Plain `<select>`, `<input>` and
  `<button>` elements with their own CSS, not `Button` or the field style
  the filter bar and Settings use.

### Review stats

- **The default date range can hide everything, silently.** Start date
  defaults to three months ago; with older data the cards and table show 0
  and nothing says why or suggests clearing it.
- **The table breaks at narrow widths.** Twelve columns squeeze until the
  headings break mid-word ("Revi / ewe / r") at 600px. No horizontal
  scroll, and the reviewer column doesn't stay put.
- **Unexplained numbers.** "Filtered rows - Current local filter scope",
  "Useful comment signals", "Comments → author commit", "Risky approvals"
  say nothing about how they're worked out (`ROADMAP.md`: "Add
  explanations for how ... the 'Review statistics' table column data is
  calculated").
- **Vague controls.** "Filter: All reviewers", "Top reviewers: 12" (it's
  how many reviewers the table lists) and "Min comments" need a word each.
- **An empty table is just headings,** with "Showing 0 of 0 reviewers"
  under it in small text.
- **Reviewers are bare logins,** where the PR table shows an avatar and a
  display name (`ActorIdentity`).

### Authors

- **The author picker is a plain `<select>`:** no search, in a list of
  every author (`ROADMAP.md`: search in long dropdowns, recently active
  first).
- **The header is one line of small text** ("Showing insights for
  app/dependabot"): no avatar, display name or counts.
- **Uneven text.** The empty states are 16px, the rest 12-13px; section
  headings are small bold text, not the app's heading style.
- **The comment box** has a monospace placeholder, a small sentiment
  select and a "Save comment" button styled unlike any other.
- **A PR's line is the old text style:** "Status: CLOSED", "Approved: NO
  (0)", "CHK: ✅ PASS", "0/1 viewed", where the table uses signal icons with
  tooltips. "View in table" is a one-off button style.

## Target

- One panel per view, with a heading and a one-line description.
- Controls in a toolbar using `Button`, the shared field style and, for
  lists, `MultiSelectDropdown` (single-pick for the author).
- Text sizes, headings, empty states and cards from `tokens.css` and
  `ui.css`, as the rest of the app.
- Reviewers and authors shown with `ActorIdentity`.
- Every number explained on hover and focus (`Tooltip`), and the
  explanations listed in the README.

## Phases

Each phase ships on its own, with unit tests, an e2e check where a browser
matters (layout, focus), and before/after screenshots in light and dark.

1. **Shell (both views).** Drop the inner box; add the heading and
   description; move the controls into a toolbar with `Button` and the
   shared field style.
2. **Review stats: say why it's empty.** When the date range leaves
   nothing, say so in the table ("No reviewer activity since Aug 6") with
   a `Clear dates` button; put the empty state inside the table.
3. **Review stats: the table.** Scroll sideways at narrow widths with the
   reviewer column fixed; reviewers with `ActorIdentity`; clearer control
   labels ("Sort by", "Show", "List the top N reviewers"). A `Columns`
   menu shows or hides columns, the least used (Thread comments, Resolved
   thread comments, Sources) hidden to start; the choice is saved in
   `user-defaults.json`, as the table's sections are.
4. **Review stats: explanations.** A tooltip on each card and column
   heading saying how it's counted, from the helpers' own definitions;
   the same text in the README. Ticks off the `ROADMAP.md` item.
5. **Authors: the picker and header.** A searchable picker, recently
   active authors first (partly the `ROADMAP.md` dropdown item); a header
   with avatar, display name, and counts (PRs open / merged, comments
   saved).
6. **Authors: comments and PRs.** The comment box with the app's fields
   and buttons; each PR as a compact row with the table's signal icons
   (status, approvals, checks, conversations, viewed files) and `View in
   table` as a link button.

## Decided

- **Phase 3 (2026-11-06):** a `Columns` menu, saved in
  `user-defaults.json`.

## To decide

- **Phase 6:** reuse the PR table's row (with its column headings) for an
  author's PRs, or a lighter list with the same icons? The row brings
  everything (selection, the detail pane) but is wide for this view.
- **Out of scope unless wanted:** `ROADMAP.md`'s author filter for Review
  stats; it fits phase 3 if so.
