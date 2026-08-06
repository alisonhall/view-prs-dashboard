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
    "923": {
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
| `byPrNumber` | object | yes | retrieval | PR rows keyed by PR number string |
| `lastRun` | object or null | no | retrieval | Last retrieval run metadata |

### `lastRun`

| Field | Type |
| --- | --- |
| `repo` | string |
| `updatedAt` | string, ISO-8601 UTC timestamp |

## `byPrNumber` entry schema

Each `byPrNumber[prNumber]` value is an object with this shape:

| Field | Type | Required | Written by | Notes |
| --- | --- | --- | --- | --- |
| `prNumber` | string | yes | retrieval | Duplicates the map key |
| `repo` | string | yes | retrieval | `owner/name` |
| `section` | string | yes | retrieval | One of `open`, `draft`, `merged` |
| `updatedAt` | string | yes | retrieval | Run timestamp |
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
| `sourceUpdatedAt` | string | yes | Head/source branch updated timestamp |
| `sourceFingerprint` | string | no | Cached source fingerprint token (for example `fp:v2:sha256:<hex>`) used to detect unchanged rows |
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
| `activityTimelineSummary` | string | yes | Rendered as an HTML table showing activity grouped by date. All dates with activity are shown; weekday dates (Mon-Fri) without activity display a dash; weekend dates (Sat-Sun) without activity are omitted. Timeline extends from today to oldest activity for open PRs, or newest to oldest activity for merged PRs. |
| `activityTimeline` | object[] | no | Bucketed activity timeline (inline for legacy rows; externalized when `detailRef` is present) |
| `baseline` | string | yes | Effective baseline timestamp or empty string |
| `reason` | string | yes | `-` or a changed-reason string |

Notes:

- When present, `additions` and `deletions` are used by the UI `More insights` panel to render a GitHub-style `Lines changed` summary (`<files> changed, +<additions>, -<deletions>, <total> lines changed`).

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

## User-state schema (separate file)

User-authored fields are persisted in `view-prs/data/check-open-pr-updates.user-state.json` and validated by `view-prs/check-open-pr-updates.user-state.schema.json`.

Top-level user-state fields:

| Field | Type | Notes |
| --- | --- | --- |
| `notesByPrNumber` | object | Per-PR notes keyed by PR number |
| `ackByRepo` | object | Repo-scoped ack timestamps |
| `reverifyByRepo` | object | Repo-scoped reverify flags |
| `inReviewByRepo` | object | Repo-scoped in-review flags |
| `flaggedByRepo` | object | Repo-scoped flagged toggles |

`notesByPrNumber[prNumber]` shape:

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
