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
- UI: `src/ui/` (`index.html`, and `react-app.tsx`, which mounts the app)
  - Components: `src/ui/components/` (the page layout and header in `components/shell/`)
  - Contexts, Providers and hooks: `src/ui/state/`
  - UI helpers: `src/ui/helpers/`
  - Stylesheets: `src/ui/styles/` (one per area, linked from `index.html`; `tokens.css` holds the design tokens)
- UI tests: `src/ui/integration-tests/`
- CLI/update scripts: `src/script/`
  - Script tests: `src/script/integration-tests/`
- Backfill tools: `src/backfill/`
- Schema and validation: `src/schema/`
- End-to-end (real browser) tests: `e2e/`

Compatibility note: migration shims were removed in Phase 3. Use canonical `src/` paths and npm scripts only.

## Architecture Snapshot

- Planning and phased modernization checklist: `AI_MODERNIZATION_PLAN.md`
- Vanilla-to-React UI migration (complete): `docs/history/REACT_MIGRATION_PLAN.md`
- UI redesign (the current layout): `UI_REDESIGN_PLAN.md`
- Window-bridge elimination, the migration's last step (complete): `docs/history/WINDOW_BRIDGE_ELIMINATION_PLAN.md`
- Server-side helper extraction/integration status: `PHASE_8_STATUS.md`

High-level layering intent:

- UI composition/wiring: `src/ui/react-app.tsx` (the Providers) and `src/ui/components/shell/AppShell.tsx` (the page it renders)
- UI components: `src/ui/components/`
- UI pure helpers: `src/ui/helpers/`
- Server routes/orchestration: `src/server/app.js` and `src/server/routes/`
- Server reusable logic: `src/server/helpers/`
- Server state/file I/O boundaries: `src/server/storage/`

## Architecture Guardrails

Target module layout by layer:

- UI composition/orchestration: `src/ui/react-app.tsx` and `src/ui/components/shell/AppShell.tsx` (Providers in `src/ui/components/` and `src/ui/state/`)
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

- New UI behavior should default to component + helper extraction, not direct growth of `src/ui/react-app.tsx` or `AppShell.tsx`.
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
npm run typecheck
npm run check:all
```

Script guide:

- `npm run test:app`: server route/integration/scheduler suites (`src/server/integration-tests/`)
- `npm run test:ui`: UI suites (every test under `src/ui/`: `.test.js`, `.test.jsx`, `.test.ts`)
- `npm run test:script`: shell script Jest harness (`src/script/integration-tests/*.test.js`)
- `npm run test:schema`: schema-focused Jest suites (`src/schema/integration-tests/`)
- `npm run test:deps`: dependency guard/unit suites (`src/dependencies/integration-tests/`)
- `npm run test:backfill`: backfill-focused suites (`src/backfill/integration-tests/`)
- `npm run test:all`: guard + full Jest run (no coverage output)
- `npm run test:coverage` / `npm run test:ci`: guard + full Jest run with coverage output (`coverage/lcov-report`)
- `npm run typecheck`: TypeScript type check, no output files (`tsconfig.json` for UI source, `tsconfig.test.json` for tests; also run by CI)
- `npm run check:all`: dependency check + lint + `typecheck` + persisted-schema validation + `test:coverage` (updates `coverage/lcov-report` automatically)
- `npm run test:e2e`: real-browser Playwright suite (`e2e/*.spec.js`) against a live server; not run as part of `test:all`/`check:all`
- `npm run stability:heap-check`: standalone long-session heap-growth diagnostic (`e2e/stability/long-session-heap-check.js`), run on demand, not part of any `test:*`/`check:*` script

UI test placement conventions:

- Unit tests for UI components and UI helpers should be co-located next to the source file:
  - `src/ui/components/*.test.js`
  - `src/ui/helpers/*.test.js`
- Shared fixture/factory modules should live under `src/ui/test-fixtures/` and expose reusable builders.
- Integration/wiring tests should remain centralized under `src/ui/integration-tests/`:
  - `index.html.test.js`
  - `index.page.memory-leak-prevention.test.jsx` (the three `index.page.*` names predate `index.page.js`'s deletion; they now test React/helper code)
  - `index.page.notifications.test.js`
  - `index.page.trends.test.js`
- `npm run test:ui` runs every test under `src/ui/` (`jest src/ui`).
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
  - The Node server serves this build when started with `NODE_ENV=production` (`NODE_ENV=production node src/server/server.js`; in PowerShell, `$env:NODE_ENV = 'production'; node src/server/server.js`). Without a build it answers with how to make one; rebuild after UI changes, since it doesn't watch `src/ui/`

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

The UI also polls scheduler state independently of `dataVersion`, so the Activity popover's scheduled jobs update even when the underlying PR data file has not changed.

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
- Before refreshing, it converts notes saved in the old stories format (separate `rallyStories`/`rallyLinks` lists, paired by position) to `stories: [{ name, url }]` in both the user state and data files. Each changed file is written through the server's state storage (its protected-write policy, plus a backup in `data/backups/` named `*.stories-migration.*.bak`) under the same lock as the refresh script. The dashboard's own notes saves don't take that lock, so the file is re-read just before writing and the conversion redone if it changed; it is still safest to run while you aren't saving notes. The conversion covers every note whatever `--repo` is (notes are stored by PR number, not repo). `--dry-run` only reports what would change, and `--migrate-only` skips the refresh. The app reads the old format either way (and any notes save rewrites the whole user state in the new format), so this only tidies the files.
- `--data`/`--user-state`/`--schema`/`--script`/`--backup-dir` override paths are relative to the current directory.

Common commands:

```bash
cd view-prs

# Inspect candidates only
npm run backfill:missing:dry -- --max-prs 30

# Only convert old-format stories (no GitHub refresh)
npm run backfill:missing -- --migrate-only

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

The page has three views, chosen by the tabs in the app header: `Pull requests` (the filter bar, the PR table in sections, and the detail pane docked beside it), `Review stats` and `Authors`. The header also shows the repo (or how many repos the table holds), the latest status, when the data was last updated, `Quick check all`, `Activity` (a popover of background jobs) and `Settings` (a drawer with running the script, the rules, backfill, the action log, actor names and export).

When localhost is running, the server starts an automatic background refresh for `view-prs` data, driven by a single per-repo-aware dispatcher (replacing three independent timers) so open PRs get checked often and cheaply while merged/closed PRs don't pay for a full re-fetch unless something actually changed:

- **Quick check** (every 5 minutes per repo, configurable via `VIEW_PRS_QUICK_CHECK_INTERVAL_MS`): a cheap listing-only pass (`check-open-pr-updates.sh --quick-check`) that compares each PR's GitHub `updatedAt` against the cached value - no comments/reviews/CI/diff fetching. Because it always re-lists every currently-open PR from GitHub (not just ones already tracked), a brand-new PR is detected the same way a changed one is - there's no cached row to match against, so it's reported pending. When an **open/draft** PR looks changed (or new), a targeted full refresh for just that repo fires immediately (a "fast-follow") instead of waiting for the next full-sweep timer. When a **merged/closed** PR looks changed, it now gets the exact same immediate fast-follow treatment (fixed - previously it only sat flagged until the merged/closed drain's own, actually *longer*, 30-minute interval).
  - A quick check does nothing if a full auto refresh for the same repo is already running, to avoid overlapping GitHub API calls. If that happens, it's retried immediately once that refresh finishes, rather than waiting for the next 5-minute tick - otherwise, for a slow multi-repo sweep, detecting a new or changed PR could take noticeably longer than the quick check's interval would suggest.
  - `Last skip` on the quick check's row in the Activity popover (and `lastQuickCheckSkipReason` in the scheduler API) shows why the most recent quick check didn't run, if it didn't - useful for spotting exactly this kind of delay.
- **Merged/closed drain** (every 30 minutes per repo, configurable via `VIEW_PRS_MERGED_FULL_SWEEP_INTERVAL_MS`): batches whatever the quick check queued for merged/closed PRs into a full refresh. If nothing was queued, it does nothing - no full fetch runs.
- **Full sweep** (every 15 minutes per repo, configurable via `VIEW_PRS_AUTO_INTERVAL_MS`): runs regardless of the quick check, as a safety net.
- Any of the above skips if a manual `Run script` action completed in the previous 15 minutes.
- Each repo's cadence/priority can be overridden individually via a `schedulerRepoConfig` key in the existing `/view-prs/user-defaults` JSON blob (`PUT` the whole object, merging your own change in - a `PUT` replaces the file, it doesn't merge for you), e.g. `{"schedulerRepoConfig": {"owner/repo": {"priority": 8, "quickCheckIntervalMs": 120000}}}`. There's no settings form for this yet; the Activity popover's "Dispatcher queue" section shows each repo's effective priority/cadence read-only. All of the above - and every repo configured - shares one global ceiling on concurrent `gh` processes (`VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET`, default `8`), so a burst of due work across many repos degrades gracefully (spilling into the next ~5s tick, `VIEW_PRS_DISPATCHER_TICK_INTERVAL_MS`) instead of spawning unboundedly many `gh` calls at once.
- On successful full refresh, `check-open-pr-updates.data.json` is updated and the UI detects the new run and rerenders automatically.
- While a run is in progress, PR rows currently being refreshed show a small spinner below the PR number link and above the relative "updated ... ago" text without forcing a full table rerender.
- A PR flagged by the quick check but not yet picked up by a full refresh shows an `Update queued` badge in its STATUS cell.
- During long runs, open/draft PR indicators and data refreshes are intentionally prioritized ahead of closed/merged work so the most actionable rows settle first.
- When auto refresh includes multiple repos, refreshes run with bounded repo concurrency (default `2`), configurable via `VIEW_PRS_AUTO_REPO_CONCURRENCY`.
- A merged PR's diff is fetched once and never re-fetched afterward - the diff cache fingerprint for merged PRs depends only on the (immutable) commit set, not on `updatedAt`, so later metadata-only changes (a new comment, a label edit) never trigger a redundant diff re-download.

An **Activity** button in the app header (with a count of running jobs and queued bulk chunks) opens a popover under it showing all of this background activity in one place. Esc, its close button, a click or Tab outside it, or scrolling the page closes it:

- **Scheduled background jobs** (auto refresh, quick check, merged/closed drain) - pushed live over Server-Sent-Events (`GET /view-prs/events`), not polled. Per-job-type status (running/idle, last result), not ordering - a quick check that's blocked by an in-progress auto refresh shows "Waiting on auto refresh" rather than a queue position. Any PRs quick-check has flagged as changed but the merged/closed drain hasn't picked up yet show as "Update queued" on that row.
- **Dispatcher queue** - the per-repo-aware dispatcher's own real, ordered task list (one entry per repo per job type), shown in the exact order it'll actually run: running first, then due (highest priority first), then scheduled (soonest first). Also where each repo's effective priority/cadence (including any `schedulerRepoConfig` override) is visible.
- **Backfill** and **in-flight requests from this browser tab** - both still polled (every 5s and 1s respectively), shown in the popover as-is.
- **Bulk Ack/Clear or Apply-label queue** - the other real ordered queue: a batch larger than 5 PRs is split into chunks run a few at a time, and the popover shows each chunk's real position and outcome (including a chunk that failed, distinct from one that succeeded).
- If the live connection drops, the popover shows its own status (reconnecting/offline).

The 30s PR-data poll itself isn't fully retired - it's the only mechanism that catches a change made from a *different* browser tab or user, which has no push hook. But ack, apply-label, a manual "Run script", and "Request more merged PRs" each push a lightweight signal the moment they've actually written data, so every other open tab refreshes immediately instead of waiting out that poll's own interval; it remains as a slower fallback for anything outside those four actions.

Optional tuning via env vars:

- `VIEW_PRS_EVENTS_HEARTBEAT_INTERVAL_MS` (default `25000`): how often a keep-alive comment is written to an idle `/view-prs/events` connection.
- `VIEW_PRS_EVENTS_MAX_CLIENTS` (default `25`): how many concurrent `/view-prs/events` connections are accepted before a further one gets a 503.
- `VIEW_PRS_SCHEDULER_STATE_THROTTLE_MS` (default `250`): caps how often a per-PR progress update (during a refresh) actually pushes an SSE frame - set to `0` to disable throttling entirely.
- `VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET` (default `8`): the dispatcher's single ceiling on total concurrent `gh` processes across every repo/job-type it runs at once.
- `VIEW_PRS_DISPATCHER_TICK_INTERVAL_MS` (default `5000`): how often the dispatcher re-checks what's due. An urgency bump (a quick check finding a real change) isn't affected by this - it triggers an immediate tick regardless.

Use the Settings drawer's Run & check and Script options to run `src/script/check-open-pr-updates.sh` with common update modifiers (`--repo`, `--pr`, `--label`, `--exclude-label`, `--author`, `--limit`, `--merged-limit`, `--jobs`, `--open`, ack/in-review options, and reason/quiet toggles), and view results directly in the page.

UI filter behavior:

- The filter bar above the PR table holds the filters that choose which PRs show. Its header always shows: a `Filters` button (with how many filters are applied) that opens the controls, `Showing N of M PRs`, and a chip per applied filter - its `×` clears that one - with `Clear all`. It opens as you left it (remembered per browser); closed the first time.
- The controls are in three groups: `Rows` (`View scope`, `PR numbers`, `Always show PRs in review`), `Labels and people` (`Labels`, `Excluded labels`, `Authors`, `Assigned to`, `Approved by`) and `Your notes` (the custom metadata filters below).
- Filters affect only what is shown in local views; changing one updates the table at once from existing JSON, without new GitHub CLI requests. They're saved to `view-prs/data/user-defaults.json` and restored on reload.
- `View scope` includes `All stored rows`, `Last run rows`, `Needs attention rows`, and `Needs attention or interacted rows`.
- `Labels` and `Excluded labels` are checkbox dropdowns populated from labels found on currently loaded stored PR rows for the active repo view.
- The `Authors` dropdown displays resolved real names (from `actorsMap`) instead of raw GitHub logins.
- `data/actor-login-aliases.json` can map a current or replacement login to a canonical login when the same person appears under multiple GitHub identities. Example: `{"7c7240971101674017d4597caddf24_uhg": "mthom486_uhg"}`.
- When an actor login alias exists, author filters, assigned-user filters, approver filters, author insights, reviewer statistics, and manual author comments treat the aliased login and canonical login as the same person.
- The `Assigned to` dropdown filters rows to PRs assigned to any selected user.
- The `Approved by` dropdown filters rows to PRs that have at least one approval from any selected user. Options are populated from `metrics.approvals` data on stored PR rows.
- Each list opens by clicking it and closes by clicking it again or anywhere outside; it says how many of its options are selected.
- Retrieved/stored JSON data remains complete so filters can be adjusted later without refetching.
- `Run script` is the primary update operation for refreshing PR data.
- When `PR numbers` is set, it matches against all stored rows and ignores the selected `View scope` value and `Excluded labels` values.

Custom Metadata Filters:

The filter bar's `Your notes` group filters on your own notes:

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
- **Stories**: Filter by the PR's stories (each a name and/or URL)
  - `Any`: Show all PRs regardless of stories
  - `Without any story details`: Show only PRs with no stories
  - `With only story name`: Show PRs with at least one story that has a name but no URL
  - `With only story URL`: Show PRs with at least one story that has a URL but no name
  - `With story and URL`: Show PRs with at least one story that has both
- **Analysis of PR**: Filter by presence/absence of PR analysis text
  - `Any (with or without)`: Show all PRs regardless of analysis
  - `With analysis`: Show only PRs that have analysis text entered
  - `Without analysis`: Show only PRs with no analysis text

These filters are applied locally and work in combination with other visibility filters (labels, authors, approvers, etc.). All custom metadata filters default to "Any" (no filtering).

On page load, the UI automatically reads stored data and renders sections without requiring a new run.

Date columns in the web table (`YOUR LAST ACTIVITY` and `MERGED AT`) use the same display format as the CLI output (`Mon D, YYYY H:MM AM/PM`, local time).

Stored PR table rows now include a `LABELS` column and each row persists the PR label names in JSON.

The `AUTHOR` column in the PR data table displays resolved real names from `actorsMap` when available. It shows the official PR author (styled distinctly, same treatment as elsewhere in the app) plus every other distinct person with a non-merge commit on the branch (merge commits as defined by the "Merge commits" rules below), deduped so a commit author who is also the PR author only appears once.

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
- **My Open & Draft PRs**: your own open and draft PRs (expanded by default)
- **Assigned to Me**: open and draft PRs you're assigned to (expanded by default)
- **Review Requested from Me**: someone else's open and draft PRs where your review is currently requested (expanded by default). GitHub usually drops the request once you submit a review, so the PR leaves this section then.
  - These three compare logins with your actor login aliases resolved; they stay empty when your login isn't known.
  - A review requested from a team you're in doesn't count: the stored data records requested people, not teams' members.
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

- The rules are in the Settings drawer's `Attention rules` section.
- Non-default values in this section are saved to `view-prs/data/user-defaults.json` and restored on reload.
- The server creates `view-prs/data/user-defaults.json` on startup if it does not exist.
- Configurable rules include:
  - NO_ACTIVITY handling mode (`all`, `mine-only`, `none`)
  - whether pending draft comments trigger attention
  - whether merge-only commit activity should be ignored for CHANGED attention
  - whether closed/merged rows should be eligible for attention
  - draft-specific toggles for CHANGED and NO_ACTIVITY attention
  - PR-author thread-resolution policy (`allow-all`, `allow-only`, `deny-only`)
  - actor-based allow/deny lists for thread starters (from Settings › `Actor names`); a saved login stays picked even when the loaded data has no such actor, listed by its login

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

Merge commits:

- The Settings drawer's `Merge commits` section edits them, saved to `user-defaults.json` as `mergeCommitRules` (only when it differs from the default).
- A commit counts as a merge when its headline matches one of the **headline patterns** (regular expressions, one per line, not case-sensitive; default `^Merge\b`, i.e. any "Merge ..." headline), or when it has author logins and every one of them is in the **logins** list (e.g. `dependabot[bot]`).
- The same definition is used everywhere: merge commits don't mark a PR CHANGED (check-open-pr-updates.sh), aren't listed in the `AUTHOR` column, and are what "Ignore merge-only commits for CHANGED" leaves out.
- An invalid pattern is skipped (the editor names it). An emptied patterns list means no headline counts as a merge. In a hand-edited `user-defaults.json`, a list given as a single string is read as one entry, and a malformed one as its default.
- Patterns are checked by both the browser (JavaScript regular expressions) and check-open-pr-updates.sh (jq's Oniguruma). Plain patterns (anchors, literal text, `\b`, `\s`, groups, alternation) behave the same in both; the editor only validates the JavaScript side.
- The old "Use built-in merge commit filter" checkbox (`changeFilters.useBuiltinMergePattern`) is no longer read; the defaults above apply until you save your own rules, and the next save drops the old setting. If you had turned it off and listed your own merge patterns under "Ignore commits matching patterns", those still keep such commits from marking a PR CHANGED; add them to the headline patterns too if the Author column and the merge-only attention rule should treat them as merges.

```json
{
  "mergeCommitRules": {
    "headlinePatterns": ["^Merge\\b", "^Revert \"Merge"],
    "logins": ["dependabot[bot]", "renovate[bot]"]
  }
}
```

Change Detection Filters:

- The Settings drawer's `Change detection` section configures what activity should NOT trigger CHANGED status.
- These filters are saved to `view-prs/data/user-defaults.json` under `changeFilters`.
- Supported filter types:
  - **Ignore comments from these authors**: Filters out general discussion comments (conversation messages, bot notifications, questions, updates) from specified GitHub logins. Use this to ignore informational messages that don't require action.
  - **Ignore reviews from these authors**: Filters out formal code review submissions (created via "Review changes" button with approval/change request states) from specified GitHub logins. Use this to ignore optional reviewers whose approval isn't required.
  - **Ignore commits matching patterns**: Filters out commits whose message headline matches specified regex patterns (one per line). Use this to ignore non-code changes like documentation updates (`^docs:`), test-only commits (`^test:`), or dependency updates (`^chore: update dependencies`).
- Built-in filters:
  - **Approved reviews are always ignored** (cannot be disabled)
  - **Merge commits** never count (see "Merge commits" above)
- Regex patterns for commits:
  - Patterns use PCRE-compatible syntax (jq's `test()` function)
  - Patterns are tested against commit message headline (first line only)
  - Multiple patterns are combined with OR logic
  - Patterns apply in addition to the merge commit rules (unlike those, they're case-sensitive)
  - Example patterns: `^docs:` (ignores doc commits), `^test:` (ignores test commits), `^chore\\(deps\\):` (ignores dependency updates), `(?i)^wip:` (case-insensitive WIP commits)

Comments vs Reviews vs Commits:

- **Comments** (💬) are general discussion messages in the PR conversation tab (created via main comment box). Example: bot notifications, questions, status updates.
- **Reviews** (✅) are formal code review submissions with states (APPROVED, CHANGES_REQUESTED, COMMENTED) created via the "Review changes" button. They affect PR merge status and appear with special badges.
- **Commits** (📝) are code changes pushed to the PR branch. Commit filtering is by headline pattern, plus the merge commit logins.

Example configurations in `user-defaults.json`:

**Example configuration:**

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

- The app header shows the app's name and the repo the table shows (or how many, when the stored rows span several - the list on hover), the views (`Pull requests`, `Review stats`, `Authors`; ←/→ move between them), the latest action's result (a row's Ack, a run, a backfill... - its first line, all of it on hover and in Settings › Run & check), how long ago the data was updated (`Updated 5m ago`, the exact time on hover, marked once it's a day old), `Quick check all`, `Activity` (see below), `Settings` and a link to this README.
- A row's chevron (`Show summary for PR #N`) opens a short summary under it: why it needs attention with a status line (checks, conflicts, approvals, viewed files), the three latest activity events, and the two most recently active open conversations. Any number of rows can be open at once.
- The detail pane, docked to the right of the table, shows the selected PR: a header (title and GitHub link, author, branch with a copy button, previous/next, and close - which hides the pane until a row is clicked), its actions (Update, Ack, In review, Flagged, Add label, JSON), and tabs - Overview (grouped as Review / People / Changes, with Approval risk and Data freshness collapsible), Activity, Conversations (with the open count) and Notes (marked while unsaved), plus Custom insights when the insights hook returns something. The last tab picked stays for the next PR.
  - Select a PR by clicking anywhere on its row that isn't a control (click it again to deselect; a click also shows the pane if it was hidden), with ↑/↓ while focus is in the table, or with its summary's `Show details`. Esc clears the selection.
  - Leaving a PR with unsaved notes (another selection, previous/next, closing or hiding the pane) asks first.
  - The `Detail pane` button above the table shows or hides it; the choice is saved in the browser. While it's docked the table keeps every column, narrower, with cells taking two lines where they need to; the pane stays in view as you scroll.
  - Below 900px wide it opens as an overlay drawer instead (Esc or the backdrop closes it).
  - `View in table` and the `Auto update paused` chips select the PR; a chip also opens its Notes tab.
- An open section's header (its name, count and summary) stays at the top of the window while you scroll through its rows, below the `Auto update paused` banner when that's showing.
- Open summaries, the selection and the pane's tab stay as they are across automatic data refresh rerenders.
- Open inner insight groups (for example the Activity tab's `Daily summary`) also stay open across rerenders.
- Auto data-refresh rerenders are paused while any Notes field has an unsaved edit (text, selects, and comments or stories added or removed).
- Unsaved manual comment drafts and edits in the `Authors` view also pause auto-refresh until they are saved, canceled, or explicitly discarded.
- When auto-refresh is paused, an `Auto update paused` banner appears under the app header - and stays at the top of the window while you scroll - with clickable blocker chips (PR numbers and author-draft chips) that jump directly to the matching unsaved UI, plus a `Discard unsaved` action (manual override to render the pending update and discard unsaved edits).
- Polling failures now show a persistent warning snackbar that includes `Last successful check` and `Last error at` timestamps.
- The polling warning snackbar is automatically cleared after a successful poll.
- The detail pane's Activity tab lists the PR's events grouped by day, newest first: who did what (approved, requested changes, commented, pushed a commit, merged the PR...), when (the full time on hover), a link to GitHub, and the comment or review text in full - long ones fold behind `Show more`. One person's run of commits on a day is one line that expands to list them. The PR author's name and yours are styled.
  - `Since I last looked` shows only what happened after your last activity on the PR or your last Ack, whichever is later, with a button to show the earlier events; `All` shows everything, with a divider where the events you'd already seen begin. Without either time, only `All` applies.
  - Chips filter by event type (Commits, Reviews, Comments, PR events), each showing its count. The scope and types stay as picked for the next PR.
  - The daily summary table (below) is a collapsed group at the end.
- The Activity tab suppresses duplicate `review (COMMENTED)` items when the same event content is already represented by a thread or top-level comment item.
- The detail pane's Conversations tab lists the PR's review threads, grouped by file (in line order, threads not on a file last). Each group collapses.
  - A summary line counts the unresolved threads, those waiting on you, and any resolved by the wrong person.
  - Chips filter to `Unresolved` (the default, which includes threads resolved by the wrong person), `Waiting on me` (unresolved threads you started or replied in whose latest comment is by someone else or mentions you; only shown when your login is known; without it, `Unresolved` applies) or `All`. Each shows its count, and the choice is kept per PR. A note says how many threads the filter hides, with a `Show all` link.
  - Each thread is one line: who started it, the start of its first comment, its line, its state, the number of replies, and `outdated`/`Pending` where they apply. It expands to show every comment as markdown, who resolved it, and a link to it on GitHub.
  - `Next unresolved` opens and focuses each thread `Unresolved` shows (so those resolved by the wrong person too) in turn, opening its file group and switching from `Waiting on me` to `Unresolved` if that filter would hide it.
  - Threads the PR author resolved against the thread-resolution rule (Settings › Attention rules) are flagged, with an explanation when opened.
  - Top-level PR comments and review summaries are collapsed groups at the end.
- Review events only show a `View` link when the URL points to a specific anchor, not just the PR root.
- Rows with pending thread comments show a `Pending comments: N` chip in the title cell and a `Needs attention` icon.
- `Open conversations with me` counts unresolved conversations where you participated (started or commented).
  - If viewer identity cannot be determined, it safely falls back to total open conversations and omits `with me` wording.

### Custom insights hook

The detail pane can show a `Custom insights` tab populated by your own script, for whatever your team wants surfaced there that isn't already part of the dashboard (a link to an internal tracker, a policy check, org-specific metadata, etc.). It's off by default and never shipped with the repo, since what's worth surfacing here is inherently specific to your org.

To enable it:

1. Write an executable script (any language with a shebang, or a compiled binary) that reads a single JSON argument and prints HTML on stdout.
2. Keep it out of the repo, or under the gitignored `local-hooks/` directory if you'd rather keep it alongside the checkout.
3. Set `VIEW_PRS_INSIGHTS_HOOK_SCRIPT` to its absolute path before starting the server. Optionally set `VIEW_PRS_INSIGHTS_HOOK_TIMEOUT_MS` (default `10000`) to bound how long it's allowed to run.

The script receives one JSON-encoded argument shaped like:

```json
{
  "repoOwner": "acme-org",
  "repoName": "acme-repo",
  "repo": "acme-org/acme-repo",
  "prId": "123",
  "prUrl": "https://github.com/acme-org/acme-repo/pull/123",
  "sourceBranch": "feature/x",
  "targetBranch": "main",
  "title": "Add feature",
  "description": "",
  "status": "open",
  "author": "octocat",
  "lastCommitDate": "2026-01-02T00:00:00Z",
  "lastCommitId": "abc1234"
}
```

Notes and caveats:

- `status` is one of `open`, `draft`, `merged`, or `closed`.
- `description` is currently always empty - the PR body/description isn't part of the data this dashboard persists, so there's nothing to pass through yet.
- `description` is truncated to 4000 characters if it's ever populated, to stay well under OS command-line length limits (the whole JSON blob is passed as a single argument).
- The script is invoked via `bash -c 'exec "$0" "$@"' <scriptPath> <jsonArg>` (not spawned directly), so it's launched through Git Bash the same way every other script in this app is - this matters on Windows, where a script's shebang line is only honored when something (here, bash) actually interprets it; the OS itself won't.
- Anything other than well-formed HTML on stdout is discarded: an unset/missing/non-executable script, a timeout, a non-zero exit, or empty output all just mean the `Custom insights` section doesn't render. Nothing is shown to the end user for a script that isn't configured or fails.
- **When a *configured* script does fail**, the browser console logs a `[insights hook] ...` warning with the failure reason (exit code/timeout plus up to 500 characters of the script's own stderr) so you have something to debug from. That same detail is also in the `GET /view-prs/insights-hook` response body. Because this reaches every browser viewing that PR row (not just whoever maintains the script), avoid having the script print anything sensitive (tokens, internal paths, environment dumps) to stderr on failure.
- The returned HTML is sanitized client-side with DOMPurify (script execution/event handlers stripped, `<style>`/`<link>`/`<base>`/`<meta>`/`<form>` tags forbidden since those can affect the whole page - or, for `<form>`, be used to phish input - rather than just this section, and `target="_blank"` links get `rel="noopener noreferrer"` added automatically) and rendered inside a CSS-contained box (`contain: layout paint style`, scrollable, capped height) so a hook's own layout/positioning can't bleed into or cover the rest of the page. None of that makes the script itself sandboxed, though - it's still something you're trusting to run locally with your server's permissions, the same as any other script you'd add to this repo.

In the UI table, `TITLE` text is shown without embedded `[CHK:...]` and `[MRG:...]` tags.

The UI includes:

- A `Settings` drawer, opened from the app header (Esc, its close button or the backdrop closes it). Its sections are down the left (↑/↓ move between them; in a narrow window they're a row across the top, with ←/→): `Run & check` (the latest status message, `Trigger auto run`, the PR numbers with the run buttons below, applying a label, and the latest request output), `Attention rules` (the Needs Attention rules; the thread starters list shows for the policy that uses it), `Merge commits` (the headline patterns and logins that mark a merge commit), `Change detection` (the comment/review authors and commit patterns to ignore), `Script options` (repo, limits, parallel jobs, open mode, ack/reason/quiet), `Backfill` (the background backfill's status, Start/Stop/Refresh status, and its log), `Action log` (the server's log of actions), `Actor names` and `Export`. Backfill loads its status at page load and again each time its section opens; Action log, Actor names and Export load the first time their section opens (Action log and Actor names reload each time it opens again).
- `Run script` (full run to refresh PR data)
  - PR number input accepts numeric IDs separated by commas, whitespace, or mixed delimiters
  - request payload maps form values as: `author` falls back to an empty string when no author is selected, and checkbox fields (`ackChanged`, `showReason`, `quiet`) are sent as booleans
- `Apply ack only` (ack updates only)
- `Apply clear only` (clear updates only)
- `Apply label` (applies an existing GitHub label to the PR number(s) in the same `pr-numbers` field the Ack buttons use)
  - the label dropdown is populated from `GET /view-prs/labels` for the currently selected repo; only labels already defined on the repo (via `gh label list`) can be chosen - there is no free-text/create-new-label input
  - `Reload labels` reloads the dropdown for the current repo
- a row's More menu (`More actions for PR #N`) › `Add label` applies an existing label to just that PR (excludes labels already on the row)
- `Apply filters (local)` (updates visible rows and persisted defaults without calling `/view-prs/run`)
- Settings › `Export` to build and export JSON from currently visible PR rows
- Settings › `Actor names` to view and edit both display-name mappings and canonical login aliases
  - display-name mappings are stored in `view-prs/data/actor-name-cache.json`
  - login aliases are stored in `view-prs/data/actor-login-aliases.json`
  - when `/view-prs/data` encounters a previously unseen non-empty `authorLogin/login`, that login is automatically added to the actor-name cache (using the best available display name)
  - display-name entries load from `GET /view-prs/actor-name-cache` and save with `PUT /view-prs/actor-name-cache`
  - login alias entries load from `GET /view-prs/actor-login-aliases` and save with `PUT /view-prs/actor-login-aliases`
  - if either JSON file is missing, it is created automatically on first read
  - writes that would clear all display-name mappings or all login aliases are rejected to prevent deleting all configured mappings
  - login alias rows must include both an alias login and a canonical login, and the two values must differ
- a row's Actions: `Ack` as a button, and in its More menu `Mark in review` / `Remove from in review`, `Flag` / `Remove flag` and `Update PR` (saved at once); whether a PR is in review or flagged shows as an icon in its Signals column
- per-row Notes editor saved to `check-open-pr-updates.user-state.json` via `POST /view-prs/notes`
  - note `createdAt`/`updatedAt` values are normalized to UTC second precision (`YYYY-MM-DDTHH:mm:ssZ`) so persisted user-state remains schema-valid
- The `Authors` view's manual comments editor, saved to `check-open-pr-updates.author-comments.json` via `GET/POST/PUT /view-prs/author-comments`
- PR-number-column relative `↻ ... ago` indicators are based on the latest successfully rendered run timestamp (`lastRun.updatedAt`), not per-row stale timestamps.
- `YOUR LAST ACTIVITY` / `MERGED AT` date cells show five small gray indicator boxes per row for saved notes fields (custom comments, other notes, PR difficulty, stories, analysis); boxes are filled when data exists and outlined when empty, and the difficulty box displays the saved numeric level when present
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

Export behavior (Settings › `Export`):

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

The detail pane's Notes tab holds your own notes on the PR:

- `Comments`: rows of author, tone (positive, negative, neutral) and note
- `Other notes`
- `PR difficulty` (1-5)
- `Stories`: one row per story, a name such as `US12345` and its URL
- `Analysis of PR`

Each field shows read-only, with an `Edit` button (`Add` while it's empty) that turns it into inputs with their own `Save` and `Cancel`. Saving a field saves it alone: the other fields keep what was saved, so an unsaved edit in another field stays unsaved. A field's `Save` is enabled only once it differs from what's saved; a comment row with neither an author nor a note doesn't count and isn't saved. Notes saved elsewhere (another window) while the PR is open show up after the next refresh, so saving one field never writes the others back as they were; a field you're editing keeps what you typed. Stories show their names (or URL, without one), each with a button opening its link - only for `http(s)` addresses. Unsaved edits survive switching to another pane tab.

Stories are persisted in user state as `stories: [{ name, url }]`. Notes saved before stories existed kept names (`rallyStories`) and URLs (`rallyLinks`) in two separate lists; those are read as stories, paired by position, and saved in the new shape on the next write.

The `Authors` view's manual comment fields include:

- comment text (textarea)
- sentiment (`positive`, `negative`, `neutral`)
- save comment
- inline edit for any saved comment

Unsaved manual-comment drafts and inline edits in the `Authors` view are preserved across internal rerenders and pause auto-refresh until they are saved, canceled, or explicitly discarded.

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

### Activity Column

The Activity column shows how long ago, in two short lines:

- **Author**: the PR author's last activity - their latest event in the PR's activity (a commit, comment, review...), the same events the detail pane's Activity tab lists. `–` when none is recorded.
- **You**: your own last activity on the PR (the `baseline` field), shown only when you have any.

The tooltip has both exact times, when the PR merged or closed, and when it was last checked for updates. The ages are underlined (dotted) when an open PR's last check is stale.

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

In the Review column, a line under the signals shows people as small initials badges, each group labelled so it reads without hovering:

- **Assigned**: every assignee.
- **Review requested**: you, when your review is currently requested but you aren't assigned (so "I'm reviewing this" stays visible). GitHub drops the request once you submit a review, and the badge goes with it. Other requested reviewers are in the Reviewers row of the detail pane's Overview.
- Your own badge is highlighted; each badge names its person on hover, with `(you)` and `(review requested)` added where they apply.

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
- Both the per-row `+ Label` dropdown and the Settings drawer's `Apply label` control (Run & check) call this same endpoint.

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
- **Activity Timeline filtering**: The daily summary on the detail pane's Activity tab displays all dates with activity, and omits weekend dates (Sat-Sun) without activity. A run of consecutive weekdays (Mon-Fri) without activity is consolidated into one "No activity for N days" row (with the date range) instead of a dash row per day; an isolated single no-activity weekday still shows its own dash ("-") row. This reduces visual clutter while maintaining visibility of business-week activity patterns.
- The `Review stats` view has its own controls (`Sort by`, `Filter`, `Min comments`, `Top reviewers`) to rank and focus reviewer activity. Reviewer names are resolved using `actorsMap` display names. The statistics view features prominent graph cards:
  - **Metric totals**: Comments, reviews, and approvals from visible table rows (clickable to sort table)
  - **Activity over time per author**: Sparkline bars showing daily review/comment activity trends for the top 6 reviewers across the last 31 days (helps identify contributor patterns and periods of high engagement)
  - **Top reviewers by comments/approvals/signals**: Stacked bar composition charts with click-to-sort interactivity
  - Source rows in the statistics view include a `View in table` button that switches to the Pull requests view, scrolls to the matching PR, and shows it in the detail pane.
- The `Authors` view shows per-PR review notes grouped by author. The author filter dropdown and metadata cards use resolved real names from `actorsMap`. PR cards in the Authors view include a `View in table` button with the same navigation behavior.
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
