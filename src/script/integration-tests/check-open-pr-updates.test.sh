#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT_PATH="$SCRIPT_DIR/../check-open-pr-updates.sh"
TEST_RETRIES="${TEST_RETRIES:-0}"

print_debug_context() {
  echo 'Test run context:'
  echo "  script      : $SCRIPT_PATH"
  echo "  cwd         : $PWD"
  echo "  shell       : ${BASH_VERSION:-unknown}"
  echo "  test_retries: $TEST_RETRIES"
  echo "  date_utc    : $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}

assert_eq() {
  local got="$1"
  local want="$2"
  local msg="$3"
  if [[ "$got" != "$want" ]]; then
    echo "FAIL: $msg"
    echo "  got : $got"
    echo "  want: $want"
    exit 1
  fi
}

assert_true() {
  local cond="$1"
  local msg="$2"
  if ! eval "$cond"; then
    echo "FAIL: $msg"
    exit 1
  fi
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local msg="$3"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "FAIL: $msg"
    echo "  expected to contain: $needle"
    echo "  got               : $haystack"
    exit 1
  fi
}

setup_tmp() {
  TEST_TMP=$(mktemp -d)
  export PR_STATE_FILE="$TEST_TMP/pr-state.json"
  export PR_STATE_LOCK_DIR="$TEST_TMP/pr-state.lock"
  export USER_STATE_FILE="$TEST_TMP/user-state.json"
  export USER_STATE_LOCK_DIR="$TEST_TMP/user-state.lock"
  trap 'rm -rf "$TEST_TMP"' EXIT
}

make_mock_gh() {
  local dir="$1"
  mkdir -p "$dir"
  cat >"$dir/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

find_arg_value() {
  local key="$1"
  shift
  local i=1
  while [[ $i -le $# ]]; do
    eval "arg=\${$i}"
    if [[ "$arg" == "$key" ]]; then
      i=$((i + 1))
      eval "val=\${$i}"
      printf '%s' "$val"
      return 0
    fi
    i=$((i + 1))
  done
  return 1
}

extract_jq() {
  find_arg_value --jq "$@" || true
}

if [[ "$1" == "auth" && "$2" == "status" ]]; then
  exit 0
fi

if [[ "$1" == "api" && "$2" == "graphql" ]]; then
  jq_expr=$(extract_jq "$@")
  query=$(find_arg_value -f "$@" | sed -n '1p' || true)
  if [[ "${query:-}" == "query { viewer { login } }" ]]; then
    payload='{"data":{"viewer":{"login":"me_user"}}}'
  else
    number=$(find_arg_value -F "$@" || true)
    number=${number#number=}
    thread_file="${MOCK_THREADS_DIR}/$number.json"
    if [[ -f "$thread_file" ]]; then
      nodes=$(cat "$thread_file")
    else
      nodes='[]'
    fi
    payload=$(jq -cn --argjson nodes "$nodes" '{data:{repository:{pullRequest:{reviewThreads:{nodes:$nodes,pageInfo:{hasNextPage:false,endCursor:null}}}}}}')
  fi

  if [[ -n "${jq_expr:-}" ]]; then
    printf '%s' "$payload" | jq -r "$jq_expr"
  else
    printf '%s' "$payload"
  fi
  exit 0
fi

if [[ "$1" == "pr" && "$2" == "list" ]]; then
  state=$(find_arg_value --state "$@")
  jq_expr=$(extract_jq "$@")
  if [[ "$state" == "open" ]]; then
    payload=$(cat "$MOCK_OPEN_JSON")
  elif [[ "$state" == "closed" ]]; then
    payload=$(cat "$MOCK_CLOSED_JSON")
  else
    payload=$(cat "$MOCK_MERGED_JSON")
  fi
  if [[ -n "${jq_expr:-}" ]]; then
    printf '%s' "$payload" | jq -r "$jq_expr"
  else
    printf '%s' "$payload"
  fi
  exit 0
fi

if [[ "$1" == "pr" && "$2" == "view" ]]; then
  number="$3"
  jq_expr=$(extract_jq "$@")
  summary_file="${MOCK_PR_VIEW_DIR:-}/$number.json"
  detail_file="${MOCK_DETAILS_DIR}/$number.json"
  if [[ -n "$jq_expr" && -f "$summary_file" ]]; then
    payload=$(cat "$summary_file")
    printf '%s' "$payload" | jq -r "$jq_expr"
    exit 0
  fi
  if [[ -f "$detail_file" ]]; then
    payload=$(cat "$detail_file")
    if [[ -n "${jq_expr:-}" ]]; then
      printf '%s' "$payload" | jq -r "$jq_expr"
    else
      printf '%s' "$payload"
    fi
    exit 0
  fi
  payload='{"comments":[],"reviews":[],"commits":[]}'
  if [[ -n "${jq_expr:-}" ]]; then
    printf '%s' "$payload" | jq -r "$jq_expr"
  else
    printf '%s' "$payload"
  fi
  exit 0
fi

echo "mock gh: unsupported args: $*" >&2
exit 1
MOCK
  chmod +x "$dir/gh"
}

run_helper_tests() {
  source "$SCRIPT_PATH"

  assert_eq "$(normalize_author_name 'kshar280_uhg' 'Sharma, Karan')" 'Karan Sharma' 'normalize_author_name should reorder Last, First'
  assert_eq "$(normalize_author_name 'ahall236_uhg' '')" 'ahall236_uhg' 'normalize_author_name should fall back to login'
  assert_eq "$(build_reasons 'comment' 0 'review' 2 'commit' 1)" 'review|commit' 'build_reasons should include active labels only'

  dt=$(format_iso_datetime '2026-03-05T13:46:48Z')
  assert_true "[[ \"$dt\" =~ ^[A-Z][a-z]{2}[[:space:]][0-9]{1,2},[[:space:]][0-9]{4}[[:space:]][0-9]{1,2}:[0-9]{2}[[:space:]](AM|PM)$ ]]" 'format_iso_datetime format mismatch'

  assert_eq "$(parse_number_list '912, 913,914' | tr -d '\r')" $'912\n913\n914' 'parse_number_list should parse comma-separated values'
  if parse_number_list '912,bad' >/dev/null 2>&1; then
    echo 'FAIL: parse_number_list should fail on non-numeric token'
    exit 1
  fi

  assert_eq "$(parse_label_list 'bug, frontend,  blocked ' | tr -d '\r')" $'bug\nfrontend\nblocked' 'parse_label_list should parse comma-separated label values'
  assert_eq "$(parse_label_list '' | tr -d '\r')" '' 'parse_label_list should return empty output for empty input'
  assert_eq "$(parse_author_list ' ahall236_uhg, kshar280_uhg ' | tr -d '\r')" $'ahall236_uhg\nkshar280_uhg' 'parse_author_list should parse comma-separated author logins'
  assert_eq "$(parse_author_list '' | tr -d '\r')" '' 'parse_author_list should return empty output for empty input'

  INCLUDE_LABELS=$'bug\nfrontend\n'
  EXCLUDE_LABELS=$'blocked\n'
  if ! pr_passes_label_filters '{"labels":[{"name":"frontend"},{"name":"other"}]}' ; then
    echo 'FAIL: pr_passes_label_filters should include when any include label matches and excludes do not match'
    exit 1
  fi
  if pr_passes_label_filters '{"labels":[{"name":"blocked"}]}' ; then
    echo 'FAIL: pr_passes_label_filters should exclude when any exclude label matches'
    exit 1
  fi
  if pr_passes_label_filters '{"labels":[{"name":"Naresh'"'"'s team"}]}' ; then
    echo 'FAIL: pr_passes_label_filters should always exclude fixed label'
    exit 1
  fi
  INCLUDE_LABELS=''
  EXCLUDE_LABELS=''

  INCLUDE_AUTHORS=$'ahall236_uhg\nkshar280_uhg\n'
  if ! pr_passes_author_filters '{"author":{"login":"ahall236_uhg"}}' ; then
    echo 'FAIL: pr_passes_author_filters should include matching author login'
    exit 1
  fi
  if pr_passes_author_filters '{"author":{"login":"someone_else"}}' ; then
    echo 'FAIL: pr_passes_author_filters should exclude non-matching author login'
    exit 1
  fi
  INCLUDE_AUTHORS=''

  HYPERLINK_ENABLED=0
  plain=$(format_link 'https://example.com' '#123')
  assert_eq "$plain" '#123' 'format_link should output plain text when disabled'

  HYPERLINK_ENABLED=1
  linked=$(format_link 'https://example.com' '#123')
  assert_true "[[ \"$linked\" == *$'\\033]8;;https://example.com\\a#123\\033]8;;\\a'* ]]" 'format_link should output OSC8 sequence when enabled'

  SHOW_REASON=1
  status_with_reason=$(format_status_display 'CHANGED' 'comment')
  if ! printf '%s' "$status_with_reason" | grep -q 'CHANGED(comment)'; then
    echo 'FAIL: format_status_display should include inline reason when enabled'
    exit 1
  fi

  SHOW_REASON=0
  status_without_reason=$(format_status_display 'CHANGED' 'comment')
  if printf '%s' "$status_without_reason" | grep -q 'CHANGED(comment)'; then
    echo 'FAIL: format_status_display should hide inline reason when disabled'
    exit 1
  fi

  tries=0
  flaky_cmd() {
    tries=$((tries + 1))
    [[ "$tries" -ge 3 ]]
  }
  gh_with_retry flaky_cmd
  assert_eq "$tries" '3' 'gh_with_retry should retry and eventually succeed'

  dead_lock_dir="$TEST_TMP/dead.lock"
  mkdir -p "$dead_lock_dir"
  {
    echo 'pid=999999'
    echo 'createdAt=1'
  } >"$dead_lock_dir/lock-info"
  assert_true "recover_stale_lock_dir \"$dead_lock_dir\" \"test lock\"" 'recover_stale_lock_dir should reclaim dead lock owner'
  assert_true "[[ ! -d \"$dead_lock_dir\" ]]" 'dead lock directory should be removed when reclaimed'

  live_lock_dir="$TEST_TMP/live.lock"
  mkdir -p "$live_lock_dir"
  {
    echo "pid=$$"
    echo 'createdAt=1'
  } >"$live_lock_dir/lock-info"
  assert_true "! recover_stale_lock_dir \"$live_lock_dir\" \"test lock\"" 'recover_stale_lock_dir should not reclaim a live lock owner'
  assert_true "[[ -d \"$live_lock_dir\" ]]" 'live lock directory should remain in place'

  normalized_commits=$(normalize_pr_commits_json '{"commits":[{"oid":"a1","committedDate":"2026-03-03T00:00:00Z","messageHeadline":"Merge branch '\''main'\'' into feature/test","messageBody":"","authors":[{"login":"other","name":"Other","email":"other@example.com"}]},{"oid":"a2","committedDate":"2026-03-03T01:00:00Z","messageHeadline":"feat: keep this commit","messageBody":"","authors":[{"login":"other","name":"Other","email":"other@example.com"}]}]}')
  assert_eq "$(printf '%s' "$normalized_commits" | jq -r 'length')" '1' 'normalize_pr_commits_json should drop merge-main commits'
  assert_eq "$(printf '%s' "$normalized_commits" | jq -r '.[0].oid')" 'a2' 'normalize_pr_commits_json should preserve non-merge commits'
}

run_ack_store_tests() {
  source "$SCRIPT_PATH"
  ACK_FILE="$TEST_TMP/ack.json"
  ACK_LOCK_DIR="$TEST_TMP/ack.lock"

  ensure_ack_store
  REPO='owner/repo-a'
  set_ack_ts 100 '2026-03-05T00:00:00Z'
  assert_eq "$(get_ack_ts 100)" '2026-03-05T00:00:00Z' 'set/get ack failed for repo-a'
  assert_eq "$(get_reverify_required 100)" 'false' 'set_ack_ts should clear reverify requirement'
  assert_eq "$(get_in_review_required 100)" 'false' 'in-review should default to false'

  REPO='owner/repo-b'
  set_ack_ts 100 '2026-03-06T00:00:00Z'
  assert_eq "$(get_ack_ts 100)" '2026-03-06T00:00:00Z' 'set/get ack failed for repo-b'

  clear_all_repo_acks
  assert_eq "$(get_ack_ts 100)" '' 'clear_all_repo_acks should clear only current repo entries'

  REPO='owner/repo-a'
  assert_eq "$(get_ack_ts 100)" '2026-03-05T00:00:00Z' 'clear_all_repo_acks should not clear other repo entries'

  clear_ack_ts 100
  assert_eq "$(get_ack_ts 100)" '' 'clear_ack_ts should remove specific PR ack'
  assert_eq "$(get_reverify_required 100)" 'true' 'clear_ack_ts should mark PR for reverify'

  set_in_review_required 100
  assert_eq "$(get_in_review_required 100)" 'true' 'set_in_review_required should mark PR as in-review'
  clear_in_review_required 100
  assert_eq "$(get_in_review_required 100)" 'false' 'clear_in_review_required should clear in-review marker'
}

run_compute_state_tests() {
  source "$SCRIPT_PATH"

  REPO='owner/repo'
  REPO_OWNER='owner'
  REPO_NAME='repo'
  VIEWER_LOGIN='me_user'
  ACK_FILE="$TEST_TMP/ack-calc.json"
  ACK_LOCK_DIR="$TEST_TMP/ack-calc.lock"
  DETAIL_CACHE_DIR="$TEST_TMP/details"
  THREAD_CACHE_DIR="$TEST_TMP/threads"
  mkdir -p "$DETAIL_CACHE_DIR" "$THREAD_CACHE_DIR"
  ensure_ack_store

  get_pr_detail_json() {
    local number="$1"
    case "$number" in
      100)
        cat <<'JSON'
{"comments":[],"reviews":[],"commits":[]}
JSON
        ;;
      101)
        cat <<'JSON'
{"comments":[{"author":{"login":"other"},"createdAt":"2026-03-01T00:00:00Z"}],"reviews":[{"author":{"login":"me_user"},"state":"COMMENTED","submittedAt":"2026-03-02T00:00:00Z"}],"commits":[]}
JSON
        ;;
      102)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"me_user"},"state":"COMMENTED","submittedAt":"2026-03-01T00:00:00Z"}],"commits":[{"messageHeadline":"feat: add stuff","committedDate":"2026-03-03T00:00:00Z","authors":[{"login":"other"}]}]}
JSON
        ;;
      103)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"me_user"},"state":"COMMENTED","submittedAt":"2026-03-01T00:00:00Z"}],"commits":[{"messageHeadline":"Merge branch 'main' into feature","committedDate":"2026-03-03T00:00:00Z","authors":[{"login":"other"}]}]}
JSON
        ;;
      104)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"me_user"},"state":"APPROVED","submittedAt":"2026-03-03T00:00:00Z"}],"commits":[]}
JSON
        ;;
      105)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"me_user"},"state":"APPROVED","submittedAt":"2026-03-01T00:00:00Z"},{"author":{"login":"me_user"},"state":"CHANGES_REQUESTED","submittedAt":"2026-03-02T00:00:00Z"}],"commits":[]}
JSON
        ;;
      108)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"me_user"},"state":"APPROVED","submittedAt":"2026-03-01T00:00:00Z"},{"author":{"login":"me_user"},"state":"COMMENTED","submittedAt":"2026-03-02T00:00:00Z"}],"commits":[]}
JSON
        ;;
            109)
        cat <<'JSON'
      {"comments":[],"reviews":[{"author":{"login":"me_user"},"state":"APPROVED","submittedAt":"2026-03-01T00:00:00Z"}],"reviewRequests":[{"requestedReviewer":{"login":"me_user","name":"User, Me"}}],"commits":[]}
      JSON
        ;;
      200)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"rev1"},"state":"APPROVED","submittedAt":"2026-03-02T00:00:00Z"},{"author":{"login":"rev2"},"state":"APPROVED","submittedAt":"2026-03-02T01:00:00Z"}],"commits":[{"messageHeadline":"feat: mine","committedDate":"2026-03-01T00:00:00Z","authors":[{"login":"me_user"}]}]}
JSON
        ;;
      201)
        cat <<'JSON'
{"comments":[{"author":{"login":"other"},"createdAt":"2026-03-03T00:00:00Z"}],"reviews":[{"author":{"login":"rev1"},"state":"APPROVED","submittedAt":"2026-03-02T00:00:00Z"},{"author":{"login":"rev2"},"state":"APPROVED","submittedAt":"2026-03-02T01:00:00Z"}],"commits":[{"messageHeadline":"feat: mine","committedDate":"2026-03-01T00:00:00Z","authors":[{"login":"me_user"}]}]}
JSON
        ;;
      202)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"rev1"},"state":"APPROVED","submittedAt":"2026-03-02T00:00:00Z"},{"author":{"login":"rev2"},"state":"APPROVED","submittedAt":"2026-03-02T01:00:00Z"}],"commits":[{"messageHeadline":"feat: mine","committedDate":"2026-03-01T00:00:00Z","authors":[{"login":"me_user"}]}]}
JSON
        ;;
      203)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"rev1"},"state":"APPROVED","submittedAt":"2026-03-02T00:00:00Z"},{"author":{"login":"rev2"},"state":"CHANGES_REQUESTED","submittedAt":"2026-03-02T01:00:00Z"}],"commits":[{"messageHeadline":"feat: mine","committedDate":"2026-03-01T00:00:00Z","authors":[{"login":"me_user"}]}]}
JSON
        ;;
      206)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"rev1"},"state":"APPROVED","submittedAt":"2026-03-02T00:00:00Z"},{"author":{"login":"rev2"},"state":"APPROVED","submittedAt":"2026-03-02T00:10:00Z"}],"commits":[{"messageHeadline":"Merge branch 'main' into feature/test","committedDate":"2026-03-03T00:00:00Z","authors":[{"login":"other"}]}]}
JSON
        ;;
      204)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"me_user"},"state":"APPROVED","submittedAt":"2026-03-02T00:30:00Z"},{"author":{"login":"rev2"},"state":"APPROVED","submittedAt":"2026-03-02T01:00:00Z"}],"commits":[{"messageHeadline":"feat: mine","committedDate":"2026-03-01T00:00:00Z","authors":[{"login":"me_user"}]}]}
JSON
        ;;
      205)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"me_user"},"state":"APPROVED","submittedAt":"2026-03-02T00:30:00Z"},{"author":{"login":"rev2"},"state":"APPROVED","submittedAt":"2026-03-02T01:00:00Z"}],"commits":[]}
JSON
        ;;
            210)
        cat <<'JSON'
      {"comments":[],"reviews":[{"author":{"login":"rev1"},"state":"APPROVED","submittedAt":"2026-03-02T00:00:00Z"},{"author":{"login":"rev2"},"state":"APPROVED","submittedAt":"2026-03-02T01:00:00Z"}],"reviewRequests":[{"requestedReviewer":{"login":"rev2","name":"Reviewer Two"}}],"commits":[]}
      JSON
        ;;
      207)
        cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"me_user"},"state":"APPROVED","submittedAt":"2026-03-02T00:30:00Z"},{"author":{"login":"rev2"},"state":"CHANGES_REQUESTED","submittedAt":"2026-03-02T01:00:00Z"}],"commits":[]}
JSON
        ;;
      106)
        cat <<'JSON'
{"comments":[{"author":{"login":"other"},"createdAt":"2026-03-03T00:00:00Z"}],"reviews":[{"author":{"login":"me_user"},"state":"COMMENTED","submittedAt":"2026-03-01T00:00:00Z"}],"commits":[]}
JSON
        ;;
      107)
        cat <<'JSON'
{"comments":[{"id":"c-1","author":{"login":"alice"},"createdAt":"2026-03-02T09:00:00Z","body":"First pass"},{"id":"c-2","author":{"login":"alice"},"createdAt":"2026-03-02T09:05:00Z","body":"Follow-up"},{"id":"c-3","author":{"login":"alice"},"createdAt":"2026-03-02T09:15:00Z","body":"After reviewer reply"}],"reviews":[{"id":"r-1","author":{"login":"bob"},"state":"COMMENTED","submittedAt":"2026-03-02T09:10:00Z","body":"Needs work"}],"commits":[]}
JSON
        ;;
      300)
        cat <<'JSON'
{"comments":[],"reviews":[],"commits":[],"statusCheckRollup":[],"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}
JSON
        ;;
      301)
        cat <<'JSON'
{"comments":[],"reviews":[],"commits":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"IN_PROGRESS","conclusion":null,"startedAt":"2026-03-01T01:00:00Z","completedAt":null}],"mergeable":"CONFLICTING","mergeStateStatus":"DIRTY"}
JSON
        ;;
      302)
        cat <<'JSON'
{"comments":[],"reviews":[],"commits":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS","startedAt":"2026-03-01T01:00:00Z","completedAt":"2026-03-01T01:10:00Z"}],"mergeable":"UNKNOWN","mergeStateStatus":"UNKNOWN"}
JSON
        ;;
      303)
        cat <<'JSON'
{"comments":[],"reviews":[],"commits":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"NEUTRAL","startedAt":"2026-03-01T01:00:00Z","completedAt":"2026-03-01T01:10:00Z"}],"mergeable":"BLOCKED","mergeStateStatus":"BLOCKED"}
JSON
        ;;
      304)
        cat <<'JSON'
{"comments":[],"reviews":[],"commits":[],"statusCheckRollup":[{"__typename":"StatusContext","state":"PENDING","startedAt":"2026-03-01T01:00:00Z","completedAt":null}],"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}
JSON
        ;;
      305)
        cat <<'JSON'
{"comments":[],"reviews":[],"commits":[],"statusCheckRollup":[{"__typename":"StatusContext","state":"FAILURE","startedAt":"2026-03-01T01:00:00Z","completedAt":"2026-03-01T01:10:00Z"}],"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}
JSON
        ;;
      306)
        cat <<'JSON'
{"comments":[],"reviews":[],"commits":[],"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"FAILURE","startedAt":"2026-03-01T01:00:00Z","completedAt":"2026-03-01T01:05:00Z"},{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS","startedAt":"2026-03-01T01:06:00Z","completedAt":"2026-03-01T01:10:00Z"}],"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}
JSON
        ;;
      *)
        echo '{"comments":[],"reviews":[],"commits":[]}'
        ;;
    esac
  }

  fetch_review_threads_json() {
    local number="$1"
    case "$number" in
      202)
        cat <<'JSON'
[{"id":"thread-202","isResolved":false,"isOutdated":false,"commentCount":2,"hasMoreComments":false,"comments":[{"id":"thread-comment-1","authorLogin":"reviewer-one","createdAt":"2026-03-02T01:30:00Z","body":"Please rename this variable"},{"id":"thread-comment-2","authorLogin":"other","createdAt":"2026-03-03T02:00:00Z","body":"Addressed in the latest push"}],"participants":["other","reviewer-one"],"latestCommentAt":"2026-03-03T02:00:00Z"}]
JSON
        ;;
      *)
        echo '[]'
        ;;
    esac
  }

  fetch_pr_viewed_files_stats_json() {
    local number="$1"
    case "$number" in
      202)
        echo '{"changedFiles":37,"viewedFiles":29}'
        ;;
      *)
        echo '{"changedFiles":0,"viewedFiles":0}'
        ;;
    esac
  }

  get_ack_ts() {
    local number="$1"
    if [[ "$number" == '106' ]]; then
      echo '2026-03-04T00:00:00Z'
      return
    fi
    echo ''
  }

  make_pr_json() {
    local n="$1"
    local author_login="$2"
    local author_name="$3"
    local labels_json="${4:-[]}"
    local source_branch="${5:-feature/test}"
    local target_branch="${6:-main}"
    local created_at="${7:-2026-03-01T00:00:00Z}"
    local merged_at="${8:-}"
    local merged_by="${9:-}"
    jq -cn --arg n "$n" --arg a "$author_login" --arg an "$author_name" --arg url "https://example.com/$n" --argjson labels "$labels_json" --arg sourceBranch "$source_branch" --arg targetBranch "$target_branch" --arg createdAt "$created_at" --arg mergedAt "$merged_at" --arg mergedBy "$merged_by" '{number:($n|tonumber),title:("PR-"+$n),url:$url,labels:$labels,author:{login:$a,name:$an},createdAt:$createdAt,mergedAt:(if $mergedAt=="" then null else $mergedAt end),mergedBy:(if $mergedBy=="" then null else {login:$mergedBy} end),headRefName:$sourceBranch,baseRefName:$targetBranch}'
  }

  row=$(compute_pr_state_json "$(make_pr_json 100 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'NO_ACTIVITY' 'non-authored no-activity status failed'

  row=$(compute_pr_state_json "$(make_pr_json 101 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'NO_CHANGE' 'non-authored no-change status failed'

  get_reverify_required() {
    local number="$1"
    if [[ "$number" == '101' ]]; then
      echo 'true'
      return
    fi
    echo 'false'
  }

  row=$(compute_pr_state_json "$(make_pr_json 101 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'CHANGED' 'ack-cleared reverify flag should force NO_CHANGE to CHANGED'
  assert_eq "$(printf '%s' "$row" | jq -r '.reason')" 'ack-cleared' 'ack-cleared reverify status should use ack-cleared reason'

  get_in_review_required() {
    local number="$1"
    if [[ "$number" == '101' ]]; then
      echo 'true'
      return
    fi
    echo 'false'
  }

  row=$(compute_pr_state_json "$(make_pr_json 101 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'CHANGED' 'in-review should force NO_CHANGE to CHANGED'
  assert_eq "$(printf '%s' "$row" | jq -r '.reason')" 'in-review' 'in-review should use in-review reason override'

  row=$(compute_pr_state_json "$(make_pr_json 102 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'CHANGED' 'non-authored changed status failed'
  assert_eq "$(printf '%s' "$row" | jq -r '.reason')" 'commit' 'non-authored changed reason should be commit'
  timeline_summary_102=$(printf '%s' "$row" | jq -r '.activityTimelineSummary')
  assert_true "[[ \"$timeline_summary_102\" == *'me_user review'* ]]" "COMMENTED review should appear in timeline summary as review type; got: $timeline_summary_102"

  row=$(compute_pr_state_json "$(make_pr_json 103 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'NO_CHANGE' 'merge-main-only commit should not mark changed'

  row=$(compute_pr_state_json "$(make_pr_json 104 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.approved')" 'YES' 'non-authored approval latest approved failed'
  assert_eq "$(printf '%s' "$row" | jq -r '.approvers | length')" '1' 'non-authored PR should persist latest approvers list'
  assert_eq "$(printf '%s' "$row" | jq -r '.approvers[0].login')" 'me_user' 'non-authored approvers list should include viewer approvals'

  row=$(compute_pr_state_json "$(make_pr_json 205 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.approved')" 'YES' 'non-authored PR should be approved when viewer latest review is approved'
  assert_eq "$(printf '%s' "$row" | jq -r '.approvalCount')" '2' 'non-authored PR should count both viewer and other approvers'
  assert_eq "$(printf '%s' "$row" | jq -r '.approvers | length')" '2' 'non-authored PR should include viewer and other in approvers list'
  assert_eq "$(printf '%s' "$row" | jq -r '[.approvers[] | select(.login == "me_user")] | length')" '1' 'non-authored approvers list should include viewer approval'
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'NO_CHANGE' 'later external approval should not mark a non-authored PR as changed'
  assert_eq "$(printf '%s' "$row" | jq -r '.reason')" '-' 'later external approval should not add a changed reason'

  row=$(compute_pr_state_json "$(make_pr_json 207 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'CHANGED' 'later external non-approved review should still mark a non-authored PR as changed'
  assert_eq "$(printf '%s' "$row" | jq -r '.reason')" 'review' 'later external non-approved review should use review reason'

  row=$(compute_pr_state_json "$(make_pr_json 105 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.approved')" 'NO' 'non-authored latest non-approved failed'

  row=$(compute_pr_state_json "$(make_pr_json 108 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.approved')" 'YES' 'non-authored PR should stay approved when a reviewer comments after approving'
  assert_eq "$(printf '%s' "$row" | jq -r '.approvalCount')" '1' 'non-authored approval count should retain prior approval when latest review is commented'

  row=$(compute_pr_state_json "$(make_pr_json 109 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.approved')" 'NO' 'non-authored PR should not be approved when reviewer approval is re-requested'
  assert_eq "$(printf '%s' "$row" | jq -r '.approvalCount')" '0' 'non-authored approval count should drop re-requested reviewer approvals'
  assert_eq "$(printf '%s' "$row" | jq -r '.approvers | length')" '0' 'non-authored approvers should exclude reviewers currently re-requested'

  row=$(compute_pr_state_json "$(make_pr_json 200 'me_user' 'User, Me')")
  assert_eq "$(printf '%s' "$row" | jq -r '.approved')" 'YES' 'authored approval with 2 approvers failed'
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'NO_CHANGE' 'authored no-change baseline failed'
  assert_eq "$(printf '%s' "$row" | jq -r '.approvers | length')" '2' 'authored PR should persist approvers from others'
  assert_eq "$(printf '%s' "$row" | jq -r '.openConversationCount')" '0' 'authored PR should include open conversation count'

  row=$(compute_pr_state_json "$(make_pr_json 201 'me_user' 'User, Me')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'CHANGED' 'authored top-level comment should mark changed'
  reason=$(printf '%s' "$row" | jq -r '.reason')
  assert_true "[[ \"$reason\" == *comment* ]]" 'authored reason should include comment'

  row=$(compute_pr_state_json "$(make_pr_json 202 'me_user' 'User, Me')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'CHANGED' 'authored thread reply should mark changed'
  reason=$(printf '%s' "$row" | jq -r '.reason')
  assert_true "[[ \"$reason\" == *thread-reply* ]]" 'authored reason should include thread-reply'
  assert_eq "$(printf '%s' "$row" | jq -r '.openConversationCount')" '1' 'authored PR should count unresolved review conversations'
  assert_eq "$(printf '%s' "$row" | jq -r '.viewedFilesCount')" '29' 'row JSON should include viewed file count'
  assert_eq "$(printf '%s' "$row" | jq -r '.changedFilesCount')" '37' 'row JSON should include changed file count'
  assert_eq "$(printf '%s' "$row" | jq -r '.viewedFilesSummary')" '29/37 viewed' 'row JSON should include viewed file summary'
  assert_eq "$(printf '%s' "$row" | jq -r '.comments | length')" '0' 'row JSON should persist top-level comments array'
  assert_eq "$(printf '%s' "$row" | jq -r '.reviews | length')" '2' 'row JSON should persist reviews array'
  assert_eq "$(printf '%s' "$row" | jq -r '.reviewThreads | length')" '1' 'row JSON should persist review thread conversations'
  assert_eq "$(printf '%s' "$row" | jq -r '.reviewThreads[0].comments | length')" '2' 'review thread entries should include all comments in order'
  assert_eq "$(printf '%s' "$row" | jq -r '.commentEvents | length')" '2' 'commentEvents should combine all review-thread and top-level comments'
  assert_eq "$(printf '%s' "$row" | jq -r '.activityEvents | length')" '6' 'activityEvents should preserve the full ordered activity stream'
  assert_eq "$(printf '%s' "$row" | jq -r '.activityTimeline | length')" '6' 'activityTimeline should only collapse consecutive matching activity runs'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.counts.totalComments')" '2' 'metrics should include total combined comment count'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.conversationSummary.openThreads')" '1' 'metrics should include open thread count'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.approvalSummary.totalApprovals')" '2' 'metrics should include approval totals'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.approvalSummary.riskyApprovals')" '2' 'metrics should flag approvals that were followed by later activity'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.approvalSummary.highRiskApprovals')" '0' 'metrics should only mark high-risk approvals when stronger issue signals are present'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.commentUsefulnessSummary.commentsFollowedByAuthorCommit')" '0' 'metrics should count only comments that were followed by author commits'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.commentUsefulnessSummary.usefulnessSignals')" '0' 'metrics usefulness signals should be zero when no modeled usefulness evidence exists'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.commentsByActor[0].login')" 'other' 'metrics should summarize comments by actor'
  assert_eq "$(printf '%s' "$row" | jq -r '.activityTimeline[0] | has("date") and has("actor") and has("type") and has("count") and has("latestAt") and has("earliestAt") and has("events")')" 'true' 'timeline items should retain richer grouped activity details'
  assert_true "[[ \"$(printf '%s' "$row" | jq -r '.activityTimelineSummary')\" == *'2026-03-02:'* ]]" 'timeline summary should include grouped date headings'
  assert_true "[[ \"$(printf '%s' "$row" | jq -r '.activityTimelineSummary')\" == *'rev1 approved'* ]]" 'APPROVED review should appear in timeline summary as approved type'
  assert_true "[[ \"$(printf '%s' "$row" | jq -r '.activityTimelineSummary')\" != *'rev1 review'* ]]" 'APPROVED review should not appear as review type in timeline summary'
  assert_true "[[ \"$(printf '%s' "$row" | jq -r '.activityTimelineSummary')\" == *'me_user opened PR'* ]]" 'timeline summary should include opened PR event'

  row=$(compute_pr_state_json "$(make_pr_json 206 'me_user' 'User, Me')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'NO_CHANGE' 'authored PR should ignore merge-main-only external commits for activity detection'
  assert_eq "$(printf '%s' "$row" | jq -r '.reason')" '-' 'authored PR should keep empty reason when only merge-main commit exists'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.approvalSummary.riskyApprovals')" '0' 'merge-main-only commits after approval should not count as risky approvals'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.approvalSummary.approvalsWithCommitsAfter')" '0' 'merge-main-only commits after approval should not count as approvalsWithCommitsAfter'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.approvals[0].commitCountAfterApproval')" '0' 'merge-main-only commits after approval should not increment commitCountAfterApproval'

  row=$(compute_pr_state_json "$(make_pr_json 107 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '[.activityTimeline[] | select(.actor == "alice" and .type == "comment")] | length')" '2' 'timeline should keep separate comment groups when a different activity happens in between'
  assert_eq "$(printf '%s' "$row" | jq -r '[.activityTimeline[] | select(.actor == "alice" and .type == "comment")][0].count')" '1' 'latest separated comment group should only contain the post-interruption event'
  assert_eq "$(printf '%s' "$row" | jq -r '[.activityTimeline[] | select(.actor == "alice" and .type == "comment")][1].count')" '2' 'earlier contiguous comment group should still collapse consecutive identical events'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.commentsByActor[0].totalCount')" '3' 'metrics should collapse repeated commenter activity counts by actor'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.commentsByActor[0].followedByAuthorCommitCount')" '0' 'metrics should not mark comments as followed by author commits when no author commit exists'
  assert_eq "$(printf '%s' "$row" | jq -r '.metrics.reviewsByActor[0].commentCount')" '1' 'metrics should summarize non-approval reviews by actor'

  row=$(compute_pr_state_json "$(make_pr_json 309 'other' 'Other, User' '[]' 'feature/test' 'main' '2026-03-01T00:00:00Z' '2026-03-03T00:00:00Z' 'merger_user')")
  assert_true "[[ \"$(printf '%s' "$row" | jq -r '.activityTimelineSummary')\" == *'2026-03-03: merger_user merged PR'* ]]" 'timeline summary should include merged PR event'

  row=$(compute_pr_state_json "$(make_pr_json 203 'me_user' 'User, Me')")
  assert_eq "$(printf '%s' "$row" | jq -r '.approved')" 'NO' 'authored approval should fail when only one latest approval remains'

  row=$(compute_pr_state_json "$(make_pr_json 204 'me_user' 'User, Me')")
  assert_eq "$(printf '%s' "$row" | jq -r '.approvalCount')" '1' 'authored PR should exclude viewer approval from approval count'
  assert_eq "$(printf '%s' "$row" | jq -r '.approved')" 'NO' 'authored PR should not be approved with only one external approver'
  assert_eq "$(printf '%s' "$row" | jq -r '.approvers | length')" '1' 'authored PR approvers should only include external reviewers'
  assert_eq "$(printf '%s' "$row" | jq -r '[.approvers[] | select(.login == "me_user")] | length')" '0' 'authored approvers list should exclude viewer approval entry'

  row=$(compute_pr_state_json "$(make_pr_json 210 'me_user' 'User, Me')")
  assert_eq "$(printf '%s' "$row" | jq -r '.approvalCount')" '1' 'authored PR approval count should exclude re-requested external reviewers'
  assert_eq "$(printf '%s' "$row" | jq -r '.approved')" 'NO' 'authored PR should require two active external approvals when one reviewer is re-requested'

  row=$(compute_pr_state_json "$(make_pr_json 106 'other' 'Other, User')")
  assert_eq "$(printf '%s' "$row" | jq -r '.status')" 'NO_CHANGE' 'ack baseline should suppress older external comment'

  row=$(compute_pr_state_json "$(make_pr_json 300 'other' 'Other, User')")
  title_display=$(printf '%s' "$row" | jq -r '.titleDisplay')
  assert_contains "$title_display" '[CHK:NA][MRG:YES]' 'empty rollup should map to CHK:NA and mergeable MERGEABLE to MRG:YES'

  row=$(compute_pr_state_json "$(make_pr_json 307 'other' 'Other, User' '["bug", "backend"]')")
  labels_joined=$(printf '%s' "$row" | jq -r '.labels | join(",")')
  assert_eq "$labels_joined" 'bug,backend' 'row JSON should persist PR label names'

  row=$(compute_pr_state_json "$(make_pr_json 308 'other' 'Other, User' '[]' 'feature/insights-panel' 'release/26.05')")
  assert_eq "$(printf '%s' "$row" | jq -r '.sourceBranch')" 'feature/insights-panel' 'row JSON should persist source branch from headRefName'
  assert_eq "$(printf '%s' "$row" | jq -r '.targetBranch')" 'release/26.05' 'row JSON should persist target branch from baseRefName'

  row=$(compute_pr_state_json "$(make_pr_json 301 'other' 'Other, User')")
  title_display=$(printf '%s' "$row" | jq -r '.titleDisplay')
  assert_contains "$title_display" '[CHK:RUN][MRG:NO]' 'in-progress check should map to CHK:RUN and conflicting to MRG:NO'

  row=$(compute_pr_state_json "$(make_pr_json 302 'other' 'Other, User')")
  title_display=$(printf '%s' "$row" | jq -r '.titleDisplay')
  assert_contains "$title_display" '[CHK:PASS][MRG:UNK]' 'successful check should map to CHK:PASS and unknown mergeable to MRG:UNK'
  assert_eq "$(printf '%s' "$row" | jq -r '.checkState')" 'PASS' 'row JSON should persist checkState'
  assert_eq "$(printf '%s' "$row" | jq -r '.mergeState')" 'UNK' 'row JSON should persist mergeState'

  row=$(compute_pr_state_json "$(make_pr_json 303 'other' 'Other, User')")
  title_display=$(printf '%s' "$row" | jq -r '.titleDisplay')
  assert_contains "$title_display" '[CHK:SKIP][MRG:BLOCKED]' 'neutral check should map to CHK:SKIP and preserve non-standard mergeable states'

  row=$(compute_pr_state_json "$(make_pr_json 304 'other' 'Other, User')")
  title_display=$(printf '%s' "$row" | jq -r '.titleDisplay')
  assert_contains "$title_display" '[CHK:RUN][MRG:YES]' 'pending status context should map to CHK:RUN'

  row=$(compute_pr_state_json "$(make_pr_json 305 'other' 'Other, User')")
  title_display=$(printf '%s' "$row" | jq -r '.titleDisplay')
  assert_contains "$title_display" '[CHK:FAIL][MRG:YES]' 'failing status context should map to CHK:FAIL'

  row=$(compute_pr_state_json "$(make_pr_json 306 'other' 'Other, User')")
  title_display=$(printf '%s' "$row" | jq -r '.titleDisplay')
  assert_contains "$title_display" '[CHK:FAIL][MRG:YES]' 'mixed checks should prioritize FAIL even when latest check is PASS'
}

run_cache_freshness_tests() {
  source "$SCRIPT_PATH"

  REPO='owner/repo'
  PR_STATE_FILE="$TEST_TMP/cache-state.json"
  PR_STATE_LOCK_DIR="$TEST_TMP/cache-state.lock"
  ACK_ENABLED=0
  ACK_CLEAR_ENABLED=0
  ACK_CLEAR_ALL=0
  ACK_CHANGED=0

  cat >"$PR_STATE_FILE" <<'JSON'
{
  "byPrNumber": {
    "1": {
      "prNumber": "1",
      "repo": "owner/repo",
      "section": "open",
      "data": {
        "number": "1",
        "sourceUpdatedAt": "2026-03-10T01:00:00Z"
      }
    },
    "2": {
      "prNumber": "2",
      "repo": "owner/repo",
      "section": "draft",
      "data": {
        "number": "2",
        "sourceUpdatedAt": "2026-03-10T01:00:00Z"
      }
    },
    "4": {
      "prNumber": "4",
      "repo": "owner/repo",
      "section": "merged",
      "data": {
        "number": "4",
        "sourceUpdatedAt": "2026-03-10T01:00:00Z",
        "sourceBranch": "feature/test",
        "targetBranch": "main",
        "approvers": [],
        "openConversationCount": "0",
        "viewedFilesCount": "5",
        "changedFilesCount": "5",
        "viewedFilesSummary": "5/5 viewed",
        "comments": [],
        "reviews": [],
        "commits": [],
        "reviewThreads": [],
        "commentEvents": [],
        "activityEvents": [
          {
            "sourceId": "opened",
            "occurredAt": "2026-03-10T01:00:00Z",
            "date": "2026-03-10",
            "actor": "owner",
            "type": "opened",
            "channel": "system"
          }
        ],
        "metrics": {
          "counts": {
            "topLevelComments": 0,
            "threadComments": 0,
            "totalComments": 0,
            "reviews": 0,
            "approvals": 0,
            "commits": 0,
            "conversations": 0,
            "openConversations": 0
          },
          "commentsByActor": [],
          "reviewsByActor": [],
          "approvals": [],
          "approvalSummary": {
            "totalApprovals": 0,
            "riskyApprovals": 0,
            "approvalsWithChangeRequestsAfter": 0,
            "approvalsWithCommentsAfter": 0,
            "approvalsWithCommitsAfter": 0,
            "averageMergeLeadMinutes": null
          },
          "conversationSummary": {
            "totalThreads": 0,
            "openThreads": 0,
            "resolvedThreads": 0,
            "totalThreadComments": 0
          }
        },
        "activityTimeline": [
          {
            "date": "2026-03-10",
            "type": "opened",
            "actor": "owner",
            "earliestAt": "2026-03-10T01:00:00Z",
            "count": 1,
            "latestAt": "2026-03-10T01:00:00Z",
            "channels": ["system"],
            "events": [
              {
                "sourceId": "opened",
                "occurredAt": "2026-03-10T01:00:00Z",
                "date": "2026-03-10",
                "actor": "owner",
                "type": "opened",
                "channel": "system"
              }
            ]
          }
        ],
        "activityTimelineSummary": "2026-03-10: owner opened PR"
      }
    },
    "5": {
      "prNumber": "5",
      "repo": "owner/repo",
      "section": "merged",
      "data": {
        "number": "5",
        "sourceUpdatedAt": "2026-03-10T01:00:00Z"
      }
    }
  },
  "ackByRepo": {}
}
JSON

  pr1_open=$(jq -cn '{number:1,isDraft:false,updatedAt:"2026-03-10T01:00:00Z"}')
  pr1_draft=$(jq -cn '{number:1,isDraft:true,updatedAt:"2026-03-10T01:00:00Z"}')
  pr2_draft=$(jq -cn '{number:2,isDraft:true,updatedAt:"2026-03-10T01:00:00Z"}')
  pr3_open_new=$(jq -cn '{number:3,isDraft:false,updatedAt:"2026-03-10T02:00:00Z"}')

  cached_open=$(get_cached_row_json_for_pr "$pr1_open" 'open')
  assert_eq "$cached_open" '' 'open rows should bypass cache reuse to keep CHK/status fresh'

  pr4_merged=$(jq -cn '{number:4,updatedAt:"2026-03-10T01:00:00Z"}')
  cached_merged=$(get_cached_row_json_for_pr "$pr4_merged" 'merged')
  assert_eq "$cached_merged" '' 'merged rows should be recomputed by default so activity/metrics stay fresh'

  pr5_merged_legacy=$(jq -cn '{number:5,updatedAt:"2026-03-10T01:00:00Z"}')
  cached_merged_legacy=$(get_cached_row_json_for_pr "$pr5_merged_legacy" 'merged')
  assert_eq "$cached_merged_legacy" '' 'merged rows with legacy schema should be treated as stale and recomputed'

  cached_wrong_section=$(get_cached_row_json_for_pr "$pr1_open" 'draft')
  assert_eq "$cached_wrong_section" '' 'cache row should not be reused across different sections'

  TARGET_PR_NUMBER='1'
  cached_single_pr=$(get_cached_row_json_for_pr "$pr1_open" 'open')
  assert_eq "$cached_single_pr" '' 'single-PR mode should bypass cache reuse so latest CHK/status data is recomputed'
  TARGET_PR_NUMBER=''

  DETAIL_CACHE_DIR="$TEST_TMP/cache-details"
  mkdir -p "$DETAIL_CACHE_DIR"
  cat >"$DETAIL_CACHE_DIR/777.json" <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"stale-reviewer"},"state":"APPROVED","submittedAt":"2026-03-10T01:00:00Z"}],"commits":[]}
JSON

  gh_with_retry() {
    cat <<'JSON'
{"comments":[],"reviews":[{"author":{"login":"fresh-reviewer"},"state":"DISMISSED","submittedAt":"2026-03-11T01:00:00Z"}],"commits":[]}
JSON
  }

  cached_non_target=$(get_pr_detail_json 777)
  assert_eq "$(printf '%s' "$cached_non_target" | jq -r '.reviews[0].author.login')" 'stale-reviewer' 'given cached detail and no target PR, when reading detail, then cached review detail should be reused'

  TARGET_PR_NUMBER='777'
  fresh_target=$(get_pr_detail_json 777)
  assert_eq "$(printf '%s' "$fresh_target" | jq -r '.reviews[0].author.login')" 'fresh-reviewer' 'given cached detail and targeted --pr update, when reading detail, then cached review detail should be bypassed and fresh detail fetched'
  TARGET_PR_NUMBER=''

  b64_lines=$(printf '%s\n%s\n%s\n%s\n' \
    "$(printf '%s' "$pr1_open" | base64)" \
    "$(printf '%s' "$pr1_draft" | base64)" \
    "$(printf '%s' "$pr2_draft" | base64)" \
    "$(printf '%s' "$pr3_open_new" | base64)")

  stale_open=$(collect_stale_numbers_from_b64 "$b64_lines" 'open' | tr -d '\r')
  assert_eq "$stale_open" $'1\n3' 'open stale collection should include all open rows because open cache reuse is disabled'

  stale_draft=$(collect_stale_numbers_from_b64 "$b64_lines" 'draft' | tr -d '\r')
  assert_eq "$stale_draft" $'1\n2' 'draft stale collection should include all draft rows because draft cache reuse is disabled'
}

run_row_order_stability_tests() {
  source "$SCRIPT_PATH"

  REPO='owner/repo'
  PR_STATE_FILE="$TEST_TMP/row-order-state.json"
  PR_STATE_LOCK_DIR="$TEST_TMP/row-order-state.lock"
  RUN_TS='2026-03-12T22:00:00Z'
  RUN_ROW_INDEX=10

  cat >"$PR_STATE_FILE" <<'JSON'
{
  "byPrNumber": {
    "123": {
      "prNumber": "123",
      "repo": "owner/repo",
      "section": "open",
      "updatedAt": "2026-03-12T21:00:00Z",
      "rowOrder": 3,
      "data": {
        "number": "123",
        "title": "Existing"
      }
    }
  },
  "ackByRepo": {},
  "reverifyByRepo": {},
  "inReviewByRepo": {}
}
JSON

  updated_row=$(jq -cn '{number:"123", title:"Updated"}')
  upsert_pr_state "$updated_row" 'open'
  assert_eq "$(jq -r '.byPrNumber["123"].rowOrder' "$PR_STATE_FILE")" '3' 'existing PR rowOrder should remain stable on upsert'

  RUN_ROW_INDEX=25
  new_row=$(jq -cn '{number:"456", title:"New"}')
  upsert_pr_state "$new_row" 'open'
  assert_eq "$(jq -r '.byPrNumber["456"].rowOrder' "$PR_STATE_FILE")" '25' 'new PR row should use current run rowOrder'
}

run_fetch_threads_pagination_tests() {
  source "$SCRIPT_PATH"

  REPO_OWNER='owner'
  REPO_NAME='repo'
  THREAD_CACHE_DIR="$TEST_TMP/pagination-threads"
  mkdir -p "$THREAD_CACHE_DIR"

  local api_call_file="$TEST_TMP/pagination-api-calls.txt"
  : >"$api_call_file"
  gh_with_retry() {
    printf '1\n' >>"$api_call_file"
    local after=''
    local arg
    for arg in "$@"; do
      if [[ "$arg" == after=* ]]; then
        after="${arg#after=}"
      fi
    done

    if [[ -z "$after" ]]; then
      cat <<'JSON'
{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[{"id":"thread-a","isResolved":false,"isOutdated":false,"comments":{"nodes":[{"id":"comment-a","author":{"login":"reviewer-a","name":"Reviewer A"},"authorAssociation":"MEMBER","body":"Thread A","createdAt":"2026-03-01T00:00:00Z","publishedAt":"2026-03-01T00:00:00Z","url":"https://example.com/a","replyTo":null,"path":"src/a.js","line":10,"originalLine":10,"diffSide":"RIGHT","state":"SUBMITTED"}],"totalCount":1,"pageInfo":{"hasNextPage":false,"endCursor":null}}}],"pageInfo":{"hasNextPage":true,"endCursor":"CURSOR_1"}}}}}}
JSON
    else
      cat <<'JSON'
{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[{"id":"thread-b","isResolved":true,"isOutdated":false,"comments":{"nodes":[{"id":"comment-b","author":{"login":"reviewer-b","name":"Reviewer B"},"authorAssociation":"MEMBER","body":"Thread B","createdAt":"2026-03-01T01:00:00Z","publishedAt":"2026-03-01T01:00:00Z","url":"https://example.com/b","replyTo":null,"path":"src/b.js","line":12,"originalLine":12,"diffSide":"RIGHT","state":"SUBMITTED"}],"totalCount":1,"pageInfo":{"hasNextPage":false,"endCursor":null}}}],"pageInfo":{"hasNextPage":false,"endCursor":null}}}}}}
JSON
    fi
  }

  threads=$(fetch_review_threads_json 999)
  assert_eq "$(printf '%s' "$threads" | jq 'length')" '2' 'fetch_review_threads_json should combine paginated thread nodes'
  assert_eq "$(wc -l <"$api_call_file" | tr -d ' ')" '2' 'fetch_review_threads_json should paginate until hasNextPage=false'

  threads_cached=$(fetch_review_threads_json 999)
  assert_eq "$(printf '%s' "$threads_cached" | jq 'length')" '2' 'cached threads should keep full paginated result'
  assert_eq "$(wc -l <"$api_call_file" | tr -d ' ')" '2' 'cached threads should avoid extra gh api calls'
}

run_ack_changed_rerun_tests() {
  source "$SCRIPT_PATH"

  REPO='owner/repo'
  REPO_OWNER='owner'
  REPO_NAME='repo'
  VIEWER_LOGIN='me_user'
  PR_STATE_FILE="$TEST_TMP/ack-rerun-state.json"
  PR_STATE_LOCK_DIR="$TEST_TMP/ack-rerun-state.lock"
  ACK_FILE="$TEST_TMP/ack-rerun.json"
  ACK_LOCK_DIR="$TEST_TMP/ack-rerun.lock"
  DETAIL_CACHE_DIR="$TEST_TMP/ack-rerun-details"
  THREAD_CACHE_DIR="$TEST_TMP/ack-rerun-threads"
  mkdir -p "$DETAIL_CACHE_DIR" "$THREAD_CACHE_DIR"
  ensure_ack_store

  get_pr_detail_json() {
    cat <<'JSON'
{"comments":[{"author":{"login":"other"},"createdAt":"2026-03-01T00:00:00Z"}],"reviews":[],"commits":[],"statusCheckRollup":[],"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}
JSON
  }

  fetch_review_threads_json() {
    echo '[]'
  }

  pr_json=$(jq -cn '{number:700,title:"Ack Rerun",url:"https://example.com/700",author:{login:"me_user",name:"User, Me"}}')

  first_row=$(compute_pr_state_json "$pr_json")
  assert_eq "$(printf '%s' "$first_row" | jq -r '.status')" 'CHANGED' 'first pass should detect change before ack baseline is applied'

  set_ack_ts 700 '2026-03-05T12:00:00Z'
  second_row=$(compute_pr_state_json "$pr_json")
  assert_eq "$(printf '%s' "$second_row" | jq -r '.status')" 'NO_CHANGE' 'second pass should suppress prior change after ack baseline'
}

run_main_integration_tests() {
  local mock_bin="$TEST_TMP/mock-bin"
  local mock_data="$TEST_TMP/mock-data"
  local integration_state="$TEST_TMP/integration-state.json"
  local integration_state_lock="$TEST_TMP/integration-state.lock"
  local integration_ack="$TEST_TMP/integration-ack.json"
  local integration_ack_lock="$TEST_TMP/integration-ack.lock"
  local integration_details="$TEST_TMP/integration-details"
  local integration_threads="$TEST_TMP/integration-threads"
  mkdir -p "$mock_data/details" "$mock_data/threads"
  mkdir -p "$integration_details" "$integration_threads"
  make_mock_gh "$mock_bin"

  cat >"$mock_data/open.json" <<'JSON'
[
  {"number":1,"title":"Open A","url":"https://example.com/1","labels":[{"name":"include-me"}],"isDraft":false,"author":{"login":"me_user","name":"User, Me"}},
  {"number":2,"title":"Draft B","url":"https://example.com/2","labels":[{"name":"blocked"}],"isDraft":true,"author":{"login":"other","name":"Other, User"}}
]
JSON

  cat >"$mock_data/merged.json" <<'JSON'
[
  {"number":10,"title":"M1","url":"https://example.com/10","labels":[{"name":"include-me"}],"mergedAt":"2026-03-05T12:00:00Z","author":{"login":"other","name":"Other, User"}},
  {"number":11,"title":"M2","url":"https://example.com/11","labels":[{"name":"blocked"}],"mergedAt":"2026-03-05T10:00:00Z","author":{"login":"other","name":"Other, User"}},
  {"number":12,"title":"M3","url":"https://example.com/12","labels":[],"mergedAt":"2026-03-04T09:00:00Z","author":{"login":"other","name":"Other, User"}},
  {"number":13,"title":"M4","url":"https://example.com/13","labels":[],"mergedAt":"2026-03-03T09:00:00Z","author":{"login":"other","name":"Other, User"}},
  {"number":14,"title":"M5","url":"https://example.com/14","labels":[],"mergedAt":"2026-03-02T09:00:00Z","author":{"login":"other","name":"Other, User"}}
]
JSON

  cat >"$mock_data/closed.json" <<'JSON'
[
  {"number":20,"title":"C1","url":"https://example.com/20","labels":[{"name":"include-me"}],"closedAt":"2026-03-06T12:00:00Z","author":{"login":"other","name":"Other, User"}},
  {"number":21,"title":"C2","url":"https://example.com/21","labels":[{"name":"blocked"}],"closedAt":"2026-03-06T10:00:00Z","author":{"login":"other","name":"Other, User"}},
  {"number":22,"title":"C3","url":"https://example.com/22","labels":[],"closedAt":"2026-03-05T09:00:00Z","author":{"login":"other","name":"Other, User"}},
  {"number":23,"title":"C4","url":"https://example.com/23","labels":[],"closedAt":"2026-03-04T09:00:00Z","author":{"login":"other","name":"Other, User"}},
  {"number":24,"title":"C5","url":"https://example.com/24","labels":[],"closedAt":"2026-03-03T09:00:00Z","author":{"login":"other","name":"Other, User"}}
]
JSON

  cat >"$mock_data/details/1.json" <<'JSON'
{"comments":[{"author":{"login":"other"},"createdAt":"2026-03-05T00:00:00Z"}],"reviews":[],"commits":[]}
JSON
  for n in 2 10 11 12 13 14 20 21 22 23 24; do
    cat >"$mock_data/details/$n.json" <<'JSON'
{"comments":[],"reviews":[],"commits":[]}
JSON
  done
  for n in 1 2 10 11 12 13 14 20 21 22 23 24; do
    cat >"$mock_data/threads/$n.json" <<'JSON'
[]
JSON
  done

  out_default=$(PATH="$mock_bin:$PATH" MOCK_OPEN_JSON="$mock_data/open.json" MOCK_CLOSED_JSON="$mock_data/closed.json" MOCK_MERGED_JSON="$mock_data/merged.json" MOCK_DETAILS_DIR="$mock_data/details" MOCK_THREADS_DIR="$mock_data/threads" PR_STATE_FILE="$integration_state" PR_STATE_LOCK_DIR="$integration_state_lock" ACK_FILE="$integration_ack" ACK_LOCK_DIR="$integration_ack_lock" DETAIL_CACHE_DIR="$integration_details" THREAD_CACHE_DIR="$integration_threads" sh "$SCRIPT_PATH" --open none --limit 5 --quiet)
  closed_rows_default=$(printf '%s\n' "$out_default" | awk '/Latest Closed PRs:/{f=1;next} /Latest Merged PRs:/{f=0} f && $1 ~ /^#/{c++} END{print c+0}')
  assert_eq "$closed_rows_default" '5' 'default mode should include latest 7 close-days'
  assert_true "printf '%s\n' \"$out_default\" | awk '/Latest Closed PRs:/{f=1;next} /Latest Merged PRs:/{f=0} f' | grep -q '^#24'" 'default closed-day mode should include the oldest fixture close day when within 7-day window'
  merged_rows_default=$(printf '%s\n' "$out_default" | awk '/Latest Merged PRs:/{f=1;next} /Summary:/{f=0} f && $1 ~ /^#/{c++} END{print c+0}')
  assert_eq "$merged_rows_default" '5' 'default mode should include latest 7 merge-days'
  assert_true "printf '%s\n' \"$out_default\" | awk '/Latest Merged PRs:/{f=1;next} /Summary:/{f=0} f' | grep -q '^#14'" 'default merged-day mode should include the oldest fixture merge day when within 7-day window'

  out_limit=$(PATH="$mock_bin:$PATH" MOCK_OPEN_JSON="$mock_data/open.json" MOCK_CLOSED_JSON="$mock_data/closed.json" MOCK_MERGED_JSON="$mock_data/merged.json" MOCK_DETAILS_DIR="$mock_data/details" MOCK_THREADS_DIR="$mock_data/threads" PR_STATE_FILE="$integration_state" PR_STATE_LOCK_DIR="$integration_state_lock" ACK_FILE="$integration_ack" ACK_LOCK_DIR="$integration_ack_lock" DETAIL_CACHE_DIR="$integration_details" THREAD_CACHE_DIR="$integration_threads" sh "$SCRIPT_PATH" --open none --limit 5 --merged-limit 2 --quiet)
  closed_rows_limit=$(printf '%s\n' "$out_limit" | awk '/Latest Closed PRs:/{f=1;next} /Latest Merged PRs:/{f=0} f && $1 ~ /^#/{c++} END{print c+0}')
  assert_eq "$closed_rows_limit" '2' 'merged-limit mode should cap closed rows too'
  first_closed_row=$(printf '%s\n' "$out_limit" | awk '/Latest Closed PRs:/{f=1;next} /Latest Merged PRs:/{f=0} f && $1 ~ /^#/{print $1; exit}')
  assert_eq "$first_closed_row" '#20' 'closed rows should stay sorted newest-first by closedAt'
  merged_rows_limit=$(printf '%s\n' "$out_limit" | awk '/Latest Merged PRs:/{f=1;next} /Summary:/{f=0} f && $1 ~ /^#/{c++} END{print c+0}')
  assert_eq "$merged_rows_limit" '2' 'merged-limit mode should cap merged rows'
  first_merged_row=$(printf '%s\n' "$out_limit" | awk '/Latest Merged PRs:/{f=1;next} /Summary:/{f=0} f && $1 ~ /^#/{print $1; exit}')
  assert_eq "$first_merged_row" '#10' 'merged-limit mode should keep merged rows sorted newest-first'

  out_hide=$(PATH="$mock_bin:$PATH" MOCK_OPEN_JSON="$mock_data/open.json" MOCK_CLOSED_JSON="$mock_data/closed.json" MOCK_MERGED_JSON="$mock_data/merged.json" MOCK_DETAILS_DIR="$mock_data/details" MOCK_THREADS_DIR="$mock_data/threads" PR_STATE_FILE="$integration_state" PR_STATE_LOCK_DIR="$integration_state_lock" ACK_FILE="$integration_ack" ACK_LOCK_DIR="$integration_ack_lock" DETAIL_CACHE_DIR="$integration_details" THREAD_CACHE_DIR="$integration_threads" sh "$SCRIPT_PATH" --open none --limit 5 --merged-limit 2 --hide-reason --quiet)
  assert_true "[[ -n \"$out_hide\" ]]" 'hide-reason run should produce output'

  out_label_filter=$(PATH="$mock_bin:$PATH" MOCK_OPEN_JSON="$mock_data/open.json" MOCK_CLOSED_JSON="$mock_data/closed.json" MOCK_MERGED_JSON="$mock_data/merged.json" MOCK_DETAILS_DIR="$mock_data/details" MOCK_THREADS_DIR="$mock_data/threads" PR_STATE_FILE="$integration_state" PR_STATE_LOCK_DIR="$integration_state_lock" ACK_FILE="$integration_ack" ACK_LOCK_DIR="$integration_ack_lock" DETAIL_CACHE_DIR="$integration_details" THREAD_CACHE_DIR="$integration_threads" sh "$SCRIPT_PATH" --open none --limit 5 --merged-limit 5 --label include-me,other-label --exclude-label blocked,deprecated --quiet)
  closed_rows_label_filter=$(printf '%s\n' "$out_label_filter" | awk '/Latest Closed PRs:/{f=1;next} /Latest Merged PRs:/{f=0} f && $1 ~ /^#/{c++} END{print c+0}')
  assert_eq "$closed_rows_label_filter" '1' 'label include/exclude filters should keep only matching closed PR rows'
  assert_true "printf '%s\n' \"$out_label_filter\" | awk '/Latest Closed PRs:/{f=1;next} /Latest Merged PRs:/{f=0} f' | grep -q '^#20'" 'label filters should retain include-me closed row'
  merged_rows_label_filter=$(printf '%s\n' "$out_label_filter" | awk '/Latest Merged PRs:/{f=1;next} /Summary:/{f=0} f && $1 ~ /^#/{c++} END{print c+0}')
  assert_eq "$merged_rows_label_filter" '1' 'label include/exclude filters should keep only matching merged PR rows'
  assert_true "printf '%s\n' \"$out_label_filter\" | awk '/Latest Merged PRs:/{f=1;next} /Summary:/{f=0} f' | grep -q '^#10'" 'label filters should retain include-me row'

}

run_reconcile_missing_open_rows_tests() {
  source "$SCRIPT_PATH"

  local reconcile_state="$TEST_TMP/reconcile-state.json"
  local reconcile_state_lock="$TEST_TMP/reconcile-state.lock"
  local old_path="$PATH"
  local mock_bin="$TEST_TMP/reconcile-mock-bin"

  PR_STATE_FILE="$reconcile_state"
  PR_STATE_LOCK_DIR="$reconcile_state_lock"
  REPO='owner/repo'
  REPO_OWNER='owner'
  REPO_NAME='repo'
  VIEWER_LOGIN='me_user'
  RUN_TS='2026-04-23T21:47:47Z'
  RUN_ROW_INDEX=0
  TARGET_PR_NUMBER=''
  RECONCILE_MISSING_OPEN_LIMIT=10

  ensure_pr_state_store

  stale_open_row=$(jq -cn '{number:"967",title:"Stale Open",url:"https://example.com/967",mergedAt:"",closedAt:"",sourceUpdatedAt:"2026-04-09T06:45:02Z",status:"NO_CHANGE",approved:"NO",approvalCount:"0",inReview:"false",approvers:[],openConversationCount:"0",viewedFilesCount:"0",changedFilesCount:"0",viewedFilesSummary:"0/0 viewed",comments:[],reviews:[],commits:[],reviewThreads:[],commentEvents:[],activityEvents:[],metrics:{counts:{}},activityTimelineSummary:"-",activityTimeline:[],baseline:"-"}')
  upsert_pr_state "$stale_open_row" 'open'

  mkdir -p "$mock_bin"
  cat >"$mock_bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" == "pr" && "$2" == "view" && "$3" == "967" ]]; then
  jq_expr=''
  i=1
  while [[ $i -le $# ]]; do
    eval "arg=\${$i}"
    if [[ "$arg" == "--jq" ]]; then
      i=$((i + 1))
      eval "jq_expr=\${$i}"
      break
    fi
    i=$((i + 1))
  done

  payload='{"number":967,"title":"Now Closed","url":"https://example.com/967","labels":[],"isDraft":false,"author":{"login":"other","name":"Other, User"},"mergedAt":"","closedAt":"2026-04-23T20:00:00Z","mergedBy":null,"createdAt":"2026-03-27T09:16:35Z","updatedAt":"2026-04-23T20:00:00Z","headRefName":"feature","baseRefName":"main"}'
  if [[ -n "$jq_expr" ]]; then
    printf '%s' "$payload" | jq -r "$jq_expr"
  else
    printf '%s' "$payload"
  fi
  exit 0
fi

echo "unsupported mock gh call: $*" >&2
exit 1
MOCK
  chmod +x "$mock_bin/gh"
  PATH="$mock_bin:$PATH"

  gh_with_retry() {
    "$@"
  }

  compute_pr_state_json() {
    local pr_json="$1"
    printf '%s' "$pr_json" | jq -c '{number:(.number|tostring),title:(.title//""),url:(.url//""),mergedAt:(.mergedAt//""),closedAt:(.closedAt//""),sourceUpdatedAt:(.updatedAt//""),status:"NO_CHANGE",approved:"NO",approvalCount:"0",inReview:"false",approvers:[],openConversationCount:"0",viewedFilesCount:"0",changedFilesCount:"0",viewedFilesSummary:"0/0 viewed",comments:[],reviews:[],commits:[],reviewThreads:[],commentEvents:[],activityEvents:[],metrics:{counts:{}},activityTimelineSummary:"-",activityTimeline:[],baseline:"-"}'
  }

  reconcile_missing_open_rows $'100\n101'

  updated_section=$(jq -r '.byPrNumber["967"].section' "$PR_STATE_FILE")
  assert_eq "$updated_section" 'closed' 'reconcile_missing_open_rows should reclassify stale open rows when they are now closed'

  updated_closed_at=$(jq -r '.byPrNumber["967"].data.closedAt' "$PR_STATE_FILE")
  assert_eq "$updated_closed_at" '2026-04-23T20:00:00Z' 'reconcile_missing_open_rows should persist refreshed closedAt timestamp'

  PATH="$old_path"
}

setup_tmp
run_all_tests() {
  setup_tmp
  run_helper_tests
  run_ack_store_tests
  run_compute_state_tests
  run_fetch_threads_pagination_tests
  run_ack_changed_rerun_tests
  run_reconcile_missing_open_rows_tests
  run_cache_freshness_tests
  run_row_order_stability_tests
  run_main_integration_tests
}

attempt=1
max_attempts=$((TEST_RETRIES + 1))
while ((attempt <= max_attempts)); do
  if run_all_tests; then
    echo "All tests passed (attempt $attempt/$max_attempts)."
    exit 0
  fi

  echo "Test attempt $attempt/$max_attempts failed."
  print_debug_context
  if ((attempt >= max_attempts)); then
    exit 1
  fi
  echo 'Retrying failed test run...'
  attempt=$((attempt + 1))
done
