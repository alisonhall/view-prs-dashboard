#!/usr/bin/env bash
# compute_pr_state_json and its helpers as they were in bash and jq, before
# the row computation moved to compute-pr-row.js (ROADMAP.md, Data freshness
# step 6). Only for compute-pr-row.parity.test.js, which sources this over
# check-open-pr-updates.sh and checks the Node module gives the same rows.

normalize_author_name() {
  local login="$1"
  local name="$2"
  local normalized

  if [[ -z "$name" || "$name" == 'null' ]]; then
    printf '%s' "$login"
    return
  fi

  normalized="$name"
  if [[ "$name" == *,* ]]; then
    local last
    local first
    last="${name%%,*}"
    first="${name#*,}"
    last=$(printf '%s' "$last" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
    first=$(printf '%s' "$first" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
    normalized="$first $last"
  fi

  normalized=$(printf '%s' "$normalized" | sed -E 's/[[:space:]]+/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//')
  printf '%s' "$normalized"
}

count_external_commits() {
  local detail_json="$1"
  local since="${2:-}"
  printf '%s' "$detail_json" | jq -r \
    --arg me "$VIEWER_LOGIN" \
    --arg since "$since" \
    --arg ignorePatterns "$CHANGE_FILTER_IGNORE_COMMIT_PATTERNS" \
    --argjson mergePatterns "$MERGE_COMMIT_HEADLINE_PATTERNS_JSON" \
    --argjson mergeLogins "$MERGE_COMMIT_LOGINS_JSON" '
    ($mergeLogins | map(ascii_downcase)) as $mergeLoginList
    | [
      .commits[]?
      | select(any(.authors[]?; .login != null and .login != $me))
      | select($since == "" or (.committedDate // "") > $since)
      | (.messageHeadline // "") as $headline
      | select((any($mergePatterns[]; . as $pattern | try ($headline | test($pattern; "i")) catch false)) | not)
      | select(([.authors[]? | .login // empty | ascii_downcase] as $logins
          | ($mergeLoginList | length) > 0 and ($logins | length) > 0
            and all($logins[]; . as $login | $mergeLoginList | index($login) != null)) | not)
      | select(($ignorePatterns | length) == 0 or (($headline | test($ignorePatterns)) | not))
    ]
    | length
  '
}

normalize_pr_comments_json() {
  local detail_json="$1"
  printf '%s' "$detail_json" | jq -c '
    [
      .comments[]?
      | {
          id: (.id // ""),
          authorLogin: (.author.login // "unknown"),
          authorName: (.author.name // ""),
          authorAssociation: (.authorAssociation // ""),
          createdAt: (.createdAt // ""),
          publishedAt: (.publishedAt // .createdAt // ""),
          body: (.body // ""),
          url: (.url // "")
        }
      | select(.createdAt != "")
    ]
    | sort_by(.createdAt, .id)
  '
}

normalize_pr_reviews_json() {
  local detail_json="$1"
  printf '%s' "$detail_json" | jq -c '
    [
      .reviews[]?
      | {
          id: (.id // ""),
          authorLogin: (.author.login // "unknown"),
          authorName: (.author.name // ""),
          authorAssociation: (.authorAssociation // ""),
          submittedAt: (.submittedAt // ""),
          state: (.state // ""),
          body: (.body // ""),
          url: (.url // ""),
          commitOid: (.commit.oid // "")
        }
      | select(.submittedAt != "")
    ]
    | sort_by(.submittedAt, .id)
  '
}

normalize_pr_commits_json() {
  local detail_json="$1"
  printf '%s' "$detail_json" | jq -c '
    [
      .commits[]?
      | {
          oid: (.oid // ""),
          committedAt: (.committedDate // ""),
          messageHeadline: (.messageHeadline // ""),
          messageBody: (.messageBody // ""),
          authors: [
            (.authors // [])[]?
            | {
                login: (.login // ""),
                name: (.name // ""),
                email: (.email // "")
              }
          ]
        }
      | select(.committedAt != "")
      | select(((.messageHeadline // "") | test("^(Merge (branch|remote-tracking branch).*(main|origin/main)|Merge main into )")) | not)
    ]
    | sort_by(.committedAt, .oid)
  '
}

build_comment_events_json() {
  local comments_json="$1"
  local review_threads_json="$2"
  local review_comments_json="${3:-[]}"  # REST /pulls/{n}/comments fallback
  jq -cn \
    --argjson comments "$comments_json" \
    --argjson reviewThreads "$review_threads_json" \
    --argjson reviewComments "$review_comments_json" '
    [
      ($comments[]? | {
        sourceId: (.id // ""),
        threadId: "",
        occurredAt: (.createdAt // ""),
        date: ((.createdAt // "") | split("T") | .[0]),
        actor: (.authorLogin // "unknown"),
        type: "comment",
        channel: "top-level",
        body: (.body // ""),
        url: (.url // "")
      }),
      ($reviewThreads[]? as $thread
        | $thread.comments[]?
        | {
            sourceId: (.id // ""),
            threadId: ($thread.id // ""),
            occurredAt: (.createdAt // ""),
            date: ((.createdAt // "") | split("T") | .[0]),
            actor: (.authorLogin // "unknown"),
            type: "comment",
            channel: "thread",
            body: (.body // ""),
            url: (.url // ""),
            replyToId: (.replyToId // ""),
            conversationResolved: ($thread.isResolved // false)
          }
      ),
      ($reviewComments[]? | {
        sourceId: (.id // ""),
        threadId: (if (.reviewId // "") != "" then ("review-" + .reviewId) else "" end),
        occurredAt: (.createdAt // ""),
        date: ((.createdAt // "") | split("T") | .[0]),
        actor: (.authorLogin // "unknown"),
        type: "comment",
        channel: "thread",
        body: (.body // ""),
        url: (.url // ""),
        replyToId: (.inReplyToId // ""),
        conversationResolved: false
      })
    ]
    | map(select(.occurredAt != "" and .date != ""))
    | unique_by(
        ((.url // "") + "|" +
        (.occurredAt // "") + "|" +
        (.actor // "") + "|" +
        (.channel // "") + "|" +
        (.body // ""))
      )
    | sort_by(.occurredAt, .actor, .channel, .sourceId)
  '
}

build_activity_events_json() {
  local comment_events_json="$1"
  local reviews_json="$2"
  local commits_json="$3"
  local created_at="$4"
  local author_login="$5"
  local merged_at="$6"
  local merged_by_login="$7"
  local closed_at="${8:-}"

  jq -cn \
    --argjson commentEvents "$comment_events_json" \
    --argjson reviews "$reviews_json" \
    --argjson commits "$commits_json" \
    --arg createdAt "$created_at" \
    --arg actor "$author_login" \
    --arg mergedAt "$merged_at" \
    --arg mergedBy "$merged_by_login" \
    --arg closedAt "$closed_at" '
    [
      ($commentEvents[]?),
      ($reviews[]? | {
        sourceId: (.id // ""),
        threadId: "",
        occurredAt: (.submittedAt // ""),
        date: ((.submittedAt // "") | split("T") | .[0]),
        actor: (.authorLogin // "unknown"),
        type: (if .state == "APPROVED" then "approval" else "review" end),
        channel: "review",
        state: (.state // ""),
        body: (.body // ""),
        url: (.url // ""),
        commitOid: (.commitOid // "")
      }),
      ($commits[]? as $commit
        | $commit.authors[]?
        | select(((.login // "") != "") or ((.name // "") != "") or ((.email // "") != ""))
        | {
            sourceId: ($commit.oid // ""),
            threadId: "",
            occurredAt: ($commit.committedAt // ""),
            date: (($commit.committedAt // "") | split("T") | .[0]),
            actor: (if (.login // "") != "" then .login elif (.name // "") != "" then .name elif (.email // "") != "" then .email else "unknown" end),
            type: "commit",
            channel: "commit",
            messageHeadline: ($commit.messageHeadline // ""),
            messageBody: ($commit.messageBody // "")
          }
      ),
      (if $createdAt != "" then {
        sourceId: "opened",
        threadId: "",
        occurredAt: $createdAt,
        date: ($createdAt | split("T") | .[0]),
        actor: (if ($actor // "") != "" then $actor else "unknown" end),
        type: "opened",
        channel: "system"
      } else empty end),
      (if $mergedAt != "" then {
        sourceId: "merged",
        threadId: "",
        occurredAt: $mergedAt,
        date: ($mergedAt | split("T") | .[0]),
        actor: (if ($mergedBy // "") != "" then $mergedBy else "unknown" end),
        type: "merged",
        channel: "system"
      } else empty end),
      (if $closedAt != "" and $mergedAt == "" then {
        sourceId: "closed",
        threadId: "",
        occurredAt: $closedAt,
        date: ($closedAt | split("T") | .[0]),
        actor: "unknown",
        type: "closed",
        channel: "system"
      } else empty end)
    ]
    | map(select(.occurredAt != "" and .date != ""))
    | sort_by(.occurredAt, .actor, .type, .channel, .sourceId)
  '
}

build_activity_timeline_json() {
  local activity_events_json="$1"
  printf '%s' "$activity_events_json" | jq -c '
    sort_by(.occurredAt, .actor, .type, .channel, .sourceId)
    | reduce .[] as $event (
        [];
        if length == 0 then
          [{
            date: $event.date,
            actor: $event.actor,
            type: $event.type,
            count: 1,
            earliestAt: $event.occurredAt,
            latestAt: $event.occurredAt,
            channels: ([$event.channel] | map(select(. != null and . != ""))),
            events: [$event]
          }]
        else
          (.[length - 1]) as $last
          | if ($last.date == $event.date and $last.actor == $event.actor and $last.type == $event.type) then
              .[length - 1] = ($last
                | .count += 1
                | .latestAt = $event.occurredAt
                | .channels = (((.channels // []) + [$event.channel]) | map(select(. != null and . != "")) | unique)
                | .events = ((.events // []) + [$event])
              )
            else
              . + [{
                date: $event.date,
                actor: $event.actor,
                type: $event.type,
                count: 1,
                earliestAt: $event.occurredAt,
                latestAt: $event.occurredAt,
                channels: ([$event.channel] | map(select(. != null and . != ""))),
                events: [$event]
              }]
            end
        end
      )
    | sort_by(.date, .latestAt, .actor, .type)
    | reverse
  '
}

build_activity_timeline_summary() {
  local activity_timeline_json="$1"
  printf '%s' "$activity_timeline_json" | jq -r '
    def type_label($type; $count):
      if $type == "comment" then (if $count > 1 then "comments" else "comment" end)
      elif $type == "review" then (if $count > 1 then "reviews" else "review" end)
      elif $type == "approval" then "approved"
      elif $type == "commit" then (if $count > 1 then "commits" else "commit" end)
      elif $type == "opened" then "opened PR"
      elif $type == "merged" then "merged PR"
      elif $type == "closed" then "closed PR"
      else (if $count > 1 then ($type + "s") else $type end)
      end;

    sort_by(.date, .latestAt, .actor, .type)
    | reverse
    | group_by(.date)
    | map(
        .[0].date + ": " + (
          map(
            if .count > 1 then
              (.actor + " " + (type_label(.type; .count)) + " (" + (.count | tostring) + ")")
            else
              (.actor + " " + (type_label(.type; .count)))
            end
          )
          | join("; ")
        )
      )
    | join("\n")
  '
}

build_pr_metrics_json() {
  local comments_json="$1"
  local reviews_json="$2"
  local commits_json="$3"
  local review_threads_json="$4"
  local comment_events_json="$5"
  local activity_events_json="$6"
  local author_login="$7"
  local merged_at="$8"

  local metrics_payload_dir metrics_out metrics_status
  metrics_payload_dir=$(mktemp -d)
  printf '%s' "${comments_json:-[]}" >"$metrics_payload_dir/comments.json"
  printf '%s' "${reviews_json:-[]}" >"$metrics_payload_dir/reviews.json"
  printf '%s' "${commits_json:-[]}" >"$metrics_payload_dir/commits.json"
  printf '%s' "${review_threads_json:-[]}" >"$metrics_payload_dir/review-threads.json"
  printf '%s' "${comment_events_json:-[]}" >"$metrics_payload_dir/comment-events.json"
  printf '%s' "${activity_events_json:-[]}" >"$metrics_payload_dir/activity-events.json"

  metrics_out=$(jq -cn \
    --rawfile comments_raw "$metrics_payload_dir/comments.json" \
    --rawfile reviews_raw "$metrics_payload_dir/reviews.json" \
    --rawfile commits_raw "$metrics_payload_dir/commits.json" \
    --rawfile review_threads_raw "$metrics_payload_dir/review-threads.json" \
    --rawfile comment_events_raw "$metrics_payload_dir/comment-events.json" \
    --rawfile activity_events_raw "$metrics_payload_dir/activity-events.json" \
    --arg authorLogin "$author_login" \
    --arg mergedAt "$merged_at" '
    (($comments_raw | fromjson?) // []) as $comments
    | (($reviews_raw | fromjson?) // []) as $reviews
    | (($commits_raw | fromjson?) // []) as $commits
    | (($review_threads_raw | fromjson?) // []) as $reviewThreads
    | (($comment_events_raw | fromjson?) // []) as $commentEvents
    | (($activity_events_raw | fromjson?) // []) as $activityEvents
    | def non_empty_values: map(select(. != null and . != ""));
    def to_epoch($value): try ($value | fromdateiso8601) catch null;
    def minutes_between($start; $end):
      (to_epoch($start)) as $startEpoch
      | (to_epoch($end)) as $endEpoch
      | if $startEpoch == null or $endEpoch == null then null else (($endEpoch - $startEpoch) / 60 | floor) end;

    (
      [
        ($comments[]? | { login: (.authorLogin // ""), name: (.authorName // "") }),
        ($reviews[]? | { login: (.authorLogin // ""), name: (.authorName // "") }),
        ($reviewThreads[]? | .comments[]? | { login: (.authorLogin // ""), name: (.authorName // "") }),
        ($commits[]? | .authors[]? | { login: (.login // ""), name: (.name // "") })
      ]
      | map(select(.login != ""))
      | sort_by(.login, .name)
      | group_by(.login)
      | map({
          key: .[0].login,
          value: ((map(select(.name != .login) | .name) | non_empty_values | last) // "")
        })
      | map(select(.value != ""))
      | from_entries
    ) as $people
    | (
        $commentEvents
        | sort_by(.actor, .occurredAt, .sourceId)
        | group_by(.actor)
        | map({
            login: .[0].actor,
            name: ($people[.[0].actor] // .[0].actor),
            topLevelCount: (map(select(.channel == "top-level")) | length),
            threadCount: (map(select(.channel == "thread")) | length),
            resolvedThreadCount: (map(select(.channel == "thread" and .conversationResolved == true)) | length),
            openThreadCount: (map(select(.channel == "thread" and .conversationResolved == false)) | length),
            followedByAuthorCommitCount: ([
              .[]?
              | select((.occurredAt // "") != "") as $comment
              | [
                  $activityEvents[]?
                  | select(.type == "commit" and .actor == $authorLogin)
                  | select((.occurredAt // "") > ($comment.occurredAt // ""))
                ]
              | if length > 0 then 1 else 0 end
            ] | add // 0),
            followedByAuthorCommitWithin24hCount: ([
              .[]?
              | select((.occurredAt // "") != "") as $comment
              | [
                  $activityEvents[]?
                  | select(.type == "commit" and .actor == $authorLogin)
                  | select((.occurredAt // "") > ($comment.occurredAt // ""))
                  | select(
                      ((to_epoch(.occurredAt) // 0) - (to_epoch($comment.occurredAt) // 0)) <= (24 * 60 * 60)
                    )
                ]
              | if length > 0 then 1 else 0 end
            ] | add // 0),
            totalCount: length,
            firstCommentAt: ((map(.occurredAt) | non_empty_values | first) // ""),
            lastCommentAt: ((map(.occurredAt) | non_empty_values | last) // ""),
            isPrAuthor: (.[0].actor == $authorLogin),
            commentsOnOthersPr: (.[0].actor != $authorLogin)
          })
        | map(. + {
            usefulnessSignals: (
              .resolvedThreadCount
              + .followedByAuthorCommitCount
              + .followedByAuthorCommitWithin24hCount
            )
          })
        | sort_by(.totalCount, .lastCommentAt, .login)
        | reverse
      ) as $commentsByActor
    | (
        $reviews
        | sort_by(.authorLogin, .submittedAt, .id)
        | group_by(.authorLogin)
        | map({
            login: .[0].authorLogin,
            name: ($people[.[0].authorLogin] // .[0].authorName // .[0].authorLogin),
            reviewCount: length,
            approvalCount: (map(select(.state == "APPROVED")) | length),
            commentCount: (map(select(.state == "COMMENTED")) | length),
            changesRequestedCount: (map(select(.state == "CHANGES_REQUESTED")) | length),
            dismissedCount: (map(select(.state == "DISMISSED")) | length),
            lastReviewAt: ((map(.submittedAt) | non_empty_values | last) // ""),
            lastApprovalAt: ((map(select(.state == "APPROVED") | .submittedAt) | non_empty_values | last) // ""),
            isPrAuthor: (.[0].authorLogin == $authorLogin),
            reviewsOnOthersPr: (.[0].authorLogin != $authorLogin)
          })
        | sort_by(.approvalCount, .reviewCount, .lastReviewAt, .login)
        | reverse
      ) as $reviewsByActor
    | (
        [
          $reviews[]?
          | select(.state == "APPROVED") as $approval
          | {
              login: ($approval.authorLogin // "unknown"),
              name: ($people[$approval.authorLogin] // $approval.authorName // $approval.authorLogin // "unknown"),
              approvedAt: ($approval.submittedAt // ""),
              mergeLeadMinutes: minutes_between(($approval.submittedAt // ""); $mergedAt),
              commentCountAfterApproval: ([
                $activityEvents[]?
                | select((.occurredAt // "") > ($approval.submittedAt // ""))
                | select(.type == "comment")
              ] | length),
              reviewCountAfterApproval: ([
                $activityEvents[]?
                | select((.occurredAt // "") > ($approval.submittedAt // ""))
                | select(.type == "review")
              ] | length),
              changeRequestCountAfterApproval: ([
                $reviews[]?
                | select((.submittedAt // "") > ($approval.submittedAt // ""))
                | select(.state == "CHANGES_REQUESTED")
              ] | length),
              commitCountAfterApproval: ([
                $activityEvents[]?
                | select((.occurredAt // "") > ($approval.submittedAt // ""))
                | select(.type == "commit")
              ] | length)
            }
          | .issueSignalsAfterApprovalCount = (
              .commentCountAfterApproval
              + .reviewCountAfterApproval
              + .changeRequestCountAfterApproval
              + .commitCountAfterApproval
            )
          | .highRiskApproval = (
              (.changeRequestCountAfterApproval > 0)
              or (.issueSignalsAfterApprovalCount >= 3)
            )
          | .riskyApproval = (.issueSignalsAfterApprovalCount > 0)
        ]
      ) as $approvals
    | ([ $reviewThreads[]? | select(.isResolved == false) ] | length) as $openThreads
    | ([ $reviewThreads[]? | select(.isResolved == true) ] | length) as $resolvedThreads
    | ([ $commentEvents[]? | select(.channel == "top-level") | .sourceId ] | map(select(. != "")) | unique | length) as $topLevelConversations
    | ([ $activityEvents[]?
         | select(.channel == "review")
         | select(.type == "review" or .type == "approval")
         | .sourceId
       ] | map(select(. != "")) | unique | length) as $reviewConversations
    | (if ($reviewThreads | length) > 0 then ($reviewThreads | length) else ($topLevelConversations + $reviewConversations) end) as $estimatedTotalConversations
    | (if ($reviewThreads | length) > 0 then $openThreads else ($topLevelConversations + ([ $reviews[]? | select(.state == "CHANGES_REQUESTED") ] | length)) end) as $estimatedOpenConversations
    | {
        counts: {
          topLevelComments: ($comments | length),
          threadComments: ([ $reviewThreads[]? | (.comments // [])[]? ] | length),
          totalComments: ($commentEvents | length),
          reviews: ($reviews | length),
          approvals: ([ $reviews[]? | select(.state == "APPROVED") ] | length),
          commits: ($commits | length),
          conversations: $estimatedTotalConversations,
          openConversations: $estimatedOpenConversations
        },
        commentsByActor: $commentsByActor,
        reviewsByActor: $reviewsByActor,
        approvals: $approvals,
        approvalSummary: {
          totalApprovals: ($approvals | length),
          riskyApprovals: ([ $approvals[]? | select(.riskyApproval == true) ] | length),
          highRiskApprovals: ([ $approvals[]? | select(.highRiskApproval == true) ] | length),
          approvalsWithChangeRequestsAfter: ([ $approvals[]? | select(.changeRequestCountAfterApproval > 0) ] | length),
          approvalsWithCommentsAfter: ([ $approvals[]? | select(.commentCountAfterApproval > 0) ] | length),
          approvalsWithCommitsAfter: ([ $approvals[]? | select(.commitCountAfterApproval > 0) ] | length),
          averageMergeLeadMinutes: (
            [ $approvals[]? | .mergeLeadMinutes | select(. != null) ] as $mergeLeadMinutes
            | if ($mergeLeadMinutes | length) == 0 then null else (($mergeLeadMinutes | add) / ($mergeLeadMinutes | length) | floor) end
          )
        },
        commentUsefulnessSummary: {
          commentsOnOthersPrs: ([ $commentsByActor[]? | select(.commentsOnOthersPr == true) | .totalCount ] | add // 0),
          resolvedThreadCommentsOnOthersPrs: ([ $commentsByActor[]? | select(.commentsOnOthersPr == true) | .resolvedThreadCount ] | add // 0),
          commentsFollowedByAuthorCommit: ([ $commentsByActor[]? | select(.commentsOnOthersPr == true) | .followedByAuthorCommitCount ] | add // 0),
          commentsFollowedByAuthorCommitWithin24h: ([ $commentsByActor[]? | select(.commentsOnOthersPr == true) | .followedByAuthorCommitWithin24hCount ] | add // 0),
          usefulnessSignals: ([ $commentsByActor[]? | select(.commentsOnOthersPr == true) | .usefulnessSignals ] | add // 0)
        },
        conversationSummary: {
          totalThreads: ($reviewThreads | length),
          openThreads: $openThreads,
          resolvedThreads: $resolvedThreads,
          totalThreadComments: ([ $reviewThreads[]? | (.comments // [])[]? ] | length),
          topLevelConversations: $topLevelConversations,
          reviewConversations: $reviewConversations,
          estimatedTotalConversations: $estimatedTotalConversations,
          estimatedOpenConversations: $estimatedOpenConversations
        }
      }
  ')
  metrics_status=$?
  rm -rf "$metrics_payload_dir"
  if [[ "$metrics_status" -ne 0 ]]; then
    return "$metrics_status"
  fi

  printf '%s' "$metrics_out"
}

build_reasons() {
  local reasons=''
  while [[ $# -gt 1 ]]; do
    local label="$1"
    local value="$2"
    shift 2
    if [[ "$value" -gt 0 ]]; then
      if [[ -z "$reasons" ]]; then
        reasons="$label"
      else
        reasons+="|$label"
      fi
    fi
  done
  printf '%s' "$reasons"
}

compute_pr_state_json() {
  local pr_json="$1"

  local number title url merged_at closed_at created_at merged_by_login source_updated_at source_branch target_branch additions deletions author_login author_name author_display author_is_viewer labels_json
  local detail_json comments_json reviews_json requested_reviewers_json commits_json assignees_json threads_json comment_events_json activity_events_json metrics_json source_fingerprint
  local my_last my_latest_review_state approved approval_count approval_count_others approval_count_all
  local approvers_all_json approvers_json
  local ack_at effective_last reverify_required in_review_required
  local external_top_comment_count external_review_count external_commit_count
  local unresolved_unanswered_count recent_thread_reply_count open_conversation_count
  local viewed_files_stats_json viewed_files_count changed_files_count viewed_files_summary
  local activity_timeline_json activity_timeline_summary
  local status changed_reason
  local check_state merge_state title_display
  local row_payload_dir row_json_out jq_status

  number=$(printf '%s' "$pr_json" | jq -r '.number')
  emit_pr_progress_marker 'START' "$number"
  title=$(printf '%s' "$pr_json" | jq -r '.title')
  url=$(printf '%s' "$pr_json" | jq -r '.url')
  merged_at=$(printf '%s' "$pr_json" | jq -r '.mergedAt // ""')
  closed_at=$(printf '%s' "$pr_json" | jq -r '.closedAt // ""')
  created_at=$(printf '%s' "$pr_json" | jq -r '.createdAt // ""')
  merged_by_login=$(printf '%s' "$pr_json" | jq -r '.mergedBy.login // ""')
  source_updated_at=$(printf '%s' "$pr_json" | jq -r '.updatedAt // ""')
  source_branch=$(printf '%s' "$pr_json" | jq -r '.headRefName // ""')
  target_branch=$(printf '%s' "$pr_json" | jq -r '.baseRefName // ""')
  additions=$(printf '%s' "$pr_json" | jq -r '.additions // 0 | tostring')
  deletions=$(printf '%s' "$pr_json" | jq -r '.deletions // 0 | tostring')
  labels_json=$(printf '%s' "$pr_json" | jq -c '.labels // [] | map(if type == "object" then (.name // "") else (tostring) end)')
  author_login=$(printf '%s' "$pr_json" | jq -r '.author.login // "-"')
  author_name=$(printf '%s' "$pr_json" | jq -r '.author.name // ""')
  author_display=$(normalize_author_name "$author_login" "$author_name")

  author_is_viewer=0
  [[ "$author_login" == "$VIEWER_LOGIN" ]] && author_is_viewer=1

  # Details or review threads that couldn't be fetched: no row, rather than
  # one computed from nothing (no reviews, threads or activity). The run
  # keeps the stored row and reports the PR (note_unfetched_pr).
  if ! detail_json=$(get_pr_detail_json "$number") || ! printf '%s' "$detail_json" | jq -e 'type == "object"' >/dev/null 2>&1; then
    emit_pr_progress_marker 'END' "$number"
    return 1
  fi
  comments_json=$(normalize_pr_comments_json "$detail_json")
  reviews_json=$(normalize_pr_reviews_json "$detail_json")
  requested_reviewers_json=$(printf '%s' "$detail_json" | jq -c '
    [
      .reviewRequests[]?
      | (.requestedReviewer // .reviewer // .user // .)
      | select(type == "object")
      | {
          login: (.login // ""),
          name: (.name // "")
        }
      | select(.login != "")
    ]
    | unique_by(.login)
  ')
  local requested_reviewer_logins_json
  requested_reviewer_logins_json=$(printf '%s' "$requested_reviewers_json" | jq -c '
    [.[]? | (.login // "") | select(. != "")]
    | unique
  ')
  commits_json=$(normalize_pr_commits_json "$detail_json")
  assignees_json=$(printf '%s' "$detail_json" | jq -c '
    [
      .assignees[]?
      | {
          login: (.login // ""),
          name: (.name // "")
        }
      | select(.login != "")
    ]
  ')
  if ! threads_json=$(fetch_review_threads_json "$number"); then
    emit_pr_progress_marker 'END' "$number"
    return 1
  fi
  local review_comments_json
  review_comments_json=$(fetch_pr_review_comments_json "$number") || review_comments_json='[]'
  local review_url_map_json
  review_url_map_json=$(fetch_pr_review_url_map_json "$number") || review_url_map_json='{}'
  reviews_json=$(printf '%s' "$reviews_json" | jq -c --argjson urlMap "$review_url_map_json" '
    map(. + {url: ($urlMap[(.submittedAt + "_" + .authorLogin)] // .url // "")})
  ')

  local review_comment_body_map_json
  review_comment_body_map_json=$(printf '%s' "$review_comments_json" | jq -c '
    reduce .[] as $comment (
      {};
      ($comment.reviewId // "") as $reviewId
      | if $reviewId == "" then
          .
        elif (($comment.body // "") == "") then
          .
        else
          . + {($reviewId): (.[ $reviewId ] // $comment.body)}
        end
    )
  ' 2>/dev/null) || review_comment_body_map_json='{}'
  [[ -z "$review_comment_body_map_json" ]] && review_comment_body_map_json='{}'

  local review_comment_url_map_json
  review_comment_url_map_json=$(printf '%s' "$review_comments_json" | jq -c '
    reduce .[] as $comment (
      {};
      ($comment.reviewId // "") as $reviewId
      | if $reviewId == "" then
          .
        elif (($comment.url // "") == "") then
          .
        else
          . + {($reviewId): (.[ $reviewId ] // $comment.url)}
        end
    )
  ' 2>/dev/null) || review_comment_url_map_json='{}'
  [[ -z "$review_comment_url_map_json" ]] && review_comment_url_map_json='{}'

  reviews_json=$(printf '%s' "$reviews_json" | jq -c --argjson reviewBodyMap "$review_comment_body_map_json" --argjson reviewUrlMap "$review_comment_url_map_json" '
    map(
      . as $review
      | .url as $url
      | (($url | split("pullrequestreview-") | .[1] // "") | split("?") | .[0] // "") as $reviewId
      | . + {
          body: (
            if (($review.body // "") != "") then
              $review.body
            elif $reviewId != "" then
              ($reviewBodyMap[$reviewId] // "")
            else
              ""
            end
          ),
          url: (
            if $reviewId != "" and (($reviewUrlMap[$reviewId] // "") != "") then
              $reviewUrlMap[$reviewId]
            else
              ($review.url // "")
            end
          )
        }
    )
  ')

  comment_events_json=$(build_comment_events_json "$comments_json" "$threads_json" "$review_comments_json")
  activity_events_json=$(build_activity_events_json "$comment_events_json" "$reviews_json" "$commits_json" "$created_at" "$author_login" "$merged_at" "$merged_by_login" "$closed_at")
  activity_timeline_json=$(build_activity_timeline_json "$activity_events_json")
  activity_timeline_summary=$(build_activity_timeline_summary "$activity_timeline_json")
  metrics_json=$(build_pr_metrics_json "$comments_json" "$reviews_json" "$commits_json" "$threads_json" "$comment_events_json" "$activity_events_json" "$author_login" "$merged_at")

  # Includes the viewer's own review-thread comments (inline diff replies),
  # not just top-level PR comments/submitted reviews/commits - a viewer who
  # only replies inline (a common review flow, e.g. answering a thread
  # without submitting a formal review) previously had no activity here at
  # all, leaving effective_last empty below even though the "N open
  # conversations with me" summary (getOpenConversationCountWithMe in
  # src/ui/helpers/pr-open-conversation-count.helpers.ts) already proves the viewer's own thread comments exist.
  # Not verbatim: the commits line read the author's committedDate
  # (authors have none), so the viewer's commits never counted. Fixed in
  # both this and compute-pr-row.js.
  my_last=$(jq -nr --arg me "$VIEWER_LOGIN" --argjson detail "$detail_json" --argjson threads "${threads_json:-[]}" '
    [
      ($detail.comments[]? | select(.author.login == $me) | .createdAt),
      ($detail.reviews[]? | select(.author.login == $me) | .submittedAt),
      ($detail.commits[]? | select(any(.authors[]?; .login == $me)) | .committedDate),
      ($threads[]? | .comments[]? | select(.authorLogin == $me) | .createdAt)
    ]
    | map(select(. != null and . != ""))
    | sort
    | last // ""
  ')

  ack_at=$(get_ack_ts "$number")
  effective_last="$my_last"
  if [[ -n "$ack_at" && ( -z "$effective_last" || "$ack_at" > "$effective_last" ) ]]; then
    effective_last="$ack_at"
  fi

  if [[ -n "$effective_last" ]]; then
    external_top_comment_count=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" --arg since "$effective_last" --arg ignoreAuthors "$CHANGE_FILTER_IGNORE_COMMENT_AUTHORS" '
      ($ignoreAuthors | split(",") | map(select(length > 0))) as $ignored
      | [.comments[]? 
         | select((.author.login // "") != "" and .author.login != $me) 
         | select((.createdAt // "") > $since)
         | select(($ignored | length) == 0 or (.author.login as $author | $ignored | index($author) | not))
        ] 
      | length
    ')
    external_review_count=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" --arg since "$effective_last" --arg ignoreAuthors "$CHANGE_FILTER_IGNORE_REVIEW_AUTHORS" '
      ($ignoreAuthors | split(",") | map(select(length > 0))) as $ignored
      | [
        .reviews[]?
        | select((.author.login // "") != "" and .author.login != $me)
        | select((.submittedAt // "") > $since)
        | select((.state // "") != "APPROVED")
        | select(($ignored | length) == 0 or (.author.login as $author | $ignored | index($author) | not))
      ]
      | length
    ')
    external_commit_count=$(count_external_commits "$detail_json" "$effective_last")
  else
    external_top_comment_count=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" --arg ignoreAuthors "$CHANGE_FILTER_IGNORE_COMMENT_AUTHORS" '
      ($ignoreAuthors | split(",") | map(select(length > 0))) as $ignored
      | [.comments[]? 
         | select((.author.login // "") != "" and .author.login != $me)
         | select(($ignored | length) == 0 or (.author.login as $author | $ignored | index($author) | not))
        ] 
      | length
    ')
    external_review_count=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" --arg ignoreAuthors "$CHANGE_FILTER_IGNORE_REVIEW_AUTHORS" '
      ($ignoreAuthors | split(",") | map(select(length > 0))) as $ignored
      | [
        .reviews[]?
        | select((.author.login // "") != "" and .author.login != $me)
        | select((.state // "") != "APPROVED")
        | select(($ignored | length) == 0 or (.author.login as $author | $ignored | index($author) | not))
      ]
      | length
    ')
    external_commit_count=$(count_external_commits "$detail_json")
  fi

  my_latest_review_state=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" '
    [
      .reviews[]?
      | select((.author.login // "") == $me and .submittedAt != null and .state != null)
      | { submittedAt: .submittedAt, state: .state }
    ]
    | sort_by(.submittedAt)
    | reduce .[] as $review ({state: ""};
        if $review.state == "APPROVED" then
          .state = "APPROVED"
        elif ($review.state == "CHANGES_REQUESTED" or $review.state == "DISMISSED") then
          .state = $review.state
        else
          .
        end
      )
    | .state
  ')
  if printf '%s' "$requested_reviewer_logins_json" | jq -e --arg me "$VIEWER_LOGIN" 'index($me) != null' >/dev/null 2>&1; then
    my_latest_review_state='RE_REQUESTED'
  fi

  approvers_all_json=$(printf '%s' "$detail_json" | jq -c --argjson requestedReviewerLogins "$requested_reviewer_logins_json" '
    [
      .reviews[]?
      | select(.author.login != null and .submittedAt != null and .state != null)
      | {
          login: .author.login,
          name: (.author.name // ""),
          state: .state,
          submittedAt: .submittedAt
        }
    ]
    | sort_by(.login, .submittedAt)
    | group_by(.login)
    | map(
        . as $reviewsByAuthor
        | ($reviewsByAuthor[0].login // "") as $login
        | ($reviewsByAuthor[0].name // "") as $name
        | (
            $reviewsByAuthor
            | reduce .[] as $review ({state: "", approvedAt: ""};
                if $review.state == "APPROVED" then
                  .state = "APPROVED"
                  | .approvedAt = ($review.submittedAt // .approvedAt)
                elif ($review.state == "CHANGES_REQUESTED" or $review.state == "DISMISSED") then
                  .state = $review.state
                  | .approvedAt = ""
                else
                  .
                end
              )
          ) as $effective
        | select($effective.state == "APPROVED")
        | { login: $login, name: $name, approvedAt: $effective.approvedAt }
      )
    | map(select((.login as $login | ($requestedReviewerLogins | index($login) | not))))
    | sort_by(.approvedAt)
  ')

  approvers_json="$approvers_all_json"
  if [[ "$author_is_viewer" -eq 1 ]]; then
    approvers_json=$(printf '%s' "$approvers_all_json" | jq -c --arg me "$VIEWER_LOGIN" '[.[] | select(.login != $me)]')
  fi

  approval_count_all=$(printf '%s' "$approvers_all_json" | jq -r 'length')
  approval_count_others=$(printf '%s' "$approvers_json" | jq -r 'length')

  approved='NO'
  if [[ "$author_is_viewer" -eq 1 ]]; then
    approval_count="$approval_count_others"
    [[ "$approval_count_others" -ge 2 ]] && approved='YES'
  else
    approval_count="$approval_count_all"
    [[ "$my_latest_review_state" == 'APPROVED' ]] && approved='YES'
  fi

  open_conversation_count=$(printf '%s' "$metrics_json" | jq -r '.conversationSummary.estimatedOpenConversations // .conversationSummary.openThreads // 0')

  # A merged/closed PR's files are settled, and seldom viewed after: its
  # stored counts stand once stored as such, saving their fetch (one or
  # more calls).
  viewed_files_stats_json=''
  if [[ -n "$merged_at" || -n "$closed_at" ]]; then
    viewed_files_stats_json=$(get_stored_viewed_files_stats_json "$number")
  fi
  [[ -z "$viewed_files_stats_json" ]] && viewed_files_stats_json=$(fetch_pr_viewed_files_stats_json "$number")
  viewed_files_count=$(printf '%s' "$viewed_files_stats_json" | jq -r '.viewedFiles // 0')
  changed_files_count=$(printf '%s' "$viewed_files_stats_json" | jq -r '.changedFiles // 0')
  viewed_files_summary="${viewed_files_count}/${changed_files_count} viewed"

  source_fingerprint=$(build_pr_source_fingerprint_value \
    "$detail_json" \
    "$comments_json" \
    "$reviews_json" \
    "$requested_reviewers_json" \
    "$commits_json" \
    "$assignees_json" \
    "$threads_json" \
    "$review_comments_json" \
    "$review_url_map_json" \
    "$viewed_files_stats_json" \
    "$(printf '%s' "$detail_json" | jq -c '{statusCheckRollup: (.statusCheckRollup // []), mergeable: (.mergeable // ""), mergeStateStatus: (.mergeStateStatus // "")}' 2>/dev/null || echo '{}')")

  unresolved_unanswered_count=0
  recent_thread_reply_count=0
  if [[ "$author_is_viewer" -eq 1 ]]; then
    if [[ -n "$effective_last" ]]; then
      unresolved_unanswered_count=$(printf '%s' "$threads_json" | jq -r --arg me "$VIEWER_LOGIN" --arg since "$effective_last" '
        [
          .[]?
          | select(.isResolved == false)
          | ((.comments // []) | sort_by(.createdAt) | last // null)
          | select(. != null)
          | select((.authorLogin // "") != "" and .authorLogin != $me)
          | select((.createdAt // "") > $since)
        ]
        | length
      ')
      recent_thread_reply_count=$(printf '%s' "$threads_json" | jq -r --arg me "$VIEWER_LOGIN" --arg since "$effective_last" '
        [
          .[]?
          | ((.comments // []) | sort_by(.createdAt) | last // null)
          | select(. != null)
          | select((.authorLogin // "") != "" and .authorLogin != $me)
          | select((.createdAt // "") > $since)
        ]
        | length
      ')
    else
      unresolved_unanswered_count=$(printf '%s' "$threads_json" | jq -r --arg me "$VIEWER_LOGIN" '
        [
          .[]?
          | select(.isResolved == false)
          | ((.comments // []) | sort_by(.createdAt) | last // null)
          | select(. != null)
          | select((.authorLogin // "") != "" and .authorLogin != $me)
        ]
        | length
      ')
      recent_thread_reply_count=$(printf '%s' "$threads_json" | jq -r --arg me "$VIEWER_LOGIN" '
        [
          .[]?
          | ((.comments // []) | sort_by(.createdAt) | last // null)
          | select(. != null)
          | select((.authorLogin // "") != "" and .authorLogin != $me)
        ]
        | length
      ')
    fi
  fi

  status='NO_CHANGE'
  changed_reason='-'

  if [[ "$author_is_viewer" -eq 1 ]]; then
    changed_reason=$(build_reasons 'unanswered-thread' "$unresolved_unanswered_count" 'thread-reply' "$recent_thread_reply_count" 'comment' "$external_top_comment_count" 'commit' "$external_commit_count")
    if [[ -n "$changed_reason" ]]; then
      status='CHANGED'
    else
      changed_reason='-'
    fi
  else
    if [[ -z "$effective_last" ]]; then
      status='NO_ACTIVITY'
      changed_reason='-'
    else
      changed_reason=$(build_reasons 'comment' "$external_top_comment_count" 'review' "$external_review_count" 'commit' "$external_commit_count")
      if [[ -n "$changed_reason" ]]; then
        status='CHANGED'
      else
        status='NO_CHANGE'
        changed_reason='-'
      fi
    fi
  fi

  # A PR acked earlier that has genuinely new activity since that ack
  # (effective_last is pinned to at least ack_at above, so a CHANGED status
  # here always means something happened after the ack) should no longer
  # read as acknowledged - clear it so the row's Ack button/state matches
  # the CHANGED status instead of contradicting it. Passes set_reverify=false
  # since changed_reason already carries the real reason (comment/review/
  # commit/etc.) - no need for the manual-clear-only 'ack-cleared' pin, which
  # would keep forcing CHANGED even once this activity ages out of
  # effective_last on a later run.
  if [[ "$status" == 'CHANGED' && -n "$ack_at" ]]; then
    clear_ack_ts "$number" false
  fi

  reverify_required=$(get_reverify_required "$number")
  if [[ "$reverify_required" == 'true' && "$status" == 'NO_CHANGE' ]]; then
    status='CHANGED'
    changed_reason='ack-cleared'
  fi

  # Populates row.inReview (checkbox state, "In Review" smart group) without
  # forcing status/changed_reason to CHANGED(in-review) — the dedicated
  # "In Review" and "Needs Attention" groups already surface these PRs, so
  # the status override is no longer needed to flag that they're being
  # worked on.
  in_review_required=$(get_in_review_required "$number")

  check_state=$(printf '%s' "$detail_json" | jq -r '
    def to_state:
      if .__typename == "CheckRun" then
        if (.status // "") != "COMPLETED" then "RUN"
        else
          ((.conclusion // "") | ascii_upcase) as $c
          | if $c == "SUCCESS" then "PASS"
            elif $c == "NEUTRAL" or $c == "SKIPPED" then "SKIP"
            elif $c == "" then "RUN"
            else "FAIL"
            end
        end
      elif .__typename == "StatusContext" then
        ((.state // "") | ascii_upcase) as $s
        | if $s == "SUCCESS" then "PASS"
          elif $s == "PENDING" or $s == "EXPECTED" then "RUN"
          elif $s == "" then "RUN"
          else "FAIL"
          end
      else "NA"
      end;
    ((.statusCheckRollup // []) | map(to_state)) as $states
    | if ($states | length) == 0 then "NA"
      elif ($states | any(. == "FAIL")) then "FAIL"
      elif ($states | any(. == "RUN")) then "RUN"
      elif ($states | any(. == "PASS")) then "PASS"
      elif ($states | any(. == "SKIP")) then "SKIP"
      else "NA"
      end
  ')

  merge_state=$(printf '%s' "$detail_json" | jq -r '
    ((.mergeable // "") | ascii_upcase) as $m
    | if $m == "MERGEABLE" then "YES"
      elif $m == "CONFLICTING" then "NO"
      elif $m == "UNKNOWN" then "UNK"
      elif $m == "" then "UNK"
      else $m
      end
  ')

  title_display="${title} [CHK:${check_state}][MRG:${merge_state}]"

  row_payload_dir=$(mktemp -d)
  printf '%s' "${approvers_json:-[]}" >"$row_payload_dir/approvers.json"
  printf '%s' "${comments_json:-[]}" >"$row_payload_dir/comments.json"
  printf '%s' "${reviews_json:-[]}" >"$row_payload_dir/reviews.json"
  printf '%s' "${requested_reviewers_json:-[]}" >"$row_payload_dir/requested-reviewers.json"
  printf '%s' "${commits_json:-[]}" >"$row_payload_dir/commits.json"
  printf '%s' "${assignees_json:-[]}" >"$row_payload_dir/assignees.json"
  printf '%s' "${threads_json:-[]}" >"$row_payload_dir/review-threads.json"
  printf '%s' "${comment_events_json:-[]}" >"$row_payload_dir/comment-events.json"
  printf '%s' "${activity_events_json:-[]}" >"$row_payload_dir/activity-events.json"
  printf '%s' "${metrics_json:-"{}"}" >"$row_payload_dir/metrics.json"
  printf '%s' "${activity_timeline_json:-[]}" >"$row_payload_dir/activity-timeline.json"
  printf '%s' "${labels_json:-[]}" >"$row_payload_dir/labels.json"

  row_json_out=$(jq -cn \
    --arg number "$number" \
    --arg title "$title" \
    --arg url "$url" \
    --arg mergedAt "$merged_at" \
    --arg closedAt "$closed_at" \
    --arg sourceUpdatedAt "$source_updated_at" \
    --arg sourceFingerprint "$source_fingerprint" \
    --arg sourceBranch "$source_branch" \
    --arg targetBranch "$target_branch" \
    --arg additions "$additions" \
    --arg deletions "$deletions" \
    --arg author "$author_display" \
    --arg authorLogin "$author_login" \
    --arg viewerLogin "$VIEWER_LOGIN" \
    --arg status "$status" \
    --arg approved "$approved" \
    --arg approvalCount "$approval_count" \
    --arg inReview "$in_review_required" \
    --arg baseline "$effective_last" \
    --arg reason "$changed_reason" \
    --arg titleDisplay "$title_display" \
    --rawfile approvers_raw "$row_payload_dir/approvers.json" \
    --arg openConversationCount "$open_conversation_count" \
    --arg viewedFilesCount "$viewed_files_count" \
    --arg changedFilesCount "$changed_files_count" \
    --arg viewedFilesSummary "$viewed_files_summary" \
    --rawfile comments_raw "$row_payload_dir/comments.json" \
    --rawfile reviews_raw "$row_payload_dir/reviews.json" \
    --rawfile requested_reviewers_raw "$row_payload_dir/requested-reviewers.json" \
    --rawfile commits_raw "$row_payload_dir/commits.json" \
    --rawfile assignees_raw "$row_payload_dir/assignees.json" \
    --rawfile review_threads_raw "$row_payload_dir/review-threads.json" \
    --rawfile comment_events_raw "$row_payload_dir/comment-events.json" \
    --rawfile activity_events_raw "$row_payload_dir/activity-events.json" \
    --slurpfile metrics_file "$row_payload_dir/metrics.json" \
    --arg activityTimelineSummary "$activity_timeline_summary" \
    --rawfile activity_timeline_raw "$row_payload_dir/activity-timeline.json" \
    --arg check_state "$check_state" \
    --arg merge_state "$merge_state" \
    --rawfile labels_raw "$row_payload_dir/labels.json" \
    '{number:$number,title:$title,titleDisplay:$titleDisplay,url:$url,mergedAt:$mergedAt,closedAt:$closedAt,sourceUpdatedAt:$sourceUpdatedAt,sourceFingerprint:$sourceFingerprint,sourceBranch:$sourceBranch,targetBranch:$targetBranch,checkState:$check_state,mergeState:$merge_state,labels:(($labels_raw | fromjson?) // []),author:$author,authorLogin:$authorLogin,viewerLogin:$viewerLogin,status:$status,approved:$approved,approvalCount:$approvalCount,inReview:$inReview,approvers:(($approvers_raw | fromjson?) // []),requestedReviewers:(($requested_reviewers_raw | fromjson?) // []),assignees:(($assignees_raw | fromjson?) // []),openConversationCount:$openConversationCount,viewedFilesCount:$viewedFilesCount,changedFilesCount:$changedFilesCount,additions:$additions,deletions:$deletions,viewedFilesSummary:$viewedFilesSummary,comments:(($comments_raw | fromjson?) // []),reviews:(($reviews_raw | fromjson?) // []),commits:(($commits_raw | fromjson?) // []),reviewThreads:(($review_threads_raw | fromjson?) // []),commentEvents:(($comment_events_raw | fromjson?) // []),activityEvents:(($activity_events_raw | fromjson?) // []),metrics:($metrics_file[0] // {}),activityTimelineSummary:$activityTimelineSummary,activityTimeline:(($activity_timeline_raw | fromjson?) // []),baseline:$baseline,reason:$reason}'
  )
  jq_status=$?
  rm -rf "$row_payload_dir"
  if [[ "$jq_status" -ne 0 ]]; then
    emit_pr_progress_marker 'END' "$number"
    return "$jq_status"
  fi
  row_json_out=$(attach_pr_detail_ref "$row_json_out")
  row_json_out=$(strip_inline_pr_detail_fields "$row_json_out")
  emit_pr_progress_marker 'END' "$number"
  printf '%s' "$row_json_out"
}

build_pr_source_fingerprint_value() {
  local detail_json="$1"
  local comments_json="$2"
  local reviews_json="$3"
  local requested_reviewers_json="$4"
  local commits_json="$5"
  local assignees_json="$6"
  local threads_json="$7"
  local review_comments_json="$8"
  local review_url_map_json="$9"
  local viewed_files_stats_json="${10}"
  local ci_merge_json="${11}"
  local payload_json canonical_payload digest

  payload_json=$(jq -cn \
    --argjson detail "$detail_json" \
    --argjson comments "$comments_json" \
    --argjson reviews "$reviews_json" \
    --argjson reviewRequests "$requested_reviewers_json" \
    --argjson commits "$commits_json" \
    --argjson assignees "$assignees_json" \
    --argjson threads "$threads_json" \
    --argjson reviewComments "$review_comments_json" \
    --argjson reviewUrlMap "$review_url_map_json" \
    --argjson viewedFiles "$viewed_files_stats_json" \
    --argjson ciMerge "$ci_merge_json" \
    '{detail:$detail,comments:$comments,reviews:$reviews,reviewRequests:$reviewRequests,commits:$commits,assignees:$assignees,threads:$threads,reviewComments:$reviewComments,reviewUrlMap:$reviewUrlMap,viewedFiles:$viewedFiles,ciMerge:$ciMerge}' 2>/dev/null)

  canonical_payload=$(printf '%s' "$payload_json" | jq -cS . 2>/dev/null || true)
  [[ -n "$canonical_payload" ]] || return 0

  digest=$(hash_text_sha256 "$canonical_payload")
  [[ -n "$digest" ]] || return 0

  printf 'fp:v2:sha256:%s' "$digest"
}

hash_text_sha256() {
  local text="$1"

  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$text" | shasum -a 256 | awk '{print $1}'
    return 0
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$text" | sha256sum | awk '{print $1}'
    return 0
  fi

  if command -v openssl >/dev/null 2>&1; then
    printf '%s' "$text" | openssl dgst -sha256 2>/dev/null | awk '{print $NF}'
    return 0
  fi

  return 1
}

