# Roadmap and future plans

## Possible improvements

- [ ] Remove the "thread open" and "thread resolved" details from the 'Activity sequence' cards
- [ ] Determine what determines the 'MRG' values
- [ ] Add explanations for how things like some of the 'Review statistics' table column data is calculated
- [ ] Move the 'View Filters' section out of the tabs section
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
- [ ] Have the content of the 'More insights' section be with tabs; one for overview, one for 'Activity sequence', 'Review conversations', 'Notes', etc.
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
- [ ] Fix consistency on when filters are applied (ie. on select vs clicking "Apply filters (local)" button)
- [ ] Rename "Rally" fields to be more generic
- [ ] Reorganize Notes' Story and Link fields to be linked together
- [ ] Use pub-sub pattern or something instead of current rerender pattern with internal rescroll/reset issues
- [ ] Modules and functions within unit tests should not be mocked unless they really need to be
- [ ] Prefer updating/modifying/refactoring existing code rather than just adding extra code
- [ ] All comments in code match surrounding code
- [ ] Define options for what a merge commit looks like within the user-defaults.json (and configured within the 'Advanced visibility and attention rules' on the UI).
- [ ] Allow overriding the PR author and allowing multiple users to be considered the author. Maybe base this off of who adds commits (other than merges)?
- [ ] For possible long dropdown lists (ie. all authors), add a UI enhancement so that it has the search/filter functionality in the dropdown. Also consider "recently active" sorting (actors from recent PRs at the top)
- [ ] Deduplicate author name dropdown fields
- [ ] Add a small copy button beside the source branch name
- [ ] Update Notes' UI so that existing notes are shown as static fields with an edit button to transform them into editable fields
- [ ] Update Notes' Story and Link fields to have the read view of the story name have a small open link icon button beside it to open the link URL

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

- [ ] Add name for each table
- [ ] Associate PR number with the controls within each table row
- [ ] Add proper labels to the 'Comments' fields

### Modernization of code

Modernize this repository toward a maintainable, readable, modular architecture with safe incremental delivery and test-backed changes.

For progress and steps, see [`AI_MODERNIZATION_PLAN.md`](AI_MODERNIZATION_PLAN.md)

### UI Modernization

Improve UI and style it more similarly to GitKraken's LaunchPad.

For planned steps, see [`UI_MODERNIZATION_PROPOSAL.md`](UI_MODERNIZATION_PROPOSAL.md)

### Future Performance Opportunities

- [ ] Virtual scrolling for 200+ PR lists (10-50x faster initial render)
- [ ] Smart group count caching (5-10% faster renders)
- [ ] Filter result memoization (10-20% improvement when filters unchanged)

For detailed performance analysis, see [`PERFORMANCE_OPTIMIZATION_OPPORTUNITIES.md`](PERFORMANCE_OPTIMIZATION_OPPORTUNITIES.md).

### React Migration

For planned steps, see [`REACT_MIGRATION_PLAN.md`](REACT_MIGRATION_PLAN.md).
