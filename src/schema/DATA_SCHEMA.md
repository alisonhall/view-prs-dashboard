# view-prs Data Schema

This document describes the persisted schema for `view-prs/data/check-open-pr-updates.data.json` as written by the current code.

User-authored state now lives in a separate file:

- `view-prs/data/check-open-pr-updates.user-state.json`
- Machine-readable schema: `view-prs/src/schema/check-open-pr-updates.user-state.schema.json`

Machine-readable JSON Schema file: `view-prs/src/schema/check-open-pr-updates.data.schema.json`

Scope rules:

- Include fields that are currently written when PR data is retrieved, even if no current UI path reads them.
- Exclude user-authored state fields (notes, ack, reverify, in-review), which are persisted in the separate user-state file.
- Exclude legacy fields that are not written by the current retrieval code path.

Source of truth for writes:

- Retrieval/upsert: `view-prs/check-open-pr-updates.sh`

## File shape

```json
{
  "byPrNumber": {
    "owner/name#923": {
      "prNumber": "923",
      "repo": "owner/name",
      "section": "open",
      "updatedAt": "2026-03-24T12:34:56Z",
      "rowOrder": 1,
      "data": {}
    }
  },
  "lastRun": {
    "repo": "owner/name",
    "updatedAt": "2026-03-24T12:34:56Z"
  }
}
```

## Top-level fields

| Field | Type | Required | Written by | Notes |
| --- | --- | --- | --- | --- |
| `byPrNumber` | object | yes | retrieval | PR rows keyed by `repo#number` (e.g. `owner/name#923`) - see below |
| `lastRun` | object or null | no | retrieval | The last retrieval run of any kind, including a run of chosen PRs |
| `lastFullRun` | object or null | no | retrieval | The last full run (of a whole repo): a run of chosen PRs (`-p/--pr`, `--prs`) leaves it. `Last run rows` shows the rows with its `updatedAt`. Missing in data from before 2026-10-31, where the server reports `lastRun` as it |

### `lastRun` and `lastFullRun`

| Field | Type |
| --- | --- |
| `repo` | string |
| `updatedAt` | string, ISO-8601 UTC timestamp |

## `byPrNumber` entry schema

Rows are keyed by repo and number - `owner/name#923` - since two repos can each have a PR #923. Before 2026-11-02 they were keyed by the bare number, so such PRs replaced each other's rows; the script moves a bare-number row to its repo's key at the start of each run (`ensure_pr_state_store`; an existing repo key, the newer row, wins), and the server reads either kind. A row without a `repo` keeps its number. Look a row up by its `repo` and `prNumber`, not by the number alone.

Each `byPrNumber[key]` value is an object with this shape:

| Field | Type | Required | Written by | Notes |
| --- | --- | --- | --- | --- |
| `prNumber` | string | yes | retrieval | Duplicates the map key |
| `repo` | string | yes | retrieval | `owner/name` |
| `section` | string | yes | retrieval | One of `open`, `draft`, `merged` |
| `updatedAt` | string | yes | retrieval | Run timestamp (the run's start, the same for every row it writes). A run of chosen PRs (`-p/--pr`, `--prs`) keeps an existing row's, and gives a row it adds `lastFullRun`'s, so it marks the last full run's rows (`Last run rows`) |
| `fetchedAt` | string | no | retrieval | When this row's details were last fetched from GitHub (ISO-8601 UTC); missing on rows written before 2026-10-31. A full run that reuses the row unchanged keeps it; an open/draft row is fetched again once it's `VIEW_PRS_OPEN_REVALIDATE_SECONDS` old. The live summary only replaces a row's values when listed after this (or after `updatedAt` without it) |
| `ciFetchedAt` | string | no | retrieval | When this row's CI and mergeability were last fetched: as `fetchedAt` for a fetched row, and moved on by a full run that reuses an open row (which still fetches its CI); missing on rows written before 2026-11-01. The live summary only replaces `checkState`/`mergeState` when listed after this |
| `rowOrder` | number | yes | retrieval | Preserved across later upserts once first set |
| `data` | object | yes | retrieval | Current PR snapshot and derived metrics |

## `data` object schema

The `data` object is written by `compute_pr_state_json()` during retrieval.

### Scalar and array fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `number` | string | yes | PR number as string |
| `title` | string | yes | Raw PR title |
| `titleDisplay` | string | yes | Title with `[CHK:...]` and `[MRG:...]` markers appended |
| `url` | string | yes | PR URL |
| `mergedAt` | string | yes | ISO timestamp or empty string |
| `createdAt` | string | no | When the PR was created (ISO timestamp); missing on rows saved before 2026-11-13, until the PR next changes (the page then uses its `opened` activity event) |
| `sourceUpdatedAt` | string | yes | Head/source branch updated timestamp |
| `sourceFingerprint` | string | no | Digest of the fetched inputs the row was computed from (for example `fp:v2:sha256:<hex>`); not used to reuse rows since 2026-11-01 |
| `localStateKey` | string | no | The local state the row's status was computed from: the checksum of the change filters, merge-commit rules and a row-format version, then the PR's ack timestamp, re-verify and in-review marks, separated by vertical bars (a single checksum before 2026-11-01). A full run reuses the row only while it matches, with the same `sourceUpdatedAt`; missing on rows computed before 2026-11-01 |
| `detailRef` | object | no | Optional pointer to externalized heavy PR detail payload (for future split storage) |
| `sourceBranch` | string | yes | PR head branch |
| `targetBranch` | string | yes | PR base branch |
| `checkState` | string | yes | `PASS`, `FAIL`, `RUN`, `SKIP`, or `NA` |
| `mergeState` | string | yes | Usually `YES`, `NO`, or `UNK` |
| `labels` | string[] | yes | Label names only |
| `author` | string | yes | Display name used by the UI |
| `authorLogin` | string | yes | GitHub login |
| `status` | string | yes | `CHANGED`, `NO_CHANGE`, or `NO_ACTIVITY` |
| `approved` | string | yes | `YES` or `NO` |
| `approvalCount` | string | yes | Count stored as a string |
| `inReview` | string | yes | Boolean-like string from repo state, usually `true` or `false` |
| `approvers` | object[] | yes | Latest approval per approver, after author filtering rules |
| `openConversationCount` | string | yes | Count stored as a string |
| `viewedFilesCount` | string | yes | Count stored as a string |
| `changedFilesCount` | string | yes | Count stored as a string |
| `additions` | string | no | Total added lines from GitHub PR metadata |
| `deletions` | string | no | Total deleted lines from GitHub PR metadata |
| `viewedFilesSummary` | string | yes | Display summary such as `14/14 viewed` |
| `comments` | object[] | yes | Normalized top-level PR comments |
| `reviews` | object[] | yes | Normalized PR reviews |
| `commits` | object[] | yes | Normalized PR commits |
| `reviewThreads` | object[] | no | Normalized review threads (inline for legacy rows; externalized when `detailRef` is present) |
| `commentEvents` | object[] | no | Flattened top-level/thread comment events (inline for legacy rows; externalized when `detailRef` is present) |
| `activityEvents` | object[] | no | Flattened comment, review, approval, commit, open, merge events (inline for legacy rows; externalized when `detailRef` is present) |
| `metrics` | object | yes | Derived reviewer/comment/conversation metrics |
| `activityTimelineSummary` | string | yes | Rendered as an HTML table showing activity grouped by date. All dates with activity are shown; a run of consecutive weekdays (Mon-Fri) without activity is consolidated into one "No activity for N days" row instead of a dash row per day (an isolated single no-activity weekday still shows its own dash); weekend dates (Sat-Sun) without activity are omitted and excluded from that day count. Timeline extends from today to oldest activity for open PRs, or newest to oldest activity for merged PRs. |
| `activityTimeline` | object[] | no | Bucketed activity timeline (inline for legacy rows; externalized when `detailRef` is present) |
| `baseline` | string | yes | Effective baseline timestamp or empty string |
| `reason` | string | yes | `-` or a changed-reason string |

Notes:

- When present, `additions` and `deletions` are used by the detail pane's Overview tab to render a GitHub-style `Lines changed` summary (`<files> changed, +<additions>, -<deletions>, <total> lines changed`).

## Nested object shapes

### `approvers[]`

| Field | Type |
| --- | --- |
| `login` | string |
| `name` | string |
| `approvedAt` | string, ISO-8601 UTC timestamp |

### `comments[]`

Normalized top-level PR comments.

| Field | Type |
| --- | --- |
| `id` | string |
| `authorLogin` | string |
| `authorName` | string |
| `authorAssociation` | string |
| `createdAt` | string, ISO-8601 UTC timestamp |
| `publishedAt` | string, ISO-8601 UTC timestamp |
| `body` | string |
| `url` | string |

### `reviews[]`

| Field | Type |
| --- | --- |
| `id` | string |
| `authorLogin` | string |
| `authorName` | string |
| `authorAssociation` | string |
| `submittedAt` | string, ISO-8601 UTC timestamp |
| `state` | string |
| `body` | string |
| `url` | string |
| `commitOid` | string |

### `commits[]`

| Field | Type |
| --- | --- |
| `oid` | string |
| `committedAt` | string, ISO-8601 UTC timestamp |
| `messageHeadline` | string |
| `messageBody` | string |
| `authors` | object[] |

#### `commits[].authors[]`

| Field | Type |
| --- | --- |
| `login` | string |
| `name` | string |
| `email` | string |

### `reviewThreads[]`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Thread id |
| `isResolved` | boolean | |
| `isOutdated` | boolean | |
| `commentCount` | number | |
| `hasMoreComments` | boolean | |
| `comments` | object[] | Thread comments |
| `participants` | string[] | Distinct `authorLogin` values from comments |
| `latestCommentAt` | string | ISO timestamp or empty string |

#### `reviewThreads[].comments[]`

| Field | Type |
| --- | --- |
| `id` | string |
| `authorLogin` | string |
| `authorName` | string |
| `authorAssociation` | string |
| `createdAt` | string, ISO-8601 UTC timestamp |
| `publishedAt` | string, ISO-8601 UTC timestamp |
| `body` | string |
| `url` | string |
| `replyToId` | string |
| `path` | string |
| `line` | number or null |
| `originalLine` | number or null |
| `diffSide` | string |
| `state` | string |

### `commentEvents[]`

Comment events are a flattened event stream built from top-level comments, review-thread comments, and REST review comments.

| Field | Type |
| --- | --- |
| `sourceId` | string |
| `threadId` | string |
| `occurredAt` | string, ISO-8601 UTC timestamp |
| `date` | string, `YYYY-MM-DD` |
| `actor` | string |
| `type` | string, currently `comment` |
| `channel` | string, currently `top-level` or `thread` |
| `body` | string |
| `url` | string |
| `replyToId` | string, optional by source |
| `conversationResolved` | boolean, optional by source |

### `activityEvents[]`

This array includes all `commentEvents[]` entries plus normalized review, approval, commit, opened, and merged events.

Common fields present on every activity event:

| Field | Type |
| --- | --- |
| `sourceId` | string |
| `threadId` | string |
| `occurredAt` | string, ISO-8601 UTC timestamp |
| `date` | string, `YYYY-MM-DD` |
| `actor` | string |
| `type` | string |
| `channel` | string |

Additional fields may be present depending on event type:

| Field | Type | Produced for |
| --- | --- | --- |
| `body` | string | comment, review, approval |
| `url` | string | comment, review, approval |
| `replyToId` | string | comment events inherited from `commentEvents[]` |
| `conversationResolved` | boolean | thread comment events inherited from `commentEvents[]` |
| `state` | string | review, approval |
| `commitOid` | string | review, approval |
| `messageHeadline` | string | commit |
| `messageBody` | string | commit |

### `activityTimeline[]`

Bucketed timeline generated from `activityEvents[]`.

| Field | Type |
| --- | --- |
| `date` | string, `YYYY-MM-DD` |
| `actor` | string |
| `type` | string |
| `count` | number |
| `earliestAt` | string, ISO-8601 UTC timestamp |
| `latestAt` | string, ISO-8601 UTC timestamp |
| `channels` | string[] |
| `events` | object[] |

The `events` array contains the original activity-event objects for that bucket.

### `metrics`

```json
{
  "counts": {},
  "commentsByActor": [],
  "reviewsByActor": [],
  "approvals": [],
  "approvalSummary": {},
  "commentUsefulnessSummary": {},
  "conversationSummary": {}
}
```

#### `metrics.counts`

All values are numbers.

| Field |
| --- |
| `topLevelComments` |
| `threadComments` |
| `totalComments` |
| `reviews` |
| `approvals` |
| `commits` |
| `conversations` |
| `openConversations` |

#### `metrics.commentsByActor[]`

All count fields are numbers.

| Field | Type |
| --- | --- |
| `login` | string |
| `name` | string |
| `topLevelCount` | number |
| `threadCount` | number |
| `resolvedThreadCount` | number |
| `openThreadCount` | number |
| `followedByAuthorCommitCount` | number |
| `followedByAuthorCommitWithin24hCount` | number |
| `totalCount` | number |
| `firstCommentAt` | string |
| `lastCommentAt` | string |
| `isPrAuthor` | boolean |
| `commentsOnOthersPr` | boolean |
| `usefulnessSignals` | number |

#### `metrics.reviewsByActor[]`

All count fields are numbers.

| Field | Type |
| --- | --- |
| `login` | string |
| `name` | string |
| `reviewCount` | number |
| `approvalCount` | number |
| `commentCount` | number |
| `changesRequestedCount` | number |
| `dismissedCount` | number |
| `lastReviewAt` | string |
| `lastApprovalAt` | string |
| `isPrAuthor` | boolean |
| `reviewsOnOthersPr` | boolean |

#### `metrics.approvals[]`

| Field | Type |
| --- | --- |
| `login` | string |
| `name` | string |
| `approvedAt` | string |
| `mergeLeadMinutes` | number or null |
| `commentCountAfterApproval` | number |
| `reviewCountAfterApproval` | number |
| `changeRequestCountAfterApproval` | number |
| `commitCountAfterApproval` | number |
| `issueSignalsAfterApprovalCount` | number |
| `highRiskApproval` | boolean |
| `riskyApproval` | boolean |

#### `metrics.approvalSummary`

| Field | Type |
| --- | --- |
| `totalApprovals` | number |
| `riskyApprovals` | number |
| `highRiskApprovals` | number |
| `approvalsWithChangeRequestsAfter` | number |
| `approvalsWithCommentsAfter` | number |
| `approvalsWithCommitsAfter` | number |
| `averageMergeLeadMinutes` | number or null |

#### `metrics.commentUsefulnessSummary`

| Field | Type |
| --- | --- |
| `commentsOnOthersPrs` | number |
| `resolvedThreadCommentsOnOthersPrs` | number |
| `commentsFollowedByAuthorCommit` | number |
| `commentsFollowedByAuthorCommitWithin24h` | number |
| `usefulnessSignals` | number |

#### `metrics.conversationSummary`

| Field | Type |
| --- | --- |
| `totalThreads` | number |
| `openThreads` | number |
| `resolvedThreads` | number |
| `totalThreadComments` | number |
| `topLevelConversations` | number |
| `reviewConversations` | number |
| `estimatedTotalConversations` | number |
| `estimatedOpenConversations` | number |

## Archive (separate file, merged and closed PRs past the cutoff)

`view-prs/data/check-open-pr-updates.data.archive.json` (`VIEW_PRS_ARCHIVE_FILE` for the server; the script's `PR_ARCHIVE_FILE`, else the data file's name with `.archive` before `.json`) has the data file's shape, with only `byPrNumber`: merged and closed rows whose `data.mergedAt` (merged) or `data.closedAt` (closed) is more than `VIEW_PRS_ARCHIVE_DAYS` days old (default 120), moved there as they were by the end of each full run (`archive_old_pr_rows_unlocked`, under the data file's lock; the archive written first, then the data file). A key in both files is the data file's row; the next full run removes its archived copy.

The server reads both files. `/view-prs/data`, the manifest and the delta routes go without archived rows, and carry `archiveSummary`: `{ version, merged, closed, newestEventAt, authors, labels }` - the archived rows' counts by section, the newest time any of their events can be at (the later of each row's merge or close time and its `fetchedAt`), a version made from the archive file's and user state's stats, and each repo's archived authors (`{ repo, login, name }`, from `data.authorLogin` and `data.author`) and labels (`{ repo, name }`), once each, ignoring case - for the table's Authors and Labels lists, which offer those only archived PRs have. `GET /view-prs/archive` returns `{ ok, byPrNumber }` with the archived rows in view, each with `archived: true`, their notes and slim detail as in `/view-prs/data`. `/view-prs/pr-detail(s)`, `/view-prs/diff`, `/view-prs/insights-hook` and `POST /view-prs/notes` find archived PRs too.

## Live summary (separate file, laid over the rows when read)

`view-prs/data/check-open-pr-updates.live-summary.json` (`VIEW_PRS_LIVE_SUMMARY_FILE`) is written only by the server (`src/server/helpers/view-prs-live-summary-helpers.js`), from a GraphQL listing of each repo's open PRs run with every quick check. It isn't part of the data file; the server lays it over open and draft rows when it reads them, so `/view-prs/data` and the delta routes return rows with it applied.

```json
{
  "byRepo": {
    "owner/name": {
      "checkedAt": "2026-10-31T10:05:00.000Z",
      "complete": true,
      "lastError": null,
      "lastErrorAt": null,
      "prs": {
        "923": {
          "number": "923",
          "title": "...",
          "url": "...",
          "isDraft": false,
          "updatedAt": "2026-10-31T10:00:00Z",
          "labels": ["backend"],
          "additions": "40",
          "deletions": "3",
          "changedFiles": "2",
          "viewedFiles": "1",
          "checkState": "PASS",
          "mergeState": "YES",
          "assignees": [{ "login": "...", "name": "..." }],
          "requestedReviewers": [{ "login": "...", "name": "..." }],
          "openConversationCount": "1"
        }
      }
    }
  }
}
```

- `checkedAt` is the last successful listing; a failed one keeps the previous `prs` and sets `lastError`/`lastErrorAt`. `complete` is false when the listing stopped at its page limit (500 PRs) before the last open PR. It's read in pages of 25, newest created first: creation order can't change while the pages are read (in update order, a PR updated meanwhile was skipped).
- Each repo's `checkedAt`, `complete`, `lastError` and `lastErrorAt` are also in the data meta (`dataMeta.liveSummary`, from `/view-prs/data-meta` and with the data), rather than on each row, so a listing that changes nothing for a row leaves that row unchanged. The data meta adds `quickCheckIntervalMs`: the repo's quick-check interval (its `schedulerRepoConfig` override or the default), `null` when it has no quick check scheduled (its rows then read as not checked automatically, rather than stale). The page marks an open row stale from it (see README's freshness).
- The data meta's `backgroundUpdates` lists every repo checked in the background, listed or not (the live summary can be off, or not have run yet): `{ "owner/repo": { "quickCheckIntervalMs": 300000, "pausedUntil": null } }`. `pausedUntil` is when its circuit breaker closes again while it's open after repeated failures, `null` otherwise. A repo missing from it isn't checked in the background. The page prefers it to `liveSummary`'s `quickCheckIntervalMs`, which older servers sent alone.
- Values use the data file's shapes. `viewedFiles` and `openConversationCount` are `null` when the listing's first page of files or threads didn't hold them all (or, for conversations, the PR has no threads, where the script estimates from comments); `mergeState` is `null` while GitHub reports `UNKNOWN`. A `null` leaves the row's own value.
- When `checkedAt` is newer than the row's `fetchedAt` (or `updatedAt` without it), these replace the row's `title`, `url`, `labels`, `additions`, `deletions`, `changedFilesCount`, `viewedFilesCount`, `viewedFilesSummary`, `checkState`, `mergeState`, `titleDisplay`, `assignees`, `requestedReviewers` and `openConversationCount`, and `isDraft` sets the row's `section` (`open`/`draft`) - except `checkState` and `mergeState` (and the markers in `titleDisplay`), which it only replaces when also newer than the row's `ciFetchedAt`. Everything else comes only from a full refresh.

An open/draft row of a listed repo gets `data.live`:

| Field | Type | Notes |
| --- | --- | --- |
| `updatedAt` | string | GitHub's `updatedAt` for the PR when listed; absent when not listed |
| `detailsBehind` | boolean | GitHub's `updatedAt` is later than the row's `sourceUpdatedAt`: activity a full refresh hasn't fetched; absent when not listed |
| `stillOpen` | boolean | `true` when listed; `false` (the only field then) when a complete listing after the row was written didn't include it (merged or closed since) |

A row not in a listing that's older than it, or incomplete, gets no `data.live`.

## User-state schema (separate file)

User-authored fields are persisted in `view-prs/data/check-open-pr-updates.user-state.json` and validated by `view-prs/check-open-pr-updates.user-state.schema.json`.

Top-level user-state fields:

| Field | Type | Notes |
| --- | --- | --- |
| `notesByPrNumber` | object | Per-PR notes keyed by `repo#number`, as the data file's rows (bare-number keys from before 2026-11-02 move to their PR's repo key when the data is read: the repo of the row with that number - the last run's repo when several repos have one - or the last run's repo when none does) |
| `ackByRepo` | object | Repo-scoped ack timestamps |
| `ackHistoryByRepo` | object | Optional. Every Ack of a PR, oldest first: repo -> PR number -> times. The current Ack (`ackByRepo`) is the last; Clear Ack takes it back out, new activity clearing it keeps it |
| `reverifyByRepo` | object | Repo-scoped reverify flags |
| `inReviewByRepo` | object | Repo-scoped in-review flags |
| `flaggedByRepo` | object | Repo-scoped flagged toggles |
| `threadChecksByRepo` | object | Optional. Conversations you started that someone else resolved, confirmed handled: repo -> PR number -> thread id -> the thread's signature when confirmed (who resolved it, how many submitted comments, the last one's id); a confirmation holds while that's unchanged |
| `customSectionsByRepo` | object | Optional. The custom sections each PR was put in (from its More actions): repo -> PR number -> section ids. The sections themselves (name, icon, colour) are in `user-defaults.json`'s `customSections`; removing one takes its id out of every PR here |

`notesByPrNumber[key]` shape:

| Field | Type | Required |
| --- | --- | --- |
| `comments` | object[] | yes |
| `otherNotes` | string | yes |

`notesByPrNumber[prNumber].comments[]` shape:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable ID for PR-linked note edits |
| `author` | string | Author/login label stored with the note |
| `tone` | string, one of `Positive`, `Negative`, `Neutral` | Sentiment for the PR-linked note |
| `note` | string | Freeform PR-linked note text |
| `createdAt` | ISO timestamp string | Optional on legacy entries; when present it must use UTC second precision (`YYYY-MM-DDTHH:mm:ssZ`). Save normalization strips milliseconds and backfills missing values from comment ids/current time. |
| `updatedAt` | ISO timestamp string | Optional on legacy entries; when present it must use UTC second precision (`YYYY-MM-DDTHH:mm:ssZ`). Save normalization strips milliseconds and falls back to `createdAt` when missing. |

## Author-comments schema (separate file)

Manual author-level comments are persisted in `view-prs/data/check-open-pr-updates.author-comments.json` and validated by `view-prs/src/schema/check-open-pr-updates.author-comments.schema.json`.

Top-level author-comments fields:

| Field | Type | Notes |
| --- | --- | --- |
| `byAuthorLogin` | object | Author-scoped manual comments keyed by `authorLogin` |

`byAuthorLogin[authorLogin]` shape:

| Field | Type | Required |
| --- | --- | --- |
| `comments` | object[] | yes |

`byAuthorLogin[authorLogin].comments[]` shape:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable ID for edit operations |
| `note` | string | Freeform manual comment text |
| `sentiment` | string | one of `positive`, `negative`, `neutral` |
| `createdAt` | ISO timestamp string | Date/time the comment was first added |
| `updatedAt` | ISO timestamp string | Date/time of most recent edit |

Protected-write and backup behavior for this file mirrors user-state protections:

- full clears are blocked by default
- large shrink operations are blocked by retain-ratio checks
- explicit override requires `VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE=true`
- backup snapshots are written to `view-prs/data/backups`

## Intentionally excluded legacy fields

These fields are not part of the current schema because the current retrieval and notes writers do not persist them, even though some fallback UI code can still tolerate them if they exist in older data.

| Field | Why excluded |
| --- | --- |
| `data.createdAt` | Read only by UI fallback event generation, but not written by current retrieval output |
| `data.mergedBy` | Read only by UI fallback event generation, but not written by current retrieval output |
| `data.author.login` and `data.author.name` object shape | Older nested-author fallback shape is not written; current schema stores `author` and `authorLogin` as separate scalar fields |

## Practical notes

- Row-level counts such as `approvalCount`, `openConversationCount`, `viewedFilesCount`, and `changedFilesCount` are stored as strings because the shell writer passes them via `--arg`.
- Metric counts inside `metrics` are stored as numbers because they are produced with `--argjson`.
- The file may contain older rows that still include legacy fields. Those fields are historical residue, not part of the current schema.
