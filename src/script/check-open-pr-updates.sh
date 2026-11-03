#!/usr/bin/env bash

set -euo pipefail

# Precedence: --repo CLI flag (parse_args, below) > VIEW_PRS_REPO env var.
# No hardcoded fallback repo - defaults to empty (not unset) specifically so
# `set -u` above doesn't crash the whole script, including --help, before
# parse_args/the real "$REPO" validation below even run; an empty/missing
# value is instead caught there with a clear message.
REPO="${VIEW_PRS_REPO:-}"
LIMIT=200
OPEN_MODE='all'
MERGED_LIMIT=15
MERGED_LIMIT_SET=0
MERGED_DAYS_DEFAULT=7
JOBS=6
TARGET_PR_NUMBER=''
INCLUDE_LABEL=''
EXCLUDE_LABEL=''
INCLUDE_LABELS=''
EXCLUDE_LABELS=''
INCLUDE_AUTHOR=''
INCLUDE_AUTHORS=''
SHOW_REASON=1
QUIET=0
QUICK_CHECK=0
QUICK_CHECK_NUMBERS_RAW_INPUT=''
QUICK_CHECK_NUMBERS=''
TARGET_PRS_RAW_INPUT=''
TARGET_PRS=''
TARGET_PRS_MISSING=''
# PRs whose details or review threads couldn't be fetched this run (see
# note_unfetched_pr): their stored rows are kept.
UNFETCHED_PR_NUMBERS=''
# Rows in the data file are keyed by repo#number: two repos can each have a
# PR #12. pr_row looks one up, also under its bare number for a file not
# migrated yet (ensure_pr_state_store migrates it).
PR_KEY_JQ='
  def pr_key($repo; $number): ($repo + "#" + ($number | tostring));
  def pr_row($repo; $number):
    (.byPrNumber // {}) as $rows
    | ($rows[pr_key($repo; $number)] // ($rows[$number | tostring] | select(. != null and (.repo // "") == $repo)) // empty);
'
STATUS_COL_WIDTH=28
APPROVED_COL_WIDTH=14
GH_COMMAND_TIMEOUT_SECONDS="${GH_COMMAND_TIMEOUT_SECONDS:-45}"
# A full run reuses a stored row whose PR hasn't changed (see
# get_cached_row_json_for_pr); VIEW_PRS_SKIP_UNCHANGED=0 fetches every PR
# instead. An open/draft row is fetched in full again once it's older than
# this, for what GitHub changes without moving the PR's updatedAt.
VIEW_PRS_OPEN_REVALIDATE_SECONDS="${VIEW_PRS_OPEN_REVALIDATE_SECONDS:-14400}"
# Part of every row's localStateKey: bump it when compute_pr_state_json
# changes what it writes, so stored rows are computed again.
ROW_CACHE_VERSION=1
VIEW_PRS_PREFETCH_GROUP_CONCURRENCY="${VIEW_PRS_PREFETCH_GROUP_CONCURRENCY:-3}"
VIEW_PRS_PROGRESS_MARKERS="${VIEW_PRS_PROGRESS_MARKERS:-0}"

REPO_OWNER=''
REPO_NAME=''
VIEWER_LOGIN=''
RUN_TS=''
RUN_ROW_INDEX=0
CACHE_TOTAL_COUNT=0
CACHE_STALE_COUNT=0
RECONCILED_MISSING_OPEN_COUNT=0
RECONCILE_MISSING_OPEN_LIMIT="${RECONCILE_MISSING_OPEN_LIMIT:-50}"
STALE_OPEN_DRAFT_PR_NUMBERS=''
STALE_CLOSED_PR_NUMBERS=''
STALE_MERGED_PR_NUMBERS=''
STALE_ALL_PR_NUMBERS=''

DETAIL_CACHE_DIR="${DETAIL_CACHE_DIR:-}"
THREAD_CACHE_DIR="${THREAD_CACHE_DIR:-}"
FILES_CACHE_DIR="${FILES_CACHE_DIR:-}"
REVIEW_URL_CACHE_DIR="${REVIEW_URL_CACHE_DIR:-}"
REVIEW_COMMENT_CACHE_DIR="${REVIEW_COMMENT_CACHE_DIR:-}"
CI_MERGE_CACHE_DIR="${CI_MERGE_CACHE_DIR:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEW_PRS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Portability (see REACT_MIGRATION_PLAN.md-adjacent dependency work): prefer
# the jq binary npm already downloaded via the node-jq devDependency over a
# system-wide `jq` on PATH, so `npm install` alone provides a working jq
# with no manual system install step. Falls back to plain `jq` (relying on
# PATH, as before) when node_modules/node-jq isn't present - e.g. this
# script run standalone outside the npm-managed project. Shadowing `jq`
# itself as a function (rather than rewriting every call site below) means
# every existing invocation picks this up unchanged; `export -f` propagates
# it into the `bash -c` subshells the parallel-fetch helpers below spawn.
if [[ -x "$VIEW_PRS_DIR/node_modules/node-jq/bin/jq" ]]; then
  JQ_BIN="$VIEW_PRS_DIR/node_modules/node-jq/bin/jq"
elif [[ -x "$VIEW_PRS_DIR/node_modules/node-jq/bin/jq.exe" ]]; then
  JQ_BIN="$VIEW_PRS_DIR/node_modules/node-jq/bin/jq.exe"
else
  JQ_BIN=""
fi
if [[ -n "$JQ_BIN" ]]; then
  jq() { "$JQ_BIN" "$@"; }
  export -f jq
fi

# The Node that computes each row (compute-pr-row.js): the server passes
# its own (process.execPath), which needn't be on PATH - nvm, Volta or an
# editor's bundled Node; run standalone, `node` from PATH.
NODE_BIN="${VIEW_PRS_NODE:-node}"

DATA_DIR="${DATA_DIR:-$VIEW_PRS_DIR/data}"
PR_STATE_FILE="${PR_STATE_FILE:-$DATA_DIR/check-open-pr-updates.data.json}"
PR_STATE_LOCK_DIR="${PR_STATE_LOCK_DIR:-$DATA_DIR/check-open-pr-updates.data.lock}"
USER_STATE_FILE="${USER_STATE_FILE:-$DATA_DIR/check-open-pr-updates.user-state.json}"
USER_STATE_LOCK_DIR="${USER_STATE_LOCK_DIR:-$DATA_DIR/check-open-pr-updates.user-state.lock}"
PR_DETAIL_DIR="${PR_DETAIL_DIR:-$DATA_DIR/pr-details}"
LOCK_STALE_SECONDS="${LOCK_STALE_SECONDS:-900}"
STATE_BACKUP_DIR="${STATE_BACKUP_DIR:-$DATA_DIR/backups}"
STATE_BACKUP_RETENTION="${STATE_BACKUP_RETENTION:-50}"
# Beyond those, the newest backup of each of this many days (the most
# recent days with backups): runs every few minutes would otherwise leave
# only the last few hours.
STATE_BACKUP_DAILY_DAYS="${STATE_BACKUP_DAILY_DAYS:-7}"

LEGACY_ACK_FILE="$HOME/.cache/check-open-pr-updates/ack.json"
ACK_RAW_INPUT=''
ACK_ENABLED=0
ACK_NUMBERS=''
ACK_CLEAR_RAW_INPUT=''
ACK_CLEAR_ENABLED=0
ACK_CLEAR_NUMBERS=''
IN_REVIEW_RAW_INPUT=''
IN_REVIEW_ENABLED=0
IN_REVIEW_NUMBERS=''
IN_REVIEW_CLEAR_RAW_INPUT=''
IN_REVIEW_CLEAR_ENABLED=0
IN_REVIEW_CLEAR_NUMBERS=''
FLAGGED_RAW_INPUT=''
FLAGGED_ENABLED=0
FLAGGED_NUMBERS=''
FLAGGED_CLEAR_RAW_INPUT=''
FLAGGED_CLEAR_ENABLED=0
FLAGGED_CLEAR_NUMBERS=''
ACK_CHANGED=0
ACK_ONLY=0
BACKUP_LIST_ONLY=0
BACKUP_RESTORE_NAME=''
DEBUG_LOG_FILE="${CHECK_OPEN_PR_DEBUG_LOG:-}"

CHANGE_FILTER_IGNORE_COMMENT_AUTHORS=''
CHANGE_FILTER_IGNORE_REVIEW_AUTHORS=''
CHANGE_FILTER_IGNORE_COMMIT_PATTERNS=''
# What counts as a merge commit (user-defaults.json's mergeCommitRules), as
# JSON arrays; see countExternalCommits in compute-pr-row.js.
MERGE_COMMIT_HEADLINE_PATTERNS_JSON='["^Merge\\b"]'
MERGE_COMMIT_LOGINS_JSON='[]'
USER_DEFAULTS_FILE=''

debug_log() {
  local message="$1"
  [[ -z "$DEBUG_LOG_FILE" ]] && return 0

  mkdir -p "$(dirname "$DEBUG_LOG_FILE")" 2>/dev/null || true
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$message" >>"$DEBUG_LOG_FILE" 2>/dev/null || true
}

emit_pr_progress_marker() {
  local action="$1"
  local number="$2"

  [[ "$VIEW_PRS_PROGRESS_MARKERS" == '1' ]] || return 0
  [[ "$action" == 'START' || "$action" == 'END' ]] || return 0
  [[ "$number" =~ ^[0-9]+$ ]] || return 0

  printf '__VIEW_PRS_PROGRESS__:%s:%s\n' "$action" "$number" >&2
}

on_error() {
  local exit_code="$1"
  local line_no="$2"
  local command="$3"
  debug_log "ERROR exit=$exit_code line=$line_no cmd=$command"
  return "$exit_code"
}

trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR

COLOR_ENABLED=0
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  COLOR_ENABLED=1
fi

if [[ "$COLOR_ENABLED" -eq 1 ]]; then
  COLOR_RESET='\033[0m'
  COLOR_GREEN='\033[32m'
  COLOR_RED='\033[31m'
  COLOR_YELLOW='\033[33m'
  COLOR_CYAN='\033[36m'
else
  COLOR_RESET=''
  COLOR_GREEN=''
  COLOR_RED=''
  COLOR_YELLOW=''
  COLOR_CYAN=''
fi

supports_hyperlinks() {
  [[ -n "${FORCE_HYPERLINKS:-}" ]] && return 0
  [[ -n "${NO_HYPERLINKS:-}" ]] && return 1
  [[ -n "${VTE_VERSION:-}" ]] && return 0
  [[ -n "${WT_SESSION:-}" ]] && return 0
  [[ -n "${KONSOLE_VERSION:-}" ]] && return 0

  case "${TERM_PROGRAM:-}" in
    iTerm.app | WezTerm | vscode | WarpTerminal)
      return 0
      ;;
  esac

  return 1
}

HYPERLINK_ENABLED=0
if [[ -t 1 ]] && supports_hyperlinks; then
  HYPERLINK_ENABLED=1
fi

usage() {
  cat <<'EOF'
Usage: check-open-pr-updates.sh [options]

Checks open PRs, closed PRs that were not merged, and latest merged PRs,
reporting status/approval and changed reasons.

Options:
  -r, --repo <owner/name>      Repository to scan (default: $VIEW_PRS_REPO env var)
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
      --ack-only               Apply ack/clear operations only; skip PR retrieval
      --backup-list            List available state-file backups
      --backup-restore <file>  Restore a backup file from data/backups
      --show-reason            Show changed reason inline beside CHANGED in STATUS (default)
      --hide-reason            Hide inline changed reason in STATUS
      --quiet                  Hide run metadata header
      --open <mode>            Browser behavior: all | changed | none (default: all)
      --quick-check            List PRs and report which changed (by updatedAt) without
                                fetching full details/diffs; prints JSON to stdout and exits
      --quick-check-numbers <numbers> With --quick-check, check exactly these PR number(s)
                                (comma-separated) via direct lookup instead of listing -
                                bypasses --limit/--merged-limit/the day-window entirely, so
                                an older merged/closed PR can still be checked. Mutually
                                exclusive with -p/--pr.
      --prs <numbers>          Fully refresh exactly these PR number(s) (comma-separated),
                                looked up directly in whatever state they're in - for
                                refreshing only what a quick check found changed. Like
                                -p/--pr, a run of chosen PRs keeps each existing row's run
                                stamp and the last run, so "last run rows" still means the
                                last full run. Mutually exclusive with -p/--pr and
                                --quick-check.
  -h, --help                   Show this help

Examples:
  ./tools/scripts/check-open-pr-updates.sh
  ./tools/scripts/check-open-pr-updates.sh --merged-limit 25
  ./tools/scripts/check-open-pr-updates.sh --pr 923
  ./tools/scripts/check-open-pr-updates.sh --label bug,frontend
  ./tools/scripts/check-open-pr-updates.sh --exclude-label dependencies,blocked
  ./tools/scripts/check-open-pr-updates.sh --author ahall236_uhg,kshar280_uhg
  ./tools/scripts/check-open-pr-updates.sh --jobs 10
  ./tools/scripts/check-open-pr-updates.sh --ack 912,921
  ./tools/scripts/check-open-pr-updates.sh --ack 912 --ack 921
  ./tools/scripts/check-open-pr-updates.sh --ack-clear 912
  ./tools/scripts/check-open-pr-updates.sh --ack-changed
  ./tools/scripts/check-open-pr-updates.sh --backup-list
  ./tools/scripts/check-open-pr-updates.sh --backup-restore check-open-pr-updates.user-state.json.user-state.20260410T182500Z-12345-999.bak
EOF
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift

  if ! [[ "$timeout_seconds" =~ ^[0-9]+$ ]] || ((timeout_seconds <= 0)); then
    "$@"
    return $?
  fi

  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout --signal=TERM "$timeout_seconds" "$@"
    return $?
  fi

  if command -v timeout >/dev/null 2>&1; then
    timeout --signal=TERM "$timeout_seconds" "$@"
    return $?
  fi

  perl -e 'alarm shift @ARGV; exec @ARGV; die "exec failed: $!"' "$timeout_seconds" "$@"
}

gh_with_retry() {
  local attempt=1
  local max_attempts=3
  local delay=1
  local exit_code=0

  while true; do
    if run_with_timeout "$GH_COMMAND_TIMEOUT_SECONDS" "$@"; then
      return 0
    fi
    exit_code=$?
    if ((attempt >= max_attempts)); then
      return "$exit_code"
    fi
    sleep "$delay"
    delay=$((delay * 2))
    attempt=$((attempt + 1))
  done
}

format_link() {
  local url="$1"
  local text="$2"

  if [[ "$HYPERLINK_ENABLED" -eq 1 ]]; then
    printf '\033]8;;%s\a%s\033]8;;\a' "$url" "$text"
    return
  fi

  printf '%s' "$text"
}

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

format_iso_datetime() {
  local iso="$1"
  local formatted

  if [[ -z "$iso" || "$iso" == '-' ]]; then
    printf '%s' '-'
    return
  fi

  if command -v gdate >/dev/null 2>&1; then
    formatted=$(gdate -d "$iso" '+%b %-d, %Y %-I:%M %p' 2>/dev/null || true)
  elif date -d "$iso" '+%b %-d, %Y %-I:%M %p' >/dev/null 2>&1; then
    formatted=$(date -d "$iso" '+%b %-d, %Y %-I:%M %p' 2>/dev/null || true)
  else
    formatted=$(date -j -f '%Y-%m-%dT%H:%M:%SZ' "$iso" '+%b %-d, %Y %-I:%M %p' 2>/dev/null || true)
  fi

  if [[ -n "$formatted" ]]; then
    printf '%s' "$formatted"
    return
  fi

  printf '%s' "$iso"
}

create_state_backup() {
  local target_file="$1"
  local tag="$2"
  local ts suffix backup_file pattern retention daily_days

  [[ -f "$target_file" ]] || return 0

  mkdir -p "$STATE_BACKUP_DIR" 2>/dev/null || true
  ts=$(date -u '+%Y%m%dT%H%M%SZ' 2>/dev/null || date '+%Y%m%dT%H%M%SZ')
  suffix="${ts}-${$}-${RANDOM}"
  backup_file="$STATE_BACKUP_DIR/$(basename "$target_file").${tag}.${suffix}.bak"
  cp "$target_file" "$backup_file" 2>/dev/null || true

  retention="$STATE_BACKUP_RETENTION"
  if [[ "$retention" =~ ^[0-9]+$ ]] && ((retention > 0)); then
    pattern="$STATE_BACKUP_DIR/$(basename "$target_file").${tag}.*.bak"
    if compgen -G "$pattern" >/dev/null; then
      # Best-effort trim only: with `set -e -o pipefail`, if a concurrent
      # invocation of this same cleanup deletes the last matching files
      # between the compgen check above and `ls` running here, the glob
      # expands to nothing, `ls` fails (no such file), and pipefail would
      # propagate that failure through the whole pipeline and abort the
      # entire script — silently dropping whatever ack/flag/clear operation
      # was in progress. `|| true` keeps that race from being fatal.
      # Keeps the newest $retention, and the newest one of each day (from
      # the name's UTC timestamp) until $daily_days days have one.
      daily_days="$STATE_BACKUP_DAILY_DAYS"
      [[ "$daily_days" =~ ^[0-9]+$ ]] || daily_days=7
      ls -1t $pattern 2>/dev/null | awk -v keep="$retention" -v days="$daily_days" '
        function day_of(name) {
          return match(name, /\.[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T/) ? substr(name, RSTART + 1, 8) : ""
        }
        {
          day = day_of($0)
          if (NR <= keep) {
            if (day != "" && !(day in seen)) { seen[day] = 1; day_count++ }
            next
          }
          if (day != "" && !(day in seen) && day_count < days) { seen[day] = 1; day_count++; next }
          print
        }
      ' | while IFS= read -r old_file; do
        [[ -n "$old_file" ]] || continue
        rm -f "$old_file" 2>/dev/null || true
      done || true
    fi
  fi
}

replace_state_file() {
  local tmp_file="$1"
  local target_file="$2"
  local tag="$3"

  if [[ ! -f "$tmp_file" || ! -s "$tmp_file" ]]; then
    echo "Refusing to replace $target_file with empty state payload" >&2
    return 1
  fi

  if ! jq -e 'type == "object"' "$tmp_file" >/dev/null 2>&1; then
    echo "Refusing to replace $target_file with invalid JSON state payload" >&2
    return 1
  fi

  create_state_backup "$target_file" "$tag"
  move_into_state_file "$tmp_file" "$target_file"
}

# A temp file beside a state file, named like the server's own
# (view-prs-state-storage.js), so moving it over the file is a rename.
state_file_tmp_path() {
  printf '%s.tmp-%s-%s' "$1" "${BASHPID:-$$}" "$RANDOM"
}

# Replaces target_file with tmp_file in one step. mktemp's files are in the
# system temp folder - often another drive (C: here, data on D:) - and a
# move between drives copies over the file in place, where the server's
# poll could read it half-written. Moved beside it first, then renamed.
move_into_state_file() {
  local tmp_file="$1"
  local target_file="$2"
  local staged

  staged=$(state_file_tmp_path "$target_file")
  if ! command mv -f "$tmp_file" "$staged"; then
    rm -f "$tmp_file" "$staged" 2>/dev/null || true
    return 1
  fi
  command mv -f "$staged" "$target_file"
}

list_state_backups() {
  local pr_base user_base pattern_pr pattern_user stats_tmp backup_path mtime
  pr_base="$(basename "$PR_STATE_FILE")"
  user_base="$(basename "$USER_STATE_FILE")"
  pattern_pr="$STATE_BACKUP_DIR/${pr_base}.pr-data.*.bak"
  pattern_user="$STATE_BACKUP_DIR/${user_base}.user-state.*.bak"

  stats_tmp=$(mktemp)
  for backup_path in $pattern_pr $pattern_user; do
    [[ -f "$backup_path" ]] || continue
    mtime=$(stat -f '%m' "$backup_path" 2>/dev/null || stat -c '%Y' "$backup_path" 2>/dev/null || echo '0')
    printf '%s\t%s\n' "$mtime" "$backup_path" >>"$stats_tmp"
  done

  if [[ ! -s "$stats_tmp" ]]; then
    rm -f "$stats_tmp"
    echo "No backups found in $STATE_BACKUP_DIR"
    return 0
  fi

  echo "Available backups (newest first):"
  sort -rn "$stats_tmp" | while IFS=$'\t' read -r _ backup_path; do
    [[ -n "$backup_path" ]] || continue
    echo "  $(basename "$backup_path")"
  done
  rm -f "$stats_tmp"
}

resolve_backup_restore_target() {
  local backup_name="$1"
  local pr_base user_base
  pr_base="$(basename "$PR_STATE_FILE")"
  user_base="$(basename "$USER_STATE_FILE")"

  if [[ "$backup_name" == "$pr_base".pr-data.*.bak ]]; then
    printf '%s\n%s\n' "$PR_STATE_FILE" 'pr-data'
    return 0
  fi

  if [[ "$backup_name" == "$user_base".user-state.*.bak ]]; then
    printf '%s\n%s\n' "$USER_STATE_FILE" 'user-state'
    return 0
  fi

  return 1
}

restore_state_backup() {
  local backup_name="$1"
  local backup_file target_and_tag target_file target_tag tmp

  if [[ -z "$backup_name" ]]; then
    echo 'Missing --backup-restore value' >&2
    return 1
  fi

  if [[ "$backup_name" == *'/'* || "$backup_name" == *'..'* ]]; then
    echo 'Invalid backup name: use a filename from --backup-list output' >&2
    return 1
  fi

  backup_file="$STATE_BACKUP_DIR/$backup_name"
  if [[ ! -f "$backup_file" ]]; then
    echo "Backup not found: $backup_name" >&2
    return 1
  fi

  if ! target_and_tag=$(resolve_backup_restore_target "$backup_name"); then
    echo "Cannot infer restore target from backup name: $backup_name" >&2
    return 1
  fi

  target_file=$(printf '%s' "$target_and_tag" | sed -n '1p')
  target_tag=$(printf '%s' "$target_and_tag" | sed -n '2p')

  mkdir -p "$(dirname "$target_file")"
  tmp=$(mktemp)
  cp "$backup_file" "$tmp"
  replace_state_file "$tmp" "$target_file" "$target_tag"
  echo "Restored $backup_name -> $target_file"
}

ensure_ack_store() {
  ensure_user_state_store
  ensure_pr_state_store
}

get_ack_ts() {
  local number="$1"
  jq -r --arg repo "$REPO" --arg number "$number" '.ackByRepo[$repo][$number] // ""' "$USER_STATE_FILE" 2>/dev/null
}

get_reverify_required() {
  local number="$1"
  jq -r --arg repo "$REPO" --arg number "$number" '.reverifyByRepo[$repo][$number] // false' "$USER_STATE_FILE" 2>/dev/null
}

get_in_review_required() {
  local number="$1"
  jq -r --arg repo "$REPO" --arg number "$number" '.inReviewByRepo[$repo][$number] // false' "$USER_STATE_FILE" 2>/dev/null
}

set_in_review_required_unlocked() {
  local number="$1"
  local tmp
  tmp=$(mktemp)
  jq --arg repo "$REPO" --arg number "$number" '(.inReviewByRepo //= {}) | (.inReviewByRepo[$repo] //= {}) | .inReviewByRepo[$repo][$number] = true' "$USER_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

set_in_review_required() {
  local number="$1"
  with_user_state_lock set_in_review_required_unlocked "$number"
}

clear_in_review_required_unlocked() {
  local number="$1"
  local tmp
  tmp=$(mktemp)
  jq --arg repo "$REPO" --arg number "$number" 'if .inReviewByRepo[$repo] then del(.inReviewByRepo[$repo][$number]) else . end' "$USER_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

clear_in_review_required() {
  local number="$1"
  with_user_state_lock clear_in_review_required_unlocked "$number"
}

set_flagged_required_unlocked() {
  local number="$1"
  local tmp
  tmp=$(mktemp)
  jq --arg repo "$REPO" --arg number "$number" '(.flaggedByRepo //= {}) | (.flaggedByRepo[$repo] //= {}) | .flaggedByRepo[$repo][$number] = true' "$USER_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

set_flagged_required() {
  local number="$1"
  with_user_state_lock set_flagged_required_unlocked "$number"
}

clear_flagged_required_unlocked() {
  local number="$1"
  local tmp
  tmp=$(mktemp)
  jq --arg repo "$REPO" --arg number "$number" 'if .flaggedByRepo[$repo] then del(.flaggedByRepo[$repo][$number]) else . end' "$USER_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

clear_flagged_required() {
  local number="$1"
  with_user_state_lock clear_flagged_required_unlocked "$number"
}

# Every Ack of a PR, kept for its Activity tab (ackHistoryByRepo: repo ->
# PR number -> times, oldest first) - the current one (ackByRepo) is the
# last. An Ack adds its time; clearing it with Clear Ack takes that time
# back out; new activity clearing it leaves the time, so you can see you'd
# looked before it changed. ACK_HISTORY_JQ's record_ack puts the current
# Ack in the history (an Ack from before there was one isn't there yet).
ACK_HISTORY_JQ='
  def record_ack:
    (.ackByRepo[$repo][$number] // "") as $ack
    | if $ack == "" then .
      else (.ackHistoryByRepo //= {}) | (.ackHistoryByRepo[$repo] //= {})
        | .ackHistoryByRepo[$repo][$number] = ((.ackHistoryByRepo[$repo][$number] // []) + [$ack] | unique)
      end;
  def unrecord_ack:
    (.ackByRepo[$repo][$number] // "") as $ack
    | if $ack == "" or (.ackHistoryByRepo[$repo][$number] == null) then .
      else .ackHistoryByRepo[$repo][$number] |= map(select(. != $ack))
        | if .ackHistoryByRepo[$repo][$number] == [] then del(.ackHistoryByRepo[$repo][$number]) else . end
      end;
'

set_ack_ts_unlocked() {
  local number="$1"
  local ts="$2"
  local tmp
  tmp=$(mktemp)
  jq --arg repo "$REPO" --arg number "$number" --arg ts "$ts" "$ACK_HISTORY_JQ"'record_ack | (.ackByRepo //= {}) | (.ackByRepo[$repo] //= {}) | .ackByRepo[$repo][$number] = $ts | record_ack | if .reverifyByRepo[$repo] then del(.reverifyByRepo[$repo][$number]) else . end' "$USER_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

set_ack_ts() {
  local number="$1"
  local ts="$2"
  with_user_state_lock set_ack_ts_unlocked "$number" "$ts"
}

clear_ack_ts_unlocked() {
  local number="$1"
  # set_reverify: the manual "--ack-clear" path (default) also sets
  # reverifyByRepo so the row shows CHANGED("ack-cleared") even absent any
  # real new activity. The automatic clear-on-new-activity path (see
  # compute_pr_state_json) passes false: status is already CHANGED for a
  # real reason there, and forcing reverifyByRepo too would keep pinning it
  # to CHANGED forever once that real activity ages out of effective_last.
  # The manual path also takes its time out of the Ack history (an Ack
  # undone); the automatic one keeps it (ACK_HISTORY_JQ).
  local set_reverify="${2:-true}"
  local tmp
  tmp=$(mktemp)
  if [[ "$set_reverify" == 'true' ]]; then
    jq --arg repo "$REPO" --arg number "$number" "$ACK_HISTORY_JQ"'unrecord_ack | if .ackByRepo[$repo] then del(.ackByRepo[$repo][$number]) else . end | (.reverifyByRepo //= {}) | (.reverifyByRepo[$repo] //= {}) | .reverifyByRepo[$repo][$number] = true' "$USER_STATE_FILE" >"$tmp"
  else
    jq --arg repo "$REPO" --arg number "$number" "$ACK_HISTORY_JQ"'record_ack | if .ackByRepo[$repo] then del(.ackByRepo[$repo][$number]) else . end' "$USER_STATE_FILE" >"$tmp"
  fi
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

clear_ack_ts() {
  local number="$1"
  local set_reverify="${2:-true}"
  with_user_state_lock clear_ack_ts_unlocked "$number" "$set_reverify"
}

ensure_user_state_store() {
  [[ -f "$USER_STATE_FILE" ]] || printf '{"notesByPrNumber":{},"ackByRepo":{},"reverifyByRepo":{},"inReviewByRepo":{},"flaggedByRepo":{}}' >"$USER_STATE_FILE"

  if [[ -f "$LEGACY_ACK_FILE" ]]; then
    local local_ack_count
    local legacy_ack_count
    local_ack_count=$(jq -r '(.ackByRepo // {} | keys | length)' "$USER_STATE_FILE" 2>/dev/null || echo '0')
    legacy_ack_count=$(jq -r '(. // {} | keys | length)' "$LEGACY_ACK_FILE" 2>/dev/null || echo '0')

    if [[ "$local_ack_count" -eq 0 && "$legacy_ack_count" -gt 0 ]]; then
      local tmp
      tmp=$(mktemp)
      jq --slurpfile legacy "$LEGACY_ACK_FILE" '.ackByRepo = ($legacy[0] // {})' "$USER_STATE_FILE" >"$tmp"
      replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
    fi
  fi
}

ensure_pr_state_store() {
  [[ -f "$PR_STATE_FILE" ]] || printf '{"byPrNumber":{},"lastRun":null}' >"$PR_STATE_FILE"

  # Rewritten (and backed up) only when there's something to fix - not with
  # every quick check. A run that writes rows backs it up itself (main).
  if jq -e '(.byPrNumber | type) == "object" and ([has("ackByRepo", "reverifyByRepo", "inReviewByRepo", "flaggedByRepo")] | any | not) and ([.byPrNumber | to_entries[] | select((.key | test("^[0-9]+$")) and ((.value.repo // "") != ""))] | length == 0)' "$PR_STATE_FILE" >/dev/null 2>&1; then
    return 0
  fi

  local tmp
  tmp=$(mktemp)
  # Rows are keyed by repo#number (see PR_KEY_JQ); a row keyed by its bare
  # number (before 2026-11-02, when two repos' PRs with the same number
  # replaced each other) moves to its repo's key - unless that key already
  # has a row, the newer one. A row without a repo keeps its number.
  jq "$PR_KEY_JQ"'
    .byPrNumber //= {}
    | del(.ackByRepo, .reverifyByRepo, .inReviewByRepo, .flaggedByRepo)
    | .byPrNumber = (
        (.byPrNumber | to_entries) as $entries
        | ([$entries[] | select(.key | test("^[0-9]+$") | not) | .key]) as $keyed
        | reduce $entries[] as $e ({};
            if ($e.key | test("^[0-9]+$")) and (($e.value.repo // "") != "") then
              pr_key($e.value.repo; $e.key) as $k
              | if ($keyed | index($k)) != null then . else .[$k] = $e.value end
            else .[$e.key] = $e.value
            end)
      )
  ' "$PR_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$PR_STATE_FILE" 'pr-data'
}

load_change_filter_config() {
  USER_DEFAULTS_FILE="$DATA_DIR/user-defaults.json"
  
  [[ -f "$USER_DEFAULTS_FILE" ]] || return 0
  
  CHANGE_FILTER_IGNORE_COMMENT_AUTHORS=$(jq -r '.changeFilters.ignoreCommentsFromAuthors // [] | join(",")' "$USER_DEFAULTS_FILE" 2>/dev/null || echo '')
  CHANGE_FILTER_IGNORE_REVIEW_AUTHORS=$(jq -r '.changeFilters.ignoreReviewsFromAuthors // [] | join(",")' "$USER_DEFAULTS_FILE" 2>/dev/null || echo '')
  CHANGE_FILTER_IGNORE_COMMIT_PATTERNS=$(jq -r '.changeFilters.ignoreCommitPatterns // [] | join("|")' "$USER_DEFAULTS_FILE" 2>/dev/null || echo '')
  # mergeCommitRules' two lists, the same way the UI reads them
  # (FilterStateProvider's asMergeCommitRules): a list as saved, a single
  # string as a one-entry list, and anything else (missing or malformed) as
  # the default - ^Merge\b for the patterns, none for the logins. The old
  # changeFilters.useBuiltinMergePattern setting is no longer read.
  MERGE_COMMIT_HEADLINE_PATTERNS_JSON=$(jq -c '
    (try .mergeCommitRules.headlinePatterns catch null) as $patterns
    | if ($patterns | type) == "array" then [$patterns[] | tostring | select(length > 0)]
      elif ($patterns | type) == "string" then [$patterns | select(length > 0)]
      else ["^Merge\\b"] end' "$USER_DEFAULTS_FILE" 2>/dev/null || echo '["^Merge\\b"]')
  MERGE_COMMIT_LOGINS_JSON=$(jq -c '
    (try .mergeCommitRules.logins catch null) as $logins
    | if ($logins | type) == "array" then [$logins[] | tostring | select(length > 0)]
      elif ($logins | type) == "string" then [$logins | select(length > 0)]
      else [] end' "$USER_DEFAULTS_FILE" 2>/dev/null || echo '[]')

  debug_log "change_filter_config loaded: ignore_comment_authors=$CHANGE_FILTER_IGNORE_COMMENT_AUTHORS ignore_review_authors=$CHANGE_FILTER_IGNORE_REVIEW_AUTHORS ignore_commit_patterns=$CHANGE_FILTER_IGNORE_COMMIT_PATTERNS merge_commit_patterns=$MERGE_COMMIT_HEADLINE_PATTERNS_JSON merge_commit_logins=$MERGE_COMMIT_LOGINS_JSON"
}

lock_info_file() {
  local lock_dir="$1"
  printf '%s/lock-info' "$lock_dir"
}
get_epoch_seconds() {
  date +%s 2>/dev/null || echo 0
}
get_path_mtime_epoch() {
  local path="$1"
  stat -f '%m' "$path" 2>/dev/null || stat -c '%Y' "$path" 2>/dev/null || echo 0
}
is_pid_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null
}
write_lock_metadata() {
  local lock_dir="$1"
  local info_file tmp_file now
  info_file=$(lock_info_file "$lock_dir")
  tmp_file="${info_file}.tmp.$$"
  now=$(get_epoch_seconds)

  # Write to a temp file and rename it into place rather than writing
  # info_file directly. `{ ...; } >"$info_file"` truncates info_file to 0
  # bytes the instant the redirect opens, before any of the printfs run —
  # under heavy concurrency, a competing process's staleness check can land
  # in that gap, see an existing-but-empty file, parse no pid from it, and
  # conclude (wrongly) that this brand-new, live lock is stale and abandoned
  # by a dead process. Renaming a fully-written temp file into place is
  # atomic, so readers only ever see "absent" or "complete", never "empty".
  {
    printf 'pid=%s\n' "$$"
    printf 'createdAt=%s\n' "$now"
    printf 'script=%s\n' "$0"
  } >"$tmp_file" 2>/dev/null && mv -f "$tmp_file" "$info_file" 2>/dev/null || true
}
is_lock_dir_currently_stale() {
  local lock_dir="$1"
  local info_file pid now age stale_after mtime

  [[ -d "$lock_dir" ]] || return 1

  stale_after="$LOCK_STALE_SECONDS"
  [[ "$stale_after" =~ ^[0-9]+$ ]] || stale_after=900

  info_file=$(lock_info_file "$lock_dir")
  if [[ -f "$info_file" ]]; then
    pid=$(awk -F= '/^pid=/{print $2; exit}' "$info_file" 2>/dev/null || true)
    if is_pid_alive "$pid"; then
      return 1
    fi
  else
    mtime=$(get_path_mtime_epoch "$lock_dir")
    now=$(get_epoch_seconds)
    if [[ "$mtime" =~ ^[0-9]+$ ]] && [[ "$now" =~ ^[0-9]+$ ]]; then
      age=$((now - mtime))
      if ((age < stale_after)); then
        return 1
      fi
    fi
  fi

  return 0
}

recover_stale_lock_dir() {
  local lock_dir="$1"
  local lock_label="$2"

  is_lock_dir_currently_stale "$lock_dir" || return 1

  # Re-verify immediately before the destructive step. Under contention,
  # checking "pid" or "reading the info file" can take long enough (process
  # scheduling, subprocess forking for `stat`/`kill -0`/`awk`) for a
  # different waiter to legitimately win the lock in between our verdict and
  # actually acting on it. Without this, we'd blow away a lock dir another
  # process just created and is actively holding, letting both believe they
  # own it — the exact way concurrent ack/flag/clear requests silently lose
  # each other's writes.
  is_lock_dir_currently_stale "$lock_dir" || return 1

  if rm -rf "$lock_dir" 2>/dev/null; then
    debug_log "Recovered stale ${lock_label} lock: ${lock_dir}"
    return 0
  fi

  return 1
}

# A run that's stopped (the server sends a timed-out run SIGTERM) lets go
# of the locks it holds, rather than leaving them for the next run to find
# stale - meanwhile every write waits on them and fails. Each lock records
# the shell holding it (set_current_shell_pid): a lock can be taken in a
# $(...) subshell, which has its own traps, so taking one sets this shell's (when run as a
# script - main sets MAIN_SHELL_PID - not when sourced by the tests). Only
# the main shell removes main's temporary caches (EXIT_CLEANUP_PATHS). A
# process killed outright (Windows ends a timed-out run that way) runs no
# trap: the next run recovers its locks as before.
PR_STATE_LOCK_HOLDER=''
USER_STATE_LOCK_HOLDER=''
EXIT_CLEANUP_PATHS=()
CURRENT_SHELL_PID=''

# Sets CURRENT_SHELL_PID to this shell's PID - a $(...) subshell's own,
# which $$ isn't. A variable, not output: read through $(...), it would be
# that substitution's subshell's. BASHPID is bash 4+; bash 3.2 (macOS's
# /bin/bash) has no BASHPID, and set -u fails on it, so there it's the
# parent of a process this shell starts (exec keeps the substitution from
# adding a shell in between).
set_current_shell_pid() {
  if [[ -n "${BASHPID:-}" ]]; then
    CURRENT_SHELL_PID=$BASHPID
  else
    CURRENT_SHELL_PID=$(exec sh -c 'printf "%s" "$PPID"')
  fi
}

on_script_exit() {
  set_current_shell_pid
  [[ "$PR_STATE_LOCK_HOLDER" == "$CURRENT_SHELL_PID" ]] && release_pr_state_lock
  [[ "$USER_STATE_LOCK_HOLDER" == "$CURRENT_SHELL_PID" ]] && release_user_state_lock
  if [[ "$CURRENT_SHELL_PID" == "${MAIN_SHELL_PID:-}" && ${#EXIT_CLEANUP_PATHS[@]} -gt 0 ]]; then
    rm -rf "${EXIT_CLEANUP_PATHS[@]}"
  fi
  return 0
}

set_exit_traps() {
  [[ -n "${MAIN_SHELL_PID:-}" ]] || return 0
  trap on_script_exit EXIT
  trap 'exit 143' TERM
  trap 'exit 130' INT
}

acquire_pr_state_lock() {
  local lock_label='PR state'
  local attempts=0
  while ! mkdir "$PR_STATE_LOCK_DIR" 2>/dev/null; do
    recover_stale_lock_dir "$PR_STATE_LOCK_DIR" "$lock_label" && continue
    attempts=$((attempts + 1))
    if ((attempts > 100)); then
      echo 'Unable to acquire PR state lock' >&2
      return 1
    fi
    sleep 0.05
  done
  write_lock_metadata "$PR_STATE_LOCK_DIR"
  set_current_shell_pid
  PR_STATE_LOCK_HOLDER=$CURRENT_SHELL_PID
  set_exit_traps
  return 0
}

release_pr_state_lock() {
  rm -f "$PR_STATE_LOCK_DIR/lock-info" 2>/dev/null || true
  rmdir "$PR_STATE_LOCK_DIR" 2>/dev/null || true
  PR_STATE_LOCK_HOLDER=''
}

with_pr_state_lock() {
  if ! acquire_pr_state_lock; then
    return 1
  fi
  "$@"
  local rc=$?
  release_pr_state_lock
  return "$rc"
}

acquire_user_state_lock() {
  local lock_label='user state'
  local attempts=0
  while ! mkdir "$USER_STATE_LOCK_DIR" 2>/dev/null; do
    recover_stale_lock_dir "$USER_STATE_LOCK_DIR" "$lock_label" && continue
    attempts=$((attempts + 1))
    if ((attempts > 100)); then
      echo 'Unable to acquire user state lock' >&2
      return 1
    fi
    sleep 0.05
  done
  write_lock_metadata "$USER_STATE_LOCK_DIR"
  set_current_shell_pid
  USER_STATE_LOCK_HOLDER=$CURRENT_SHELL_PID
  set_exit_traps
  return 0
}

release_user_state_lock() {
  rm -f "$USER_STATE_LOCK_DIR/lock-info" 2>/dev/null || true
  rmdir "$USER_STATE_LOCK_DIR" 2>/dev/null || true
  USER_STATE_LOCK_HOLDER=''
}

with_user_state_lock() {
  if ! acquire_user_state_lock; then
    return 1
  fi
  "$@"
  local rc=$?
  release_user_state_lock
  return "$rc"
}

upsert_pr_state_unlocked() {
  local row_json="$1"
  local section="$2"
  local tmp row_file

  # Beside the data file, so replacing it is a rename (move_into_state_file).
  tmp=$(state_file_tmp_path "$PR_STATE_FILE")
  row_file=$(mktemp)
  printf '%s' "$row_json" >"$row_file"
  # fetchedAt: when this row was written - updatedAt is the run's start for
  # every row, so a long run's late rows look older than they are. The
  # server's live summary (view-prs-live-summary-helpers.js) only replaces a
  # row's values when listed after this. Written after the row's data was
  # fetched, so a listing it counts as newer always is. A row reused as it
  # was (get_pr_row_json's __reused) wasn't fetched, so keeps its fetchedAt:
  # the live summary still applies to it, and an open row is still fetched
  # again once that's VIEW_PRS_OPEN_REVALIDATE_SECONDS old. ciFetchedAt: when
  # its CI and mergeability were, which a reused open row's are
  # (enrich_cached_row_with_ci_merge's __ciFetched) - so a listing older
  # than that doesn't replace them.
  #
  # A run of chosen PRs (is_targeted_run) keeps an existing row's updatedAt
  # and lastFullRun: they mark which rows the last full run saw - the "last
  # run rows" view - which refreshing a few PRs doesn't change. A row it
  # adds takes the last full run's stamp too, so a new PR shows there
  # straight away. lastRun is every run's, for "updated N minutes ago".
  # (Data from before lastFullRun takes its lastRun as one.)
  #
  # Written straight over the file, without replace_state_file's backup and
  # second parse: the run backed the file up once before its first row
  # (main), and jq only succeeds with a whole document.
  local targeted=false
  is_targeted_run && targeted=true
  if ! jq \
    --arg repo "$REPO" \
    --arg section "$section" \
    --arg updatedAt "$RUN_TS" \
    --argjson rowOrder "$RUN_ROW_INDEX" \
    --argjson targeted "$targeted" \
    --slurpfile row_file "$row_file" \
    "$PR_KEY_JQ"'
      ($row_file[0] // {}) as $row |
      ($row.number | tostring) as $number |
      pr_key($repo; $number) as $key |
      (now | todate) as $now |
      .byPrNumber //= {} |
      ([pr_row($repo; $number)] | first // {}) as $existing |
      (if ((.byPrNumber[$number].repo // "") == $repo) then del(.byPrNumber[$number]) else . end) |
      ($existing.updatedAt // (.lastFullRun // .lastRun).updatedAt // null) as $existingUpdatedAt |
      .byPrNumber[$key] = (($existing | del(.notes)) + {
        prNumber: $number,
        repo: $repo,
        section: $section,
        updatedAt: (if $targeted then ($existingUpdatedAt // $updatedAt) else $updatedAt end),
        fetchedAt: (if $row.__reused == true then $existing.fetchedAt else $now end),
        ciFetchedAt: (
          if $row.__reused != true or $row.__ciFetched == true then $now
          else ($existing.ciFetchedAt // $existing.fetchedAt)
          end
        ),
        rowOrder: (($existing.rowOrder // $rowOrder)),
        data: ($row | del(.__reused, .__ciFetched))
      }) |
      .lastFullRun = (if $targeted then (.lastFullRun // .lastRun) else {
        repo: $repo,
        updatedAt: $updatedAt
      } end) |
      .lastRun = {
        repo: $repo,
        updatedAt: $updatedAt
      }
    ' "$PR_STATE_FILE" >"$tmp" || [[ ! -s "$tmp" ]]; then
    rm -f "$row_file" "$tmp"
    echo "Refusing to replace $PR_STATE_FILE: couldn't add row" >&2
    return 1
  fi
  rm -f "$row_file"
  command mv -f "$tmp" "$PR_STATE_FILE"
}

upsert_pr_state() {
  local row_json="$1"
  local section="$2"
  with_pr_state_lock upsert_pr_state_unlocked "$row_json" "$section"
}

apply_ack_changes() {
  if [[ "$IN_REVIEW_CLEAR_ENABLED" -eq 1 ]]; then
    while IFS= read -r review_clear_num; do
      [[ -z "$review_clear_num" ]] && continue
      clear_in_review_required "$review_clear_num"
    done <<<"$IN_REVIEW_CLEAR_NUMBERS"
  fi

  if [[ "$IN_REVIEW_ENABLED" -eq 1 ]]; then
    while IFS= read -r review_num; do
      [[ -z "$review_num" ]] && continue
      set_in_review_required "$review_num"
    done <<<"$IN_REVIEW_NUMBERS"
  fi

  if [[ "$FLAGGED_CLEAR_ENABLED" -eq 1 ]]; then
    while IFS= read -r flagged_clear_num; do
      [[ -z "$flagged_clear_num" ]] && continue
      clear_flagged_required "$flagged_clear_num"
    done <<<"$FLAGGED_CLEAR_NUMBERS"
  fi

  if [[ "$FLAGGED_ENABLED" -eq 1 ]]; then
    while IFS= read -r flagged_num; do
      [[ -z "$flagged_num" ]] && continue
      set_flagged_required "$flagged_num"
    done <<<"$FLAGGED_NUMBERS"
  fi

  if [[ "$ACK_CLEAR_ENABLED" -eq 1 ]]; then
    while IFS= read -r clear_num; do
      [[ -z "$clear_num" ]] && continue
      clear_ack_ts "$clear_num"
    done <<<"$ACK_CLEAR_NUMBERS"
  fi

  if [[ "$ACK_ENABLED" -eq 1 ]]; then
    ack_now=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    while IFS= read -r ack_num; do
      [[ -z "$ack_num" ]] && continue
      set_ack_ts "$ack_num" "$ack_now"
    done <<<"$ACK_NUMBERS"
  fi
}

fetch_pr_review_url_map_json() {
  local number="$1"

  # REVIEW_URL_CACHE_DIR may be unset in test/helper contexts — skip caching and
  # return an empty map so callers always receive valid JSON.
  if [[ -z "${REVIEW_URL_CACHE_DIR:-}" ]]; then
    echo '{}'
    return
  fi

  local cache_file="$REVIEW_URL_CACHE_DIR/$number.json"

  if [[ -f "$cache_file" ]]; then
    cat "$cache_file"
    return
  fi

  # Returns a JSON object mapping "<submittedAt>_<authorLogin>" => html_url for
  # each review, so that compute-pr-row.js can give each review its URL.
  # The gh CLI's --json reviews schema doesn't expose url, so we use the REST API.
  # Every page (it gave the first 30), and no leading slash: Git Bash
  # rewrites an argument starting with one into a Windows path
  # ("C:/Program Files/Git/repos/..."), so on Windows this always failed.
  # --paginate prints one array a page; -s gathers them.
  local result
  local api_output
  api_output=$(gh_with_retry gh api --paginate "repos/$REPO_OWNER/$REPO_NAME/pulls/$number/reviews?per_page=100" 2>/dev/null) || api_output=''
  result=$(printf '%s' "$api_output" | jq -cs 'map(select(type == "array")) | add // [] | [.[] | select(.submitted_at != null and .submitted_at != "") | {
      key: (.submitted_at + "_" + (.user.login // "unknown")),
      value: (.html_url // "")
    }] | from_entries' 2>/dev/null) || result=''
    [[ -z "$result" ]] && result='{}'
  printf '%s' "$result" >"$cache_file"
  printf '%s' "$result"
}

get_pr_detail_json() {
  local number="$1"
  local cache_file="$DETAIL_CACHE_DIR/$number.json"

  local detail_json
  if [[ -f "$cache_file" && "$number" != "$TARGET_PR_NUMBER" ]]; then
    detail_json=$(cat "$cache_file")
  else
    detail_json=$(gh_with_retry gh pr view "$number" -R "$REPO" --json comments,reviews,reviewRequests,commits,assignees,statusCheckRollup,mergeable,mergeStateStatus) || return 1
  fi
  # A PR over 100 commits: the rest of them, or no details (the run keeps
  # its stored row) rather than details missing its newest commits.
  complete_pr_detail_commits "$detail_json" "$number"
}

# Every commit of a PR, in gh pr view's shape: gh gives the first 100 only,
# so a longer PR's newer commits - the ones that matter for what changed -
# were missing. Pages of 100 through GraphQL, into a file (a page can be past
# Windows' 32 KB command line). GitHub's API stops at 250 commits a PR,
# newest included. Status 1 when a page can't be fetched.
fetch_all_pr_commits_json() {
  local number="$1"
  local pages_file response cursor='' has_next
  pages_file=$(mktemp)
  while true; do
    if ! response=$(gh_with_retry gh api graphql \
      -f query='query($owner: String!, $name: String!, $number: Int!, $after: String) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { commits(first: 100, after: $after) { nodes { commit { oid authoredDate committedDate messageHeadline messageBody authors(first: 100) { nodes { email name user { id login } } } } } pageInfo { hasNextPage endCursor } } } } }' \
      -f owner="$REPO_OWNER" \
      -f name="$REPO_NAME" \
      -F number="$number" \
      ${cursor:+-f after="$cursor"} 2>/dev/null) ||
      ! printf '%s' "$response" | jq -e '.data.repository.pullRequest.commits.nodes | type == "array"' >/dev/null 2>&1; then
      rm -f "$pages_file"
      return 1
    fi
    printf '%s\n' "$response" >>"$pages_file"
    has_next=$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.commits.pageInfo.hasNextPage')
    cursor=$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.commits.pageInfo.endCursor // ""')
    [[ "$has_next" == 'true' && -n "$cursor" ]] || break
  done
  jq -cs '
    [
      .[].data.repository.pullRequest.commits.nodes[].commit
      | {
          authoredDate,
          authors: [.authors.nodes[] | {email: (.email // ""), id: (.user.id // ""), login: (.user.login // ""), name: (.name // "")}],
          committedDate,
          messageBody,
          messageHeadline,
          oid
        }
    ]
  ' "$pages_file"
  local status=$?
  rm -f "$pages_file"
  return "$status"
}

# A PR's details with all its commits: gh's 100 replaced by the full list
# when there may be more (exactly 100). Through files, not --argjson.
complete_pr_detail_commits() {
  local detail_json="$1"
  local number="$2"
  local detail_file commits_file
  if ! printf '%s' "$detail_json" | jq -e '(.commits | type) == "array" and (.commits | length) >= 100' >/dev/null 2>&1; then
    printf '%s' "$detail_json"
    return 0
  fi
  commits_file=$(mktemp)
  if ! fetch_all_pr_commits_json "$number" >"$commits_file"; then
    rm -f "$commits_file"
    return 1
  fi
  detail_file=$(mktemp)
  printf '%s' "$detail_json" >"$detail_file"
  jq -c --slurpfile commits "$commits_file" '.commits = $commits[0]' "$detail_file"
  local status=$?
  rm -f "$detail_file" "$commits_file"
  return "$status"
}

prefetch_pr_details() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return

  printf '%s\n' "$numbers" | xargs -P "$(prefetch_task_jobs)" -I '{}' bash -c '
    number="$1"
    repo="$2"
    cache_dir="$3"
    gh_timeout="$4"

    run_with_timeout_inner() {
      local timeout_seconds="$1"
      shift

      if ! [[ "$timeout_seconds" =~ ^[0-9]+$ ]] || ((timeout_seconds <= 0)); then
        "$@"
        return $?
      fi

      if command -v gtimeout >/dev/null 2>&1; then
        gtimeout --signal=TERM "$timeout_seconds" "$@"
        return $?
      fi

      if command -v timeout >/dev/null 2>&1; then
        timeout --signal=TERM "$timeout_seconds" "$@"
        return $?
      fi

      perl -e "alarm shift @ARGV; exec @ARGV; die qq(exec failed: $!)" "$timeout_seconds" "$@"
    }

    for attempt in 1 2 3; do
      if run_with_timeout_inner "$gh_timeout" gh pr view "$number" -R "$repo" --json comments,reviews,reviewRequests,commits,assignees,statusCheckRollup,mergeable,mergeStateStatus > "$cache_dir/$number.json" 2>/dev/null; then
        exit 0
      fi
      sleep $((2 ** (attempt - 1)))
    done
    exit 0
  ' _ '{}' "$REPO" "$DETAIL_CACHE_DIR" "$GH_COMMAND_TIMEOUT_SECONDS"
}

# Fetches specific PR numbers directly (used by --quick-check-numbers), in
# parallel via the same xargs -P "$JOBS" + 3-attempt/backoff/timeout idiom as
# prefetch_pr_details above, instead of listing PRs via `gh pr list`. This is
# what lets a quick-check-by-number bypass LIMIT/MERGED_LIMIT/MERGED_DAYS_DEFAULT
# entirely - an old merged PR is fetched directly, never subject to the
# listing/day-window logic. A number that fails after all retries (not found,
# wrong repo) is silently skipped rather than failing the whole run, unlike
# -p/--pr's hard-fail, since a batch shouldn't abort over one bad number.
fetch_quick_check_target_prs() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return

  local scratch_dir
  scratch_dir=$(mktemp -d)

  printf '%s\n' "$numbers" | xargs -P "$JOBS" -I '{}' bash -c '
    number="$1"
    repo="$2"
    out_dir="$3"
    gh_timeout="$4"

    run_with_timeout_inner() {
      local timeout_seconds="$1"
      shift

      if ! [[ "$timeout_seconds" =~ ^[0-9]+$ ]] || ((timeout_seconds <= 0)); then
        "$@"
        return $?
      fi

      if command -v gtimeout >/dev/null 2>&1; then
        gtimeout --signal=TERM "$timeout_seconds" "$@"
        return $?
      fi

      if command -v timeout >/dev/null 2>&1; then
        timeout --signal=TERM "$timeout_seconds" "$@"
        return $?
      fi

      perl -e "alarm shift @ARGV; exec @ARGV; die qq(exec failed: $!)" "$timeout_seconds" "$@"
    }

    for attempt in 1 2 3; do
      if run_with_timeout_inner "$gh_timeout" gh pr view "$number" -R "$repo" --json number,title,url,labels,isDraft,author,mergedAt,closedAt,mergedBy,createdAt,updatedAt,headRefName,baseRefName,additions,deletions --jq ". | @base64" > "$out_dir/$number.txt" 2>/dev/null; then
        exit 0
      fi
      sleep $((2 ** (attempt - 1)))
    done
    exit 0
  ' _ '{}' "$REPO" "$scratch_dir" "$GH_COMMAND_TIMEOUT_SECONDS"

  local number result_file
  while IFS= read -r number; do
    [[ -z "$number" ]] && continue
    result_file="$scratch_dir/$number.txt"
    if [[ -s "$result_file" ]]; then
      cat "$result_file"
    else
      debug_log "quick-check-numbers: PR #$number not found in $REPO, skipping"
    fi
  done <<<"$numbers"

  rm -rf "$scratch_dir"
}

# How many `gh` calls one prefetch task runs at once: --jobs shared among
# the VIEW_PRS_PREFETCH_GROUP_CONCURRENCY tasks run together, so a group
# runs about --jobs in all (the open/draft group and the merged/closed one
# can overlap: about twice that). Not --jobs each - with every prefetch
# working that was up to 36 at once, where the server budgets 4 a refresh.
prefetch_task_jobs() {
  local jobs="$JOBS"
  local groups="$VIEW_PRS_PREFETCH_GROUP_CONCURRENCY"
  [[ "$jobs" =~ ^[0-9]+$ ]] && ((jobs > 0)) || jobs=1
  [[ "$groups" =~ ^[0-9]+$ ]] && ((groups > 0)) || groups=1
  jobs=$((jobs / groups))
  ((jobs < 1)) && jobs=1
  printf '%s' "$jobs"
}

# Runs `fn number` for each number, prefetch_task_jobs at a time, each in a
# background subshell, for the cache file it writes. A subshell has the
# script's functions and variables; the `bash -c` these used to run under
# xargs had neither, so they fetched nothing and every PR's was fetched one
# at a time while its row was computed.
run_for_each_number_in_parallel() {
  local fn="$1"
  local numbers="$2"
  local max_parallel
  local -a pids=()
  local number pid

  max_parallel=$(prefetch_task_jobs)

  while IFS= read -r number; do
    [[ -z "$number" ]] && continue
    { "$fn" "$number" >/dev/null 2>&1 || true; } &
    pids+=("$!")
    if ((${#pids[@]} >= max_parallel)); then
      wait "${pids[0]}"
      pids=("${pids[@]:1}")
    fi
  done <<<"$numbers"

  for pid in ${pids[@]+"${pids[@]}"}; do
    wait "$pid"
  done
}

prefetch_review_threads() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return

  run_for_each_number_in_parallel fetch_review_threads_json "$numbers"
}

prefetch_review_comments() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return
  [[ -z "$REVIEW_COMMENT_CACHE_DIR" ]] && return

  run_for_each_number_in_parallel fetch_pr_review_comments_json "$numbers"
}

prefetch_review_urls() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return
  [[ -z "$REVIEW_URL_CACHE_DIR" ]] && return

  run_for_each_number_in_parallel fetch_pr_review_url_map_json "$numbers"
}

prefetch_viewed_files_stats() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return

  run_for_each_number_in_parallel fetch_pr_viewed_files_stats_json "$numbers"
}

prefetch_ci_merge_stats() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return
  [[ -z "$CI_MERGE_CACHE_DIR" ]] && return

  printf '%s\n' "$numbers" | xargs -P "$(prefetch_task_jobs)" -I '{}' bash -c '
    number="$1"
    repo="$2"
    cache_dir="$3"
    gh_timeout="$4"

    cache_file="$cache_dir/$number.json"
    [[ -f "$cache_file" ]] && exit 0

    for attempt in 1 2 3; do
      if timeout "$gh_timeout" gh pr view "$number" -R "$repo" --json statusCheckRollup,mergeable,mergeStateStatus > "$cache_file" 2>/dev/null; then
        exit 0
      fi
      sleep $((2 ** (attempt - 1)))
    done
    exit 0
  ' _ '{}' "$REPO" "$CI_MERGE_CACHE_DIR" "$GH_COMMAND_TIMEOUT_SECONDS" 2>/dev/null &
  wait
}

run_prefetch_tasks_concurrently() {
  local max_parallel="$1"
  shift

  local -a active_pids=()
  local running=0
  local task_fn
  local task_arg

  if ! [[ "$max_parallel" =~ ^[0-9]+$ ]] || ((max_parallel <= 0)); then
    max_parallel=1
  fi

  while [[ $# -gt 1 ]]; do
    task_fn="$1"
    task_arg="$2"
    shift 2

    "$task_fn" "$task_arg" &
    active_pids+=("$!")
    running=$((running + 1))

    if ((running >= max_parallel)); then
      wait "${active_pids[0]}"
      active_pids=("${active_pids[@]:1}")
      running=$((running - 1))
    fi
  done

  # The +-guard: bash before 4.4 calls an empty array unbound under set -u.
  for pid in ${active_pids[@]+"${active_pids[@]}"}; do
    wait "$pid"
  done
}

fetch_review_threads_json() {
  local number="$1"
  local cache_file="$THREAD_CACHE_DIR/$number.json"
  local tmp_nodes
  local response
  local cursor=''
  local has_next='false'

  if [[ -f "$cache_file" ]]; then
    cat "$cache_file"
    return
  fi

  tmp_nodes=$(mktemp)
  trap 'rm -f "$tmp_nodes"' RETURN

  while true; do
    if [[ -n "$cursor" ]]; then
      response=$(gh_with_retry gh api graphql \
        -f query='query($owner: String!, $name: String!, $number: Int!, $after: String) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 100, after: $after) { nodes { id isResolved isOutdated resolvedBy { login } comments(first: 100) { totalCount pageInfo { hasNextPage endCursor } nodes { id author { login } authorAssociation body createdAt publishedAt url replyTo { id } path line originalLine state } } } pageInfo { hasNextPage endCursor } } } } }' \
        -f owner="$REPO_OWNER" \
        -f name="$REPO_NAME" \
        -F number="$number" \
        -f after="$cursor") || return 1
    else
      response=$(gh_with_retry gh api graphql \
        -f query='query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 100) { nodes { id isResolved isOutdated resolvedBy { login } comments(first: 100) { totalCount pageInfo { hasNextPage endCursor } nodes { id author { login } authorAssociation body createdAt publishedAt url replyTo { id } path line originalLine state } } } pageInfo { hasNextPage endCursor } } } } }' \
        -f owner="$REPO_OWNER" \
        -f name="$REPO_NAME" \
        -F number="$number") || return 1
    fi

    # A failed request, or a response without the threads (a GraphQL
    # error): fail, rather than return no threads - an empty list would
    # replace the row's threads (the prefetch caches what this returns).
    printf '%s' "$response" | jq -e '.data.repository.pullRequest.reviewThreads.nodes | type == "array"' >/dev/null 2>&1 || return 1
    printf '%s' "$response" | jq -c '.data.repository.pullRequest.reviewThreads.nodes[]?' >>"$tmp_nodes"
    has_next=$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')
    cursor=$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor // ""')

    [[ "$has_next" != 'true' ]] && break
    [[ -z "$cursor" ]] && break
  done

  jq -sc '
    def normalize_comment:
      {
        id: (.id // ""),
        authorLogin: (.authorLogin // .author.login // "unknown"),
        authorName: (.authorName // .author.name // ""),
        authorAssociation: (.authorAssociation // ""),
        createdAt: (.createdAt // ""),
        publishedAt: (.publishedAt // .createdAt // ""),
        body: (.body // ""),
        url: (.url // ""),
        replyToId: (.replyToId // .replyTo.id // ""),
        path: (.path // ""),
        line: (.line // null),
        originalLine: (.originalLine // null),
        diffSide: (.diffSide // ""),
        state: (.state // "")
      };

    map({
      id: (.id // ""),
      isResolved: (.isResolved // false),
      isOutdated: (.isOutdated // false),
      resolvedByLogin: (.resolvedBy.login // ""),
      commentCount: (.commentCount // .comments.totalCount // ((.comments.nodes // .comments // []) | length) // 0),
      hasMoreComments: (.hasMoreComments // .comments.pageInfo.hasNextPage // false),
      comments: [((.comments.nodes // .comments // [])[]?) | normalize_comment | select(.createdAt != "")]
    })
    | map(. + {
        participants: ([.comments[]?.authorLogin | select(. != "")] | unique),
        latestCommentAt: ([.comments[]?.createdAt | select(. != "")] | sort | last // "")
      })
    | sort_by(.latestCommentAt, .id)
  ' "$tmp_nodes" >"$cache_file.tmp-$$" || {
    rm -f "$cache_file.tmp-$$"
    return 1
  }
  command mv -f "$cache_file.tmp-$$" "$cache_file"
  cat "$cache_file"
}

fetch_pr_review_comments_json() {
  local number="$1"

  # Optional enrichment only. In helper/test contexts this cache dir may not be
  # initialized, so return an empty array instead of failing.
  if [[ -z "${REVIEW_COMMENT_CACHE_DIR:-}" ]]; then
    echo '[]'
    return
  fi

  local cache_file="$REVIEW_COMMENT_CACHE_DIR/$number.json"
  if [[ -f "$cache_file" ]]; then
    cat "$cache_file"
    return
  fi

  local page=1
  local page_output
  local page_count
  local api_output='[]'
  local normalized
  local pages_file

  # The pages go through a file, not --argjson: a page of 100 comments
  # (with their diff hunks) is past Windows' 32 KB command line, and can be
  # past Linux's 128 KB an argument - the jq failed, and the PR lost its
  # review comments.
  pages_file=$(mktemp)
  while true; do
    page_output=$(gh_with_retry gh api "repos/$REPO_OWNER/$REPO_NAME/pulls/$number/comments?per_page=100&page=$page" 2>/dev/null) || page_output='[]'
    printf '%s\n' "$page_output" >>"$pages_file"
    page_count=$(printf '%s' "$page_output" | jq -r 'if type == "array" then length else 0 end' 2>/dev/null) || page_count=0
    [[ "$page_count" -lt 100 ]] && break
    page=$((page + 1))
  done
  api_output=$(jq -cs 'map(if type == "array" then . else [] end) | add // []' "$pages_file" 2>/dev/null) || api_output='[]'
  rm -f "$pages_file"

  normalized=$(printf '%s' "$api_output" | jq -c '
    if type == "array" then
      [
        .[]?
        | {
            id: (.id | tostring // ""),
            nodeId: (.node_id // ""),
            reviewId: (.pull_request_review_id | tostring // ""),
            inReplyToId: (.in_reply_to_id | tostring // ""),
            authorLogin: (.user.login // "unknown"),
          authorName: (.user.name // ""),
            body: (.body // ""),
            createdAt: (.created_at // ""),
            url: (.html_url // ""),
            path: (.path // ""),
            line: (.line // null),
            originalLine: (.original_line // null),
            diffHunk: (.diff_hunk // ""),
            side: (.side // ""),
            commitId: (.commit_id // "")
          }
        | select(.createdAt != "")
      ]
      | sort_by(.createdAt, .id)
    else
      []
    end
  ' 2>/dev/null) || normalized='[]'
  [[ -z "$normalized" ]] && normalized='[]'

  printf '%s' "$normalized" >"$cache_file"
  printf '%s' "$normalized"
}

fetch_pr_viewed_files_stats_json() {
  local number="$1"
  local response
  local fetch_failed=0

  if [[ -z "$FILES_CACHE_DIR" ]]; then
    FILES_CACHE_DIR=$(mktemp -d)
  fi

  local cache_file="$FILES_CACHE_DIR/$number.json"
  local tmp_nodes
  local cursor=''
  local has_next='false'
  local changed_files='0'

  if [[ -f "$cache_file" ]]; then
    cat "$cache_file"
    return
  fi

  tmp_nodes=$(mktemp)
  trap 'rm -f "$tmp_nodes"' RETURN

  while true; do
    if [[ -n "$cursor" ]]; then
      if ! response=$(gh_with_retry gh api graphql \
        -f query='query($owner: String!, $name: String!, $number: Int!, $after: String) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { changedFiles files(first: 100, after: $after) { nodes { viewerViewedState } pageInfo { hasNextPage endCursor } } } } }' \
        -f owner="$REPO_OWNER" \
        -f name="$REPO_NAME" \
        -F number="$number" \
        -f after="$cursor" 2>/dev/null); then
        fetch_failed=1
        break
      fi
    else
      if ! response=$(gh_with_retry gh api graphql \
        -f query='query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { changedFiles files(first: 100) { nodes { viewerViewedState } pageInfo { hasNextPage endCursor } } } } }' \
        -f owner="$REPO_OWNER" \
        -f name="$REPO_NAME" \
        -F number="$number" 2>/dev/null); then
        fetch_failed=1
        break
      fi
    fi

    changed_files=$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.changedFiles // 0')
    printf '%s' "$response" | jq -c '.data.repository.pullRequest.files.nodes[]?' >>"$tmp_nodes"
    has_next=$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.files.pageInfo.hasNextPage')
    cursor=$(printf '%s' "$response" | jq -r '.data.repository.pullRequest.files.pageInfo.endCursor // ""')

    [[ "$has_next" != 'true' ]] && break
    [[ -z "$cursor" ]] && break
  done

  if [[ "$fetch_failed" -eq 1 ]]; then
    jq -cn '{changedFiles:0, viewedFiles:0}' >"$cache_file"
    cat "$cache_file"
    return
  fi

  # The files straight from their file, not --argjson: a PR with a few
  # hundred files is past Windows' 32 KB command line.
  jq -cs --arg changedFiles "$changed_files" '
    {
      changedFiles: (($changedFiles | split("\n") | map(select(length > 0)) | .[0] // "0") | tonumber? // 0),
      viewedFiles: (map(select((.viewerViewedState // "") == "VIEWED")) | length)
    }
  ' "$tmp_nodes" >"$cache_file"
  cat "$cache_file"
}

parse_label_list() {
  local raw="$1"
  local out=''
  local label
  local -a parts=()

  [[ -z "$raw" ]] && {
    printf '%s' ""
    return
  }

  IFS=',' read -r -a parts <<<"$raw"
  for part in "${parts[@]}"; do
    label=$(printf '%s' "$part" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
    [[ -z "$label" ]] && continue
    out+="$label"$'\n'
  done
  printf '%s' "$out"
}

parse_author_list() {
  local raw="$1"
  local out=''
  local author
  local -a parts=()

  [[ -z "$raw" ]] && {
    printf '%s' ""
    return
  }

  IFS=',' read -r -a parts <<<"$raw"
  for part in "${parts[@]}"; do
    author=$(printf '%s' "$part" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
    [[ -z "$author" ]] && continue
    out+="$author"$'\n'
  done
  printf '%s' "$out"
}

pr_passes_label_filters() {
  local pr_json="$1"
  local labels_lines include_label exclude_label include_match

  labels_lines=$(printf '%s' "$pr_json" | jq -r '.labels // [] | map(if type == "object" then (.name // "") else (tostring) end) | .[]')

  if [[ -n "$INCLUDE_LABELS" ]]; then
    include_match=0
    while IFS= read -r include_label; do
      [[ -z "$include_label" ]] && continue
      if printf '%s\n' "$labels_lines" | grep -Fxq "$include_label"; then
        include_match=1
        break
      fi
    done <<<"$INCLUDE_LABELS"
    if [[ "$include_match" -ne 1 ]]; then
      return 1
    fi
  fi

  while IFS= read -r exclude_label; do
    [[ -z "$exclude_label" ]] && continue
    if printf '%s\n' "$labels_lines" | grep -Fxq "$exclude_label"; then
      return 1
    fi
  done <<<"$EXCLUDE_LABELS"

  return 0
}

pr_passes_author_filters() {
  local pr_json="$1"
  local author_login author_name author_display include_author

  if [[ -z "$INCLUDE_AUTHORS" ]]; then
    return 0
  fi

  author_login=$(printf '%s' "$pr_json" | jq -r '.author.login // ""')
  author_name=$(printf '%s' "$pr_json" | jq -r '.author.name // ""')
  author_display=$(normalize_author_name "$author_login" "$author_name")

  while IFS= read -r include_author; do
    [[ -z "$include_author" ]] && continue
    if [[ "$author_login" == "$include_author" || "$author_name" == "$include_author" || "$author_display" == "$include_author" ]]; then
      return 0
    fi
  done <<<"$INCLUDE_AUTHORS"

  return 1
}

row_passes_display_filters() {
  local row_json="$1"
  pr_passes_label_filters "$row_json" && pr_passes_author_filters "$row_json"
}

# The PR's viewed-files counts as last stored, in
# fetch_pr_viewed_files_stats_json's shape, or nothing: none stored, none
# changed (likely a failed fetch), or stored while the PR was still open -
# files pushed or viewed after that fetch would stay uncounted.
get_stored_viewed_files_stats_json() {
  local number="$1"
  [[ -n "${PR_STATE_FILE:-}" && -f "$PR_STATE_FILE" ]] || return 0
  jq -c --arg number "$number" --arg repo "$REPO" "$PR_KEY_JQ"'
    pr_row($repo; $number)
    | select(.section == "merged" or .section == "closed")
    | .data
    | select(.viewedFilesCount != null and .changedFilesCount != null)
    | select((.changedFilesCount | tostring) != "0")
    | {
        viewedFiles: ((.viewedFilesCount | tonumber?) // 0),
        changedFiles: ((.changedFilesCount | tonumber?) // 0)
      }
  ' "$PR_STATE_FILE" 2>/dev/null || true
}

# One PR's row: fetches its details, review threads, review comments and
# links, and viewed files, reads its ack, re-verify and In Review marks, and
# computes the row in compute-pr-row.js (one process; this was dozens of jq
# calls - ROADMAP.md, Data freshness step 6). Clears the ack when the PR
# changed since it, and writes the row's detail file. No row (status 1) when
# its details or threads couldn't be fetched.
compute_pr_state_json() {
  local pr_json="$1"
  local number merged_at closed_at detail_json threads_json review_comments_json review_url_map_json viewed_files_stats_json
  local input_dir computed ack_action row_json_out

  number=$(printf '%s' "$pr_json" | jq -r '.number')
  emit_pr_progress_marker 'START' "$number"

  # Details or review threads that couldn't be fetched: no row, rather than
  # one computed from nothing (no reviews, threads or activity). The run
  # keeps the stored row and reports the PR (note_unfetched_pr).
  if ! detail_json=$(get_pr_detail_json "$number") || ! printf '%s' "$detail_json" | jq -e 'type == "object"' >/dev/null 2>&1; then
    emit_pr_progress_marker 'END' "$number"
    return 1
  fi
  if ! threads_json=$(fetch_review_threads_json "$number"); then
    emit_pr_progress_marker 'END' "$number"
    return 1
  fi
  review_comments_json=$(fetch_pr_review_comments_json "$number") || review_comments_json='[]'
  review_url_map_json=$(fetch_pr_review_url_map_json "$number") || review_url_map_json='{}'

  # A merged/closed PR's files are settled, and seldom viewed after: its
  # stored counts stand once stored as such, saving their fetch (one or
  # more calls).
  IFS=$'\t' read -r merged_at closed_at <<<"$(printf '%s' "$pr_json" | jq -r '[(.mergedAt // ""), (.closedAt // "")] | @tsv')"
  viewed_files_stats_json=''
  if [[ -n "$merged_at" || -n "$closed_at" ]]; then
    viewed_files_stats_json=$(get_stored_viewed_files_stats_json "$number")
  fi
  [[ -z "$viewed_files_stats_json" ]] && viewed_files_stats_json=$(fetch_pr_viewed_files_stats_json "$number")

  [[ -n "$threads_json" ]] || threads_json='[]'
  [[ -n "$review_comments_json" ]] || review_comments_json='[]'
  [[ -n "$review_url_map_json" ]] || review_url_map_json='{}'
  [[ -n "$viewed_files_stats_json" ]] || viewed_files_stats_json='{}'
  input_dir=$(mktemp -d)
  printf '%s' "$pr_json" >"$input_dir/pr.json"
  printf '%s' "$detail_json" >"$input_dir/detail.json"
  printf '%s' "$threads_json" >"$input_dir/threads.json"
  printf '%s' "$review_comments_json" >"$input_dir/review-comments.json"
  printf '%s' "$review_url_map_json" >"$input_dir/review-url-map.json"
  printf '%s' "$viewed_files_stats_json" >"$input_dir/viewed-files.json"
  jq -n \
    --arg viewerLogin "$VIEWER_LOGIN" \
    --arg ackAt "$(get_ack_ts "$number")" \
    --arg reverifyRequired "$(get_reverify_required "$number")" \
    --arg inReviewRequired "$(get_in_review_required "$number")" \
    --arg ignoreCommentAuthors "$CHANGE_FILTER_IGNORE_COMMENT_AUTHORS" \
    --arg ignoreReviewAuthors "$CHANGE_FILTER_IGNORE_REVIEW_AUTHORS" \
    --arg ignoreCommitPatterns "$CHANGE_FILTER_IGNORE_COMMIT_PATTERNS" \
    --argjson mergeHeadlinePatterns "$MERGE_COMMIT_HEADLINE_PATTERNS_JSON" \
    --argjson mergeLogins "$MERGE_COMMIT_LOGINS_JSON" \
    '$ARGS.named' >"$input_dir/settings.json"

  if ! computed=$("$NODE_BIN" "$SCRIPT_DIR/compute-pr-row.js" "$input_dir"); then
    # Reported with the unfetched PRs (its stored row stays); this says why.
    echo "PR #$number: compute-pr-row.js failed; its row is kept as stored." >&2
    rm -rf "$input_dir"
    emit_pr_progress_marker 'END' "$number"
    return 1
  fi
  rm -rf "$input_dir"
  ack_action=${computed%%$'\n'*}
  row_json_out=${computed#*$'\n'}

  # A PR acked earlier with activity since that ack shouldn't read as
  # acknowledged: the ack goes (set_reverify=false - the row has the real
  # reason, not the manual-clear-only 'ack-cleared').
  [[ "$ack_action" == 'clear-ack' ]] && clear_ack_ts "$number" false

  row_json_out=$(attach_pr_detail_ref "$row_json_out")
  row_json_out=$(strip_inline_pr_detail_fields "$row_json_out")
  emit_pr_progress_marker 'END' "$number"
  printf '%s' "$row_json_out"
}

print_table_header_open() {
  local title="$1"
  echo "$title"
  printf "%-8s %-23s %-${STATUS_COL_WIDTH}s %-${APPROVED_COL_WIDTH}s %-25s %s\n" 'PR' 'AUTHOR' 'STATUS' 'APPROVED' 'LAST_YOUR_ACTIVITY' 'TITLE'
  printf "%-8s %-23s %-${STATUS_COL_WIDTH}s %-${APPROVED_COL_WIDTH}s %-25s %s\n" '--------' '----------------------' '-----------------------------------' '-------------' '------------------------' '-----'
}

print_table_header_closed() {
  echo 'Latest Closed PRs:'
  printf "%-8s %-23s %-${STATUS_COL_WIDTH}s %-${APPROVED_COL_WIDTH}s %-25s %s\n" 'PR' 'AUTHOR' 'STATUS' 'APPROVED' 'CLOSED_AT' 'TITLE'
  printf "%-8s %-23s %-${STATUS_COL_WIDTH}s %-${APPROVED_COL_WIDTH}s %-25s %s\n" '--------' '----------------------' '-----------------------------------' '-------------' '------------------------' '-----'
}

print_table_header_merged() {
  echo 'Latest Merged PRs:'
  printf "%-8s %-23s %-${STATUS_COL_WIDTH}s %-${APPROVED_COL_WIDTH}s %-25s %s\n" 'PR' 'AUTHOR' 'STATUS' 'APPROVED' 'MERGED_AT' 'TITLE'
  printf "%-8s %-23s %-${STATUS_COL_WIDTH}s %-${APPROVED_COL_WIDTH}s %-25s %s\n" '--------' '----------------------' '-----------------------------------' '-------------' '------------------------' '-----'
}

format_status_display() {
  local status="$1"
  local reason="$2"
  local status_text="$status"
  local padded

  if [[ "$SHOW_REASON" -eq 1 && "$status" == 'CHANGED' && -n "$reason" && "$reason" != '-' ]]; then
    status_text="${status}(${reason})"
  fi

  padded=$(printf "%-${STATUS_COL_WIDTH}s" "$status_text")

  case "$status" in
    CHANGED)
      printf '%b' "${COLOR_YELLOW}${padded}${COLOR_RESET}"
      ;;
    NO_CHANGE)
      printf '%b' "${COLOR_GREEN}${padded}${COLOR_RESET}"
      ;;
    NO_ACTIVITY)
      printf '%b' "${COLOR_CYAN}${padded}${COLOR_RESET}"
      ;;
    *)
      printf '%s' "$padded"
      ;;
  esac
}

format_approved_display() {
  local approved="$1"
  local approval_count="$2"
  local approved_text="${approved} (${approval_count})"
  local padded
  padded=$(printf "%-${APPROVED_COL_WIDTH}s" "$approved_text")

  case "$approved" in
    YES)
      printf '%b' "${COLOR_GREEN}${padded}${COLOR_RESET}"
      ;;
    NO)
      printf '%b' "${COLOR_RED}${padded}${COLOR_RESET}"
      ;;
    *)
      printf '%s' "$padded"
      ;;
  esac
}

print_row() {
  local row_json="$1"
  local date_value="$2"

  local number title url author status approved approval_count reason title_display
  local pr_text pr_pad_len pr_spaces pr_display
  local status_display approved_display date_display

  # One jq for every field (each call is a process), split on the unit
  # separator so empty fields and tabs in a title survive.
  IFS=$'\x1f' read -r number title title_display url author status approved approval_count reason <<<"$(printf '%s' "$row_json" | jq -r '
    [.number, .title, (.titleDisplay // .title), .url, .author, .status, .approved, (.approvalCount // "0"), .reason]
    | map(tostring | gsub("[\u001f\n\r]"; " "))
    | join("\u001f")
  ')"

  pr_text="#$number"
  pr_pad_len=$((8 - ${#pr_text}))
  ((pr_pad_len < 0)) && pr_pad_len=0
  pr_spaces=$(printf '%*s' "$pr_pad_len" '')
  pr_display="$(format_link "$url" "$pr_text")$pr_spaces"

  status_display=$(format_status_display "$status" "$reason")
  approved_display=$(format_approved_display "$approved" "$approval_count")
  date_display=$(format_iso_datetime "$date_value")

  printf '%b %-23s %b %b %-25s %s\n' "$pr_display" "$author" "$status_display" "$approved_display" "$date_display" "$title_display"
}

open_pr_url() {
  local url="$1"
  command -v open >/dev/null 2>&1 && open "$url" >/dev/null 2>&1 || true
  command -v xdg-open >/dev/null 2>&1 && xdg-open "$url" >/dev/null 2>&1 || true
}

collect_numbers_from_b64() {
  local b64_lines="$1"
  while IFS= read -r pr_item; do
    [[ -z "$pr_item" ]] && continue
    pr_json=$(printf '%s' "$pr_item" | base64 --decode)
    printf '%s\n' "$(printf '%s' "$pr_json" | jq -r '.number')"
  done <<<"$b64_lines"
}

classify_pr_section() {
  local pr_json="$1"
  local merged_at closed_at is_draft

  merged_at=$(printf '%s' "$pr_json" | jq -r '.mergedAt // ""')
  closed_at=$(printf '%s' "$pr_json" | jq -r '.closedAt // ""')
  is_draft=$(printf '%s' "$pr_json" | jq -r '.isDraft // false')

  if [[ -n "$merged_at" ]]; then
    printf 'merged'
  elif [[ -n "$closed_at" ]]; then
    printf 'closed'
  elif [[ "$is_draft" == 'true' ]]; then
    printf 'draft'
  else
    printf 'open'
  fi
}

reconcile_missing_open_rows() {
  local current_open_numbers="$1"
  local current_open_tmp stale_tmp stale_count number
  local limit fresh_pr_b64 fresh_pr_json fresh_section row_json

  # A run of chosen PRs didn't list the open ones, so every other saved
  # open row would look missing.
  is_targeted_run && return 0
  RECONCILED_MISSING_OPEN_COUNT=0

  current_open_tmp=$(mktemp)
  stale_tmp=$(mktemp)

  printf '%s\n' "$current_open_numbers" | awk 'NF' | sort -u >"$current_open_tmp"

  jq -r \
    --arg repo "$REPO" \
    '
      .byPrNumber // {}
      | to_entries[]
      | select(.value.repo == $repo)
      | select((.value.section // "") == "open" or (.value.section // "") == "draft")
      | (.value.prNumber // (.key | split("#") | last) | tostring)
    ' "$PR_STATE_FILE" 2>/dev/null | awk 'NF' | sort -u >"$stale_tmp"

  stale_count=$(wc -l <"$stale_tmp" | tr -d '[:space:]')
  [[ -z "$stale_count" ]] && stale_count=0
  ((stale_count == 0)) && {
    rm -f "$current_open_tmp" "$stale_tmp"
    return 0
  }

  limit="$RECONCILE_MISSING_OPEN_LIMIT"
  [[ "$limit" =~ ^[0-9]+$ ]] || limit=50
  ((limit < 0)) && limit=0

  while IFS= read -r number; do
    [[ -z "$number" ]] && continue
    if grep -Fxq "$number" "$current_open_tmp"; then
      continue
    fi
    if ((limit == 0)); then
      break
    fi

    fresh_pr_b64=$(gh_with_retry gh pr view "$number" -R "$REPO" --json number,title,url,labels,isDraft,author,mergedAt,closedAt,mergedBy,createdAt,updatedAt,headRefName,baseRefName,additions,deletions --jq '. | @base64' 2>/dev/null || true)
    [[ -z "$fresh_pr_b64" ]] && continue

    fresh_pr_json=$(printf '%s' "$fresh_pr_b64" | base64 --decode)
    fresh_section=$(classify_pr_section "$fresh_pr_json")
    if ! row_json=$(get_pr_row_json "$fresh_pr_json" "$fresh_section"); then
      note_unfetched_pr "$fresh_pr_json"
      continue
    fi

    RUN_ROW_INDEX=$((RUN_ROW_INDEX + 1))
    upsert_pr_state "$row_json" "$fresh_section"
    RECONCILED_MISSING_OPEN_COUNT=$((RECONCILED_MISSING_OPEN_COUNT + 1))

    limit=$((limit - 1))
  done <"$stale_tmp"

  debug_log "reconciled_missing_open_rows=$RECONCILED_MISSING_OPEN_COUNT"

  rm -f "$current_open_tmp" "$stale_tmp"
}

# -p/--pr or --prs: a run of chosen PRs, not of the repo.
is_targeted_run() {
  [[ -n "$TARGET_PR_NUMBER" || -n "$TARGET_PRS" ]]
}

cache_shortcut_allowed() {
  [[ "$ACK_ENABLED" -eq 0 && "$ACK_CLEAR_ENABLED" -eq 0 && "$ACK_CHANGED" -eq 0 ]] && ! is_targeted_run
}

cache_shortcut_allowed_for_section() {
  local section="$1"
  cache_shortcut_allowed || return 1

  # On by default; VIEW_PRS_SKIP_UNCHANGED=0 fetches every PR in full.
  if [[ "${VIEW_PRS_SKIP_UNCHANGED:-1}" == '0' ]]; then
    return 1
  fi

  return 0
}

# What a row's status depends on besides GitHub's data: the viewer's ack,
# re-verify and in-review marks for the PR, the change filters and
# merge-commit rules (user-defaults.json), and ROW_CACHE_VERSION. Stored
# with each row computed (get_pr_row_json); a stored row is reused only
# while it matches, so acking a PR or changing a filter recomputes it.
# The key is "<checksum of what every PR shares>|<the PR's marks>", so
# get_cached_row_json_for_pr can work out the marks in its own jq.
ROW_LOCAL_STATE_MARKS_JQ='
  def local_state_marks($user; $repo; $number):
    [
      ($user.ackByRepo[$repo][$number] // ""),
      ($user.reverifyByRepo[$repo][$number] // false),
      ($user.inReviewByRepo[$repo][$number] // false)
    ] | map(tostring) | join("|");
'

# The shared part, set once a run (main) - each call is a process.
ROW_LOCAL_STATE_SHARED_KEY=''
row_local_state_shared_key() {
  local sum
  if [[ -n "$ROW_LOCAL_STATE_SHARED_KEY" ]]; then
    printf '%s' "$ROW_LOCAL_STATE_SHARED_KEY"
    return
  fi
  read -r sum _ <<<"$(printf '%s' "$ROW_CACHE_VERSION|$CHANGE_FILTER_IGNORE_COMMENT_AUTHORS|$CHANGE_FILTER_IGNORE_REVIEW_AUTHORS|$CHANGE_FILTER_IGNORE_COMMIT_PATTERNS|$MERGE_COMMIT_HEADLINE_PATTERNS_JSON|$MERGE_COMMIT_LOGINS_JSON" | cksum)"
  printf '%s' "$sum"
}

# USER_STATE_FILE, or an empty document when there's none yet.
user_state_file_or_empty() {
  if [[ -f "${USER_STATE_FILE:-}" ]]; then
    printf '%s' "$USER_STATE_FILE"
  else
    printf '%s' /dev/null
  fi
}

build_row_local_state_key() {
  local number="$1"
  local marks

  marks=$(jq -rn --slurpfile user "$(user_state_file_or_empty)" --arg repo "$REPO" --arg number "$number" \
    "$ROW_LOCAL_STATE_MARKS_JQ"' local_state_marks($user[0] // {}; $repo; $number)' 2>/dev/null || true)

  printf '%s|%s' "$(row_local_state_shared_key)" "$marks"
}

# Each of this repo's stored rows in its own small file (the data file's
# shape, one PR in it), in ROW_REUSE_SNAPSHOT_DIR: get_cached_row_json_for_pr
# then reads that instead of the whole data file, twice for every listed PR.
# Taken before the run writes its first row; a row is only looked up before
# it's written again. None when the run reuses nothing (chosen PRs, acks,
# VIEW_PRS_SKIP_UNCHANGED=0).
build_row_reuse_snapshot() {
  local number entry_json
  [[ -n "${ROW_REUSE_SNAPSHOT_DIR:-}" && -f "$PR_STATE_FILE" ]] || return 0
  cache_shortcut_allowed_for_section 'open' || return 0
  while IFS=$'\t' read -r number entry_json; do
    [[ -n "$number" && -n "$entry_json" ]] || continue
    printf '%s' "$entry_json" >"$ROW_REUSE_SNAPSHOT_DIR/$number.json"
  done < <(jq -r --arg repo "$REPO" "$PR_KEY_JQ"'
    (.byPrNumber // {}) | to_entries[]
    | select(.value.repo == $repo)
    | (.value.prNumber // (.key | split("#") | last) | tostring) as $number
    | select($number | test("^[0-9]+$"))
    | "\($number)\t\({byPrNumber: {(pr_key($repo; $number)): .value}} | tojson)"
  ' "$PR_STATE_FILE" 2>/dev/null || true)
}

# The stored row for this listed PR when a full run can use it as it is -
# the PR hasn't changed on GitHub (the same updatedAt) - or nothing, for a
# full fetch. Also needs the same section, viewer and localStateKey, every
# field a row has; and for an open/draft row, a full fetch (fetchedAt)
# within VIEW_PRS_OPEN_REVALIDATE_SECONDS, since CI, mergeability, viewed
# files and resolved threads change without moving updatedAt (the server's
# live summary keeps those current in between). A merged/closed row is
# reused for as long as its PR doesn't change.
get_cached_row_json_for_pr() {
  local pr_json="$1"
  local section="$2"
  local number source_updated_at max_age_seconds state_file

  cache_shortcut_allowed_for_section "$section" || return 0

  IFS=$'\t' read -r number source_updated_at <<<"$(printf '%s' "$pr_json" | jq -r '[(.number // "" | tostring), (.updatedAt // "")] | @tsv')"

  [[ -z "$number" || "$number" == 'null' ]] && return 0
  [[ -z "$source_updated_at" || "$source_updated_at" == 'null' ]] && return 0

  state_file="$PR_STATE_FILE"
  if [[ -n "${ROW_REUSE_SNAPSHOT_DIR:-}" ]]; then
    state_file="$ROW_REUSE_SNAPSHOT_DIR/$number.json"
    [[ -f "$state_file" ]] || return 0
  fi

  max_age_seconds="$VIEW_PRS_OPEN_REVALIDATE_SECONDS"
  if ! [[ "$max_age_seconds" =~ ^[0-9]+$ ]]; then
    max_age_seconds=14400
  fi
  if [[ "$section" != 'open' && "$section" != 'draft' ]]; then
    max_age_seconds=-1
  fi

  jq -c \
    --arg number "$number" \
    --arg repo "$REPO" \
    --arg section "$section" \
    --arg viewerLogin "$VIEWER_LOGIN" \
    --arg sourceUpdatedAt "$source_updated_at" \
    --arg sharedKey "$(row_local_state_shared_key)" \
    --slurpfile user "$(user_state_file_or_empty)" \
    --argjson maxAgeSeconds "$max_age_seconds" \
    "$ROW_LOCAL_STATE_MARKS_JQ$PR_KEY_JQ"'
      ($sharedKey + "|" + local_state_marks($user[0] // {}; $repo; $number)) as $localStateKey |
      def to_epoch($ts):
        (($ts | fromdateiso8601?) //
        (($ts | sub("\\.[0-9]+Z$"; "Z")) | fromdateiso8601?) //
        0);

      pr_row($repo; $number)
      | select(.section == $section)
      | select(($maxAgeSeconds < 0) or ((now - to_epoch(.fetchedAt // "")) <= $maxAgeSeconds))
      | .data
      | select((.viewerLogin // "") == $viewerLogin)
      | select((.sourceUpdatedAt // "") == $sourceUpdatedAt)
      | select((.localStateKey // "") == $localStateKey)
      | select(has("sourceBranch") and .sourceBranch != null)
      | select(has("targetBranch") and .targetBranch != null)
      | select(has("approvers") and .approvers != null)
      | select(has("openConversationCount") and .openConversationCount != null)
      | select(has("viewedFilesCount") and .viewedFilesCount != null)
      | select(has("changedFilesCount") and .changedFilesCount != null)
      | select(has("viewedFilesSummary") and .viewedFilesSummary != null)
      | select(has("comments") and .comments != null)
      | select(has("reviews") and .reviews != null)
      | select(has("commits") and .commits != null)
      | select((has("detailRef") and .detailRef != null) or (has("reviewThreads") and .reviewThreads != null))
      | select((has("detailRef") and .detailRef != null) or (has("commentEvents") and .commentEvents != null))
      | select((has("detailRef") and .detailRef != null) or (has("activityEvents") and .activityEvents != null))
      | select(has("metrics") and .metrics != null)
      | select((has("detailRef") and .detailRef != null) or (has("activityTimeline") and .activityTimeline != null))
      | select(has("activityTimelineSummary") and .activityTimelineSummary != null)
    ' "$state_file" 2>/dev/null || true
}

enrich_cached_row_with_ci_merge() {
  local cached_row_json="$1"
  local number="$2"
  local ci_merge_json

  [[ -z "$cached_row_json" ]] && return

  # No fresh CI data (its fetch failed, or none ran): the row's own values
  # stand, rather than read as no checks at all.
  ci_merge_json=$(cat "${CI_MERGE_CACHE_DIR:-/nonexistent}/$number.json" 2>/dev/null || true)
  if [[ -z "$ci_merge_json" ]]; then
    printf '%s' "$cached_row_json"
    return
  fi

  printf '%s' "$cached_row_json" | jq -c \
    --arg check_state "$(printf '%s' "$ci_merge_json" | jq -r '
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
    ' 2>/dev/null || echo '"NA"')" \
    --arg merge_state "$(printf '%s' "$ci_merge_json" | jq -r '
      ((.mergeable // "") | ascii_upcase) as $m
      | if $m == "MERGEABLE" then "YES"
        elif $m == "CONFLICTING" then "NO"
        elif $m == "UNKNOWN" then "UNK"
        elif $m == "" then "UNK"
        else $m
        end
    ' 2>/dev/null || echo '"UNK"')" \
    '.checkState = $check_state | .mergeState = $merge_state | .titleDisplay = (.title + " [CHK:" + $check_state + "][MRG:" + $merge_state + "]") | .__ciFetched = true'
}

# A PR whose details or review threads couldn't be fetched (after
# retries): its stored row stays as it was, and the run reports it at the
# end - a run of chosen PRs then fails, so they stay queued.
note_unfetched_pr() {
  local number
  number=$(printf '%s' "$1" | jq -r '.number // ""' 2>/dev/null || true)
  [[ -n "$number" ]] && UNFETCHED_PR_NUMBERS+="$number"$'\n'
  return 0
}

get_pr_row_json() {
  local pr_json="$1"
  local section="$2"
  local row_json number local_state_key

  row_json=$(get_cached_row_json_for_pr "$pr_json" "$section")
  if [[ -z "$row_json" ]]; then
    number=$(printf '%s' "$pr_json" | jq -r '.number')
    # Before computing: the state the row is computed from (computing may
    # clear the ack, which then recomputes it once more next run).
    local_state_key=$(build_row_local_state_key "$number")
    row_json=$(compute_pr_state_json "$pr_json") || return 1
    printf '%s' "$row_json" | jq -c --arg localStateKey "$local_state_key" '.localStateKey = $localStateKey' 2>/dev/null || printf '%s' "$row_json"
    return
  fi

  number=$(printf '%s' "$row_json" | jq -r '.number // ""')
  emit_pr_progress_marker 'START' "$number"
  # The listing's own fields as they are now (a label renamed across the
  # repo doesn't move a PR's updatedAt). __reused tells upsert_pr_state the
  # row wasn't fetched, so it keeps the row's fetchedAt.
  row_json=$(printf '%s' "$row_json" | jq -c --argjson pr "$pr_json" '
    .title = ($pr.title // .title)
    | .titleDisplay = (.title + " [CHK:" + (.checkState // "UNK") + "][MRG:" + (.mergeState // "UNK") + "]")
    | .url = ($pr.url // .url)
    | .labels = (($pr.labels // null) | if . == null then null else map(if type == "object" then (.name // "") else tostring end) end) // .labels
    | .additions = (($pr.additions // null) | if . == null then null else tostring end) // .additions
    | .deletions = (($pr.deletions // null) | if . == null then null else tostring end) // .deletions
    | .__reused = true
  ' 2>/dev/null || printf '%s' "$row_json")
  if [[ "$section" == 'open' || "$section" == 'draft' ]]; then
    row_json=$(enrich_cached_row_with_ci_merge "$row_json" "$number")
  fi
  emit_pr_progress_marker 'END' "$number"
  printf '%s' "$row_json"
}

sanitize_detail_path_token() {
  local value="$1"
  value=$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')
  value=$(printf '%s' "$value" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
  [[ -n "$value" ]] || value='unknown'
  printf '%s' "$value"
}

build_pr_detail_file_path() {
  local repo="$1"
  local pr_number="$2"
  local safe_repo safe_pr

  safe_repo=$(sanitize_detail_path_token "$repo" | sed 's/-/_/g')
  safe_pr=$(printf '%s' "$pr_number" | tr -cd '0-9')
  [[ -n "$safe_pr" ]] || safe_pr='unknown'

  printf '%s/%s__pr-%s.json' "$PR_DETAIL_DIR" "$safe_repo" "$safe_pr"
}

is_destructive_sidecar_write_allowed() {
  [[ "${VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE:-}" =~ ^(1|true|yes)$ ]]
}

count_pr_detail_payload_events() {
  local payload_json="$1"
  printf '%s' "$payload_json" | jq -r '
    ((.activityTimeline // []) | length)
    + ((.activityEvents // []) | length)
    + ((.reviewThreads // []) | length)
    + ((.commentEvents // []) | length)
  ' 2>/dev/null || printf '0'
}

should_block_pr_detail_sidecar_overwrite() {
  local detail_file="$1"
  local incoming_payload_json="$2"
  local existing_count incoming_count

  is_destructive_sidecar_write_allowed && return 1
  [[ -f "$detail_file" ]] || return 1

  existing_count=$(jq -r '
    ((.activityTimeline // []) | length)
    + ((.activityEvents // []) | length)
    + ((.reviewThreads // []) | length)
    + ((.commentEvents // []) | length)
  ' "$detail_file" 2>/dev/null || printf '0')
  incoming_count=$(count_pr_detail_payload_events "$incoming_payload_json")

  [[ "$existing_count" =~ ^[0-9]+$ ]] || existing_count=0
  [[ "$incoming_count" =~ ^[0-9]+$ ]] || incoming_count=0

  [[ "$existing_count" -gt 0 && "$incoming_count" -eq 0 ]]
}

attach_pr_detail_ref() {
  local row_json="$1"
  local pr_number detail_file detail_tmp detail_json relative_file row_out

  pr_number=$(printf '%s' "$row_json" | jq -r '.number // ""' 2>/dev/null || true)
  [[ "$pr_number" =~ ^[0-9]+$ ]] || {
    printf '%s' "$row_json"
    return 0
  }

  detail_file=$(build_pr_detail_file_path "$REPO" "$pr_number")
  mkdir -p "$(dirname "$detail_file")" 2>/dev/null || {
    printf '%s' "$row_json"
    return 0
  }

  detail_json=$(printf '%s' "$row_json" | jq -c '{activityTimeline:(.activityTimeline // []),activityEvents:(.activityEvents // []),reviewThreads:(.reviewThreads // []),commentEvents:(.commentEvents // [])}' 2>/dev/null || true)
  [[ -n "$detail_json" ]] || {
    printf '%s' "$row_json"
    return 0
  }

  if should_block_pr_detail_sidecar_overwrite "$detail_file" "$detail_json"; then
    debug_log "skip destructive pr-detail overwrite: file=$detail_file"
  else
    detail_tmp="${detail_file}.tmp-$$-${RANDOM}"
    printf '%s\n' "$detail_json" >"$detail_tmp" 2>/dev/null || {
      rm -f "$detail_tmp" 2>/dev/null || true
      printf '%s' "$row_json"
      return 0
    }
    command mv "$detail_tmp" "$detail_file" 2>/dev/null || {
      rm -f "$detail_tmp" 2>/dev/null || true
      printf '%s' "$row_json"
      return 0
    }
  fi

  relative_file="$detail_file"
  if [[ "$relative_file" == "$VIEW_PRS_DIR"/* ]]; then
    relative_file="${relative_file#"$VIEW_PRS_DIR"/}"
  fi

  row_out=$(printf '%s' "$row_json" | jq -c --arg detailFile "$relative_file" '.detailRef = {file: $detailFile, version: "v1"} | del(.activityTimeline, .activityEvents, .reviewThreads, .commentEvents)' 2>/dev/null || true)
  if [[ -n "$row_out" ]]; then
    printf '%s' "$row_out"
    return 0
  fi

  printf '%s' "$row_json"
}

strip_inline_pr_detail_fields() {
  local row_json="$1"
  local row_out

  row_out=$(printf '%s' "$row_json" | jq -c 'del(.activityTimeline, .activityEvents, .reviewThreads, .commentEvents)' 2>/dev/null || true)
  if [[ -n "$row_out" ]]; then
    printf '%s' "$row_out"
    return 0
  fi

  printf '%s' "$row_json"
}

collect_stale_numbers_from_b64() {
  local b64_lines="$1"
  local section="$2"
  local is_draft

  while IFS= read -r pr_item; do
    [[ -z "$pr_item" ]] && continue
    pr_json=$(printf '%s' "$pr_item" | base64 --decode)
    number=$(printf '%s' "$pr_json" | jq -r '.number')
    [[ -z "$number" || "$number" == 'null' ]] && continue

    is_draft=$(printf '%s' "$pr_json" | jq -r '.isDraft // false')
    if [[ "$section" == 'open' && "$is_draft" == 'true' ]]; then
      continue
    fi
    if [[ "$section" == 'draft' && "$is_draft" != 'true' ]]; then
      continue
    fi

    cached_row_json=$(get_cached_row_json_for_pr "$pr_json" "$section")
    [[ -n "$cached_row_json" ]] && continue

    printf '%s\n' "$number"
  done <<<"$b64_lines"
}

pr_updated_at_matches_cache() {
  local number="$1"
  local section="$2"
  local source_updated_at="$3"
  local cached_updated_at

  cached_updated_at=$(
    jq -r \
      --arg number "$number" \
      --arg repo "$REPO" \
      --arg section "$section" \
      "$PR_KEY_JQ"'pr_row($repo; $number) | select(.section == $section) | (.data.sourceUpdatedAt // empty)' \
      "$PR_STATE_FILE" 2>/dev/null
  )

  [[ -n "$cached_updated_at" && "$cached_updated_at" == "$source_updated_at" ]]
}

# Cheap "did it change" check used by --quick-check: compares the just-listed
# updatedAt against the cached row's sourceUpdatedAt directly, independent of
# the full run's row reuse (get_cached_row_json_for_pr, VIEW_PRS_SKIP_UNCHANGED) and
# without requiring every other detail field to already be populated.
collect_quick_check_pending_numbers() {
  local b64_lines="$1"
  local section="$2"
  local is_draft number source_updated_at pr_json

  while IFS= read -r pr_item; do
    [[ -z "$pr_item" ]] && continue
    pr_json=$(printf '%s' "$pr_item" | base64 --decode)
    number=$(printf '%s' "$pr_json" | jq -r '.number')
    [[ -z "$number" || "$number" == 'null' ]] && continue

    is_draft=$(printf '%s' "$pr_json" | jq -r '.isDraft // false')
    if [[ "$section" == 'open' && "$is_draft" == 'true' ]]; then
      continue
    fi
    if [[ "$section" == 'draft' && "$is_draft" != 'true' ]]; then
      continue
    fi

    source_updated_at=$(printf '%s' "$pr_json" | jq -r '.updatedAt // ""')
    [[ -z "$source_updated_at" || "$source_updated_at" == 'null' ]] && continue

    if pr_updated_at_matches_cache "$number" "$section" "$source_updated_at"; then
      continue
    fi

    printf '%s\n' "$number"
  done <<<"$b64_lines"
}

collect_prioritized_stale_number_sets() {
  local open_b64="$1"
  local closed_b64="$2"
  local merged_b64="$3"

  STALE_OPEN_DRAFT_PR_NUMBERS=$(
    {
      collect_stale_numbers_from_b64 "$open_b64" 'open'
      collect_stale_numbers_from_b64 "$open_b64" 'draft'
    } | awk 'NF' | sort -u
  )

  STALE_CLOSED_PR_NUMBERS=$(collect_stale_numbers_from_b64 "$closed_b64" 'closed' | awk 'NF' | sort -u)
  STALE_MERGED_PR_NUMBERS=$(collect_stale_numbers_from_b64 "$merged_b64" 'merged' | awk 'NF' | sort -u)

  STALE_ALL_PR_NUMBERS=$(
    {
      printf '%s\n' "$STALE_OPEN_DRAFT_PR_NUMBERS"
      printf '%s\n' "$STALE_CLOSED_PR_NUMBERS"
      printf '%s\n' "$STALE_MERGED_PR_NUMBERS"
    } | awk 'NF' | sort -u
  )
}

emit_quick_check_result() {
  local repo="$1"
  local open_draft_numbers="$2"
  local closed_merged_numbers="$3"

  jq -n \
    --arg repo "$repo" \
    --arg checkedAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    --argjson pendingOpen "$(printf '%s\n' "$open_draft_numbers" | awk 'NF' | jq -R 'tonumber' | jq -s '.')" \
    --argjson pendingMergedClosed "$(printf '%s\n' "$closed_merged_numbers" | awk 'NF' | jq -R 'tonumber' | jq -s '.')" \
    '{repo: $repo, checkedAt: $checkedAt, pendingOpen: $pendingOpen, pendingMergedClosed: $pendingMergedClosed}'
}

parse_number_list() {
  local raw="$1"
  local out=''
  IFS=',' read -r -a parts <<<"$raw"
  # Empty input reads as an empty array, which bash before 4.4 calls
  # unbound under set -u: the +-guard.
  for part in ${parts[@]+"${parts[@]}"}; do
    num=$(printf '%s' "$part" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
    [[ -z "$num" ]] && continue
    if ! [[ "$num" =~ ^[0-9]+$ ]]; then
      echo ""
      return 1
    fi
    out+="$num"$'\n'
  done
  printf '%s' "$out"
}

parse_number_list_or_fail() {
  local raw_input="$1"
  local flag_name="$2"
  local parsed=''

  if ! parsed=$(parse_number_list "$raw_input"); then
    echo "Invalid $flag_name usage: expected valid PR numbers" >&2
    exit 1
  fi

  if [[ -z "$parsed" ]]; then
    echo "Invalid $flag_name usage: provide at least one PR number" >&2
    exit 1
  fi

  printf '%s' "$parsed"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -r | --repo)
        REPO="$2"
        shift 2
        ;;
      -l | --limit)
        LIMIT="$2"
        shift 2
        ;;
      -p | --pr)
        TARGET_PR_NUMBER="$2"
        shift 2
        ;;
      --quick-check-numbers)
        QUICK_CHECK_NUMBERS_RAW_INPUT="$2"
        shift 2
        ;;
      --prs)
        TARGET_PRS_RAW_INPUT="$2"
        shift 2
        ;;
      --label)
        INCLUDE_LABEL="$2"
        shift 2
        ;;
      --exclude-label)
        EXCLUDE_LABEL="$2"
        shift 2
        ;;
      --author)
        INCLUDE_AUTHOR="$2"
        shift 2
        ;;
      --merged-limit)
        MERGED_LIMIT="$2"
        MERGED_LIMIT_SET=1
        shift 2
        ;;
      --jobs)
        JOBS="$2"
        shift 2
        ;;
      --ack)
        ACK_ENABLED=1
        ACK_RAW_INPUT+="$2,"
        shift 2
        ;;
      --ack-clear)
        ACK_CLEAR_ENABLED=1
        ACK_CLEAR_RAW_INPUT+="$2,"
        shift 2
        ;;
      --in-review)
        IN_REVIEW_ENABLED=1
        IN_REVIEW_RAW_INPUT+="$2,"
        shift 2
        ;;
      --in-review-clear)
        IN_REVIEW_CLEAR_ENABLED=1
        IN_REVIEW_CLEAR_RAW_INPUT+="$2,"
        shift 2
        ;;
      --flagged)
        FLAGGED_ENABLED=1
        FLAGGED_RAW_INPUT+="$2,"
        shift 2
        ;;
      --flagged-clear)
        FLAGGED_CLEAR_ENABLED=1
        FLAGGED_CLEAR_RAW_INPUT+="$2,"
        shift 2
        ;;
      --ack-changed)
        ACK_CHANGED=1
        shift
        ;;
      --ack-only)
        ACK_ONLY=1
        shift
        ;;
      --backup-list)
        BACKUP_LIST_ONLY=1
        shift
        ;;
      --backup-restore)
        BACKUP_RESTORE_NAME="$2"
        shift 2
        ;;
      --show-reason)
        SHOW_REASON=1
        shift
        ;;
      --hide-reason)
        SHOW_REASON=0
        shift
        ;;
      --quiet)
        QUIET=1
        shift
        ;;
      --open)
        OPEN_MODE="$2"
        shift 2
        ;;
      --quick-check)
        QUICK_CHECK=1
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage
        exit 1
        ;;
    esac
  done
}

main() {
  set_current_shell_pid
  MAIN_SHELL_PID=$CURRENT_SHELL_PID
  set_exit_traps
  debug_log "start args=$*"
  parse_args "$@"

  if [[ "$BACKUP_LIST_ONLY" -eq 1 && -n "$BACKUP_RESTORE_NAME" ]]; then
    echo '--backup-list cannot be combined with --backup-restore' >&2
    exit 1
  fi

  if [[ "$BACKUP_LIST_ONLY" -eq 1 ]]; then
    list_state_backups
    exit 0
  fi

  if [[ -n "$BACKUP_RESTORE_NAME" ]]; then
    restore_state_backup "$BACKUP_RESTORE_NAME"
    exit 0
  fi

  if [[ -z "$REPO" ]]; then
    echo "No repo specified. Set VIEW_PRS_REPO=owner/name or pass --repo owner/name." >&2
    exit 1
  fi

  if [[ "$REPO" != */* ]]; then
    echo "Invalid --repo value: $REPO (expected owner/name)" >&2
    exit 1
  fi

  REPO_OWNER="${REPO%%/*}"
  REPO_NAME="${REPO##*/}"
  debug_log "parsed repo=$REPO open_mode=$OPEN_MODE limit=$LIMIT merged_limit_set=$MERGED_LIMIT_SET jobs=$JOBS target_pr=${TARGET_PR_NUMBER:-none} quick_check_numbers=${QUICK_CHECK_NUMBERS//$'\n'/,}"

  if [[ "$OPEN_MODE" != 'all' && "$OPEN_MODE" != 'changed' && "$OPEN_MODE" != 'none' ]]; then
    echo "Invalid --open mode: $OPEN_MODE (expected: all | changed | none)" >&2
    exit 1
  fi

  if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 ]]; then
    echo "Invalid --limit value: $LIMIT (expected positive integer)" >&2
    exit 1
  fi

  if [[ -n "$TARGET_PR_NUMBER" ]]; then
    if ! [[ "$TARGET_PR_NUMBER" =~ ^[0-9]+$ ]] || [[ "$TARGET_PR_NUMBER" -lt 1 ]]; then
      echo "Invalid --pr value: $TARGET_PR_NUMBER (expected positive integer)" >&2
      exit 1
    fi
  fi

  if [[ -n "$QUICK_CHECK_NUMBERS_RAW_INPUT" ]]; then
    if [[ -n "$TARGET_PR_NUMBER" ]]; then
      echo '--quick-check-numbers cannot be combined with -p/--pr' >&2
      exit 1
    fi
    # Without this, --quick-check-numbers would silently feed a real gh
    # pr view fetch into the full (non-quick-check) report path below -
    # untested territory whose run-metadata header still claims the normal
    # --limit/--merged-limit/day-window shown, even though none of that
    # applied to how these specific PRs were actually fetched.
    if [[ "$QUICK_CHECK" -ne 1 ]]; then
      echo '--quick-check-numbers requires --quick-check' >&2
      exit 1
    fi
    QUICK_CHECK_NUMBERS=$(parse_number_list_or_fail "$QUICK_CHECK_NUMBERS_RAW_INPUT" '--quick-check-numbers')
  fi

  if [[ -n "$TARGET_PRS_RAW_INPUT" ]]; then
    if [[ -n "$TARGET_PR_NUMBER" ]]; then
      echo '--prs cannot be combined with -p/--pr' >&2
      exit 1
    fi
    if [[ "$QUICK_CHECK" -eq 1 ]]; then
      echo '--prs cannot be combined with --quick-check' >&2
      exit 1
    fi
    TARGET_PRS=$(parse_number_list_or_fail "$TARGET_PRS_RAW_INPUT" '--prs')
  fi

  INCLUDE_LABEL=$(printf '%s' "$INCLUDE_LABEL" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  EXCLUDE_LABEL=$(printf '%s' "$EXCLUDE_LABEL" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  INCLUDE_AUTHOR=$(printf '%s' "$INCLUDE_AUTHOR" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  INCLUDE_LABELS=$(parse_label_list "$INCLUDE_LABEL")
  EXCLUDE_LABELS=$(parse_label_list "$EXCLUDE_LABEL")
  INCLUDE_AUTHORS=$(parse_author_list "$INCLUDE_AUTHOR")

  if [[ -n "$INCLUDE_LABEL" && -z "$INCLUDE_LABELS" ]]; then
    echo 'Invalid --label usage: provide at least one label value' >&2
    exit 1
  fi

  if [[ -n "$EXCLUDE_LABEL" && -z "$EXCLUDE_LABELS" ]]; then
    echo 'Invalid --exclude-label usage: provide at least one label value' >&2
    exit 1
  fi

  if [[ -n "$INCLUDE_AUTHOR" && -z "$INCLUDE_AUTHORS" ]]; then
    echo 'Invalid --author usage: provide at least one author login' >&2
    exit 1
  fi

  if [[ "$MERGED_LIMIT_SET" -eq 1 ]]; then
    if ! [[ "$MERGED_LIMIT" =~ ^[0-9]+$ ]] || [[ "$MERGED_LIMIT" -lt 1 ]]; then
      echo "Invalid --merged-limit value: $MERGED_LIMIT (expected positive integer)" >&2
      exit 1
    fi
  fi

  if ! [[ "$JOBS" =~ ^[0-9]+$ ]] || [[ "$JOBS" -lt 1 ]]; then
    echo "Invalid --jobs value: $JOBS (expected positive integer)" >&2
    exit 1
  fi

  if [[ "$ACK_ONLY" -eq 1 && "$ACK_CHANGED" -eq 1 ]]; then
    echo '--ack-only cannot be combined with --ack-changed' >&2
    exit 1
  fi

  if [[ "$IN_REVIEW_ENABLED" -eq 1 ]]; then
    IN_REVIEW_NUMBERS=$(parse_number_list_or_fail "$IN_REVIEW_RAW_INPUT" '--in-review')
  fi

  if [[ "$IN_REVIEW_CLEAR_ENABLED" -eq 1 ]]; then
    IN_REVIEW_CLEAR_NUMBERS=$(parse_number_list_or_fail "$IN_REVIEW_CLEAR_RAW_INPUT" '--in-review-clear')
  fi

  if [[ "$FLAGGED_ENABLED" -eq 1 ]]; then
    FLAGGED_NUMBERS=$(parse_number_list_or_fail "$FLAGGED_RAW_INPUT" '--flagged')
  fi

  if [[ "$FLAGGED_CLEAR_ENABLED" -eq 1 ]]; then
    FLAGGED_CLEAR_NUMBERS=$(parse_number_list_or_fail "$FLAGGED_CLEAR_RAW_INPUT" '--flagged-clear')
  fi

  if ! command -v jq >/dev/null 2>&1; then
    echo 'jq is required.' >&2
    exit 1
  fi

  # Each row is computed in compute-pr-row.js.
  if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
    echo 'node is required.' >&2
    exit 1
  fi

  if [[ "$ACK_ENABLED" -eq 1 ]]; then
    ACK_NUMBERS=$(parse_number_list_or_fail "$ACK_RAW_INPUT" '--ack')
  fi

  if [[ "$ACK_CLEAR_ENABLED" -eq 1 ]]; then
    ACK_CLEAR_NUMBERS=$(parse_number_list_or_fail "$ACK_CLEAR_RAW_INPUT" '--ack-clear')
  fi

  ensure_ack_store
  load_change_filter_config
  ROW_LOCAL_STATE_SHARED_KEY=$(row_local_state_shared_key)
  apply_ack_changes

  if [[ "$ACK_ONLY" -eq 1 ]]; then
    if [[ "$ACK_ENABLED" -eq 0 && "$ACK_CLEAR_ENABLED" -eq 0 && "$IN_REVIEW_ENABLED" -eq 0 && "$IN_REVIEW_CLEAR_ENABLED" -eq 0 && "$FLAGGED_ENABLED" -eq 0 && "$FLAGGED_CLEAR_ENABLED" -eq 0 ]]; then
      echo '--ack-only requires at least one operation: --ack, --ack-clear, --in-review, --in-review-clear, --flagged, or --flagged-clear' >&2
      exit 1
    fi
    if [[ "$QUIET" -eq 0 ]]; then
      echo "Acknowledgments updated for $REPO"
    fi
    debug_log "ack_only_complete repo=$REPO"
    exit 0
  fi

  if ! command -v gh >/dev/null 2>&1; then
    echo 'GitHub CLI (gh) is required.' >&2
    exit 1
  fi

  if ! gh auth status >/dev/null 2>&1; then
    echo 'Please authenticate first: gh auth login' >&2
    exit 1
  fi

  VIEWER_LOGIN=$(gh_with_retry gh api graphql -f query='query { viewer { login } }' --jq '.data.viewer.login')
  RUN_TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  RUN_ROW_INDEX=0
  debug_log "viewer_login=$VIEWER_LOGIN run_ts=$RUN_TS"

  if [[ "$QUIET" -eq 0 ]]; then
    echo "Repository : $REPO"
    echo "Viewer     : $VIEWER_LOGIN"
    echo "Open mode  : $OPEN_MODE"
    [[ -n "$INCLUDE_LABELS" ]] && echo "Include    : label(s) = $INCLUDE_LABEL"
    [[ -n "$EXCLUDE_LABELS" ]] && echo "Exclude    : label(s) = $EXCLUDE_LABEL"
    [[ -n "$INCLUDE_AUTHORS" ]] && echo "Include    : author login(s) = $INCLUDE_AUTHOR"
    echo "Drafts     : shown in separate section"
    if [[ "$MERGED_LIMIT_SET" -eq 1 ]]; then
      echo "Closed     : latest $MERGED_LIMIT shown"
      echo "Merged     : latest $MERGED_LIMIT shown"
    else
      echo "Closed     : latest $MERGED_DAYS_DEFAULT close-days shown"
      echo "Merged     : latest $MERGED_DAYS_DEFAULT merge-days shown"
    fi
    echo "Jobs       : $JOBS"
    [[ -n "$TARGET_PR_NUMBER" ]] && echo "Target PR  : #$TARGET_PR_NUMBER"
    echo "Hyperlinks : $([[ "$HYPERLINK_ENABLED" -eq 1 ]] && echo enabled || echo disabled)"
    echo
  fi

  # --quick-check-numbers and --prs both look their PRs up by number, in
  # whatever state they're in, rather than listing.
  if [[ -n "$QUICK_CHECK_NUMBERS" || -n "$TARGET_PRS" ]]; then
    quick_check_numbers_b64=$(fetch_quick_check_target_prs "${QUICK_CHECK_NUMBERS:-$TARGET_PRS}")

    prs_b64=''
    closed_prs_b64=''
    closed_prs_b64_all=''
    merged_prs_b64=''
    merged_prs_b64_all=''

    while IFS= read -r pr_b64_line; do
      [[ -z "$pr_b64_line" ]] && continue
      pr_json=$(printf '%s' "$pr_b64_line" | base64 --decode)
      merged_at=$(printf '%s' "$pr_json" | jq -r '.mergedAt // ""')
      closed_at=$(printf '%s' "$pr_json" | jq -r '.closedAt // ""')

      if [[ -n "$merged_at" ]]; then
        merged_prs_b64+="$pr_b64_line"$'\n'
        merged_prs_b64_all+="$pr_b64_line"$'\n'
      elif [[ -n "$closed_at" ]]; then
        closed_prs_b64+="$pr_b64_line"$'\n'
        closed_prs_b64_all+="$pr_b64_line"$'\n'
      else
        prs_b64+="$pr_b64_line"$'\n'
      fi
    done <<<"$quick_check_numbers_b64"

    # --prs: the chosen PRs that couldn't be fetched (after retries). The
    # rest are still refreshed; the run then fails (end of main), so they
    # stay queued for update rather than look done.
    if [[ -n "$TARGET_PRS" ]]; then
      local fetched_numbers
      fetched_numbers=$(collect_numbers_from_b64 "$quick_check_numbers_b64" | tr -d '\r' | awk 'NF' | sort -u)
      TARGET_PRS_MISSING=$(printf '%s\n' "$TARGET_PRS" | awk 'NF' | sort -u | grep -vxF -f <(printf '%s\n' "$fetched_numbers") || true)
    fi
  elif [[ -n "$TARGET_PR_NUMBER" ]]; then
    target_pr_b64=$(gh_with_retry gh pr view "$TARGET_PR_NUMBER" -R "$REPO" --json number,title,url,labels,isDraft,author,mergedAt,closedAt,mergedBy,createdAt,updatedAt,headRefName,baseRefName,additions,deletions --jq '. | @base64')

    if [[ -z "$target_pr_b64" ]]; then
      echo "PR #$TARGET_PR_NUMBER not found" >&2
      exit 1
    fi

    target_pr_json=$(printf '%s' "$target_pr_b64" | base64 --decode)

    target_merged_at=$(printf '%s' "$target_pr_json" | jq -r '.mergedAt // ""')
    target_closed_at=$(printf '%s' "$target_pr_json" | jq -r '.closedAt // ""')

    prs_b64=''
    closed_prs_b64=''
    closed_prs_b64_all=''
    merged_prs_b64=''
    merged_prs_b64_all=''

    if [[ -n "$target_merged_at" ]]; then
      merged_prs_b64="$target_pr_b64"
      merged_prs_b64_all="$target_pr_b64"
    elif [[ -n "$target_closed_at" ]]; then
      closed_prs_b64="$target_pr_b64"
      closed_prs_b64_all="$target_pr_b64"
    else
      prs_b64="$target_pr_b64"
    fi
  else
    prs_b64_raw=$(gh_with_retry gh pr list -R "$REPO" --state open --limit "$LIMIT" --json number,title,url,labels,isDraft,author,mergedBy,createdAt,updatedAt,headRefName,baseRefName,additions,deletions --jq '.[] | @base64')
    prs_b64="$prs_b64_raw"

    if [[ "$MERGED_LIMIT_SET" -eq 1 ]]; then
      merged_fetch_limit=$((MERGED_LIMIT * 5))
      ((merged_fetch_limit < 50)) && merged_fetch_limit=50
    else
      merged_fetch_limit=200
    fi
    ((merged_fetch_limit > 200)) && merged_fetch_limit=200

    closed_prs_b64_all_raw=$(gh_with_retry gh pr list -R "$REPO" --state closed --limit "$merged_fetch_limit" --json number,title,url,labels,mergedAt,closedAt,mergedBy,author,createdAt,updatedAt,headRefName,baseRefName,additions,deletions --jq 'map(select((.mergedAt // null) == null and (.closedAt // null) != null)) | sort_by(.closedAt) | reverse | .[] | @base64')
    closed_prs_b64_all="$closed_prs_b64_all_raw"

    merged_prs_b64_all_raw=$(gh_with_retry gh pr list -R "$REPO" --state merged --limit "$merged_fetch_limit" --json number,title,url,labels,mergedAt,closedAt,mergedBy,author,createdAt,updatedAt,headRefName,baseRefName,additions,deletions --jq 'sort_by(.mergedAt) | reverse | .[] | @base64')
    merged_prs_b64_all="$merged_prs_b64_all_raw"

    if [[ "$MERGED_LIMIT_SET" -eq 1 ]]; then
      closed_prs_b64=$(printf '%s\n' "$closed_prs_b64_all" | head -n "$MERGED_LIMIT")
      merged_prs_b64=$(printf '%s\n' "$merged_prs_b64_all" | head -n "$MERGED_LIMIT")
    else
      closed_prs_b64=''
      closed_days_seen=''
      closed_days_count=0
      while IFS= read -r pr_item; do
        [[ -z "$pr_item" ]] && continue
        pr_json=$(printf '%s' "$pr_item" | base64 --decode)
        closed_at=$(printf '%s' "$pr_json" | jq -r '.closedAt // ""')
        closed_day="${closed_at%%T*}"
        [[ -z "$closed_day" ]] && continue

        if ! printf '%s\n' "$closed_days_seen" | grep -Fxq "$closed_day"; then
          if [[ "$closed_days_count" -ge "$MERGED_DAYS_DEFAULT" ]]; then
            break
          fi
          closed_days_seen+="$closed_day"$'\n'
          closed_days_count=$((closed_days_count + 1))
        fi

        closed_prs_b64+="$pr_item"$'\n'
      done <<<"$closed_prs_b64_all"

      merged_prs_b64=''
      merged_days_seen=''
      merged_days_count=0
      while IFS= read -r pr_item; do
        [[ -z "$pr_item" ]] && continue
        pr_json=$(printf '%s' "$pr_item" | base64 --decode)
        merged_at=$(printf '%s' "$pr_json" | jq -r '.mergedAt // ""')
        merged_day="${merged_at%%T*}"
        [[ -z "$merged_day" ]] && continue

        if ! printf '%s\n' "$merged_days_seen" | grep -Fxq "$merged_day"; then
          if [[ "$merged_days_count" -ge "$MERGED_DAYS_DEFAULT" ]]; then
            break
          fi
          merged_days_seen+="$merged_day"$'\n'
          merged_days_count=$((merged_days_count + 1))
        fi

        merged_prs_b64+="$pr_item"$'\n'
      done <<<"$merged_prs_b64_all"
    fi
  fi

  ensure_pr_state_store

  if [[ "$QUICK_CHECK" -eq 1 ]]; then
    quick_check_open_draft_pending=$(
      {
        collect_quick_check_pending_numbers "$prs_b64" 'open'
        collect_quick_check_pending_numbers "$prs_b64" 'draft'
      } | awk 'NF' | sort -u
    )
    quick_check_closed_merged_pending=$(
      {
        collect_quick_check_pending_numbers "$closed_prs_b64" 'closed'
        collect_quick_check_pending_numbers "$merged_prs_b64" 'merged'
      } | awk 'NF' | sort -u
    )
    emit_quick_check_result "$REPO" "$quick_check_open_draft_pending" "$quick_check_closed_merged_pending"
    exit 0
  fi

  # One backup for the run, before its first row: upsert_pr_state writes
  # each row without one (a backup per row filled the retention with copies
  # from a single run).
  create_state_backup "$PR_STATE_FILE" 'pr-data'

  current_open_numbers=$(collect_numbers_from_b64 "$prs_b64")
  current_closed_numbers=$(collect_numbers_from_b64 "$closed_prs_b64")
  current_merged_numbers=$(collect_numbers_from_b64 "$merged_prs_b64")
  reconcile_missing_open_rows "$current_open_numbers"

  detail_cache_tmp=0
  thread_cache_tmp=0
  files_cache_tmp=0
  review_url_cache_tmp=0
  review_comment_cache_tmp=0
  ci_merge_cache_tmp=0
  if [[ -z "$DETAIL_CACHE_DIR" ]]; then
    DETAIL_CACHE_DIR=$(mktemp -d)
    detail_cache_tmp=1
  fi
  if [[ -z "$THREAD_CACHE_DIR" ]]; then
    THREAD_CACHE_DIR=$(mktemp -d)
    thread_cache_tmp=1
  fi
  if [[ -z "$FILES_CACHE_DIR" ]]; then
    FILES_CACHE_DIR=$(mktemp -d)
    files_cache_tmp=1
  fi
  if [[ -z "$REVIEW_URL_CACHE_DIR" ]]; then
    REVIEW_URL_CACHE_DIR=$(mktemp -d)
    review_url_cache_tmp=1
  fi
  if [[ -z "$REVIEW_COMMENT_CACHE_DIR" ]]; then
    REVIEW_COMMENT_CACHE_DIR=$(mktemp -d)
    review_comment_cache_tmp=1
  fi
  if [[ -z "$CI_MERGE_CACHE_DIR" ]]; then
    CI_MERGE_CACHE_DIR=$(mktemp -d)
    ci_merge_cache_tmp=1
  fi
  ROW_REUSE_SNAPSHOT_DIR=$(mktemp -d)
  build_row_reuse_snapshot

  # Removed when the run ends, however it ends (on_script_exit).
  EXIT_CLEANUP_PATHS+=("$ROW_REUSE_SNAPSHOT_DIR")
  [[ "$detail_cache_tmp" -eq 1 ]] && EXIT_CLEANUP_PATHS+=("$DETAIL_CACHE_DIR")
  [[ "$thread_cache_tmp" -eq 1 ]] && EXIT_CLEANUP_PATHS+=("$THREAD_CACHE_DIR")
  [[ "$files_cache_tmp" -eq 1 ]] && EXIT_CLEANUP_PATHS+=("$FILES_CACHE_DIR")
  [[ "$review_url_cache_tmp" -eq 1 ]] && EXIT_CLEANUP_PATHS+=("$REVIEW_URL_CACHE_DIR")
  [[ "$review_comment_cache_tmp" -eq 1 ]] && EXIT_CLEANUP_PATHS+=("$REVIEW_COMMENT_CACHE_DIR")
  [[ "$ci_merge_cache_tmp" -eq 1 ]] && EXIT_CLEANUP_PATHS+=("$CI_MERGE_CACHE_DIR")

  collect_prioritized_stale_number_sets "$prs_b64" "$closed_prs_b64" "$merged_prs_b64"

  all_candidate_pr_numbers=$(
    {
      collect_numbers_from_b64 "$prs_b64"
      collect_numbers_from_b64 "$closed_prs_b64"
      collect_numbers_from_b64 "$merged_prs_b64"
    } | awk 'NF' | sort -u
  )

  CACHE_TOTAL_COUNT=$(printf '%s\n' "$all_candidate_pr_numbers" | awk 'NF' | wc -l | tr -d '[:space:]')
  CACHE_STALE_COUNT=$(printf '%s\n' "$STALE_ALL_PR_NUMBERS" | awk 'NF' | wc -l | tr -d '[:space:]')
  debug_log "cache stale=$CACHE_STALE_COUNT total=$CACHE_TOTAL_COUNT staleOpenDraft=$(printf '%s\n' \"$STALE_OPEN_DRAFT_PR_NUMBERS\" | awk 'NF' | wc -l | tr -d '[:space:]') staleClosed=$(printf '%s\n' \"$STALE_CLOSED_PR_NUMBERS\" | awk 'NF' | wc -l | tr -d '[:space:]') staleMerged=$(printf '%s\n' \"$STALE_MERGED_PR_NUMBERS\" | awk 'NF' | wc -l | tr -d '[:space:]')"

  # Open/draft rows reused as they are (not stale) still get their CI and
  # mergeability as they are now; the stale ones get both with their
  # details.
  local reused_open_numbers
  reused_open_numbers=$(printf '%s\n' "$current_open_numbers" | awk 'NF' | grep -vxF -f <(printf '%s\n' "$STALE_OPEN_DRAFT_PR_NUMBERS" | awk 'NF') || true)

  # Prioritize data needed for open/draft rows so visible updates land sooner in the UI.
  run_prefetch_tasks_concurrently "$VIEW_PRS_PREFETCH_GROUP_CONCURRENCY" \
    prefetch_pr_details "$STALE_OPEN_DRAFT_PR_NUMBERS" \
    prefetch_review_threads "$STALE_OPEN_DRAFT_PR_NUMBERS" \
    prefetch_review_comments "$STALE_OPEN_DRAFT_PR_NUMBERS" \
    prefetch_review_urls "$STALE_OPEN_DRAFT_PR_NUMBERS" \
    prefetch_viewed_files_stats "$STALE_OPEN_DRAFT_PR_NUMBERS" \
    prefetch_ci_merge_stats "$reused_open_numbers"

  deferred_prefetch_pid=''
  closed_merged_stale_numbers=$(
    {
      printf '%s\n' "$STALE_CLOSED_PR_NUMBERS"
      printf '%s\n' "$STALE_MERGED_PR_NUMBERS"
    } | awk 'NF' | sort -u
  )

  # Merged/closed: only the ones that changed (the rest are reused), and
  # not their viewed files - see compute_pr_state_json.
  if [[ -n "$closed_merged_stale_numbers" ]]; then
    (
      run_prefetch_tasks_concurrently "$VIEW_PRS_PREFETCH_GROUP_CONCURRENCY" \
        prefetch_pr_details "$closed_merged_stale_numbers" \
        prefetch_review_threads "$closed_merged_stale_numbers" \
        prefetch_review_comments "$closed_merged_stale_numbers" \
        prefetch_review_urls "$closed_merged_stale_numbers"
    ) &
    deferred_prefetch_pid="$!"
  fi

  if [[ "$QUIET" -eq 0 ]]; then
    echo "Cache      : stale $CACHE_STALE_COUNT of $CACHE_TOTAL_COUNT"
    echo "Reconcile  : refreshed $RECONCILED_MISSING_OPEN_COUNT stale open/draft rows"
    echo
  fi

  changed_count=0
  no_change_count=0
  no_activity_count=0

  print_table_header_open 'Open PRs (non-draft):'
  non_draft_printed=0
  while IFS= read -r pr_item; do
    [[ -z "$pr_item" ]] && continue
    pr_json=$(printf '%s' "$pr_item" | base64 --decode)
    is_draft=$(printf '%s' "$pr_json" | jq -r '.isDraft')
    [[ "$is_draft" == 'true' ]] && continue

    if ! row_json=$(get_pr_row_json "$pr_json" 'open'); then
      note_unfetched_pr "$pr_json"
      continue
    fi
    status=$(printf '%s' "$row_json" | jq -r '.status')
    baseline=$(printf '%s' "$row_json" | jq -r '.baseline')

    RUN_ROW_INDEX=$((RUN_ROW_INDEX + 1))
    upsert_pr_state "$row_json" 'open'

    if ! row_passes_display_filters "$row_json"; then
      continue
    fi

    case "$status" in
      CHANGED)
        changed_count=$((changed_count + 1))
        if [[ "$ACK_CHANGED" -eq 1 ]]; then
          pr_number=$(printf '%s' "$row_json" | jq -r '.number')
          set_ack_ts "$pr_number" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
        fi
        ;;
      NO_CHANGE)
        no_change_count=$((no_change_count + 1))
        ;;
      NO_ACTIVITY)
        no_activity_count=$((no_activity_count + 1))
        ;;
    esac

    print_row "$row_json" "$baseline"
    non_draft_printed=$((non_draft_printed + 1))

    if [[ "$OPEN_MODE" == 'all' ]]; then
      open_url=$(printf '%s' "$row_json" | jq -r '.url')
      open_pr_url "$open_url"
    elif [[ "$OPEN_MODE" == 'changed' && "$status" == 'CHANGED' ]]; then
      open_url=$(printf '%s' "$row_json" | jq -r '.url')
      open_pr_url "$open_url"
    fi
  done <<<"$prs_b64"

  [[ "$non_draft_printed" -eq 0 ]] && echo '(none)'

  echo
  print_table_header_open 'Draft PRs:'
  draft_printed=0
  while IFS= read -r pr_item; do
    [[ -z "$pr_item" ]] && continue
    pr_json=$(printf '%s' "$pr_item" | base64 --decode)
    is_draft=$(printf '%s' "$pr_json" | jq -r '.isDraft')
    [[ "$is_draft" != 'true' ]] && continue

    if ! row_json=$(get_pr_row_json "$pr_json" 'draft'); then
      note_unfetched_pr "$pr_json"
      continue
    fi
    status=$(printf '%s' "$row_json" | jq -r '.status')
    baseline=$(printf '%s' "$row_json" | jq -r '.baseline')

    RUN_ROW_INDEX=$((RUN_ROW_INDEX + 1))
    upsert_pr_state "$row_json" 'draft'

    if ! row_passes_display_filters "$row_json"; then
      continue
    fi

    case "$status" in
      CHANGED)
        changed_count=$((changed_count + 1))
        ;;
      NO_CHANGE)
        no_change_count=$((no_change_count + 1))
        ;;
      NO_ACTIVITY)
        no_activity_count=$((no_activity_count + 1))
        ;;
    esac

    print_row "$row_json" "$baseline"
    draft_printed=$((draft_printed + 1))
  done <<<"$prs_b64"

  [[ "$draft_printed" -eq 0 ]] && echo '(none)'

  if [[ -n "$deferred_prefetch_pid" ]]; then
    wait "$deferred_prefetch_pid"
  fi

  echo
  print_table_header_closed
  closed_printed=0
  while IFS= read -r pr_item; do
    [[ -z "$pr_item" ]] && continue
    pr_json=$(printf '%s' "$pr_item" | base64 --decode)

    if ! row_json=$(get_pr_row_json "$pr_json" 'closed'); then
      note_unfetched_pr "$pr_json"
      continue
    fi

    RUN_ROW_INDEX=$((RUN_ROW_INDEX + 1))
    upsert_pr_state "$row_json" 'closed'

    if ! row_passes_display_filters "$row_json"; then
      continue
    fi

    closed_at=$(printf '%s' "$row_json" | jq -r '.closedAt')
    print_row "$row_json" "$closed_at"
    closed_printed=$((closed_printed + 1))
  done <<<"$closed_prs_b64"

  [[ "$closed_printed" -eq 0 ]] && echo '(none)'

  echo
  print_table_header_merged
  merged_printed=0
  while IFS= read -r pr_item; do
    [[ -z "$pr_item" ]] && continue
    pr_json=$(printf '%s' "$pr_item" | base64 --decode)

    if ! row_json=$(get_pr_row_json "$pr_json" 'merged'); then
      note_unfetched_pr "$pr_json"
      continue
    fi

    RUN_ROW_INDEX=$((RUN_ROW_INDEX + 1))
    upsert_pr_state "$row_json" 'merged'

    if ! row_passes_display_filters "$row_json"; then
      continue
    fi

    merged_at=$(printf '%s' "$row_json" | jq -r '.mergedAt')
    print_row "$row_json" "$merged_at"
    merged_printed=$((merged_printed + 1))
  done <<<"$merged_prs_b64"

  [[ "$merged_printed" -eq 0 ]] && echo '(none)'

  echo
  echo 'Summary:'
  echo "  CHANGED     : $changed_count"
  echo "  NO_CHANGE   : $no_change_count"
  echo "  NO_ACTIVITY : $no_activity_count"
  debug_log "summary changed=$changed_count no_change=$no_change_count no_activity=$no_activity_count"

  if [[ -n "$UNFETCHED_PR_NUMBERS" ]]; then
    if is_targeted_run; then
      TARGET_PRS_MISSING=$(printf '%s\n%s\n' "$TARGET_PRS_MISSING" "$UNFETCHED_PR_NUMBERS" | awk 'NF' | sort -u)
    else
      echo "Could not fetch the details of PR(s), kept as stored: $(printf '%s' "$UNFETCHED_PR_NUMBERS" | awk 'NF' | sort -u | tr '\n' ',' | sed 's/,$//')" >&2
    fi
  fi

  if [[ -n "$TARGET_PRS_MISSING" ]]; then
    echo "Could not fetch PR(s): $(printf '%s' "$TARGET_PRS_MISSING" | tr '\n' ',' | sed 's/,$//')" >&2
    exit 1
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
