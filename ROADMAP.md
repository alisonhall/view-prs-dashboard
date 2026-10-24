# Roadmap and future plans

## Possible improvements

- [ ] Remove the "thread open" and "thread resolved" details from the 'Activity sequence' cards
- [x] ~~Determine what determines the 'MRG' values~~ - answered (2026-10-22): MRG is GitHub's `mergeable` field, not anything to do with merge commits. YES = no conflicts, NO = conflicts, UNK = GitHub hasn't computed it yet. Still to do: add a tooltip explaining this on the badge.
- [ ] Add explanations for how things like some of the 'Review statistics' table column data is calculated
- [ ] Move the 'View Filters' section out of the tabs section - decided (2026-10-22): a collapsible filter bar directly above the PR table; the applied-filter chips stay visible when it's collapsed. Run Script options stay in the Script tab.
- [x] Change the 'Filter by label name(s)' and 'Exclude by label name(s)' fields to be multiselect dropdowns with all the possible GitHub labels as options
- [ ] Add more details and explanations for the various fields and data
- [x] Move the 'In Review' checkbox into the 'Actions' column cell
- [x] Show total number of comments/reviews within the PR row's top-level view
- [x] Show number of viewed files within the PR row's top-level view
- [x] Store and show data around the number of files changed, as well as the number of lines added and deleted within each PR
- ~~For each comment within the 'Review conversations' section, add thumbs up and thumbs down emoji toggle buttons and store that info within the data json. These buttons are to help indicate whether a comment is useful or not. This data should be used to help populate data within the 'Review statistics' section~~
- [ ] Add a filter by author multiselect dropdown to the 'Review statistics' section
- [x] Only enable the 'Save notes' button if there are changes that haven't yet been saved
- [x] Update the 'Status' and 'Scheduler Status' sections to make it more clear when a script is running
- [ ] Extend the 'Your last activity' column data so that it shows the relative difference too
- [ ] Add additional expandable sections under each PR to contain things like the user's PR description, an AI description of the PR changes, a large textarea where I can paste in AI review of the PR quality, etc.
- [ ] Have the content of the 'More insights' section be with tabs; one for overview, one for 'Activity sequence', 'Review conversations', 'Notes', etc. - decided (2026-10-22): tabs Overview (the label/value rows plus Approval risk) | Activity | Conversations | Notes, plus a hook-output tab only when an insights hook is configured. Labels carry counts (e.g. "Conversations (3 open)") and Notes shows an unsaved-changes marker. The last tab picked applies to every PR opened afterwards, but only in memory: a page refresh goes back to the first tab, and it is never saved to the user-state file.
- [ ] Don't truncate comments/details under the 'Activity sequence' cards
- [x] Add a toggle within the 'Review conversations' section for viewing all vs only unresolved conversations. The default value should be viewing only the unresolved conversations.
- [x] Call out places where the wrong person resolved a conversation
- [x] Exclude weekends from Activity Timeline empty dates
- [x] Save changes to the applied filters and run settings within local storage, and then restore from local storage
- [x] Allow configuration of what is considered for 'Needs attention'
- [x] Add button to view raw JSON data
- [x] Have a Git Diff only row view when there is a git diff file available for a PR but not info in the data json
- [x] Save selected export checkboxes in the local user state json
- ~~Validate Rally story/defect ID matches what is within the PR title~~
- [x] ~~Fix consistency on when filters are applied~~ - all filters (scope, PR-number, the 5 row-filtering multi-selects, alwaysShowInReview, the 6 "Any" filters) now apply live/instantly on change, no "Apply filters (local)" click needed for the table itself (see REACT_MIGRATION_PLAN.md, "Live filtering", 2026-10-10). The "Applied filters" chip/summary text now also updates live (same date, follow-up slice) - fully consistent, nothing left lagging.
- [x] ~~Rename "Rally" fields to be more generic~~ - done (2026-10-24): "Story"/"Stories"
- [x] ~~Reorganize Notes' Story and Link fields to be linked together~~ - done (2026-10-24), as decided (2026-10-22): one "Stories" list, each row a name plus an optional URL, stored as `stories: [{ name, url }]` in place of `rallyStories`/`rallyLinks` (done together with the rename; old keys still read if present, paired by position). The two with/without filters become one filter with four options: "Without any story details", "With only story name", "With only story URL", "With story and URL" - a PR matches the last three when at least one of its stories does. The editor is plain name/URL inputs for now; its look is part of the UI rework.
- [x] ~~Use pub-sub pattern or something instead of current rerender pattern with internal rescroll/reset issues~~ - superseded by the React migration (docs/history/REACT_MIGRATION_PLAN.md): React state/Context now drives re-renders, so the old full re-render and its scroll/reset problems are gone.
- [ ] Modules and functions within unit tests should not be mocked unless they really need to be
- [ ] Prefer updating/modifying/refactoring existing code rather than just adding extra code
- [ ] All comments in code match surrounding code
- [x] ~~Define options for what a merge commit looks like within the user-defaults.json (and configured within the 'Advanced visibility and attention rules' on the UI)~~ - done (2026-10-24), as decided (2026-10-22): a `mergeCommitRules` setting with headline patterns (default `^Merge\b`) and logins (e.g. bots) whose commits always count as merges, edited one pattern per line. The two duplicated `isMergeCommitHeadline` copies (pr-author-cell, pr-needs-attention helpers) share one function. Also decided (2026-10-24): it is the single definition - it replaced the script's "Use built-in merge commit filter" checkbox, so check-open-pr-updates.sh, the attention rule and the Author column all use it; a commit counts when every author is in the logins list.
- ~~Allow overriding the PR author and allowing multiple users to be considered the author. Maybe base this off of who adds commits (other than merges)?~~ - decided not to do (2026-10-22): the Author cell already lists everyone with non-merge commits, which covers the need; filters, insights and stats keep using GitHub's PR author.
- [ ] For possible long dropdown lists (ie. all authors), add a UI enhancement so that it has the search/filter functionality in the dropdown. Also consider "recently active" sorting (actors from recent PRs at the top)
- [ ] Deduplicate author name dropdown fields
- [x] ~~Add a small copy button beside the source branch name~~ - already done: the "Source branch" row in More insights has a copy button
- [ ] Update Notes' UI so that existing notes are shown as static fields with an edit button to transform them into editable fields
- [ ] Update Notes' Story and Link fields to have the read view of the story name have a small open link icon button beside it to open the link URL (part of the Stories change above)
- [x] ~~Make the per-row busy indicator reference-counted~~ - fixed (2026-10-10): `PrActivityQueueProvider.tsx`'s `markPrBusy`/`clearPrBusy` now track a `useRef`-held `Map<key, count>` alongside the existing `busyPrNumbers` Set - a key only leaves the Set once its count returns to 0, so two concurrent "busy" claims on the same PR (e.g. "Quick check all" and an unrelated Ack click) both have to clear before the spinner does. `busyPrNumbers`' own external shape (a Set of keys) is unchanged, so no consumer needed updating. New regression tests in `PrActivityQueueProvider.test.jsx` (confirmed one fails without the fix).
- [x] ~~Give `FilterOptionsProvider.tsx` a per-entry derived-value cache~~ - fixed (2026-10-10): a `useRef`-held `createEntryDerivedCache()` (`pr-entry-derived-cache.helpers.ts`, the same module `useVisiblePrNumbers.tsx` already uses) now wraps `extractRowLabelNames`/`getPreferredActorKey`/`collectAssignedUsers`/`collectApproversFromRow`'s per-entry output, keyed by entry object reference - an unchanged entry across a poll tick reuses its cached result instead of re-deriving it. See `REACT_MIGRATION_PLAN.md` for the full writeup, including the one accepted tradeoff (no invalidation on an actor-login-alias-map change alone, matching `pr-row-filtering.helpers.ts`'s own identical-shape cache).
- [x] ~~Fix the In Review/Flagged checkbox's on-failure revert~~ - re-investigated (2026-10-10) and found stale, not an actual bug: the `mockCheckbox`-mutation path described below is indeed dead code, but `handleCheckboxChange`'s failure branch still calls `setStatusTextOnly` (inside `toggleInReviewForRow`/`toggleFlaggedForRow`), which pushes to `AppRoot`'s own local `useState` and forces a re-render of `PrTableApp` (rendered as its non-memoized child) on every attempt, success or failure - so the controlled checkbox already re-derives from the unchanged `payload` and snaps back immediately, with no extra wiring needed. Confirmed empirically: implemented a re-push fix (re-adding a `getLatestStoredPayload` getter for the failure path only), wrote a Playwright regression test for it, then disabled the fix and reran the test - it still passed against the original, unmodified code, proving the existing status-text cascade already covers this. Fix reverted as redundant; the Playwright test (`e2e/smoke.spec.js`, "a failed In Review toggle reverts the checkbox...") is kept as a real behavioral regression test. Original finding (Phase 7 sub-phase 7.3 follow-up review, 2026-10-03): `react-callbacks.helpers.js`'s `handleCheckboxChange` passes a throwaway `mockCheckbox = { checked }` object (not the real DOM node) into `toggleInReviewForRow`/`toggleFlaggedForRow`, so their `checkbox.checked = !nextValue` revert-on-failure never reaches the actual checkbox - true, but harmless given the above.
- [ ] Per-computer, track what code and branches have been pulled onto the local computer (per PR). I would then be able to tell if my local is behind/ahead. It would be great if it could tell if I'm using worktrees, and possibly have a button to do a `git pull` on that branch/worktree. Another button to open that branch/worktree in VS Code would also be useful.
- [ ] Look into extracting the contents in the data folder into a separate location so that it can be backed up and tracked. Then look into if it would be possible to deploy the core part of the app online while keeping the data files local.

### Styling

- [ ] Add different styling for when my name appears
- [ ] Add styling for when the PR author's name appears in the 'Activity timeline' or 'Activity sequence' or 'Review conversations'
- [x] Add markdown styling to content of comments and threads
- [x] Add right padding for the 'In Review' column and 'CHK' column content to prevent it touching the border
- [x] Update styling for target branch details within the 'Title' column cells
- [x] Add styling for status and sentiment within the 'Author Insights' cards
- [ ] Change the 'More insights' content to be in multiple columns for ease of reading
- [x] Have the PR comments' 'Note...' textarea vertically expand to include all of the text content
- [x] Align the PR comments' 'Note...' textarea properly with the other fields
- [ ] Style the code examples differently from text
- [ ] Remove all the unneeded extra padding around markdown paragraphs/bulleted lists/etc
- [ ] Set max-height on 'Activity timeline' and add scroll when it overflows
- [ ] Set max-height on 'Activity sequence' and 'Review conversations' sections and add scroll when it overflows
- [ ] Add sticky table row

### Accessibility fixes

- [x] ~~Add name for each table~~ - done (2026-10-22): each PR table is named by its section title (`aria-label`, e.g. "Open PRs")
- [x] ~~Associate PR number with the controls within each table row~~ - done (2026-10-22): "More insights for PR #N", "Select PR #N", "Update PR #N", "Ack PR #N" join the existing In Review/Flagged/View JSON/Add label names
- [x] ~~Add proper labels to the 'Comments' fields~~ - done (2026-10-22): the Notes section is a group named "Notes for PR #N", and each comment row's author/tone/note/remove controls are named ("Comment 1 author", etc.)

### Modernization of code

Modernize this repository toward a maintainable, readable, modular architecture with safe incremental delivery and test-backed changes.

For progress and steps, see [`AI_MODERNIZATION_PLAN.md`](AI_MODERNIZATION_PLAN.md)

### UI Modernization

Improve UI and style it more similarly to GitKraken's LaunchPad.

For planned steps, see [`UI_MODERNIZATION_PROPOSAL.md`](UI_MODERNIZATION_PROPOSAL.md)

### Future Performance Opportunities

- [ ] Virtual scrolling for 200+ PR lists (10-50x faster initial render)
- [x] ~~Smart group count caching~~ - superseded by the React migration's own Phase 5 ("Performance Tuning"), see `PERFORMANCE_OPTIMIZATION_OPPORTUNITIES.md` #7
- [x] ~~Filter result memoization~~ - superseded by the React migration's own Phase 5, see `PERFORMANCE_OPTIMIZATION_OPPORTUNITIES.md` #8

For detailed performance analysis, see [`PERFORMANCE_OPTIMIZATION_OPPORTUNITIES.md`](PERFORMANCE_OPTIMIZATION_OPPORTUNITIES.md).

### React Migration

The React migration is complete; its history is in [`docs/history/REACT_MIGRATION_PLAN.md`](docs/history/REACT_MIGRATION_PLAN.md).
