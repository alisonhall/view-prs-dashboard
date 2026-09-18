# view-prs

## Overview

Utilities for checking open and recently merged pull requests in a GitHub repository.

## Quick Start

> **Windows:** this project needs a real `bash` (for `check-open-pr-updates.sh` and friends). Install [Git for Windows](https://git-scm.com/download/win) and run every command below from its **Git Bash** terminal (or WSL) - plain `cmd.exe`/PowerShell won't have `bash` on `PATH`. `npm install`/`npm run setup` will also tell you this if `bash` is missing.

```bash
npm run setup   # npm install, then checks deps (jq is auto-provided; bash/gh you provide) and prints next steps
```

Then, to point this at your own repo:

```bash
export VIEW_PRS_REPO='owner/repo'   # or pass --repo owner/repo directly to the CLI script
```

(PowerShell: `$env:VIEW_PRS_REPO = 'owner/repo'`. cmd.exe: `set VIEW_PRS_REPO=owner/repo`. Either way, run the actual commands from Git Bash/WSL as noted above - only the env var needs to be set in your native shell if you're setting it outside Git Bash.)

Authenticate the GitHub CLI once, if you haven't already (`gh auth login`), then start the server:

```bash
npm start
```

- UI (with React HMR): `http://localhost:3456`
- Backend only, no HMR: `http://localhost:9000/view-prs/index.html` (via `npm run start:server-only`)
- Dependency health, once running: `curl -s http://localhost:9000/health/deps`

See `## Requirements` below for what `npm run setup`/`npm run deps:check` actually verify, and the full CLI/script reference further down for every other option.

## Project Layout

Canonical runtime and scripts now live under `src/`:

- Server runtime: `src/server/`
  - Routes: `src/server/routes/`
  - Shared helpers: `src/server/helpers/`
  - State storage internals: `src/server/storage/`
  - Tests: `src/server/integration-tests/`
- UI assets and page controller: `src/ui/`
  - UI helpers: `src/ui/helpers/`
- UI tests: `src/ui/integration-tests/`
- CLI/update scripts: `src/script/`
  - Script tests: `src/script/integration-tests/`
- Backfill tools: `src/backfill/`
- Schema and validation: `src/schema/`
- End-to-end (real browser) tests: `e2e/`

Compatibility note: migration shims were removed in Phase 3. Use canonical `src/` paths and npm scripts only.

## Architecture Snapshot

- Planning and phased modernization checklist: `AI_MODERNIZATION_PLAN.md`
- Vanilla-to-React UI migration (complete): `REACT_MIGRATION_PLAN.md`
- Server-side helper extraction/integration status: `PHASE_8_STATUS.md`

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
- Integration/wiring tests should remain in `src/ui/integration-tests/` and server integration test folders.
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

- `npm run test:app`: server route/integration/scheduler suites (`src/server/integration-tests/`)
- `npm run test:ui`: UI suites (`src/ui/**/*.test.js`)
- `npm run test:script`: shell script Jest harness (`src/script/integration-tests/*.test.js`)
- `npm run test:schema`: schema-focused Jest suites (`src/schema/integration-tests/`)
- `npm run test:deps`: dependency guard/unit suites (`src/dependencies/integration-tests/`)
- `npm run test:backfill`: backfill-focused suites (`src/backfill/integration-tests/`)
- `npm run test:all`: guard + full Jest run (no coverage output)
- `npm run test:coverage` / `npm run test:ci`: guard + full Jest run with coverage output (`coverage/lcov-report`)
- `npm run check:all`: dependency check + lint + persisted-schema validation + `test:coverage` (updates `coverage/lcov-report` automatically)
- `npm run test:e2e`: real-browser Playwright suite (`e2e/*.spec.js`) against a live server; not run as part of `test:all`/`check:all`
- `npm run stability:heap-check`: standalone long-session heap-growth diagnostic (`e2e/stability/long-session-heap-check.js`), run on demand, not part of any `test:*`/`check:*` script

UI test placement conventions:

- Unit tests for UI components and UI helpers should be co-located next to the source file:
  - `src/ui/components/*.test.js`
  - `src/ui/helpers/*.test.js`
- Shared fixture/factory modules should live under `src/ui/test-fixtures/` and expose reusable builders.
- Integration/wiring tests should remain centralized under `src/ui/integration-tests/`:
  - `index.html.test.js`
  - `index.page.memory-leak-prevention.test.js`
  - `index.page.notifications.test.js`
  - `index.page.trends.test.js`
- `npm run test:ui` discovers all UI tests via `src/ui/**/*.test.js`.
- Real-browser regressions that jsdom can't see (asset 404s, event-delegation races between vanilla and React, charset handling) belong in `e2e/smoke.spec.js` instead.

Recommended default before opening a PR: `npm run check:all`. Run `npm run test:e2e` too if you touched UI rendering/event wiring — it isn't part of `check:all`.

Test decision flow:

- Fast local iteration: run the smallest relevant `npm run test:*` subset.
- Before PR/merge: run `npm run check:all` (and `npm run test:e2e` for UI changes).

Run from repository root:

```bash
npm run test:view-prs
```

## React Development Scripts

The following scripts support the React migration and development workflow:

```bash
npm start                    # Start both Node.js backend (9000) + Vite dev server (3456)
npm run dev                  # Alias for npm start
npm run start:server-only    # Start Node.js backend only (no Vite)
npm run dev:server           # Alias for start:server-only
npm run dev:ui               # Start Vite dev server only (requires backend running)
npm run build:ui             # Build production React bundle to dist/ui/
npm run preview              # Preview production build locally
npm run verify:react-setup   # Verify React development environment setup
```

Script guide:

- **`npm start`** (recommended): Starts both servers for full React development with Hot Module Replacement (HMR)
  - Node.js backend on `http://localhost:9000` (API server)
  - Vite dev server on `http://localhost:3456` (frontend with HMR)
  - Access UI at: `http://localhost:3456`
  - Use this for React/UI development work

- **`npm run start:server-only`**: Backend-only mode for API development
  - Starts only Node.js server on `http://localhost:9000`
  - Serves static files but no HMR
  - Use when working on backend logic without UI changes

- **`npm run dev:ui`**: Frontend-only Vite server
  - Requires backend to be running separately
  - Proxies `/view-prs/*` API calls to backend on port 9000
  - Use for frontend-focused work with backend already running

- **`npm run build:ui`**: Production build
  - Compiles React app to optimized static files
  - Output: `dist/ui/` directory
  - Run before deploying or testing production builds

- **`npm run preview`**: Test production build locally
  - Serves built files from `dist/ui/`
  - Simulates production environment
  - Run after `build:ui` to verify production bundle

- **`npm run verify:react-setup`**: Development environment check
  - Verifies all React dependencies installed
  - Checks configuration files exist
  - Validates project structure
  - Run after cloning repo or updating dependencies

Recommended React development workflow:

1. **First time setup:** `npm run verify:react-setup`
2. **Development:** `npm start` (opens both servers)
3. **Access UI:** `http://localhost:3456`
4. **Before deployment:** `npm run build:ui`
5. **Test build:** `npm run preview`

See [Development Servers](#development-servers) section for more details.

## Key Files

- Script: `src/script/check-open-pr-updates.sh`
- Local launcher (recommended): `./run-prs`
- CLI script mode: `npm run cli-view -- <args>`
- Development server: `npm start` (runs Node.js backend + Vite dev server with React HMR)
- Backend only: `npm run start:server-only` (Node.js server without Vite)
- Interactive page: `src/ui/index.html`
- Actor login aliases: `data/actor-login-aliases.json`
- JSON Schema: `src/schema/check-open-pr-updates.data.schema.json`
- Author comments schema: `src/schema/check-open-pr-updates.author-comments.schema.json`
- Persisted data schema: `src/schema/DATA_SCHEMA.md`

> Note: use `./run-prs --help` or `npm run cli-view -- --help` for script options.

## Requirements

- `gh` (GitHub CLI), authenticated (`gh auth login`)
- Bash shell (on Windows: [Git for Windows](https://git-scm.com/download/win)'s Git Bash, or WSL - there's no bash on `PATH` in a native `cmd.exe`/PowerShell terminal)

`jq` is provided automatically by `npm install` (via the `node-jq` dependency, which downloads a real jq binary into `node_modules`) - no manual install needed. `check-open-pr-updates.sh` prefers that bundled binary over a system-wide `jq`, falling back to one on `PATH` only if `node_modules` is missing.

Run `npm run deps:check` any time to verify all of the above (plus a few coreutils the script also needs) are actually present - it also runs automatically before `npm test` and (as a non-blocking warning) after `npm install`. Once the server is running, `curl -s http://localhost:9000/health/deps` reports the same thing live, plus a `ghAuthenticated` field (`true`/`false`/`null` if `gh` isn't installed at all) - `gh` being installed but not logged in (`gh auth login`) is treated as unhealthy (`ok: false`, `503`) since that's the one dependency issue `deps:check`/`postinstall` can't catch on their own without an extra network call.

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

## Development Servers

**React Development Mode (Recommended):**

```bash
cd view-prs
npm start
```

This starts TWO servers:
- **Node.js backend** on `http://localhost:9000` (API server)
- **Vite dev server** on `http://localhost:3456` (frontend with Hot Module Replacement)

**Access the UI at:** `http://localhost:3456`

**Benefits:**
- ✅ Hot Module Replacement (HMR) - changes appear instantly without page reload
- ✅ Fast builds with Vite (10-100x faster than Webpack)
- ✅ React DevTools support
- ✅ Modern ESM development

**Backend Only Mode:**

If you only need the Node.js server without React HMR:

```bash
cd view-prs
npm run start:server-only
```

**Access the UI at:** `http://localhost:9000`

Note: This mode serves static files but does not provide Hot Module Replacement.

**Production Build:**

To build the React app for production:

```bash
cd view-prs
npm run build:ui
```

Built files are output to `dist/ui/` and can be served by the Node.js server.

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
npm start  # Starts Node.js backend (9000) + Vite dev server (3456) with React HMR
npm run start:server-only  # Node.js backend only (no Vite)
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

When localhost is running, the server starts an automatic background refresh for `view-prs` data, split into two tiers so open PRs get checked often and cheaply while merged/closed PRs don't pay for a full re-fetch unless something actually changed:

- **Quick check** (every 5 minutes, configurable via `VIEW_PRS_QUICK_CHECK_INTERVAL_MS`): a cheap listing-only pass (`check-open-pr-updates.sh --quick-check`) that compares each PR's GitHub `updatedAt` against the cached value - no comments/reviews/CI/diff fetching. When an **open/draft** PR looks changed, a targeted full refresh for just that repo fires immediately (a "fast-follow") instead of waiting for the next full-sweep timer. When a **merged/closed** PR looks changed, it's queued instead.
- **Merged/closed drain** (every 30 minutes, configurable via `VIEW_PRS_MERGED_FULL_SWEEP_INTERVAL_MS`): batches whatever the quick check queued for merged/closed PRs into a full refresh. If nothing was queued, it does nothing - no full fetch runs.
- **Full sweep** (every 15 minutes, unchanged): runs for all configured repos regardless of the quick check, as a safety net.
- Any of the above skips if a manual `Run script` action completed in the previous 15 minutes.
- On successful full refresh, `check-open-pr-updates.data.json` is updated and the UI detects the new run and rerenders automatically.
- While a run is in progress, PR rows currently being refreshed show a small spinner below the PR number link and above the relative "updated ... ago" text without forcing a full table rerender.
- A PR flagged by the quick check but not yet picked up by a full refresh shows an `Update queued` badge in its STATUS cell.
- During long runs, open/draft PR indicators and data refreshes are intentionally prioritized ahead of closed/merged work so the most actionable rows settle first.
- When auto refresh includes multiple repos, refreshes run with bounded repo concurrency (default `2`), configurable via `VIEW_PRS_AUTO_REPO_CONCURRENCY`.
- A merged PR's diff is fetched once and never re-fetched afterward - the diff cache fingerprint for merged PRs depends only on the (immutable) commit set, not on `updatedAt`, so later metadata-only changes (a new comment, a label edit) never trigger a redundant diff re-download.

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

The `AUTHOR` column in the PR data table displays resolved real names from `actorsMap` when available. It shows the official PR author (styled distinctly, same treatment as elsewhere in the app) plus every other distinct person with a non-merge commit on the branch (commits whose `messageHeadline` starts with "Merge" are excluded, matching the "ignore merge-only commits" attention rule's definition), deduped so a commit author who is also the PR author only appears once.

Open and draft PR sections are sorted by PR number descending (highest first). Closed PRs sort by close date descending. Merged PRs sort by merge date descending.

The PR section headings are expandable/collapsible in the UI: `Open PRs`, `Draft PRs`, and `Latest Merged PRs` are expanded by default, while `Closed PRs` is collapsed by default. Each heading also shows total PR count and a `Needs attention` count for that section.

Smart Accordion Groups:

The UI features **smart accordion groups** that appear above lifecycle sections (Open, Draft, Closed, Merged). Smart groups provide workflow-based organization where PRs can appear in multiple sections simultaneously:

- **🚩 Flagged**: PRs marked with the flagged flag (collapsed by default)
  - Purpose: User-flagged PRs for quick reference
  - Example use: Star important PRs that need close monitoring
- **👁️ In Review**: PRs marked with the in-review flag (expanded by default)
  - Purpose: Active code review workflow tracking
  - Example use: PRs currently undergoing review cycles
- **⚠️ Needs Attention**: PRs requiring action based on your "Needs Attention rules" settings (expanded by default)
  - Purpose: High-priority PRs needing immediate attention
  - Shows: Open, Draft, and Merged PRs (excludes Closed PRs)
  - Uses the SAME logic as the existing needs attention flag/icon shown in PR rows
  - Respects your custom "Needs Attention" configuration (CHANGED status, pending comments, no activity, etc.)
  - Independent of the `In Review` flag/checkbox - marking a PR in-review does not, by itself, make it need attention or affect its `STATUS`; it only controls membership in the `In Review` smart group above and the row's `In Review` checkbox state
  - Configuration controlled via `user-defaults.json` (see "Needs Attention Configuration" section below)
  - Example use: Open/Draft PRs with new commits, unresolved comments, failing checks, or marked for review
- **💬 Open PRs I'm Involved In**: PRs where viewer has participated (collapsed by default)
  - Purpose: Personal reference for active PRs you're engaged with
  - Only shows OPEN or DRAFT PRs (excludes merged/closed to keep section actionable)
  - Shows PRs where you are:
    - The author
    - A commenter (have left comments)
    - A reviewer (have submitted reviews)
    - A requested reviewer
    - An assignee
  - Example use: Track all active PRs requiring your attention or where you've contributed

Smart group features:

- **Non-exclusive membership**: A single PR can appear in multiple smart groups AND its lifecycle section
- **Two-tier hierarchy**: Smart groups (Tier 1) display above lifecycle sections (Tier 2)
- **Lifecycle badges**: When a PR appears in a smart group, a small pill-shaped badge indicates its lifecycle state:
  - 🟢 **OPEN** (green pill) - Active open PR
  - ⚪ **DRAFT** (gray pill) - Draft PR
  - 🔵 **MERGED** (purple pill) - Merged PR
  - 🔴 **CLOSED** (red pill) - Closed PR (only in Flagged/In Review groups)
  - Badges only appear in smart groups (not in lifecycle sections where they would be redundant)
- **Color-coded sections**: Each smart group has unique visual styling (colored border and gradient background)
- **State persistence**:
  - Section open/closed state persists across page refreshes and auto-refresh cycles
  - "More Insights" expand/collapse state persists independently per section
  - When a PR appears in multiple sections, each section maintains its own "More Insights" state
  - Example: PR #123 can have "More Insights" expanded in "Needs Attention" but collapsed in "Open PRs"
- **Smart defaults**:
  - Smart groups: Actionable groups (In Review, Needs Attention) expand by default; reference groups (Flagged, Open PRs I'm Involved In) collapse by default
  - Lifecycle sections: All sections (Open PRs, Draft PRs, Closed PRs, Latest Merged PRs) collapse by default to reduce clutter

Visual layout example:

```text
┌─ SMART GROUPS ─────────────────────────┐
│ ▼ 🚩 Flagged (3)                       │ ← Red border, pink gradient
│ ▼ 👁️ In Review (5)                     │ ← Blue border, blue gradient
│ ▼ ⚠️ Needs Attention (2)               │ ← Orange border, yellow gradient
│ ▼ 💬 Open PRs I'm Involved In (8)      │ ← Purple border, purple gradient
├─ LIFECYCLE SECTIONS ───────────────────┤
│ ▼ Open PRs (12)                        │
│ ▼ Draft PRs (3)                        │
│ ▶ Closed PRs (5)                       │
│ ▼ Latest Merged PRs (20)               │
└──────────────────────────────────────────┘
```

Each stored row also persists branch metadata used by expandable row insights:

- `sourceBranch` (PR head branch)
- `targetBranch` (base/merge target branch)

The table also includes:

- a leading attention-icon column (blank header)
- a dedicated `CHK` column
- expandable per-row insights in `TITLE` showing source branch, merge target branch, CHK state, mergeability state, source updated timestamp, and baseline timestamp
  - The source branch value has a small copy-icon button beside it to copy the branch name to the clipboard (e.g. for `git checkout`).
- expandable per-row insights in `TITLE` also show approver names + approval timestamps and open (unresolved) conversation count
- expandable per-row insights in `TITLE` also show requested reviewers and assigned users
- The `TITLE` cell itself also has a copy-icon button beside the PR title that copies `<title> #<number>` to the clipboard - when pasted into a rich-text target (Slack, docs, email) the `#<number>` portion is a link to the PR on GitHub; plain-text targets get `<title> #<number>` with no markup.
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
- Built-in filters:
  - **Approved reviews are always ignored** (cannot be disabled)
  - **Built-in merge commit filter** (configurable):
    - Pattern: `^(Merge (branch|remote-tracking branch).*(main|origin/main)|Merge main into )`
    - Enabled by default via "Use built-in merge commit filter" checkbox
    - Can be disabled to define custom merge patterns or allow all merge commits to trigger CHANGED status
    - Useful for repos with different merge workflows (e.g., develop → main, custom branch names)
    - When disabled, only user-defined commit patterns apply
- Regex patterns for commits:
  - Patterns use PCRE-compatible syntax (jq's `test()` function)
  - Patterns are tested against commit message headline (first line only)
  - Multiple patterns are combined with OR logic
  - Patterns work in addition to built-in merge filter (when enabled) or as standalone filters (when built-in is disabled)
  - Example patterns: `^docs:` (ignores doc commits), `^test:` (ignores test commits), `^chore\\(deps\\):` (ignores dependency updates), `(?i)^wip:` (case-insensitive WIP commits), `^Merge branch 'develop'` (custom merge pattern)

Comments vs Reviews vs Commits:

- **Comments** (💬) are general discussion messages in the PR conversation tab (created via main comment box). Example: bot notifications, questions, status updates.
- **Reviews** (✅) are formal code review submissions with states (APPROVED, CHANGES_REQUESTED, COMMENTED) created via the "Review changes" button. They affect PR merge status and appear with special badges.
- **Commits** (📝) are code changes pushed to the PR branch. Commit filtering is pattern-based, not author-based.

Example configurations in `user-defaults.json`:

**Default configuration (built-in merge filter enabled):**

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

Note: `useBuiltinMergePattern` defaults to `true` if omitted.

**Custom merge pattern configuration (built-in disabled):**

```json
{
  "repo": "owner/repo",
  "changeFilters": {
    "useBuiltinMergePattern": false,
    "ignoreCommitPatterns": [
      "^Merge branch '(develop|staging)'",
      "^Merge pull request #",
      "^docs:",
      "^test:"
    ]
  }
}
```

This configuration disables the built-in merge filter and defines custom merge patterns for repos that merge from develop/staging branches.

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
- `Apply label` (applies an existing GitHub label to the PR number(s) in the same `pr-numbers` field the Ack buttons use)
  - the label dropdown is populated from `GET /view-prs/labels` for the currently selected repo; only labels already defined on the repo (via `gh label list`) can be chosen - there is no free-text/create-new-label input
  - `↻ Labels` reloads the dropdown for the current repo
- per-row `+ Label` dropdown in the `ACTIONS` cell applies an existing label to just that PR (excludes labels already on the row)
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
- `GET /view-prs/labels?repo=<owner/name>` (list a repo's existing GitHub labels, for the label picker)
- `POST /view-prs/labels/apply` (apply an existing GitHub label to one or more PR numbers)
- `POST /view-prs/notes` (persist notes for a specific PR)
- `GET /view-prs/author-comments?authorLogin=<login>` (fetch manual comments for selected author)
- `POST /view-prs/author-comments` (create a manual author comment)
- `PUT /view-prs/author-comments` (edit an existing manual author comment)
- `GET /view-prs/diff?repo=<owner/name>&prNumber=<number>` (read cached PR diff; refreshes when the commit fingerprint changes - for a merged PR that fingerprint depends only on the commit set, so it never changes again once merged)
- `GET /view-prs/user-defaults` (read persisted default filter/visibility/attention overrides)
- `PUT /view-prs/user-defaults` (save persisted default filter/visibility/attention overrides)
- `GET /view-prs/data` (load persisted data for display)
- `GET /view-prs/data-meta` (lightweight data-version polling)
- `GET /view-prs/data-manifest` (per-PR row-version manifest for selective polling)
- `POST /view-prs/data-delta` (retrieve only changed PR rows by PR number)
- `GET /view-prs/scheduler` (scheduler state, including `activePrNumbers` for per-PR in-progress indicators)
  - The same per-row spinner also lights up while a user-initiated Ack, Clear, `↻ Update`, or `+ Label` request is in flight for that PR (independent of the scheduler's own `activePrNumbers`), and clears once that request settles (success, failure, or error) - so a row stays visibly busy for exactly as long as its own request takes.
  - Also includes `quickCheckIntervalMinutes`, `mergedFullSweepIntervalMinutes`, `lastQuickCheckAt`, `lastQuickCheckError`, `lastMergedDrainAt`, `pendingOpenCount`, and `pendingMergedClosedCount` for the two-tier scheduler described above.

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

## Date Columns

### Last Activity Column

The "LAST ACTIVITY" column displays two lines of information:

- **Line 1 (bold)**: PR's last activity date
  - Shows `mergedAt` if the PR is merged
  - Shows `closedAt` if the PR is closed (but not merged)
  - Otherwise shows `sourceUpdatedAt` or `updatedAt` (last commit timestamp)
  - Tooltip: "Merged at", "Closed at", or "Last commit"
- **Line 2 (muted)**: Your last activity on the PR
  - Format: "You: [datetime]"
  - Shows the `baseline` field (your last interaction with the PR)
  - Tooltip: "Your last activity on this PR"

**Data sources:**
- PR activity (Line 1): `mergedAt` (highest priority) → `closedAt` → `sourceUpdatedAt` → `updatedAt`
- Viewer activity (Line 2): `baseline` field (always shows YOUR last interaction, never the merge/close date)

This two-line format helps you quickly see both when the PR was last updated and when you last interacted with it.

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
  - `npm start` launches the React dev servers, not the CLI script - use `./run-prs --help` or `npm run cli-view -- --help` instead.
- Web UI run fails with endpoint/network errors
  - Start server from repo root with `npm start` and use `http://localhost:9000/view-prs/index.html`.
- Ack toggle button fails in UI
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

Below the summary, assigned users and requested reviewers show as small initials badges:

- A badge is shown for every assignee, plus every requested reviewer who isn't already an assignee - so a reviewer who isn't assigned to the PR is still visible here, not just in the `More insights` reviewers list.
- The badge for the current viewer gets a highlighted "me" style (blue border/background), with `(you)` added to its tooltip.
- A badge for anyone who is one of the PR's requested reviewers gets a small green corner-dot indicator, with `(reviewer)` added to its tooltip - regardless of whether they're also assigned. Both the "me" and "reviewer" indicators can apply to the same badge at once.
- A reviewer who is **not** assigned additionally gets a dashed border and lighter fill (instead of the solid pill used for assignees), with `(not assigned)` added to its tooltip, so it's visually distinct from an actual assignee at a glance.

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
- An ack is automatically cleared the moment a PR shows new external activity (a comment/review/commit) after the ack timestamp - the row's status flips to `CHANGED` with the real reason (e.g. `comment`), and the Ack button reverts from "Ack'd" back to "Ack". This does not set the same `reverifyByRepo` flag the manual `--ack-clear`/"Ack'd" button click does, since the row is already `CHANGED` for a real reason.

### Ack commands

- `--ack <numbers>`: mark one or more PRs as acknowledged
  - supports comma-separated (`--ack 912,921`) or repeated flags (`--ack 912 --ack 921`)
- `--ack-clear <numbers>`: clear ack for one or more PRs
- `--in-review <numbers>`: mark one or more PRs as in-review (a manual, UI-only flag - it controls the `In Review` smart group and row checkbox state, and does not change `STATUS` or the Needs Attention icon)
- `--in-review-clear <numbers>`: clear in-review toggle for one or more PRs
- `--flagged <numbers>`: mark one or more PRs as flagged
- `--flagged-clear <numbers>`: clear flagged toggle for one or more PRs
- `--ack-changed`: during this run, auto-ack all `CHANGED` open non-draft PRs
- `--ack-only`: apply ack/clear/in-review/flagged options only, skip PR retrieval

## Label management

Applies an existing GitHub label (never a newly typed one) to one or more PRs directly via `gh pr edit --add-label`.

- `GET /view-prs/labels?repo=<owner/name>` lists every label currently defined in the repo's GitHub Labels settings (via `gh label list`), including labels not yet applied to any PR.
- `POST /view-prs/labels/apply` with `{ repo, label, prNumbers }` (`prNumbers` is a comma-separated string, same shape as the Ack endpoints) applies the label to each PR number, then fetches just that PR's current label set (`gh pr view --json labels`) and patches it directly into the stored `data.labels` field for that entry.
  - Deliberately does NOT reuse `/view-prs/ack`'s targeted-refresh pattern (re-running `check-open-pr-updates.sh --pr <n>`), since a full refresh also re-fetches comments, reviews, file diffs, and review threads - for a PR with a lot of history (especially merged PRs) that can take minutes, leaving the just-applied label invisible until it finishes or the next scheduled auto-refresh catches up. The direct label-only patch stays fast regardless of a PR's size.
  - The patch acquires the same lock directory (`check-open-pr-updates.data.lock`) the shell script's `acquire_pr_state_lock`/`release_pr_state_lock` use for `check-open-pr-updates.data.json`, so it can't interleave its read-modify-write with a concurrent script run.
- Per-PR failures (invalid PR number, `gh` error, no matching stored entry) are collected into `applyErrors`/`refreshErrors` in the response rather than failing the whole request; PRs that did succeed are still applied and reflected in `prData`.
- Both the per-row `+ Label` dropdown and the "Run & Filter" tab's `Apply label` control call this same endpoint.

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
- Open, draft, and merged rows are recomputed on each run by default so activity/comments/conversation details and derived metrics stay current. See [Performance Toggle](#performance-toggle) (`VIEW_PRS_SKIP_UNCHANGED`) to re-enable per-row cache reuse within a full run - this is separate from the `--quick-check` listing pass described in [Usage](#usage), which only ever compares `updatedAt` to decide whether a PR needs a full run *at all*.

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
- **Activity Timeline filtering**: The Activity timeline in PR insights displays all dates with activity, and omits weekend dates (Sat-Sun) without activity. A run of consecutive weekdays (Mon-Fri) without activity is consolidated into one "No activity for N days" row (with the date range) instead of a dash row per day; an isolated single no-activity weekday still shows its own dash ("-") row. This reduces visual clutter while maintaining visibility of business-week activity patterns.
- The page now includes a `Review Statistics` tab with dedicated controls (`Sort by`, `Filter`, `Min comments`, `Top reviewers`) to rank and focus reviewer activity. Reviewer names are resolved using `actorsMap` display names. The statistics view features prominent graph cards:
  - **Metric totals**: Comments, reviews, and approvals from visible table rows (clickable to sort table)
  - **Activity over time per author**: Sparkline bars showing daily review/comment activity trends for the top 6 reviewers across the last 31 days (helps identify contributor patterns and periods of high engagement)
  - **Top reviewers by comments/approvals/signals**: Stacked bar composition charts with click-to-sort interactivity
  - Source rows in the statistics panel include a `View in table` button that switches to the PR Data tab, scrolls to the matching PR, and expands its `More insights`.
- The page now includes an `Author Insights` tab that shows per-PR review notes grouped by author. The author filter dropdown and metadata cards use resolved real names from `actorsMap`. PR cards in Author Insights include a `View in table` button with the same navigation behavior.
- The page-level and per-PR insights now show usefulness and approval-risk signals (for example, comments followed by author commits and high-risk approvals).

## Modifier options

```text
-r, --repo <owner/name>      Repository to scan
-p, --pr <number>            Inspect a single PR number only
    --label <name(s)>        Include only PRs that have these label(s), comma-separated
    --exclude-label <name(s)> Exclude PRs that have these label(s), comma-separated
  --author <login(s)>      Include only PRs authored by these login(s), comma-separated
-l, --limit <number>         Max number of open PRs to inspect (default: 200)
    --merged-limit <number>  Max closed/merged PRs to show per section (overrides default day-based mode)
    --jobs <number>          Parallel workers for API prefetch (default: 6)
    --ack <numbers>          Mark PR number(s) as acknowledged (comma-separated or repeat flag)
    --ack-clear <numbers>    Clear acknowledgment for PR number(s)
  --in-review <numbers>    Mark PR number(s) as in-review (UI-only flag; does not change STATUS)
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
    --quick-check            List PRs and report which changed (by updatedAt) without
                              fetching full details/diffs; prints JSON to stdout and exits
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

# Mark a PR in-review (UI-only flag; does not change STATUS)
./run-prs --in-review 923 --ack-only

# Clear in-review for a PR
./run-prs --in-review-clear 923 --ack-only

# List available backups
./run-prs --backup-list

# Restore a specific backup file from view-prs/data/backups
./run-prs --backup-restore check-open-pr-updates.user-state.json.user-state.20260410T182500Z-12345-999.bak
```
