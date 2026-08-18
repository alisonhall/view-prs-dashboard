# view-prs

## Overview

Utilities for checking open and recently merged pull requests in a GitHub repository.

## Project Layout

Canonical runtime and scripts now live under `src/`:

- Server runtime: `src/server/`
  - Routes: `src/server/routes/`
  - Shared helpers: `src/server/helpers/`
  - State storage internals: `src/server/storage/`
  - Tests: `src/server/tests/`
- UI assets and page controller: `src/ui/`
  - UI helpers: `src/ui/helpers/`
- UI tests: `src/ui/tests/`
- CLI/update scripts: `src/script/`
  - Script tests: `src/script/tests/`
- Backfill tools: `src/backfill/`
- Schema and validation: `src/schema/`

Compatibility note: migration shims were removed in Phase 3. Use canonical `src/` paths and npm scripts only.

## Architecture Snapshot

- Planning and phased modernization checklist: `AI_MODERNIZATION_PLAN.md`
- Current baseline inventory and hotspot evidence: `PHASE0_BASELINE.md`

High-level layering intent:

- UI composition/wiring: `src/ui/index.page.js`
- UI components: `src/ui/components/`
- UI pure helpers: `src/ui/helpers/`
- Server routes/orchestration: `src/server/app.js` and `src/server/routes/`
- Server reusable logic: `src/server/helpers/`
- Server state/file I/O boundaries: `src/server/storage/`

## Architecture Guardrails

Target module layout by layer:

- UI composition/orchestration: `src/ui/index.page.js`
- UI components (render/event wiring): `src/ui/components/`
- UI pure helpers (formatters/transformers): `src/ui/helpers/`
- UI test fixtures/factories: `src/ui/test-fixtures/`
- Server route wiring/orchestration: `src/server/app.js`, `src/server/routes/`
- Server reusable business logic: `src/server/helpers/` (and future `src/server/services/`)
- Server state and file access: `src/server/storage/`

Dependency direction rules:

- UI layer (`src/ui/**`) must not import server runtime code (`src/server/**`) or script/backfill/dependency internals.
- Server runtime (`src/server/**`) must not import UI runtime code (`src/ui/**`).
- Server storage (`src/server/storage/**`) should not import route modules (`src/server/routes/**`).
- Shared domain/helper logic should flow inward to helpers/services, not upward to route or page orchestration files.

These boundaries are enforced by ESLint restricted import rules in `eslint.config.mjs`.

Contribution guidance:

- New UI behavior should default to component + helper extraction, not direct growth of `src/ui/index.page.js`.
- New server behavior should keep routes thin and place reusable logic in helper/service modules.
- New unit tests should be co-located with source files (`src/ui/components/*.test.js`, `src/ui/helpers/*.test.js`).
- Integration/wiring tests should remain in `src/ui/tests/` and server integration test folders.
- Reusable test data builders should be added under `src/ui/test-fixtures/` and validated with fixture contract tests.

## Test Ownership

`view-prs` tests are colocated inside this folder and cover `view-prs`-owned behavior only (for example scheduler/cooldown and `view-prs` routes).

Run from this folder:

```bash
npm run test:app
npm run test:ui
npm run test:script
npm run test:schema
npm run test:deps
npm run test:backfill
npm run test:all
npm run test:coverage
npm run check:all
```

Script guide:

- `npm run test:app`: server route/integration/scheduler suites (`src/server/tests/`)
- `npm run test:ui`: UI suites (`src/ui/**/*.test.js`)
- `npm run test:script`: shell script Jest harness (`src/script/tests/*.test.js`)
- `npm run test:schema`: schema-focused Jest suites (`src/schema/tests/`)
- `npm run test:deps`: dependency guard/unit suites (`src/dependencies/tests/`)
- `npm run test:backfill`: backfill-focused suites (`src/backfill/tests/`)
- `npm run test:all`: guard + full Jest run (no coverage output)
- `npm run test:coverage` / `npm run test:ci`: guard + full Jest run with coverage output (`coverage/lcov-report`)
- `npm run check:all`: dependency check + lint + persisted-schema validation + `test:coverage` (updates `coverage/lcov-report` automatically)

UI test placement conventions:

- Unit tests for UI components and UI helpers should be co-located next to the source file:
  - `src/ui/components/*.test.js`
  - `src/ui/helpers/*.test.js`
- Shared fixture/factory modules should live under `src/ui/test-fixtures/` and expose reusable builders.
- Integration/wiring tests should remain centralized under `src/ui/tests/`:
  - `index.html.test.js`
  - `index.page.notifications.test.js`
  - `index.page.trends.test.js`
- `npm run test:ui` discovers all UI tests via `src/ui/**/*.test.js`.

Recommended default before opening a PR: `npm run check:all`.

Test decision flow:

- Fast local iteration: run the smallest relevant `npm run test:*` subset.
- Before PR/merge: run `npm run check:all`.

Run from repository root:

```bash
npm run test:view-prs
```

## Key Files

- Script: `src/script/check-open-pr-updates.sh`
- Local launcher (recommended): `./run-prs`
- CLI script mode: `npm run cli-view -- <args>`
- Standalone server: `npm run start`
- Interactive page: `src/ui/index.html`
- Actor login aliases: `data/actor-login-aliases.json`
- JSON Schema: `src/schema/check-open-pr-updates.data.schema.json`
- Author comments schema: `src/schema/check-open-pr-updates.author-comments.schema.json`
- Persisted data schema: `src/schema/DATA_SCHEMA.md`

> Note: use `./run-prs --help` or `npm run cli-view -- --help` for script options.

## Requirements

- `gh` (GitHub CLI), authenticated (`gh auth login`)
- `jq`
- Bash shell

Optional for date formatting fallback:

- `gdate` / GNU `date -d` / macOS `date -j`

## Performance Toggle

Set `VIEW_PRS_SKIP_UNCHANGED=1` to enable updated-at based row reuse for unchanged open/draft PRs.

- Unchanged PR rows are reused from local state when source `updatedAt` matches.
- Cache reuse is viewer-specific (`viewerLogin` must match), preventing cross-user stale rows.
- Fresh CI/check and mergeability data is still prefetched each run and merged into cached rows.
- Fresh viewed-files progress (`viewed/changed`) is also refreshed for open/draft PRs and merged into cached rows.
- Closed and merged rows reuse the same skip shortcut, but only when the full prefetched source fingerprint still matches, so the table stays fresh without forcing a full recompute.
- Prefetch and row recompute now prioritize open/draft PRs first; closed/merged prefetch runs in a deferred phase so active review rows update earlier in long runs.
- This keeps `CHK`/`MRG` values current while reducing full recomputation and API volume.

The UI also polls scheduler state independently of `dataVersion`, so the Auto Refresh panel updates even when the underlying PR data file has not changed.

Example:

```bash
cd view-prs
VIEW_PRS_SKIP_UNCHANGED=1 ./run-prs --open none
```

## Usage

### Recommended (local launcher)

```bash
cd view-prs
./run-prs --help
./run-prs --open none
./run-prs --repo owner/name --limit 100 --jobs 10
```

### Via npm

```bash
cd view-prs
npm run cli-view -- --help
npm run cli-view -- --open changed
npm run cli-view -- --ack 912,921
npm run start
npm run backfill:missing:dry -- --max-prs 20
npm run backfill:missing -- --max-prs 50 --delay-ms 3000
npm run backfill:missing:bg
```

From repository root, `npm test` also runs JSON Schema validation for latest-run `view-prs` persisted rows before route/scheduler tests.

### Backfill missing/old rows

Use `backfill-missing-data.js` to find PR rows with schema-missing data and optionally refresh them one-by-one with `--pr` runs.

- Low-resource defaults: one PR at a time (`--jobs 1`) and throttled delay between refreshes.
- Safe with active localhost usage: writes are serialized via the same state-file lock used by `src/script/check-open-pr-updates.sh`.
- Candidate processing is prioritized by section for faster visible wins: `open` -> `draft` -> `closed` -> `merged`.
- Backfill refreshes can run with a bounded worker pool (`--concurrency`) while keeping each PR update independent.

Common commands:

```bash
cd view-prs

# Inspect candidates only
npm run backfill:missing:dry -- --max-prs 30

# Refresh candidates in foreground (throttled)
npm run backfill:missing -- --max-prs 50 --delay-ms 3000

# Include age-based refresh (example: older than 30 days)
npm run backfill:missing -- --max-age-days 30 --max-prs 100 --delay-ms 3000

# Run in background with log output
npm run backfill:missing:bg
npm run backfill:missing:bg:status
tail -f data/backfill-missing.log
npm run backfill:missing:bg:stop

# Run with a larger worker pool for faster throughput
npm run backfill:missing -- --max-prs 50 --delay-ms 1000 --concurrency 4
```

Optional background tuning via env vars:

- `BACKFILL_MAX_PRS` (default `100`)
- `BACKFILL_DELAY_MS` (default `3000`)
- `BACKFILL_JOBS` (default `1`)
- `BACKFILL_CONCURRENCY` (default `2`)
- `BACKFILL_EXTRA_ARGS` (for example `--repo owner/name --max-age-days 30`)

### Interactive web UI

From the repository root, start the local server:

```bash
npm install
npm start
```

Then open:

- `http://localhost:9000/view-prs/index.html`
- `http://localhost:9000/health/deps` (dependency health)

When localhost is running, the server starts an automatic 15-minute background refresh for `view-prs` data.

- Auto refresh runs every 15 minutes.
- It skips if a manual `Run script` action completed in the previous 15 minutes.
- On successful auto refresh, `check-open-pr-updates.data.json` is updated and the UI detects the new run and rerenders automatically.
- While a run is in progress, PR rows currently being refreshed show a small spinner below the PR number link and above the relative "updated ... ago" text without forcing a full table rerender.
- During long runs, open/draft PR indicators and data refreshes are intentionally prioritized ahead of closed/merged work so the most actionable rows settle first.
- When auto refresh includes multiple repos, refreshes run with bounded repo concurrency (default `2`), configurable via `VIEW_PRS_AUTO_REPO_CONCURRENCY`.

Use the form to run `src/script/check-open-pr-updates.sh` with common update modifiers (`--repo`, `--pr`, `--label`, `--exclude-label`, `--author`, `--limit`, `--merged-limit`, `--jobs`, `--open`, ack/in-review options, and reason/quiet toggles), and view results directly in the page.

UI filter behavior:

- `Filter by PR number(s)`, label/author filters, and `View scope` affect only what is shown in local views.
- `View scope` includes `All stored rows`, `Last run rows`, `Needs attention rows`, and `Needs attention or interacted rows`.
- `Filter by label name(s)` and `Exclude by label name(s)` are checkbox dropdowns populated from labels found on currently loaded stored PR rows for the active repo view.
- The `Filter by PR author(s)` dropdown displays resolved real names (from `actorsMap`) instead of raw GitHub logins.
- `data/actor-login-aliases.json` can map a current or replacement login to a canonical login when the same person appears under multiple GitHub identities. Example: `{"7c7240971101674017d4597caddf24_uhg": "mthom486_uhg"}`.
- When an actor login alias exists, author filters, assigned-user filters, approver filters, author insights, reviewer statistics, and manual author comments treat the aliased login and canonical login as the same person.
- The `Filter by Assigned user(s)` dropdown filters rows to PRs assigned to any selected user.
- The `Filter by PR approver(s)` dropdown filters rows to PRs that have at least one approval from any selected user. Options are populated from `metrics.approvals` data on stored PR rows.
- Multi-select filter dropdowns are collapsible: expand by clicking the label to see checkbox options, collapse by clicking the label again or clicking outside the dropdown. When selections are active, the dropdown summary shows "(N selected)" to indicate how many options are chosen.
- Retrieved/stored JSON data remains complete so filters can be adjusted later without refetching.
- `Run script` is the primary update operation for refreshing PR data.
- `Filter by PR number(s)` in View Filters affects only what is shown in local views, not what is refreshed or stored.
- When `Filter by PR number(s)` is set, it matches against all stored rows and ignores the selected `View scope` value and `Exclude by label name(s)` values.
- Changing filter fields updates the HTML tables and local terminal preview from existing JSON without making new GitHub CLI requests.

Custom Metadata Filters:

The `Visibility Filters` panel includes filters for custom metadata fields (manual notes data):

- **Custom comments**: Filter by presence/absence of custom review comments
  - `Any (with or without)`: Show all PRs regardless of custom comments
  - `With custom comments`: Show only PRs that have at least one custom comment
  - `Without custom comments`: Show only PRs with no custom comments
- **Other notes**: Filter by presence/absence of "Other notes" text field
  - `Any (with or without)`: Show all PRs regardless of other notes
  - `With other notes`: Show only PRs that have other notes text entered
  - `Without other notes`: Show only PRs with no other notes text
- **PR difficulty**: Filter by difficulty rating (1-5 scale) or unset
  - `Any (set or not set)`: Show all PRs regardless of difficulty setting
  - `1` through `5`: Show only PRs with that specific difficulty rating
  - `Not set`: Show only PRs where difficulty has not been assigned
- **Rally stories**: Filter by presence/absence of Rally story references
  - `Any (with or without)`: Show all PRs regardless of Rally stories
  - `With Rally stories`: Show only PRs that have Rally story references entered
  - `Without Rally stories`: Show only PRs with no Rally story references
- **Rally links**: Filter by presence/absence of Rally links
  - `Any (with or without)`: Show all PRs regardless of Rally links
  - `With Rally links`: Show only PRs that have Rally links entered
  - `Without Rally links`: Show only PRs with no Rally links
- **Analysis of PR**: Filter by presence/absence of PR analysis text
  - `Any (with or without)`: Show all PRs regardless of analysis
  - `With analysis`: Show only PRs that have analysis text entered
  - `Without analysis`: Show only PRs with no analysis text

These filters are applied locally and work in combination with other visibility filters (labels, authors, approvers, etc.). All custom metadata filters default to "Any" (no filtering).

On page load, the UI automatically reads stored data and renders sections without requiring a new run.

Date columns in the web table (`YOUR LAST ACTIVITY` and `MERGED AT`) use the same display format as the CLI output (`Mon D, YYYY H:MM AM/PM`, local time).

Stored PR table rows now include a `LABELS` column and each row persists the PR label names in JSON.

The `AUTHOR` column in the PR data table displays resolved real names from `actorsMap` when available.

Open and draft PR sections are sorted by PR number descending (highest first). Closed PRs sort by close date descending. Merged PRs sort by merge date descending.

The PR section headings are expandable/collapsible in the UI: `Open PRs`, `Draft PRs`, and `Latest Merged PRs` are expanded by default, while `Closed PRs` is collapsed by default. Each heading also shows total PR count and a `Needs attention` count for that section.

Each stored row also persists branch metadata used by expandable row insights:

- `sourceBranch` (PR head branch)
- `targetBranch` (base/merge target branch)

The table also includes:

- a leading attention-icon column (blank header)
- a dedicated `CHK` column
- expandable per-row insights in `TITLE` showing source branch, merge target branch, CHK state, mergeability state, source updated timestamp, and baseline timestamp
- expandable per-row insights in `TITLE` also show approver names + approval timestamps and open (unresolved) conversation count
- expandable per-row insights in `TITLE` also show requested reviewers and assigned users
- expandable per-row insights in `TITLE` also show GitHub viewed-files progress (`viewed/changed`, like `29/37 viewed`)
- expandable per-row insights in `TITLE` also show GitHub-style line-change totals when available (`<files> changed, +<additions>, -<deletions>, <total> lines changed`)
- expandable insights include a compact colored badge strip for `STATUS`, `CHK`, and `MRG`

Needs Attention configuration:

- The `View Filters` panel includes a `Needs Attention rules` section.
- Non-default values in this section are saved to `view-prs/data/user-defaults.json` and restored on reload.
- The server creates `view-prs/data/user-defaults.json` on startup if it does not exist.
- Configurable rules include:
  - NO_ACTIVITY handling mode (`all`, `mine-only`, `none`)
  - whether pending draft comments trigger attention
  - whether merge-only commit activity should be ignored for CHANGED attention
  - whether closed/merged rows should be eligible for attention
  - draft-specific toggles for CHANGED and NO_ACTIVITY attention
  - PR-author thread-resolution policy (`allow-all`, `allow-only`, `deny-only`)
  - actor-based allow/deny lists for thread starters (from `Actor Names`)

Default values:

| Setting | Default |
| --- | --- |
| NO_ACTIVITY handling | `all` |
| Include pending draft comments | `on` |
| Ignore merge-only commits for CHANGED | `off` |
| Include closed/merged sections | `on` |
| Include CHANGED drafts | `on` |
| Include NO_ACTIVITY drafts | `off` |
| PR-author thread-resolution policy | `allow-all` |

Change Detection Filters:

- The `Advanced visibility and attention rules` section includes `Change Detection Filters` to configure what activity should NOT trigger CHANGED status.
- These filters are saved to `view-prs/data/user-defaults.json` under `changeFilters`.
- Supported filter types:
  - **Ignore comments from these authors**: Filters out general discussion comments (conversation messages, bot notifications, questions, updates) from specified GitHub logins. Use this to ignore informational messages that don't require action.
  - **Ignore reviews from these authors**: Filters out formal code review submissions (created via "Review changes" button with approval/change request states) from specified GitHub logins. Use this to ignore optional reviewers whose approval isn't required.
  - **Ignore commits matching patterns**: Filters out commits whose message headline matches specified regex patterns (one per line). Use this to ignore non-code changes like documentation updates (`^docs:`), test-only commits (`^test:`), or dependency updates (`^chore: update dependencies`).
- Built-in filters (always active):
  - Approved reviews are always ignored
  - Merge commits from main are always ignored (pattern: `^(Merge (branch|remote-tracking branch).*(main|origin/main)|Merge main into )`)
- Regex patterns for commits:
  - Patterns use PCRE-compatible syntax (jq's `test()` function)
  - Patterns are tested against commit message headline (first line only)
  - Multiple patterns are combined with OR logic
  - Example patterns: `^docs:` (ignores doc commits), `^test:` (ignores test commits), `^chore\\(deps\\):` (ignores dependency updates), `(?i)^wip:` (case-insensitive WIP commits)

Comments vs Reviews vs Commits:

- **Comments** (💬) are general discussion messages in the PR conversation tab (created via main comment box). Example: bot notifications, questions, status updates.
- **Reviews** (✅) are formal code review submissions with states (APPROVED, CHANGES_REQUESTED, COMMENTED) created via the "Review changes" button. They affect PR merge status and appear with special badges.
- **Commits** (📝) are code changes pushed to the PR branch. Commit filtering is pattern-based, not author-based.

Example configuration in `user-defaults.json`:

```json
{
  "repo": "owner/repo",
  "changeFilters": {
    "ignoreCommentsFromAuthors": ["dependabot[bot]", "github-actions[bot]", "codecov[bot]"],
    "ignoreReviewsFromAuthors": ["optional-reviewer"],
    "ignoreCommitPatterns": [
      "^docs:",
      "^test:",
      "^style: formatting",
      "^chore: update dependencies"
    ]
  }
}
```

Scope mode behavior:

- `all`: show all rows that match non-scope filters.
- `needs-attention`: show only rows currently flagged as needing attention.
- `needs-attention-or-interacted`: show rows needing attention or rows where you have interaction context.
- PR-number filter (when non-empty) takes precedence over scope and other local filters for row inclusion.

Insights behavior notes:

- `More insights` stays open across automatic data refresh rerenders.
- Open inner insight groups (for example `Activity sequence`) also stay open across rerenders.
- Auto data-refresh rerenders are paused while any PR-section field is unsaved (including Notes text/select changes and Notes comment add/remove changes).
- Unsaved `Author Insights` manual comment drafts and manual comment edits also pause auto-refresh until they are saved, canceled, or explicitly discarded.
- When auto-refresh is paused, a floating `Auto update paused` indicator appears with clickable blocker chips (PR numbers and author-draft chips) that jump directly to the matching unsaved UI, plus a `Discard unsaved` action (manual override to render the pending update and discard unsaved edits).
- Polling failures now show a persistent warning snackbar that includes `Last successful check` and `Last error at` timestamps.
- The polling warning snackbar is automatically cleared after a successful poll.
- `Activity sequence` visually distinguishes event kinds (approval/review/thread/top-level/commit/system).
- `Activity sequence` suppresses duplicate `review (COMMENTED)` items when the same event content is already represented by a thread or top-level comment item.
- `Review conversations` in `More insights` shows both top-level PR comments (displayed in a gray card, sorted oldest-first) and inline review threads.
- The `Review conversations` summary heading now includes resolved/total thread counts in the format `Review conversations (<resolved>/<total>)` (for example `Review conversations (12/43)`).
- Review events only show a `View` link when the URL points to a specific anchor, not just the PR root.
- Rows with pending thread comments show a `Pending comments: N` chip in the title cell and a `Needs attention` icon.
- `Open conversations with me` counts unresolved conversations where you participated (started or commented).
  - If viewer identity cannot be determined, it safely falls back to total open conversations and omits `with me` wording.

In the UI table, `TITLE` text is shown without embedded `[CHK:...]` and `[MRG:...]` tags.

The UI includes:

- `Run script` (full run to refresh PR data)
  - PR number input accepts numeric IDs separated by commas, whitespace, or mixed delimiters
  - request payload maps form values as: `author` falls back to an empty string when no author is selected, and checkbox fields (`ackChanged`, `showReason`, `quiet`) are sent as booleans
- `Apply ack only` (ack updates only)
- `Apply clear only` (clear updates only)
- `Apply filters (local)` (updates visible rows and persisted defaults without calling `/view-prs/run`)
- `Export` management tab to build and export JSON from currently visible PR rows
- `Actor Names` management tab to view and edit both display-name mappings and canonical login aliases
  - display-name mappings are stored in `view-prs/data/actor-name-cache.json`
  - login aliases are stored in `view-prs/data/actor-login-aliases.json`
  - when `/view-prs/data` encounters a previously unseen non-empty `authorLogin/login`, that login is automatically added to the actor-name cache (using the best available display name)
  - display-name entries load from `GET /view-prs/actor-name-cache` and save with `PUT /view-prs/actor-name-cache`
  - login alias entries load from `GET /view-prs/actor-login-aliases` and save with `PUT /view-prs/actor-login-aliases`
  - if either JSON file is missing, it is created automatically on first read
  - writes that would clear all display-name mappings or all login aliases are rejected to prevent deleting all configured mappings
  - login alias rows must include both an alias login and a canonical login, and the two values must differ
- per-row `In Review` checkbox in the `ACTIONS` cell with immediate persistence
- per-row `Flagged` checkbox in the `ACTIONS` cell with immediate persistence
  - flagged PRs display a `🚩` icon in `Needs Attention` with tooltip `PR was flagged`
  - when both icons are present, the `🚩` icon is rendered below `⚠️`
- per-row Notes editor saved to `check-open-pr-updates.user-state.json` via `POST /view-prs/notes`
  - note `createdAt`/`updatedAt` values are normalized to UTC second precision (`YYYY-MM-DDTHH:mm:ssZ`) so persisted user-state remains schema-valid
- Author Insights manual comments editor saved to `check-open-pr-updates.author-comments.json` via `GET/POST/PUT /view-prs/author-comments`
- PR-number-column relative `↻ ... ago` indicators are based on the latest successfully rendered run timestamp (`lastRun.updatedAt`), not per-row stale timestamps.
- `YOUR LAST ACTIVITY` / `MERGED AT` date cells show six small gray indicator boxes per row for saved notes fields (custom comments, other notes, PR difficulty, Rally stories, Rally links, analysis); boxes are filled when data exists and outlined when empty, and the difficulty box displays the saved numeric level when present
- per-row `View PR JSON details` modal with four expanded-by-default sections:
  - `Data File Entry`
  - `PR Detail File`
  - `User State Entry`
  - `PR Diff`
- per-row `View PR JSON details` modal supports:
  - syntax-highlighted diff rendering
  - `Copy diff` (raw diff only)
  - `Copy all` (AI-chat-friendly combined payload including data file entry, pr-detail file entry, user-state entry, diff metadata, and full diff text)
  - keyboard and modal-accessibility behaviors: Escape closes the dialog, backdrop click closes the dialog, and Tab/Shift+Tab keep focus cycling within the dialog while open
- each modal section (`Data File Entry`, `PR Detail File`, `User State Entry`, `PR Diff`) has its own internal scrollbar for large payloads

Export tab behavior:

- Field picker supports mixed data-file and user-state fields in any combination.
- Export scope uses what is currently visible in `PR data`:
  - applies active local filter values,
  - includes only PR rows inside expanded sections (`Open PRs`, `Draft PRs`, `Closed PRs`, `Latest Merged PRs`),
  - excludes rows in collapsed sections.
- Export actions:
  - `Preview JSON` renders the payload in-page,
  - `Copy JSON` writes payload to clipboard,
  - `Download JSON` saves payload as a local `.json` file.
- Export field selections are persisted in `data/user-defaults.json` when using `Preview JSON`, `Copy JSON`, or `Download JSON`, and re-applied when the Export section is rebuilt.

Notes editor fields include:

- comment rows (author, sentiment, note)
- `Other Notes` (textarea)
- `PR difficulty` (1-5)
- `Rally stories` (multi-entry text; use `+` to add another story)
- `Rally links` (multi-entry text; use `+` to add another link)
- `Analysis of PR` (textarea)

`Rally stories` and `Rally links` are persisted as arrays in user state.

`Save notes` is enabled only when one or more notes fields are dirty (including the additional fields above).

Author Insights manual comments fields include:

- comment text (textarea)
- sentiment (`positive`, `negative`, `neutral`)
- save comment
- inline edit for any saved comment

Unsaved Author Insights manual-comment drafts and inline edits are preserved across internal rerenders and pause auto-refresh until they are saved, canceled, or explicitly discarded.

Saved manual author comments are grouped by `authorLogin` in `data/check-open-pr-updates.author-comments.json`, include `createdAt` and `updatedAt` timestamps, and are loaded lazily for the selected author.

Protected-write and backup behavior for `check-open-pr-updates.author-comments.json` matches existing protected state files:

- destructive clears and large shrink operations are blocked by default unless `VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE=true`
- every successful write creates backup snapshots in `data/backups` with retention pruning

The page calls:

- `POST /view-prs/run`
- `POST /view-prs/ack` (acknowledgment-only updates; no full PR refresh)
- `POST /view-prs/notes` (persist notes for a specific PR)
- `GET /view-prs/author-comments?authorLogin=<login>` (fetch manual comments for selected author)
- `POST /view-prs/author-comments` (create a manual author comment)
- `PUT /view-prs/author-comments` (edit an existing manual author comment)
- `GET /view-prs/diff?repo=<owner/name>&prNumber=<number>` (read cached PR diff; refreshes when commit fingerprint changed)
- `GET /view-prs/user-defaults` (read persisted default filter/visibility/attention overrides)
- `PUT /view-prs/user-defaults` (save persisted default filter/visibility/attention overrides)
- `GET /view-prs/data` (load persisted data for display)
- `GET /view-prs/data-meta` (lightweight data-version polling)
- `GET /view-prs/data-manifest` (per-PR row-version manifest for selective polling)
- `POST /view-prs/data-delta` (retrieve only changed PR rows by PR number)
- `GET /view-prs/scheduler` (scheduler state, including `activePrNumbers` for per-PR in-progress indicators)

Selective polling behavior:

- The UI still checks `GET /view-prs/data-meta` first for a lightweight file-version change signal.
- When the server advertises manifest support, the UI then compares `GET /view-prs/data-manifest` row versions against the last rendered payload.
- Only changed PR numbers are fetched through `POST /view-prs/data-delta`, reducing unnecessary full-data reloads for row-local changes such as labels or notes.
- If manifest support is unavailable or a delta request fails, the UI falls back to the existing full `GET /view-prs/data` refresh path.

PR diff caching behavior:

- Diff files are stored at `view-prs/data/pr-diffs`.
- Each PR writes to its own file (repo + PR number key).
- Diff refresh is queued in background after data loads/runs so it does not block normal UI/API requests.
- Diff is re-downloaded only when that PR's commit fingerprint changes (for example, additional commits).
- If a PR exists only in `data/pr-diffs` (and not in `check-open-pr-updates.data.json`), the server synthesizes a fallback merged row titled `Git Diff only` so the PR remains visible in the table.
- The per-PR JSON modal includes this diff payload via the `/view-prs/diff` endpoint.
- The per-PR JSON modal includes this diff payload via the `/view-prs/diff` endpoint and can copy either raw diff-only or all modal data in a chatbot-friendly format.

Response payload includes:

- `ok`
- `command`
- `output`
- `stderr`
- `error` (on failure)

Ack-only response payload includes:

- `ok`
- `command`
- `output`
- `stderr`
- `refreshedPrs`
- `refreshErrors`
- `error` (on failure)

Dependency health response includes:

- `ok`
- `commands` (per-command availability)
- `packages` (per-package availability)
- `missingCommands`
- `missingPackages`
- `missing`

Example healthy response:

```json
{
  "ok": true,
  "commands": {
    "bash": true,
    "gh": true,
    "jq": true
  },
  "packages": {
    "marked": true
  },
  "missingCommands": [],
  "missingPackages": [],
  "missing": []
}
```

Example missing dependency response:

```json
{
  "ok": false,
  "commands": {
    "bash": true,
    "gh": false,
    "jq": true
  },
  "packages": {
    "marked": false
  },
  "missingCommands": ["gh"],
  "missingPackages": ["marked"],
  "missing": ["gh", "npm:marked"]
}
```

## Troubleshooting

- `gh: command not found`
  - Install GitHub CLI, then verify with `gh --version`.
- `Please authenticate first: gh auth login`
  - Run `gh auth login`, then confirm with `gh auth status`.
- `jq is required`
  - Install `jq`, then verify with `jq --version`.
- `Permission denied` when running scripts
  - Run `chmod +x run-prs src/script/check-open-pr-updates.sh` from `view-prs`.
- `npm start --help` shows npm help instead of script help
  - Use `./run-prs --help` or `npm run start -- --help`.
- Web UI run fails with endpoint/network errors
  - Start server from repo root with `npm start` and use `http://localhost:9000/view-prs/index.html`.
- Ack/Clear buttons fail in UI
  - Verify the server has restarted after updates and `POST /view-prs/ack` is available.
- Page stays on "Not run" and "Loading..."
  - Hard refresh the browser and ensure the server is restarted so latest `view-prs/src/ui/index.html` is served.
- Browser console shows `content_script.js` errors like `UsernameElementUniqueID` or `ControlLooksLikePasswordCredentialField`
  - These are typically injected by password-manager/autofill browser extensions, not by `view-prs` runtime code.
  - Verify by opening the page in a browser profile/incognito session with extensions disabled.
  - If confirmed, disable that extension for this site (or add a site exclusion) to remove console noise.
- Verify dependency health endpoint
  - Run `curl -s http://localhost:9000/health/deps`.

### Debugging flaky runs

If shell tests fail intermittently, rerun with retries enabled:

```bash
TEST_RETRIES=2 bash view-prs/src/script/tests/check-open-pr-updates.test.sh
```

`TEST_RETRIES=N` performs up to `N+1` total attempts and prints run context when an attempt fails.

To capture debug logs from `src/script/check-open-pr-updates.sh`, set `CHECK_OPEN_PR_DEBUG_LOG`:

```bash
CHECK_OPEN_PR_DEBUG_LOG=view-prs/results/check-open-pr-debug.log \
bash view-prs/src/script/check-open-pr-updates.sh --open none --quiet
```

The log includes startup args, parsed settings, cache counters, summary totals, and any trapped command error with line number.

For `auto-refresh` action-log entries, `detail` now also includes timing metrics:

- `repoConcurrency`: effective bounded concurrency used for repo refresh workers.
- `repoMetrics`: per-repo timing breakdown (`startedAt`, `completedAt`, `durationMs`, `queueWaitMs`, `seededPrCount`, `firstPrProgressAt`, `timeToFirstPrProgressMs`).
- `firstPrProgressAt` and `timeToFirstPrProgressMs`: earliest observed PR-progress marker timing across all repos in that run.

Quick report command for recent auto-refresh performance:

```bash
cd view-prs
npm run report:auto-refresh -- --limit 10
npm run report:auto-refresh -- --limit 20 --include-failures
npm run report:auto-refresh -- --limit 15 --json
```

Report command options:

- `--limit <n>`: analyze the most recent `n` auto-refresh runs (default `10`).
- `--include-failures`: include failed auto-refresh runs in summary stats.
- `--file <path>`: read metrics from a specific action-log JSON file.
- `--json`: print machine-readable JSON summary.

Summary output fields:

- `Run duration`: end-to-end auto-refresh runtime across selected runs.
- `Time to first PR progress`: latency to first observed per-PR progress marker.
- `Per-repo duration`: runtime distribution across repo worker runs.
- `Per-repo queue wait`: queue-delay before each repo worker started.

## What the script does

`src/script/check-open-pr-updates.sh` pulls PR data using `gh`, computes per-PR state, and prints four sections:

1. **Open PRs (non-draft)**
2. **Draft PRs**
3. **Latest Closed PRs** (closed but not merged)
4. **Latest Merged PRs**

At the end, it prints a summary count for:

- `CHANGED`
- `NO_CHANGE`
- `NO_ACTIVITY`

You can apply label filters at run time:

- `--label <name(s)>`: include only PRs containing any of the provided labels (comma-separated)
- `--exclude-label <name(s)>`: exclude PRs containing any of the provided labels (comma-separated)

You can also filter by PR author login:

- `--author <login(s)>`: include only PRs authored by the provided login(s) (comma-separated)

## How status is computed

The script compares recent activity from others against your own latest activity (or an acknowledgment timestamp).

- **`CHANGED`**: there is new external activity since your baseline.
- **`NO_CHANGE`**: no relevant new external activity since your baseline.
- **`NO_ACTIVITY`**: you have no baseline activity on that PR yet (mostly for PRs you did not author).

### CHANGED reasons

When status is `CHANGED`, optional reason tags can be shown inline:

- For PRs authored by you:
  - `unanswered-thread`
  - `thread-reply`
  - `comment`
  - `commit`
- For PRs authored by others:
  - `comment`
  - `review` (non-approval reviews such as `COMMENTED` or `CHANGES_REQUESTED`)
  - `commit` (non-merge commits)

## Approval column behavior

`APPROVED` is shown as `YES/NO` with a count in parentheses.

- If **you authored the PR**:
  - `YES` requires at least **2 approvals** from others.
  - count shows **approvals from others only**.
- If **someone else authored the PR**:
  - `YES` means **your latest review state is APPROVED**.
  - count shows **all latest approvals**, including yours.

## Check indicators in UI vs script

- Script output/title metadata includes `CHK:<state>` where `<state>` is one of `PASS`, `FAIL`, `RUN`, `SKIP`, `NA`.
- UI table shows `CHK` in its own column and removes embedded `CHK`/`MRG` tags from displayed `TITLE` text.

## Browser opening behavior (`--open`)

- `all` (script default): opens every non-draft open PR URL.
- `changed`: opens only non-draft PRs with `CHANGED` status.
- `none`: does not open URLs.

When launched through `npm start` or `./run-prs`, `--open none` is pre-applied by the package script unless you override it with another `--open` value.

## Acknowledgment features

Acknowledgments let you move the baseline forward so already-seen changes stop showing as new.

- Store location: `view-prs/data/check-open-pr-updates.user-state.json` under `ackByRepo`
- Locking is used to avoid concurrent write corruption.
- Acks are namespaced per repo.

### Ack commands

- `--ack <numbers>`: mark one or more PRs as acknowledged
  - supports comma-separated (`--ack 912,921`) or repeated flags (`--ack 912 --ack 921`)
- `--ack-clear <numbers>`: clear ack for one or more PRs
- `--in-review <numbers>`: mark one or more PRs as in-review
- `--in-review-clear <numbers>`: clear in-review toggle for one or more PRs
- `--flagged <numbers>`: mark one or more PRs as flagged
- `--flagged-clear <numbers>`: clear flagged toggle for one or more PRs
- `--ack-changed`: during this run, auto-ack all `CHANGED` open non-draft PRs
- `--ack-only`: apply ack/clear/in-review/flagged options only, skip PR retrieval

## Local PR state file

The script now persists retrieved/calculated PR state to a local JSON file next to the script:

- `view-prs/data/check-open-pr-updates.data.json`
- `view-prs/data/check-open-pr-updates.user-state.json` (user-authored state: notes + ack/reverify/in-review/flagged)
- Full persisted schema: `view-prs/src/schema/DATA_SCHEMA.md`

Behavior:

- Data is grouped by PR number under `byPrNumber`.
- Each run updates (upserts) entries for PRs processed in that run.
- PR IDs not processed in a run are **not removed** from the file.
- Display filters do not trim what is stored in this file.
- Open, draft, and merged rows are recomputed on each run by default so activity/comments/conversation details and derived metrics stay current.
- If needed for performance experiments, cache reuse can be re-enabled by setting `VIEW_PRS_ALLOW_CACHE_REUSE=1`.

Top-level structure:

See `view-prs/src/schema/DATA_SCHEMA.md` for the canonical persisted schema, including:

- main data file buckets (`byPrNumber`, `lastRun`)
- separate user-state file buckets (`notesByPrNumber`, `ackByRepo`, `reverifyByRepo`, `inReviewByRepo`, `flaggedByRepo`)
- the full retrieved `data` object written for each PR row and the notes object shape in user-state

Additional notes:

- Heavy per-PR arrays (`activityTimeline`, `activityEvents`, `reviewThreads`, and `commentEvents`) are now externalized to detail sidecars under `view-prs/data/pr-details/` and linked from each row via `data.detailRef`.
- Existing inline-heavy rows can be migrated once with `npm run migrate:pr-detail:v1` from `view-prs/`.
- `activityTimeline` now collapses only consecutive runs of the same actor and activity type, so interruptions by another person or another type of event are preserved.
- `reviewThreads`, `commentEvents`, and `activityEvents` keep the richer raw history needed for later analytics and reviewer-behavior views.
- **Activity Timeline filtering**: The Activity timeline in PR insights displays all dates with activity, shows weekday dates (Mon-Fri) without activity as a dash ("-"), and omits weekend dates (Sat-Sun) without activity. This reduces visual clutter while maintaining visibility of business-week activity patterns.
- The page now includes a `Review Statistics` tab with dedicated controls (`Sort by`, `Filter`, `Min comments`, `Top reviewers`) to rank and focus reviewer activity. Reviewer names are resolved using `actorsMap` display names. The statistics view features prominent graph cards:
  - **Metric totals**: Comments, reviews, and approvals from visible table rows (clickable to sort table)
  - **Activity over time per author**: Sparkline bars showing daily review/comment activity trends for the top 6 reviewers across the last 31 days (helps identify contributor patterns and periods of high engagement)
  - **Top reviewers by comments/approvals/signals**: Stacked bar composition charts with click-to-sort interactivity
  - Source rows in the statistics panel include a `View in table` button that switches to the PR Data tab, scrolls to the matching PR, and expands its `More insights`.
- The page now includes an `Author Insights` tab that shows per-PR review notes grouped by author. The author filter dropdown and metadata cards use resolved real names from `actorsMap`. PR cards in Author Insights include a `View in table` button with the same navigation behavior.
- The page-level and per-PR insights now show usefulness and approval-risk signals (for example, comments followed by author commits and high-risk approvals).

## Modifier options

```text
-r, --repo <owner/name>      Repository to scan (default: optum-rx-clinicalproducts/orx-cpp-mp-uis)
-p, --pr <number>            Inspect a single PR number only
    --label <name(s)>        Include only PRs that have these label(s), comma-separated
    --exclude-label <name(s)> Exclude PRs that have these label(s), comma-separated
  --author <login(s)>      Include only PRs authored by these login(s), comma-separated
-l, --limit <number>         Max number of open PRs to inspect (default: 200)
    --merged-limit <number>  Max closed/merged PRs to show per section (overrides default day-based mode)
    --jobs <number>          Parallel workers for API prefetch (default: 6)
    --ack <numbers>          Mark PR number(s) as acknowledged (comma-separated or repeat flag)
    --ack-clear <numbers>    Clear acknowledgment for PR number(s)
  --in-review <numbers>    Mark PR number(s) as in-review (forces NO_CHANGE -> CHANGED)
  --in-review-clear <numbers> Clear in-review toggle for PR number(s)
  --flagged <numbers>      Mark PR number(s) as flagged
  --flagged-clear <numbers> Clear flagged toggle for PR number(s)
    --ack-changed            Acknowledge all CHANGED open non-draft PRs from this run
    --ack-only               Apply ack/clear/in-review/flagged operations only; skip PR retrieval
    --backup-list            List available state-file backups
    --backup-restore <file>  Restore a backup file from view-prs/data/backups
    --show-reason            Show changed reason inline beside CHANGED in STATUS (default)
    --hide-reason            Hide inline changed reason in STATUS
    --quiet                  Hide run metadata header
    --open <mode>            Browser behavior: all | changed | none (default: all)
-h, --help                   Show this help
```

## Common examples

```bash
# Default run via local launcher (no browser popups unless you override --open)
./run-prs

# No browser popups
./run-prs --open none

# Only open changed PRs
./run-prs --open changed

# Show more merged PRs
./run-prs --merged-limit 25

# Inspect only one PR
./run-prs --pr 923

# Include only PRs with a specific label
./run-prs --label bug,frontend

# Exclude PRs with specific labels
./run-prs --exclude-label dependencies,blocked

# Inspect one PR and avoid opening browser pages
./run-prs --pr 923 --open none

# Acknowledge specific PRs
./run-prs --ack 912,921

# Clear acknowledgments
./run-prs --ack-clear 912

# Acknowledge everything changed in this run
./run-prs --ack-changed

# Lightweight ack-only update (no PR fetch)
./run-prs --ack 912,921 --ack-only

# Lightweight clear-only update (no PR fetch)
./run-prs --ack-clear 912 --ack-only

# Mark a PR in-review (forces NO_CHANGE -> CHANGED)
./run-prs --in-review 923 --ack-only

# Clear in-review for a PR
./run-prs --in-review-clear 923 --ack-only

# List available backups
./run-prs --backup-list

# Restore a specific backup file from view-prs/data/backups
./run-prs --backup-restore check-open-pr-updates.user-state.json.user-state.20260410T182500Z-12345-999.bak
```
