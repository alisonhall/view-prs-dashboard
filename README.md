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

The backend answers only on this computer (`127.0.0.1`). It has no sign-in, and anyone who can reach it can read your notes and data, start runs, and apply labels on GitHub as your `gh` account. `VIEW_PRS_HOST=0.0.0.0` opens it to your network; `VIEW_PRS_PORT` changes the port. Pages on other websites can't use it through your browser either: a request must be addressed to this computer (`localhost`, `127.0.0.1` or `[::1]`, so a site can't point its own name at it), a change must come from a page on this computer or the server's own address, and only JSON bodies are read. Requests that don't come from a browser page (curl, scripts) aren't affected.

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
- People (names and logins): `data/actors.json`
- JSON Schema: `src/schema/check-open-pr-updates.data.schema.json`
- Author comments schema: `src/schema/check-open-pr-updates.author-comments.schema.json`
- Persisted data schema: `src/schema/DATA_SCHEMA.md`

> Note: use `./run-prs --help` or `npm run cli-view -- --help` for script options.

## Requirements

- `gh` (GitHub CLI), authenticated (`gh auth login`)
- Bash shell (on Windows: [Git for Windows](https://git-scm.com/download/win)'s Git Bash, or WSL - there's no bash on `PATH` in a native `cmd.exe`/PowerShell terminal)
- Node.js: the script computes each PR's row in `src/script/compute-pr-row.js` - one process a row, where that was dozens of `jq` calls (about 6x faster). From the web UI it uses the server's own Node; run standalone, `node` on `PATH`

`jq` is provided automatically by `npm install` (via the `node-jq` dependency, which downloads a real jq binary into `node_modules`) - no manual install needed. `check-open-pr-updates.sh` prefers that bundled binary over a system-wide `jq`, falling back to one on `PATH` only if `node_modules` is missing.

Run `npm run deps:check` any time to verify all of the above (plus a few coreutils the script also needs) are actually present - it also runs automatically before `npm test` and (as a non-blocking warning) after `npm install`. Once the server is running, `curl -s http://localhost:9000/health/deps` reports the same thing live, plus a `ghAuthenticated` field (`true`/`false`/`null` if `gh` isn't installed at all) - `gh` being installed but not logged in (`gh auth login`) is treated as unhealthy (`ok: false`, `503`) since that's the one dependency issue `deps:check`/`postinstall` can't catch on their own without an extra network call.

Optional for date formatting fallback:

- `gdate` / GNU `date -d` / macOS `date -j`

## Reusing unchanged rows

A full run (not a run of chosen PRs, or one that acks) reuses a stored row as it is, instead of fetching the PR's details again (about 6 `gh` calls), when the PR hasn't changed on GitHub - its listed `updatedAt` is the row's `sourceUpdatedAt` (since 2026-11-01; before, every PR was fetched every run unless `VIEW_PRS_SKIP_UNCHANGED=1`, and even then reuse rarely happened). The row also has to be:

- for the same section, the same viewer (`viewerLogin`), and the same local state (`localStateKey`: the PR's ack, re-verify and in-review marks, the change filters and merge-commit rules, and a version the script bumps when it changes what it computes) - acking a PR or changing a filter computes its row again;
- complete (every field a row has);
- for an **open/draft** PR, fetched in full within `VIEW_PRS_OPEN_REVALIDATE_SECONDS` (default 14400, 4 hours), since CI, mergeability, viewed files and resolved threads change without moving `updatedAt`. A **merged/closed** PR's row is reused for as long as the PR doesn't change. Between those full fetches, the quick check's live summary keeps the collapsed row current, and queues for update any open PR whose number of unresolved threads differs from its row's, so its threads (and the status that depends on them) are refetched within minutes, not hours.

A reused row still takes the listing's title, URL, labels and size, and a reused open/draft row this run's CI and mergeability (one call each). It keeps its `fetchedAt` - it wasn't fetched - so the live summary (see the automatic background refresh) keeps its viewed files and open threads current in between, and its CI and mergeability once listed after this run fetched them (`ciFetchedAt`). A merged/closed PR that has changed is fetched without its viewed files when its stored row was already merged/closed: those counts stand. Its first row after merging or closing fetches them, since files pushed or viewed after the open row was fetched would otherwise never be counted.

`VIEW_PRS_SKIP_UNCHANGED=0` fetches every PR in full. A `Run script` from Tools always does.

The PRs to fetch have their details, review threads, review comments, review links and viewed files fetched in parallel before their rows are computed: about `--jobs` `gh` calls at a time for the open/draft PRs, shared among the `VIEW_PRS_PREFETCH_GROUP_CONCURRENCY` (3) kinds fetched together, and as many again for merged/closed ones alongside. Before 2026-11-01 only the details were: the other four silently fetched nothing, and each was fetched one at a time with its row.

The UI also polls scheduler state independently of `dataVersion`, so the Activity popover's scheduled jobs update even when the underlying PR data file has not changed.

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
- Before refreshing, it converts notes saved in the old stories format (separate `rallyStories`/`rallyLinks` lists, paired by position) to `stories: [{ name, url }]` in both the user state and data files. Each changed file is written through the server's state storage (its protected-write policy, plus a backup in `data/backups/` named `*.stories-migration.*.bak`) under the same lock as the refresh script. The dashboard's notes saves take that lock too (before 2026-11-03 they didn't, so the file is still re-read just before writing and the conversion redone if it changed). The conversion covers every note whatever `--repo` is (notes are stored by repo and PR number - see `DATA_SCHEMA.md`). `--dry-run` only reports what would change, and `--migrate-only` skips the refresh. The app reads the old format either way (and any notes save rewrites the whole user state in the new format), so this only tidies the files.
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

The page has three views, chosen by the tabs in the app header: `Pull requests` (the filter bar, the PR table in sections, and the detail pane docked beside it), `Review stats` and `Authors`. The header also shows the repo (or how many repos the table holds), the latest status, when the data was last updated, `Activity` (a popover of background jobs), `Tools` (a drawer of things to do: running the script and the quick checks, backfill, export and the action log) and `Settings` (a drawer of choices kept: sources, background updates, the rules, people and appearance).

Which repos and PRs the background refresh covers is kept in `data/check-open-pr-updates.sources.json` (`VIEW_PRS_SOURCES_FILE`): repo **subscriptions** - a repo's recent PRs, or only listed PR numbers - and PRs added one by one. The repos it fetches in full are those subscribed to their recent PRs, plus any in `VIEW_PRS_AUTO_REPOS` (comma-separated, read at each check), falling back to `VIEW_PRS_REPO` only before the file exists (so unsubscribing the last repo doesn't bring it back). The file is created the first time it's needed, subscribing every repo the dashboard already had rows for, so nothing changes when it appears; after that, a repo with stored rows isn't fetched in full just for having them. A full manual "Run script" of a repo subscribes it (a run of chosen PRs doesn't). An unreadable file is kept beside it (`.unreadable-<time>`). Once the file has been created, a marker beside it (`.seeded`) stops it being seeded again: a file deleted or set aside later starts empty, rather than subscribing every repo with rows again (those of PRs added one by one included) - and records that it did (`lost`, with where an unreadable one was kept) until the next change, so Settings › Sources can say why every row is hidden.

**Add PR** in the header adds a PR by its URL (`https://github.com/owner/repo/pull/123`, any page of it, or `owner/repo#123`) from any repo, a GitHub Enterprise one included, without subscribing to the rest of that repo (`POST /view-prs/tracked-prs` with `{ url }`; `DELETE` with `{ repo, number }` stops tracking one, leaving its row; `GET /view-prs/sources` lists them). The server checks `gh` finds it, then fetches it - waiting for its repo's run if one is in progress - and answers with whether that worked (`fetched`), or, after 25 seconds, that it's still going (`fetched: null`, 202). PRs added this way, and a `numbers` subscription's, are refreshed on their own (the script's `--prs`; quick checks look them up with `--quick-check-numbers`), never with a full run of their repo, while they're open or merged/closed within the last 30 days; in a repo also subscribed to its recent PRs, each full run is followed by a run of those it didn't refresh (too old for its listings). A run of chosen PRs that fetched some of them counts as done, with the ones it couldn't fetch (deleted, or no longer visible) logged - so one gone PR doesn't fail every run of its repo and trip its circuit breaker; one that fetched none still fails. A repo on a GitHub Enterprise host is fetched with `GH_HOST` set to it - its runs, quick checks, live summary, diffs, labels and backfill alike (only the actor-name and viewer lookups, which aren't a repo's, stay on github.com) (rows are still keyed `owner/repo#number`, so two hosts' repos of the same name would share rows). `POST /view-prs/run`'s `prNumber` takes several, comma-separated, as one run of them (`--prs`).

**Settings › Sources** lists the subscriptions - each following its repo's recent PRs, or only listed PR numbers - and the PRs added one by one, with a mark on any its last run couldn't fetch (deleted, or no longer visible to `gh`; saved with the scheduler state as `unreachablePrSince`, so a restart keeps them, until a run fetches the PR or it's removed). There you can subscribe to a repo, change what a subscription follows, unsubscribe, or remove an added PR (`PUT`/`DELETE /view-prs/subscriptions` with `{ repo, mode, numbers }` / `{ repo }`). The page shows only the rows of repos in view: those fetched in full (subscribed to their recent PRs, or in `VIEW_PRS_AUTO_REPOS` - listed there as fixed, as unsubscribing can't hide them), and each PR added one by one or listed by a subscription. Unsubscribing hides a repo's rows - they stay stored, notes and all, and come back if it's subscribed again - but not PRs added from it by URL. A manual run of chosen PRs in a repo that isn't subscribed adds them, so their rows stay in view. Until the sources file exists, every row shows, and the section still offers to subscribe (which creates it). Subscription repos must be names GitHub could have (letters, digits, `.`, `_`, `-`, not leading). The repo fields (Run & check's options for Run script, and the subscribe form) suggest the repos the page knows of. Beside each repo followed for its recent PRs, `Fetch older merged PRs` fetches up to 30 of its latest 100 merged PRs that aren't stored yet - the background updates only fetch recently merged ones (`POST /view-prs/merged/request-more` with `{ repo, count, scanLimit }`, refused for a repo whose rows wouldn't all show). The Activity popover lists it while it runs and once it's done. It replaced the page's `Request more` button, which fetched them for whichever repo the last run was of. Each repo, and each PR added one by one, has `Timing…`, which opens Settings › Background updates at its repo: one schedule per repo, shared by every PR followed from it.

When localhost is running, the server starts an automatic background refresh for `view-prs` data, driven by a single per-repo-aware dispatcher (replacing three independent timers) so open PRs get checked often and cheaply while merged/closed PRs don't pay for a full re-fetch unless something actually changed:

- **Quick check** (every 5 minutes per repo, configurable via `VIEW_PRS_QUICK_CHECK_INTERVAL_MS`): a cheap listing-only pass (`check-open-pr-updates.sh --quick-check`) that compares each PR's GitHub `updatedAt` against the cached value - no comments/reviews/CI/diff fetching. Because it always re-lists every currently-open PR from GitHub (not just ones already tracked), a brand-new PR is detected the same way a changed one is - there's no cached row to match against, so it's reported pending. When an **open/draft** PR looks changed (or new), the repo's auto refresh runs immediately (a "fast-follow") instead of waiting for the next full-sweep timer - and, unless the full sweep is due anyway, it refreshes only the PRs the quick check queued (`check-open-pr-updates.sh --prs`, open and merged/closed alike), then puts the full sweep back to its time, so a busy repo's fast-follows don't keep pushing the sweep back. When a **merged/closed** PR looks changed, it gets the same immediate treatment through the merged/closed drain. A repo with more than 25 PRs queued gets its full refresh instead (each PR in a run of chosen PRs is looked up on its own; past that, listing them is cheaper). Only the PRs refreshed leave the queue, so one queued while a refresh ran stays queued. A fast-follow whose queue emptied before it ran (a manual run refreshed the repo, say) does nothing. And it only refreshes queued PRs when quick checks are all that asked for it: a manual "run now" from the Activity popover stays a full refresh even if a quick check bumps the same repo before it runs.
  - A quick check does nothing if a full auto refresh for the same repo is already running, to avoid overlapping GitHub API calls. If that happens, it's retried immediately once that refresh finishes, rather than waiting for the next 5-minute tick - otherwise, for a slow multi-repo sweep, detecting a new or changed PR could take noticeably longer than the quick check's interval would suggest.
  - A skipped quick check shows under the Activity popover's `Just finished`, with why (and `lastQuickCheckSkipReason` in the scheduler API) - useful for spotting exactly this kind of delay.
- **Live summary** (with each quick check): one paginated GraphQL listing of the repo's open PRs (`gh api graphql`, 25 a page, newest created first - an order that can't change while the pages are read) with what a collapsed table row shows - title, labels, draft state, CI state, mergeability, viewed files, open threads, size, assignees and requested reviewers. It's saved in `data/check-open-pr-updates.live-summary.json` (`VIEW_PRS_LIVE_SUMMARY_FILE`) and laid over the rows when the server reads them, so these stay current between full refreshes - including what GitHub changes without moving a PR's `updatedAt` (CI finishing, mergeability as the target branch moves, files marked viewed, threads resolved), which the quick check can't see. A listing only replaces a row's values when it's newer than the row's last full refresh (each row's `fetchedAt`, when the script wrote it). Open/draft rows get `data.live` (whether GitHub has activity the full refresh hasn't fetched yet, or the PR is no longer open - the latter only from a complete listing, not one stopped at its 500-PR limit); when each repo was listed, and its last listing error, are in the data meta (`dataMeta.liveSummary`). A failed listing keeps the last good one and is logged; it doesn't fail the quick check. A quick check of entered PR numbers doesn't list. `VIEW_PRS_DISABLE_LIVE_SUMMARY=1` turns it off (the test setups do). The data version the page polls includes the listing and the PRs queued for update, so both reach the page on its next poll. It includes your user state too, and the manifest carries its Acks, flags and confirmations, so an Ack a run clears (or one made in another tab) reaches the page without a full reload.
- **Merged/closed drain** (every 30 minutes per repo, configurable via `VIEW_PRS_MERGED_FULL_SWEEP_INTERVAL_MS`): refreshes whatever the quick check queued for merged/closed PRs - just those PRs (`--prs`), or the whole repo when more than 25 are queued. If nothing was queued, it does nothing - no fetch runs.
- **Full sweep** (every 15 minutes per repo, configurable via `VIEW_PRS_AUTO_INTERVAL_MS`): runs regardless of the quick check, as a safety net. It fetches only the PRs that changed (and open ones not fetched in full for 4 hours), reusing the other rows - see [Reusing unchanged rows](#reusing-unchanged-rows).
- A repo's full refresh (the sweep, or a fast-follow or drain with too many PRs queued) waits if a manual `Run script` of that whole repo completed in the previous 15 minutes (`manualFullRunAtByRepo` in the scheduler state; a run with no repo counts for every repo). A refresh of just the queued PRs doesn't wait - they changed since - and nor does another repo's. A manual run of one PR doesn't start the wait, and takes that PR off the queue. (Before 2026-10-31 any manual run, even of one PR, held off every automatic refresh in every repo.)
- A quick check of entered PR numbers settles only those: the ones it finds unchanged leave the queue, and the repo's other queued PRs stay.
- Settings › `Background updates` sets each repo's cadence and priority. It lists every repo in Settings › Sources first, each saying how it's followed (`From your sources: its recent PRs`, `2 PRs added one by one`...) - and why one isn't checked: a repo whose PRs followed by number were all merged or closed over 30 days ago - then any other repo the server checks, then any with saved settings but no checks (those wait). Which repos the server checks is asked again whenever the sources change, so a repo just subscribed to shows (before 2026-11-09 it listed only the repos checked when the section first opened). Leave a field empty for its default; a change is saved once typing pauses or the field is left - not a keystroke at a time, so "1" on the way to "15" never schedules a check - and applies on the dispatcher's next tick, a few seconds, without a restart. A saved value outside the form's range (a hand-edited file) is shown as still applying, not as an error. They're saved in `user-defaults.json` as `schedulerRepoConfig`, only what differs from the defaults, e.g. `{"schedulerRepoConfig": {"owner/repo": {"priority": 2, "quickCheckIntervalMs": 120000}}}`:
  - `quickCheckIntervalMs`, `autoRefreshIntervalMs`, `mergedDrainIntervalMs` replace that check's interval for the repo (the form takes minutes, at least 1). A changed interval also applies to the wait already under way: shortening the quick check from 5 minutes to 1 doesn't first wait out the 5.
  - `priority` is a boost (a whole number, -10 to 10 in the form) added to each check's default priority - quick check 5, auto refresh 3, merged/closed drain 1 - so a boosted repo's work goes ahead of other repos' when several are due, and its quick checks still go before its full refreshes. A negative boost lets a repo wait behind the others. (Before 2026-10-31 `priority` replaced all three defaults; a saved value now reads as a boost.)
  - A repo that's saved but no longer checked is listed too, so its settings can be removed.
  - The defaults and the checked repos come from `GET /view-prs/dispatcher/settings`. The Activity popover's `Up next` shows each task's effective priority on hover. All of the above - and every repo configured - shares one global ceiling on concurrent `gh` processes (`VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET`, default `8`), so a burst of due work across many repos degrades gracefully (spilling into the next ~5s tick, `VIEW_PRS_DISPATCHER_TICK_INTERVAL_MS`) instead of spawning unboundedly many `gh` calls at once.
- On successful full refresh, `check-open-pr-updates.data.json` is updated and the UI detects the new run and rerenders automatically.
- While a run is in progress, a PR's row shows the circular arrow beside its number only while that PR is being fetched (the script's per-PR progress markers), and a grey clock while a run of chosen PRs (an update of changed PRs, the drain, a Run script of chosen PRs) hasn't reached it yet - each row on its own, without a full table rerender. Your own actions on a row (Ack, a label, `↻ Update`, a bulk Ack or label) do the same. The server sends them as `activePrNumbers` and `queuedPrNumbers`, `{ repo, prNumber }` pairs. (Before 2026-11-05 no background run's arrows reached the page - they were dropped as not being plain numbers - and a full refresh marked the repo's 15 latest merged PRs busy for its whole run.)
- A PR flagged by the quick check but not yet picked up by a full refresh shows `Details updating` under its title (see [Freshness](#freshness)).
- During long runs, open/draft PR indicators and data refreshes are intentionally prioritized ahead of closed/merged work so the most actionable rows settle first.
- When auto refresh includes multiple repos, refreshes run with bounded repo concurrency (default `2`), configurable via `VIEW_PRS_AUTO_REPO_CONCURRENCY`.
- A merged PR's diff is fetched once and never re-fetched afterward - the diff cache fingerprint for merged PRs depends only on the (immutable) commit set, not on `updatedAt`, so later metadata-only changes (a new comment, a label edit) never trigger a redundant diff re-download.

An **Activity** button in the app header opens a popover under it showing all of this activity in one place, by what you want to know. The button counts what's running or queued (jobs, bulk chunks and your requests - not the page's own data loads), and turns red with a `!` while there's a problem. Esc, its close button, a click or Tab outside it, or scrolling the page closes it:

- **Problems**, at the top and only when there are some: repos paused by their circuit breaker after repeated failures (with `Reset`), live updates disconnected or stale, and backfill status that couldn't be read.
- **Now**: everything running, whoever started it - background jobs (full refresh, update changed PRs, quick check, merged/closed drain) with the repos they're working on, your requests from this tab, bulk Ack/Clear or Apply-label batches (`chunk 2 of 4`; a batch larger than 5 PRs runs in chunks a few at a time), and backfill. Each says `Background` or `You` (`Quick check`, `Quick check all` and `Full refresh now`, and an added PR's fetch - `Fetch added PR` - are yours), how far it's got - `12 of 30 PRs` when its PRs are known (a refresh of chosen PRs, `Fetch older merged PRs`, an Ack's refreshes, a Run script of chosen PRs), `3 PRs so far` when they aren't (a full refresh or Run script), `1 of 2 repos` for a quick check - and how long it's run; a request running longer than usual turns amber, then red. The server keeps the list of what's running (`tasks` in the scheduler state, each with its kind, repos, done and total, and start), so every tab sees everything, including requests made from another tab. The page's own data load only shows once it's slow. It's all pushed live over Server-Sent-Events (`GET /view-prs/events`), not polled.
- **Up next**: the dispatcher's queue in the order it'll run - due tasks first (highest priority first), then scheduled ones (`in 6m`), each with `Run now` - plus a quick check waiting for a refresh, and the PRs a quick check queued for the merged/closed drain. A repo's auto refresh due only because a quick check found PRs changed is `Update changed PRs` (it refreshes just those); otherwise it's its `Full refresh` (the dispatcher's queue says which, as `forChangedPrs`). A task's priority (including any `schedulerRepoConfig` boost) is in its tooltip.
- **Just finished**: background jobs (with the error when one failed, and why when one was skipped) and your requests, newest first - the last 8; `Action log` opens Tools › Action log for the rest, and each item's `Log` opens it at that item's entry (of its kind, logged nearest its time; the filters hiding it are cleared, and it's unfolded) - or says the log hasn't got it, for a run with nothing to do. An auto refresh's job events say which it was (`kind`: `autoRefresh`, `changedPrs`, `mergedQueueDrain` or `addPr` - the drain's refresh isn't listed apart from the drain).
- **What these are**, folded at the bottom: what each kind of activity does, and what it doesn't update - a quick check, for instance, keeps open PRs' title, labels, checks, mergeability and the like current from its listing, but not comments, reviews, commits or the diff, which wait for the update it queues. Each item's name says the same on hover.

The popover was reorganised on 2026-11-05 from seven sections (scheduled jobs, dispatcher queue, circuit breaker, bulk queue, backfill, in-flight requests, recent activity).

PR data changes are pushed too. While a page is connected, the server checks the data version (the data file, the live summary, the update queue, your user state, the sources file and the PRs that couldn't be fetched) every few seconds and sends a `data-changed` event when it moved, so a script run's rows, each quick check's listing and the PRs it queues reach the page within seconds; ack, apply-label, a manual "Run script" and "Request more merged PRs" also send one the moment they've written. The page then fetches only the changed rows (one fetch at a time, however many events arrive), and checks for changes each time the connection opens - including the first, once the page's data has loaded, since the server only pushes what changes after that. Its PR-data poll stays as a safety net: every 5 minutes while the connection is open, every 30s while it isn't. (Before 2026-11-01 only those four actions pushed, and the page otherwise polled every 30s.)

Optional tuning via env vars:

- `VIEW_PRS_EVENTS_HEARTBEAT_INTERVAL_MS` (default `25000`): how often a keep-alive comment is written to an idle `/view-prs/events` connection.
- `VIEW_PRS_EVENTS_MAX_CLIENTS` (default `25`): how many concurrent `/view-prs/events` connections are accepted before a further one gets a 503.
- `VIEW_PRS_EVENTS_DATA_WATCH_INTERVAL_MS` (default `3000`, at least `500`): how often the server checks the data version for `data-changed` while a page is connected. It doesn't check while none is.
- `VIEW_PRS_SCHEDULER_STATE_THROTTLE_MS` (default `250`): caps how often a per-PR progress update (during a refresh) actually pushes an SSE frame - set to `0` to disable throttling entirely.
- `VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET` (default `8`): the dispatcher's single ceiling on total concurrent `gh` processes across every repo/job-type it runs at once.
- `VIEW_PRS_DISPATCHER_TICK_INTERVAL_MS` (default `5000`): how often the dispatcher re-checks what's due. An urgency bump (a quick check finding a real change) isn't affected by this - it triggers an immediate tick regardless.

Use the Tools drawer's Run & check (with its options for Run script) to run `src/script/check-open-pr-updates.sh` with common update modifiers (`--repo`, `--pr`, `--label`, `--exclude-label`, `--author`, `--limit`, `--merged-limit`, `--jobs`, `--open`, ack/in-review options, and reason/quiet toggles), and view results directly in the page.

UI filter behavior:

- The filter bar above the PR table holds the filters that choose which PRs show. Its header always shows: a `Filters` button (with how many filters are applied) that opens the controls, the search box, `Showing N of M PRs`, and a chip per applied filter - its `×` clears that one - with `Clear all`. It opens as you left it (remembered per browser); closed the first time.
- The controls are in four groups: `Rows` (`PRs`, `Only PRs that need attention`, `Always show PRs in review`), `Labels and people` (`Labels`, `Excluded labels`, `Authors`, `Assigned to`, `Approved by`), `Your notes` (the custom metadata filters below) and `Conversations` (`Open conversations with me`, `Waiting on me`, `Resolved for you to check`) - then `Manage saved views` (below).
- Saved views: under the header, a chip per saved view applies its filters in one click - every filter in the bar, the search included, set to the view's (those it doesn't have cleared); the view whose filters are applied is pressed, and clicking it again clears them. Its filters show on hover. `Save as view` names the applied filters while no view has them (another view's name can't be reused, whatever its case). Once you change a filter after applying a view (and no other view has the filters you end up with), it shows `(modified)` with `Update "name"` to save the change into it. `Manage saved views`, at the end of the open bar, lists each view with what it filters on, and `Rename`, `Update to applied filters` and `Delete`; a deleted view can be put back where it was with `Undo`, until you delete another. Until you save one, three starter views are offered - `Needs attention`, `Waiting on me` and `Resolved for you to check` - kept, renamed or deleted like any other once you change the views. The views are saved in `user-defaults.json` (`savedFilterViews`), so every browser has them: a change applies to the views as saved at that moment, so it doesn't undo one made in another browser, and the page reads them again whenever its window regains focus. While `user-defaults.json` can't be read, no views show (one saved then would be lost). A change that can't be saved is undone on the page, which says so, so the views shown are always the ones saved.
- `Search PRs`, beside the `Filters` button, shows the PRs with every word you type - in any order and case - somewhere in their title, author (login or name), branch names, or your notes (comments and their authors, other notes, difficulty, stories' names and URLs, analysis). It works with the other filters (a PR you've marked in review still shows with `Always show PRs in review`, and so does one picked by number in `PRs`). When a word is only in something the row doesn't show, the row says where ("Matches in branch, comments"). `Escape` clears it. Unlike the filters, a search isn't saved: a reload starts without one.
- Filters affect only what is shown in local views; changing one updates the table at once from existing JSON, without new GitHub CLI requests. They're saved to `view-prs/data/user-defaults.json` and restored on reload.
- `Only PRs that need attention` narrows every section to the PRs with the warning icon (Settings › Attention rules decide which). `Open conversations with me` narrows them to PRs with an unresolved conversation you started or replied in (the Review column's speech bubble), and `Waiting on me` to those where such a conversation's latest comment is someone else's or mentions you (the filled bubble, and the Conversations tab's `Waiting on me`). `Resolved for you to check` narrows them to PRs with a conversation you started that someone else resolved, until you confirm it (see the Conversations tab below). With several checked, a PR has to match them all. PRs picked by number in `PRs`, and PRs marked in review with `Always show PRs in review`, show whatever they say. They replaced the `View scope` select (2026-11-05): a saved `Needs attention rows` or `Needs attention or interacted rows` scope comes back as the first, `Conversations resolved for you to check` as the second, and `Last run rows` as neither.
- Each filter has a line under it saying what it does; the label and people lists say it at the top when open.
- `Legend`, above the table beside `Detail pane`, explains what each column's icons and cues mean.
- `PRs` takes PR numbers (`912`: that PR in any repo), PRs by repo (`acme/api#921`) or by URL (any page of it; a GitHub Enterprise one too), and repos (`acme/web`, or its URL), comma- or space-separated; repo names match whatever their case. The PRs it names show whatever the checkboxes and the other filters say; a repo filters like the rest, and with a number picks that repo's PR (`acme/api 12`).
- `Labels` and `Excluded labels` are checkbox dropdowns populated from labels found on currently loaded stored PR rows for the active repo view.
- The `Authors` dropdown displays resolved real names (from `actorsMap`) instead of raw GitHub logins. As in the Authors view's picker, people with a PR updated in the last 30 days (by anyone) come first, newest first, under "Recent PRs", then "Everyone else" by name.
- A dropdown of more than 8 options (here or in Settings) opens on a `Search` box: typing narrows it to options whose name (or login) has the text, ignoring case, keeping what's ticked. `Escape` clears it, then closes the dropdown; closing it clears it too.
- A person can have more than one GitHub login (Settings › `People`): author filters, assigned-user filters, approver filters, author insights, reviewer statistics, and manual author comments treat all of a person's logins as one person.
- The `Assigned to` dropdown filters rows to PRs assigned to any selected user.
- The `Approved by` dropdown filters rows to PRs that have at least one approval from any selected user. Options are populated from `metrics.approvals` data on stored PR rows.
- Each list opens by clicking it and closes by clicking it again or anywhere outside; it says how many of its options are selected.
- A ticked value no loaded PR has - an author with no open PRs in a saved view, a label from another repo - stays ticked, so the filter keeps applying (showing no PRs for it rather than all of them), and is listed at the end of its dropdown as `name · no PRs loaded` so you can untick it. Saved selections apply as soon as the page loads, before the data has.
- Retrieved/stored JSON data remains complete so filters can be adjusted later without refetching.
- `Run script` is the primary update operation for refreshing PR data.
- When `PR numbers` is set, it matches against all stored rows and ignores `Only PRs that need attention`, `Resolved for you to check` and `Excluded labels`.

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
- **Me as Reviewer**: someone else's open and draft PRs where your review is currently requested (expanded by default). Named for the role rather than "review requested", because some projects add reviewers automatically, so it isn't always a to-do. GitHub usually drops the request once you submit a review, so the PR leaves this section then.
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
  - allow/deny lists of people who start threads (Settings › `People`): each pick is a person, saved as their id, and covers every login of theirs; a saved login stays picked even when the loaded data has no such person, listed by its login (an id whose person was removed from People says so)

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
- These filters are saved to `view-prs/data/user-defaults.json` under `changeFilters`. The two author lists hold people (Settings › `People`): each saved as their id (`actor:dependabot`), which check-open-pr-updates.sh turns into every login `actors.json` lists for them (`VIEW_PRS_ACTORS_FILE`, else `$DATA_DIR/actors.json`) - an id it can't find is left out, and a login saved before ids is used as it is.
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

- The app header shows the app's name and the repo the table shows (or how many, when the stored rows span several - the list on hover), the views (`Pull requests`, `Review stats`, `Authors`; ←/→ move between them), the latest action's result (a row's Ack, a run, a backfill... - its first line, all of it on hover and in Tools › Run & check), how long since the repos were checked (`Checked 3m ago`, each repo and the last run on hover, marked when one is stale or failing - see [Freshness](#freshness); `Updated 5m ago`, from the last run, before any repo has been checked), `Activity` (see below), `Tools`, `Settings` and a link to this README. The quick checks you start yourself are in Tools › `Run & check` (see below).
- A row's chevron (`Show summary for PR #N`) opens a short summary under it: why it needs attention with a status line (checks, conflicts, approvals, viewed files), the three latest activity events, and the two most recently active open conversations. Any number of rows can be open at once.
  - What's new since you last looked (your last activity or Ack, whichever is later - as the Activity tab's `Since I last looked`) is counted: a change's reasons are one line, e.g. `Since you acked on Nov 2: 2 commits · 1 review (changes requested by Sam)` (reasons the counts don't say, like unanswered threads, stay as they are), and the activity column becomes `New since you acked on Nov 2` with the newest three of those events, plus `See all N in Activity` when there are more - the pane's Activity tab, on `Since I last looked`.
- The detail pane, docked to the right of the table, shows the selected PR: a header (title and GitHub link, author, branch with a copy button, previous/next, and close - which hides the pane until a row is clicked), its actions (Update, Ack, In review, Flagged, Add label, JSON), and tabs - Overview (grouped as Review / People / Changes, with Approval risk and Data freshness collapsible; Review says when `You last looked` and whether that was your Ack or your last activity, and who's requesting changes now - reviewers whose latest verdict requested changes), Activity, Conversations (with the open count) and Notes (marked while unsaved), plus Custom insights when the insights hook returns something. The last tab picked stays for the next PR.
  - Select a PR by clicking anywhere on its row that isn't a control (clicking the PR in the pane again closes the pane, like its close button; a click also shows the pane if it was hidden), with ↑/↓ (or j/k) while focus is in the table, or with its summary's `Show details`. Esc clears the selection, and `a` Acks the selected PR - or undoes its Ack - from its row, as its `Ack` button does (whose tooltip says so).
  - Leaving a PR with unsaved notes (another selection, previous/next, closing or hiding the pane) asks first.
  - The `Detail pane` button above the table shows or hides it; the choice is saved in the browser. While it's docked the table keeps every column, narrower, with cells taking two lines where they need to; the pane stays in view as you scroll. Opening or closing the pane keeps the row you clicked (or the selected one) where it is on screen while the table reflows around it; a PR shown in several sections keeps the copy you clicked.
  - Each row's PR number (its link) starts the cell's first line, followed by its labels, with the title under them, so the number is in the same place on every row. `Size` shows `+added −deleted`, each count kept whole (the line breaks between them); counts of 10,000 or more are shortened (`+12k`, `+1.2M`), with the exact numbers on hover.
  - Near the end of the list the docked pane gets shorter (its contents scroll inside it) instead of being pushed up with the list's end, so its header - close, previous/next - stays in the window.
  - Below 900px wide it opens as an overlay drawer instead (Esc or the backdrop closes it).
  - `View in table` and the `Auto update paused` chips select the PR; a chip also opens its Notes tab.
  - Used from Review stats or Authors, a bar stuck to the top of the window over the table says which PR and view (`PR #12, from Authors`) with `Back to Authors`: it shows that view again as you left it - the same author, dates and open rows, scrolled where you were, with the focus on the `View in table` you clicked. Showing another view by its tab, or the bar's `Dismiss`, forgets it.
- An open section's header (its name and count) and, under it, its table's column headers stay at the top of the window while you scroll through its rows, below the `Auto update paused` banner when that's showing. In a window too narrow for the table, the section scrolls sideways instead and only its name stays.
- Open summaries, the selection and the pane's tab stay as they are across automatic data refresh rerenders.
- Open inner insight groups (for example the Activity tab's `Daily summary`) also stay open across rerenders.
- Auto data-refresh rerenders are paused while any Notes field has an unsaved edit (text, selects, and comments or stories added or removed).
- Unsaved manual comment drafts and edits in the `Authors` view also pause auto-refresh until they are saved, canceled, or explicitly discarded.
- When auto-refresh is paused, an `Auto update paused` banner appears under the app header - and stays at the top of the window while you scroll - with clickable blocker chips (PR numbers and author-draft chips) that jump directly to the matching unsaved UI, plus a `Discard unsaved` action (manual override to render the pending update and discard unsaved edits).
- Polling failures now show a persistent warning snackbar that includes `Last successful check` and `Last error at` timestamps.
- The polling warning snackbar is automatically cleared after a successful poll.
- The detail pane's Activity tab lists the PR's events grouped by day, newest first: who did what (approved, requested changes, commented, pushed a commit, merged the PR...), when (the full time on hover), a link to GitHub, and the comment or review text in full - long ones fold behind `Show more`. One person's run of commits on a day is one line that expands to list them. The PR author's name and yours are styled.
  - Your Acks show among the events (your name, then `acknowledged the PR`; the current one adds `(current Ack)`), each at its time - including ones a later change cleared.
  - `Since I last looked` shows only what happened after your last activity on the PR or your last Ack (current or since cleared by a change), whichever is later, with a button to show the earlier events; `All` shows everything, with a divider where the events you'd already seen begin. Without either time, only `All` applies.
  - A commit dated before you last looked but after the one your latest review was on is new too (see below), but its date puts it among the older events, below the divider: it stays by its date, tagged `Not in your last review`, which says why on hover. A run of one person's commits is all tagged or none. The row's summary under the table tags it the same way among its new events.
  - Chips filter by event type (Commits, Reviews, Comments, PR events), each showing its count. The scope and types stay as picked for the next PR.
  - GitHub returns a PR's newest 250 commits at most. For a PR with more, the row keeps how many it has (`commitTotalCount`, from the same query), and `All` ends with `This PR has 389 commits, but GitHub returns only the newest 250: the older ones aren't shown.`
  - The daily summary table (below) is a collapsed group at the end.
- The Activity tab suppresses duplicate `review (COMMENTED)` items when the same event content is already represented by a thread or top-level comment item.
- The detail pane's Conversations tab lists the PR's review threads, grouped by file (in line order, threads not on a file last). Each group collapses.
  - A summary line counts the unresolved threads, those waiting on you, any resolved by the wrong person, and any resolved for you to check.
  - Chips filter to `Unresolved` (the default, which includes threads resolved by the wrong person and those resolved for you to check), `Waiting on me` (unresolved threads you started or replied in whose latest comment is by someone else or mentions you; only shown when your login is known; without it, `Unresolved` applies), `To check` (below; shown once a thread was resolved for you) or `All`. Each shows its count, and the choice is kept per PR. A note says how many threads the filter hides, with a `Show all` link.
  - Each thread is one line: who started it, the start of its first comment, its line, its state, the number of replies, and `outdated`/`Pending` where they apply. It expands to show every comment as markdown, who resolved it, and a link to it on GitHub.
  - `Next unresolved` opens and focuses each thread `Unresolved` shows (so those resolved by the wrong person too) in turn, opening its file group and switching from `Waiting on me` to `Unresolved` if that filter would hide it.
  - Threads the PR author resolved against the thread-resolution rule (Settings › Attention rules) are flagged, with an explanation when opened.
  - Conversations resolved for you: a thread you started that someone else resolved is marked `to check` until you confirm it was handled - for when others may resolve your threads (say, on high-priority PRs) once they've checked. Opened, it says who resolved it (and warns when it was the PR author, who shouldn't), whether the code it was on has changed since (GitHub's `outdated`), and whether the resolver replied, with a `Confirm handled` button (and `Undo`). Confirmations are kept in the user state (`threadChecksByRepo`); a new reply, or the thread resolved again by someone else, asks again. The Review column shows `N to check` on the PR's row, and the `View scope` filter can list just these PRs.
  - Top-level PR comments and review summaries are collapsed groups at the end.
- Review events only show a `View` link when the URL points to a specific anchor, not just the PR root.
- Rows with pending thread comments show a `Pending comments: N` chip in the title cell and a `Needs attention` icon.
- `Open conversations with me` counts unresolved conversations where you participated (started or commented).
  - If viewer identity cannot be determined, it safely falls back to total open conversations and omits `with me` wording.

**Keyboard shortcuts.** The header's `Shortcuts`, or `?` from anywhere but a field or a modal (Tools, Settings, a dialog), lists them; opened with `?`, Esc puts the focus back where you were.

- Anywhere:
  - `?`: Show or hide this list (not while typing in a field, or with Tools, Settings or another dialog open).
  - `Esc`: Close the open popover, drawer or dialog.
- Tabs, with focus on them (the views, the detail pane's, the Tools and Settings drawers' sections):
  - `← / →`: Show the tab before or after (↑ / ↓ for the drawers' sections down the left).
  - `Home / End`: Show the first or last tab.
- The PR table, with focus in it:
  - `↑ / ↓` or `j / k`: Select the PR above or below.
  - `a`: Ack the selected PR, or undo its Ack, with focus in its row.
  - `Esc`: Clear the selection.
- Search boxes (Search PRs, a long list's Search):
  - `Esc`: Clear what's typed; in a list with nothing typed, close the list.
- Pickers and menus (Author, More actions):
  - `↑ / ↓`: Move through the options.
  - `Enter`: Choose the option.
  - `Esc`: Close without choosing.

### Custom insights hook

The detail pane can show a `Custom insights` tab populated by your own script, for whatever your team wants surfaced there that isn't already part of the dashboard (a link to an internal tracker, a policy check, org-specific metadata, etc.). It's off by default and never shipped with the repo, since what's worth surfacing here is inherently specific to your org.

To enable it:

1. Write an executable script (any language with a shebang, or a compiled binary) that reads a single JSON argument and prints HTML on stdout.
2. Keep it out of the repo, or under the gitignored `local-hooks/` directory if you'd rather keep it alongside the checkout.
3. Set `VIEW_PRS_INSIGHTS_HOOK_SCRIPT` to its path - absolute (a Git Bash path like `/d/hooks/insights.sh` works), or relative to the project folder - in an optional `.env` file in the project folder (copy `.env.example`; `.env` is gitignored), which the server reads when it starts, so no start command needs changing. Without a `.env`, the server starts as usual with the hook off. Optionally set `VIEW_PRS_INSIGHTS_HOOK_TIMEOUT_MS` (default `10000`) to bound how long it's allowed to run. A variable already set in your shell wins over `.env`; restart the server after changing it.

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

- Two drawers, opened from the app header (Esc, the close button or the backdrop closes one): `Tools`, for things to do or look at, and `Settings`, for choices kept until changed (split 2026-11-09; until then Settings held both). Each has its sections down the left (↑/↓ move between them; in a narrow window they're a row across the top, with ←/→), and opens at the section it last showed. Every section, and every option in it, says what it does under it (an option's text is its description, so screen readers read it too).
  - `Tools`: `Run & check` (the latest status message, `Full refresh now` - the background full refresh of every followed repo, started now; it was `Trigger auto run` - `Quick check` - `Quick check open and latest merged`, what the background quick check covers: a cheap listing of each repo's open PRs and latest merged ones, as a full refresh lists them, and the PRs added one by one; and `Quick check all`, every stored row, older merged and closed ones too, one call per PR (it was in the app header until 2026-11-08) - the PR numbers with the run buttons below (its `Quick check` checks the PR numbers typed, or does what `Quick check open and latest merged` does when there are none), `Options for Run script` folded under them (repo, limits, parallel jobs, open mode, ack/reason/quiet - Settings' `Script options` until 2026-11-09), applying a label, and the latest request output), `Backfill` (the background backfill's status, Start/Stop/Refresh status, and its log), `Export` and `Action log` (the server's log, newest first: what you did, and the background runs - each quick check, each full refresh, update of changed PRs and drain, and each skip that kept one from happening, not one that found nothing to do. One line each - when, what, `You` or `Background`, OK/Failed/Skipped, its repos, what it did or why it failed or skipped, and how long it took - with the rest folded under it, filtered by kind, outcome (`Failed or skipped` together), who and repo. The server keeps your newest 500 entries and the newest 1,000 background ones apart, so a few days of quick checks can't push out your actions).
  - `Settings`, its sections under three headings: PRs followed - `Sources` and `Background updates` (how often each check runs per repo: `Quick check`, `Full refresh` - it was `Auto refresh` there - and `Merged/closed drain`); Rules - `Attention rules` (the Needs Attention rules; the thread starters list shows for the policy that uses it), `Change detection` (the comment/review authors and commit patterns to ignore), `Merge commits` (the headline patterns and logins that mark a merge commit) and `People` (a row per person: their name and logins); Display - `Appearance` (the theme: Light, Dark, or System to follow your computer's setting, Light to start; which PR table sections show and which start open; and grouping rows by repo).
  - Backfill loads its status at page load and again each time its section opens; Background updates, Action log, People and Export load the first time their section opens (Action log and People reload each time it opens again - People not over unsaved edits).
- `Run script` (full run to refresh PR data)
  - PR number input accepts numeric IDs separated by commas, whitespace, or mixed delimiters
  - request payload maps form values as: `author` falls back to an empty string when no author is selected, and checkbox fields (`ackChanged`, `showReason`, `quiet`) are sent as booleans
- `Apply ack only` (ack updates only)
- `Undo ack` (undoes the Acks of the PRs in `PR number(s)`, as if they were never made)
- `Apply label` (applies an existing GitHub label to the PR number(s) in the same `pr-numbers` field the Ack buttons use)
  - the label dropdown is populated from `GET /view-prs/labels` for the currently selected repo; only labels already defined on the repo (via `gh label list`) can be chosen - there is no free-text/create-new-label input
  - `Reload labels` reloads the dropdown for the current repo
- a row's More menu (`More actions for PR #N`) › `Add label` applies an existing label to just that PR (excludes labels already on the row)
- `Apply filters (local)` (updates visible rows and persisted defaults without calling `/view-prs/run`)
- Tools › `Export` to build and export JSON from currently visible PR rows
- Settings › `Appearance` to pick the theme. It's saved in `user-defaults.json` as `theme` (so it stays after the browser is closed, and in another browser), with a copy in the browser that sets it before the page first draws
- Each section with more than one PR has a sort menu at the end of its table's header row (the arrows in the `Actions` header): PR number or last updated, plus the date merged or closed in the Merged and Closed sections, and the order. Merged sorts by date merged and Closed by date closed by default; every other section by PR number, newest first. A choice other than the default is saved with the section's preferences (`prSections` in `user-defaults.json`, as `{ "sort": { "by", "direction" } }`). With grouping by repo, the sort applies within each repo. `Restore default sections` (Settings › Appearance) leaves the sorts as they are.
- While you are working in a section (the pointer over it or a tooltip it opened, keyboard focus in it, or its row open in the detail pane), a refresh does not re-sort its rows, so a row does not move out from under you. New rows still go where the sort puts them, and rows that leave the section are removed. If the sort would now give a different order, the `Actions` header shows `Re-sort`. Otherwise the sort applies again a moment after you leave the section. Choosing another sort applies at once.
- With rows from more than one repo in view, each row says its repo before its number: the name alone (`web` for `acme/web`, in full on hover), or the full `owner/repo` when repos from different owners share a name. A long one is cut short rather than pushing the number onto a line of its own. Settings › `Appearance` › `Group rows by repo` (saved as `prRowsGroupByRepo`) puts each section's rows under a heading per repo, A-Z, keeping their order within it, and then the rows don't each say their repo - the pane's previous/next follows that order.
- Settings › `Appearance` › Sections to hide PR table sections and choose which open when the page loads, saved in `user-defaults.json` as `prSections` (only what differs from the defaults). A hidden section isn't in the pane's previous/next or in Export; `View in table` for a PR that's only in hidden sections shows it in the detail pane. The filter bar's `Showing N of M PRs` adds how many of them are only in hidden sections. With every section hidden, the table says so and links to the setting. Changing a section's open-on-load choice also opens or closes it now, unless you've opened or closed it yourself since the page loaded. A copy in the browser lets the table draw with the choices straight away; without one (a new browser), the table waits for `user-defaults.json` to be read, so a hidden section never flashes up while the page loads (if it can't be read, the copy stays, or the default sections show). A setting is never saved when `user-defaults.json` can't be read first, since every save writes the whole file back
- Settings › `Background updates` to set how often each repo's background checks run and its priority (see the automatic background refresh above)
- Settings › `People`: everyone the app knows, a row each - the name to show, and every GitHub login that's them (the first is their main one). Replaced `Actor names` (2026-11-09), whose two lists - display names and login aliases - are moved over the first time the people are read: each alias joins the login it pointed to, and every other login is a person of its own (a name that was just the login again isn't kept). The old files are left as they were.
  - stored in `view-prs/data/actors.json` (`VIEW_PRS_ACTORS_FILE`; beside the old name cache by default): `{ "version": 1, "actors": [{ "id": "actor:alice", "name": "Alice Smith", "logins": ["alice", "alice-work"] }] }`. A person's id is made once, from their first login, and kept however their logins change; it can never be a login (GitHub's have no `:`)
  - when `/view-prs/data` sees a login no one has, a person is added for it, named as the data names them, else as GitHub does (`gh api users/<login>`). A person already there is never changed, so a name set in Settings stays
  - merging two people (one row given the other's login, the other row removed) records the removed one's id as moved to the one kept (`movedIds` in `actors.json`, `actorIdMoves` in `/view-prs/data`), so what was picked or kept under it - filters, saved views, rules, the change-detection lists check-open-pr-updates.sh reads, the Authors view's comments - becomes theirs; an id that's someone's again moves no longer
  - `GET /view-prs/actors` lists them and `PUT /view-prs/actors` (`{ actors: [...] }`) replaces them all. A save is refused when a login is in two people (ignoring case), when a person has no login, or when it would leave no one
  - edits stay on the page until `Save`; `Undo changes` puts back what's saved, and `Find` narrows the rows by name or login
  - while `actors.json` isn't valid JSON (a bad hand edit), no one is listed or added - the data still loads - and Settings › People says so; a save there keeps a copy of the old file beside it (`actors.json.unreadable-<time>`) before starting it again. A write that fails while adding people seen in the data doesn't fail the data read
  - a login the data spells in another case than a person's (`AHall` for `ahall`) counts as that person's
  - a save here, or someone new added, reaches open pages with their next poll: `actors.json` counts toward the data version, and `/view-prs/data-manifest` carries the names and logins (`actorMaps`) - before, they only changed with a reload
  - the page groups people by id (2026-11-09; until then by each person's main login): the author, assignee and approver filters, Review stats, the Authors view, the thread-resolution and change-detection lists, and saved views all pick a person by id, so renaming a person or changing their logins keeps what's picked. A login saved before ids is read as its person's id once the people load, and saved that way from then on; a saved view saved with logins is the one applied when its people are. `/view-prs/data` sends `actors` (each id and its logins) and `actorsMap` (each id's name, or the id when there's none - the page then shows the PR data's name, else the main login). Avatars, @-mentions and the conversations' checks (who started a thread, whether it waits on you) still compare GitHub's logins, the conversations with the login you're signed in as; elsewhere "you" is any of your logins
  - the Authors view's comments are kept under the person's id (`check-open-pr-updates.author-comments.json`); comments kept under any of their logins before are theirs, and move to the id the next time any comment is saved
- a row's Actions: `Ack` as a button, and in its More menu `Mark in review` / `Remove from in review`, `Flag` / `Remove flag` and `Update PR` (saved at once); whether a PR is in review or flagged shows as an icon in its Signals column
- per-row Notes editor saved to `check-open-pr-updates.user-state.json` via `POST /view-prs/notes`
  - note `createdAt`/`updatedAt` values are normalized to UTC second precision (`YYYY-MM-DDTHH:mm:ssZ`) so persisted user-state remains schema-valid
- The `Authors` view's manual comments editor, saved to `check-open-pr-updates.author-comments.json` via `GET/POST/PUT /view-prs/author-comments`
- how current each row is, and when each repo was last checked (see [Freshness](#freshness))
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

Export behavior (Tools › `Export`):

- Field picker supports mixed data-file and user-state fields in any combination.
- The fields are listed under `Data file` and `User state`, each with how many are chosen, as nested lists: each object in the data (`data`, `notesByPrNumber`) is a group, folded until you open it, with a checkbox for all of its fields - ticked when every one is chosen, part-ticked when some are - and how many are chosen (`12 of 34`). A group holding only one other group shows as one row (`a.b`). A field that's a plain value in some PRs and an object in others (`notesByPrNumber` for a PR without notes) is in its group as `(as one value)`: choosing it exports the whole object.
- Export scope uses what is currently visible in `PR data`:
  - applies active local filter values,
  - includes only PR rows inside expanded sections (`Open PRs`, `Draft PRs`, `Closed PRs`, `Latest Merged PRs`),
  - excludes rows in collapsed sections.
- Export actions:
  - `Preview JSON` renders the payload in-page,
  - `Copy JSON` writes payload to clipboard,
  - `Download JSON` saves payload as a local `.json` file.
- Export field selections are persisted in `data/user-defaults.json` when using `Preview JSON`, `Copy JSON`, or `Download JSON`, and re-applied when the Export section is rebuilt.
- Export profiles: a chip per profile, above the field controls, chooses its fields in one click (its fields show on hover); the profile whose fields are chosen is pressed, and clicking it again puts back the fields chosen before you applied it (or every field, when there were none to go back to). `Save as profile` names the chosen fields while no profile has them (another profile's name can't be reused, whatever its case). Once you change a field after applying a profile, it shows `(modified)` with `Update "name"` to save the change into it. `Manage export profiles`, below the export buttons, lists each profile with its fields, and `Rename`, `Update to chosen fields` and `Delete`; a deleted profile can be put back where it was with `Undo`, until you delete another. Profiles are saved in `user-defaults.json` (`exportFieldProfiles`) and kept as the filter bar's saved views are: the same in every browser, read again when the window regains focus, a change applied to the profiles as saved then, and one that can't be saved undone on the page, which says so.
- A chosen field the loaded data doesn't have (from a profile, or the saved choice) is listed after the rest as `name · not in the loaded data`, so it can be unticked.

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
  - Like the server's other user-state writes (conversation confirmations), it reads and writes the file under the script's user-state lock (`check-open-pr-updates.user-state.lock`, `USER_STATE_LOCK_DIR`), so a script run's Ack change and a save can't overwrite each other. It waits up to 3 seconds for the lock, and passes over one more than a minute old (left by a script that stopped early).
- `GET /view-prs/author-comments?authorLogin=<login>` (fetch manual comments for selected author)
- `POST /view-prs/author-comments` (create a manual author comment)
- `PUT /view-prs/author-comments` (edit an existing manual author comment)
- `GET /view-prs/diff?repo=<owner/name>&prNumber=<number>` (read cached PR diff; refreshes when the commit fingerprint changes - for a merged PR that fingerprint depends only on the commit set, so it never changes again once merged)
- `GET /view-prs/user-defaults` (read persisted default filter/visibility/attention overrides)
- `PUT /view-prs/user-defaults` (save persisted default filter/visibility/attention overrides)
- `GET /view-prs/data` (load persisted data for display)
- `GET /view-prs/data-meta` (lightweight data-version polling)
- `GET /view-prs/data-manifest` (per-PR row-version manifest for selective polling, with the user state's Acks, Ack history, flags and confirmations)
- `POST /view-prs/data-delta` (retrieve only changed PR rows by PR number)
- `GET /view-prs/scheduler` (scheduler state, including `activePrNumbers` for per-PR in-progress indicators)
- `GET /view-prs/dispatcher/settings` (the repos checked in the background, and each check's default interval and priority, for Settings › Background updates)
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

The tooltip has both exact times, when the PR merged or closed, and how current the row is (see [Freshness](#freshness)). The ages are underlined (dotted) when an open PR is stale, and dimmed while its details are behind GitHub.

### Freshness

An open or draft PR's row has two ages, both in its Activity tooltip:

- **Summary confirmed**: what the collapsed row shows - title, labels, size, CI, mergeability, viewed files, open conversations - as of its repo's latest live summary (the listing with each quick check, every 5 minutes by default), or the last run that refreshed it when that's newer or the PR wasn't listed: a full fetch, or a full run that reused the row (it takes the listing's title, labels and size and fetches the CI; when that CI fetch fails, the run doesn't count).
- **Details fetched**: reviews, approvals and activity, from its last full fetch (`fetchedAt`).

It's **stale** - the Activity ages underlined (dotted), "Stale" in the tooltip - when its summary hasn't been confirmed for about two of its repo's quick-check intervals (plus a minute), or its repo's last listing failed. A repo with no background updates isn't checked, so its rows say `Not checked automatically` instead of going stale. A repo whose background updates are paused after repeated failures (its circuit breaker) says until when, instead of just "not confirmed recently". The interval is each repo's own, whether or not it's listed (with the live summary off, say). Merged and closed rows only change when GitHub says they did, so they're never stale; their tooltip has when their details were fetched.

While GitHub has activity newer than the row's details, or the quick check has queued the PR, the row shows `Details updating` under its title and its Activity ages are dimmed: its summary is current, its reviews, approvals and activity update when the queued refresh runs. A PR that a complete listing no longer has (merged or closed since) shows `No longer open` - and the quick check queues it as a merged/closed change, so it's fetched again within a minute or two whenever it merged (the quick check's own listing of merged PRs only reaches back a few days of merges) - until its refresh moves it. One that can't be fetched (access to it lost, say) leaves the queue after its failed run, and is queued again only after 6 hours, so it doesn't fail every run of its repo.

A row whose last refresh failed shows `Couldn't refresh · data from 2h ago` under its title (the age of its last full fetch), with why on hover - the error, when, and since when its repo's refreshes have been failing - and `Retry`, which updates just that PR (as its menu's `Update PR`; disabled while it's being fetched). That's a row not fetched since its repo's last refresh failed that the refresh would have fetched - an open or draft PR queued for an update (changed on GitHub), or not fetched in full for 4 hours (the script's default `VIEW_PRS_OPEN_REVALIDATE_SECONDS`); the rest it would have left as they were, so they aren't out of date - or one of the PRs a refresh of chosen PRs failed on. A PR added on its own that couldn't be fetched (deleted, or no longer visible to `gh`) shows `Couldn't fetch` instead. It goes once the row is fetched again. The server keeps each repo's last failed refresh until one works (`refreshFailureByRepo`, saved with the scheduler state; a refresh of chosen PRs clears just those) and sends it, with the PRs that couldn't be fetched, in the live scheduler state (`refreshFailures`, `unreachablePrs`), so rows change without a reload.

The header's status pill says how long since the repos shown were checked (`Checked 3m ago`, the least recently checked one), with each repo's time - or its failure - and the last run on hover; it takes the attention tone when a repo is stale or failing, and says when a repo's background updates are paused. A repo with no background updates (an old listing from when it had them) is listed as not checked automatically, and doesn't count. Before any repo has been listed, it shows the last run (`Updated 5m ago`).

An automatic update says so in the header's status line once per new run (`Auto-updated from latest run at ...`); other pushed changes, which come every few seconds during a run, leave the status line with the result of your last action.

## Troubleshooting

- `gh: command not found`
  - Install GitHub CLI, then verify with `gh --version`.
- `Please authenticate first: gh auth login`
  - Run `gh auth login`, then confirm with `gh auth status`.
- `jq is required`
  - Install `jq`, then verify with `jq --version`.
- `node is required`
  - The script computes rows with Node (`src/script/compute-pr-row.js`): run standalone, it uses `node` from `PATH` (verify with `node --version`), or the one `VIEW_PRS_NODE` names. Runs from the web UI use the server's own Node.
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

The script's shell tests (`src/script/integration-tests/check-open-pr-updates.test.sh`) run in Jest, one group of test functions per test, spread over three files so they run in parallel (`check-open-pr-updates.sh-tests*.test.js`; the full-run group alone takes about 4.5 minutes). A failing group shows the end of the script's output. They run the script with `bash` (on Linux `sh` is often dash, which can't run it), use the bundled jq, and keep everything they write in a temporary folder, removed afterwards. To run them directly, or just some groups:

```bash
bash src/script/integration-tests/check-open-pr-updates.test.sh
ONLY_TESTS="run_compute_state_tests run_quick_check_tests" bash src/script/integration-tests/check-open-pr-updates.test.sh
```

If they fail intermittently, rerun with retries enabled:

```bash
TEST_RETRIES=2 bash src/script/integration-tests/check-open-pr-updates.test.sh
```

`TEST_RETRIES=N` performs up to `N+1` total attempts and prints run context when an attempt fails.

To capture debug logs from `src/script/check-open-pr-updates.sh`, set `CHECK_OPEN_PR_DEBUG_LOG`:

```bash
CHECK_OPEN_PR_DEBUG_LOG=view-prs/results/check-open-pr-debug.log \
bash view-prs/src/script/check-open-pr-updates.sh --open none --quiet
```

The log includes startup args, parsed settings, cache counters, summary totals, and any trapped command error with line number.

Background runs' entries are `job/quickCheck` (a quick check), `job/<job>` with `skipped: true` (a skip, with its `reason`), and `auto-refresh` (a full refresh, an update of changed PRs, the drain's refresh, or an added PR's fetch), each with `kind` (Activity's) and `origin` (`background` or `you`).

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
  - `review` (`CHANGES_REQUESTED`, or `COMMENTED` with a body - not approvals, nor the empty review GitHub wraps each inline comment in, which the thread reasons cover)
  - `commit`
- For PRs authored by others:
  - `comment`
  - `review` (non-approval reviews such as `COMMENTED` or `CHANGES_REQUESTED`)
  - `commit` (non-merge commits)

A commit counts as new when it's dated after your baseline, or comes after the commit your latest review was on - a commit's date is when it was made, not pushed, so one made before your review and pushed after it still shows. After an acknowledgment, only the date counts.

## Approval column behavior

`APPROVED` is shown as `YES/NO` with a count in parentheses.

- If **you authored the PR**:
  - `YES` requires at least **2 approvals** from others.
  - count shows **approvals from others only**.
- If **someone else authored the PR**:
  - `YES` means **your latest review state is APPROVED**.
  - count shows **all latest approvals**, including yours.

In the Review column, lines under the signals show people as small initials badges, each group labelled so it reads without hovering. `Assigned` comes first, then `Reviewer`, each on a line of its own, with the badges starting in the same place on every row. With the detail pane docked, a group with three or more badges puts its label above them, so they get the cell's full width. A label never breaks across lines.

- **Assigned**: every assignee.
- **Reviewer**: you, when your review is currently requested but you aren't assigned. It says `Reviewer` rather than `Review requested` because some projects add reviewers automatically, so a request doesn't always mean a review is needed (the badge's tooltip still says `review requested`). GitHub drops the request once you submit a review, and the badge goes with it. Other requested reviewers are in the Reviewers row of the detail pane's Overview.
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
- An ack is automatically cleared the moment a PR shows new external activity (a comment/review/commit) after the ack timestamp - the row's status flips to `CHANGED` with the real reason (e.g. `comment`), and the Ack button reverts from "Ack'd" back to "Ack".
- Every Ack is also kept, with its time, under `ackHistoryByRepo`, and shows in the PR's Activity tab (your name, then `acknowledged the PR`; the current one adds `(current Ack)`). Clicking "Ack'd" (or `--ack-clear`) undoes the Ack as if it had never been made: it goes from the history too, and the row is judged as it was before (before 2026-11-05 it also marked the row `CHANGED` with the reason `ack-cleared` until the next Ack, and rows marked then still are); one cleared by new activity stays in the history - it can't be cleared with the button any more, since it's no longer the current Ack - so you can see you'd checked the PR before it changed. The Activity tab's `Since I last looked` counts from your latest Ack, current or not.

### Ack commands

- `--ack <numbers>`: mark one or more PRs as acknowledged
  - supports comma-separated (`--ack 912,921`) or repeated flags (`--ack 912 --ack 921`)
- `--ack-clear <numbers>`: undo the current ack of one or more PRs, as if it had never been made
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
  - The patch acquires the same lock directory (`check-open-pr-updates.data.lock`) the shell script's `acquire_pr_state_lock`/`release_pr_state_lock` use for `check-open-pr-updates.data.json`, so it can't interleave its read-modify-write with a concurrent script run. It passes over one more than a minute old (the script holds it for one row's write, so that one was left by a run killed mid-write) rather than failing until the next run recovers it.
- Per-PR failures (invalid PR number, `gh` error, no matching stored entry) are collected into `applyErrors`/`refreshErrors` in the response rather than failing the whole request; PRs that did succeed are still applied and reflected in `prData`.
- Both the per-row `+ Label` dropdown and the Tools drawer's `Apply label` control (Run & check) call this same endpoint.

## Local PR state file

The script now persists retrieved/calculated PR state to a local JSON file next to the script:

- `view-prs/data/check-open-pr-updates.data.json`
- `view-prs/data/check-open-pr-updates.user-state.json` (user-authored state: notes + ack/reverify/in-review/flagged)
- Full persisted schema: `view-prs/src/schema/DATA_SCHEMA.md`

Behavior:

- Data is grouped by repo and PR number under `byPrNumber` (`owner/repo#123`: two repos can each have a PR #123; before 2026-11-02 rows were keyed by the bare number, and one replaced the other - see `DATA_SCHEMA.md`).
- Each run updates (upserts) entries for PRs processed in that run.
- PR IDs not processed in a run are **not removed** from the file.
- Display filters do not trim what is stored in this file.
- A full run reuses the rows of PRs that haven't changed on GitHub, and fetches the rest; open/draft rows are fetched in full again at least every 4 hours. See [Reusing unchanged rows](#reusing-unchanged-rows) - this is separate from the `--quick-check` listing pass described in [Usage](#usage), which only ever compares `updatedAt` to decide whether a PR needs a full run *at all*.

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
- The `Review stats` view has its own controls (`Sort by`, `Show` - all reviewers or those with risky approvals, high-risk approvals or useful-comment signals - `Minimum comments`, `Reviewers to list`, the dates and `Reviewers`) to rank and focus reviewer activity. `Reviewers` (`Everyone` until you pick) lists everyone with activity in the dates, by name: with people picked, only their comments, reviews and approvals count - the cards, charts, trend note and table - and someone picked with no activity in the dates stays listed (`erin · no activity in the dates`) to unpick. Like the other controls, it isn't saved across reloads. Each reviewer shows with an avatar and their `actorsMap` display name (the login on hover). The table scrolls sideways when it's wider than the window, the Reviewer column staying put. `Columns`, above it, picks the columns: Thread comments, Resolved thread comments and Sources start hidden, and the choice is saved in `user-defaults.json` (as `reviewStatsColumns`, only what differs from that). The statistics view features prominent graph cards:
  - **Metric totals**: Comments, reviews, and approvals from visible table rows (clickable to sort table)
  - **Activity over time per author**: Sparkline bars showing daily review/comment activity trends for the top 6 reviewers across the last 31 days (helps identify contributor patterns and periods of high engagement)
  - **Top reviewers by comments/approvals/signals**: Stacked bar composition charts with click-to-sort interactivity
  - Source rows in the statistics view include a `View in table` button that switches to the Pull requests view, scrolls to the matching PR, and shows it in the detail pane.
  - `Start date` begins three months back. When the table lists no one, its one row says why: no reviewer activity in the dates (`No reviewer activity since Aug 6, 2026.`, with `Clear dates`), or `Show` and `Minimum comments` hiding the reviewers who have some (`No reviewers with risky approvals and at least 3 comments.`, with `Show all reviewers`), or the reviewers picked having none (`No activity from the 2 reviewers picked since Aug 6, 2026.`, with `Show everyone`).
  - **How Review stats counts.** Each card's label and each column heading says this on hover and focus (dotted underline). Everything counts only what falls between `Start date` and `End date`, and with `Reviewers` picked, only their comments, reviews and approvals.
    - Cards:
      - `PRs`: Stored PRs the numbers come from: with dates set, those with a comment, review, approval or open review thread in them; with no dates, every stored PR. With Reviewers picked, only the PRs they commented on, reviewed or approved, or have an open review thread they commented in.
      - `Comments on others' PRs`: Comments on PRs by anyone but the PR's author, top-level and in review threads.
      - `Approvals`: Approvals of PRs. Risky: the PR got a comment, review, change request or commit after the approval. High-risk: a change request after it, or 3 or more of those.
      - `Comment usefulness`: Signs that comments on others' PRs were acted on, one point each: the comment's thread was resolved, the PR's author committed after it, and did so within 24 hours - up to 3 per comment.
    - Columns:
      - `Reviewer`: Anyone who commented on, reviewed or approved someone else's PR.
      - `Comments`: Their comments on others' PRs, top-level and in review threads.
      - `Thread comments`: Of those, the ones in review threads (on lines of code).
      - `Reviews`: Reviews they submitted on others' PRs, whatever the outcome: approved, commented, changes requested or dismissed.
      - `Approvals`: Their reviews that approved.
      - `Risky approvals`: Their approvals after which the PR got a comment, review, change request or commit.
      - `High-risk approvals`: Their approvals followed by a change request, or by 3 or more comments, reviews, change requests and commits.
      - `Useful comment signals`: Their comments' points, one each: the thread was resolved, the PR's author committed after it, and within 24 hours - up to 3 per comment.
      - `Comments → author commit`: Their comments the PR's author committed after.
      - `Resolved thread comments`: Their comments in review threads that are now resolved.
      - `PRs touched`: Others' PRs they commented on, reviewed or approved.
      - `Sources`: The PRs behind their numbers.
- The `Authors` view shows per-PR review notes grouped by author. The author filter dropdown and metadata cards use resolved real names from `actorsMap`. Each PR in the Authors view is two lines: its state (open, draft, closed or merged), number and title linking to GitHub, and when it was merged, closed or updated; then the table's signals with their tooltips (status, approvals, checks, open conversations, viewed files) and `View in table`. The comment box and a comment's edit form use the app's fields (`New comment`, `Sentiment`) and buttons.
  - `Author` is a text box that narrows its list to what's typed (a name or a login). The list puts the authors with a PR updated in the last 30 days (by anyone) first, newest first, under `Recent PRs`, then `Everyone else` by name; Up and Down move through it, Enter picks, and Escape closes it without a change. Opening the view shows the author of the most recently updated PR.
  - Under it, the chosen author's avatar, name and login, then how many of their stored PRs are open and merged and how many comments you've saved about them.
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
    --ack-clear <numbers>    Undo the acknowledgment of PR number(s), as if never made
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
    --prs <numbers>          Fully refresh exactly these PR number(s), comma-separated,
                              looked up directly in whatever state they're in
-h, --help                   Show this help
```

A run of chosen PRs (`-p/--pr` or `--prs`) keeps each existing row's `updatedAt` and the data file's `lastFullRun`, so it still says when the last full run was. `lastRun` is still every run's, so the header's "Updated N minutes ago" counts them. Each repo also has its own, `lastRunByRepo` and `lastFullRunByRepo` - several repos' runs take turns, and the global ones are only the latest repo's. Every row also records when it was written (`fetchedAt`). A run that writes rows backs the data file up once, before its first row, in `data/backups/` (before 2026-11-01, once for every row, so a large run filled the 50 kept with copies from that run alone); a quick check takes none. The newest 50 backups are kept (`STATE_BACKUP_RETENTION`), and beyond them the newest of each day until 7 days have one (`STATE_BACKUP_DAILY_DAYS`): with a run every few minutes, the 50 alone would cover only the last few hours. `--prs` refreshes the PRs it can fetch, then fails, naming the rest, if any couldn't be fetched - so the server keeps those queued rather than treat them as refreshed. A PR whose details or review threads can't be fetched (after retries) keeps its stored row as it was, rather than being written without them: a run of chosen PRs then fails naming it, as above, and a full run says which PRs it kept and still succeeds. (Before 2026-11-02 a failed thread request read as no threads, so the row lost them until a later fetch.)

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
