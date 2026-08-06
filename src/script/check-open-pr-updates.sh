#!/usr/bin/env bash

set -euo pipefail

REPO='optum-rx-clinicalproducts/orx-cpp-mp-uis'
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
STATUS_COL_WIDTH=28
APPROVED_COL_WIDTH=14
GH_COMMAND_TIMEOUT_SECONDS="${GH_COMMAND_TIMEOUT_SECONDS:-45}"
VIEW_PRS_CACHE_REVALIDATE_SECONDS="${VIEW_PRS_CACHE_REVALIDATE_SECONDS:-1800}"
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
VIEWED_FILES_FRESH_CACHE_DIR="${VIEWED_FILES_FRESH_CACHE_DIR:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEW_PRS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_DIR="${DATA_DIR:-$VIEW_PRS_DIR/data}"
PR_STATE_FILE="${PR_STATE_FILE:-$DATA_DIR/check-open-pr-updates.data.json}"
PR_STATE_LOCK_DIR="${PR_STATE_LOCK_DIR:-$DATA_DIR/check-open-pr-updates.data.lock}"
USER_STATE_FILE="${USER_STATE_FILE:-$DATA_DIR/check-open-pr-updates.user-state.json}"
USER_STATE_LOCK_DIR="${USER_STATE_LOCK_DIR:-$DATA_DIR/check-open-pr-updates.user-state.lock}"
PR_DETAIL_DIR="${PR_DETAIL_DIR:-$DATA_DIR/pr-details}"
LOCK_STALE_SECONDS="${LOCK_STALE_SECONDS:-900}"
STATE_BACKUP_DIR="${STATE_BACKUP_DIR:-$DATA_DIR/backups}"
STATE_BACKUP_RETENTION="${STATE_BACKUP_RETENTION:-50}"

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
      --ack-only               Apply ack/clear operations only; skip PR retrieval
      --backup-list            List available state-file backups
      --backup-restore <file>  Restore a backup file from data/backups
      --show-reason            Show changed reason inline beside CHANGED in STATUS (default)
      --hide-reason            Hide inline changed reason in STATUS
      --quiet                  Hide run metadata header
      --open <mode>            Browser behavior: all | changed | none (default: all)
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
  local ts suffix backup_file pattern retention

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
      ls -1t $pattern 2>/dev/null | awk -v keep="$retention" 'NR > keep { print }' | while IFS= read -r old_file; do
        [[ -n "$old_file" ]] || continue
        rm -f "$old_file" 2>/dev/null || true
      done
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
  command mv -f "$tmp_file" "$target_file"
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

get_flagged_required() {
  local number="$1"
  jq -r --arg repo "$REPO" --arg number "$number" '.flaggedByRepo[$repo][$number] // false' "$USER_STATE_FILE" 2>/dev/null
}

set_reverify_required_unlocked() {
  local number="$1"
  local tmp
  tmp=$(mktemp)
  jq --arg repo "$REPO" --arg number "$number" '(.reverifyByRepo //= {}) | (.reverifyByRepo[$repo] //= {}) | .reverifyByRepo[$repo][$number] = true' "$USER_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

set_reverify_required() {
  local number="$1"
  with_user_state_lock set_reverify_required_unlocked "$number"
}

clear_reverify_required_unlocked() {
  local number="$1"
  local tmp
  tmp=$(mktemp)
  jq --arg repo "$REPO" --arg number "$number" 'if .reverifyByRepo[$repo] then del(.reverifyByRepo[$repo][$number]) else . end' "$USER_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

clear_reverify_required() {
  local number="$1"
  with_user_state_lock clear_reverify_required_unlocked "$number"
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

set_ack_ts_unlocked() {
  local number="$1"
  local ts="$2"
  local tmp
  tmp=$(mktemp)
  jq --arg repo "$REPO" --arg number "$number" --arg ts "$ts" '(.ackByRepo //= {}) | (.ackByRepo[$repo] //= {}) | .ackByRepo[$repo][$number] = $ts | if .reverifyByRepo[$repo] then del(.reverifyByRepo[$repo][$number]) else . end' "$USER_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

set_ack_ts() {
  local number="$1"
  local ts="$2"
  with_user_state_lock set_ack_ts_unlocked "$number" "$ts"
}

clear_ack_ts_unlocked() {
  local number="$1"
  local tmp
  tmp=$(mktemp)
  jq --arg repo "$REPO" --arg number "$number" 'if .ackByRepo[$repo] then del(.ackByRepo[$repo][$number]) else . end | (.reverifyByRepo //= {}) | (.reverifyByRepo[$repo] //= {}) | .reverifyByRepo[$repo][$number] = true' "$USER_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

clear_ack_ts() {
  local number="$1"
  with_user_state_lock clear_ack_ts_unlocked "$number"
}

clear_all_repo_acks_unlocked() {
  local tmp
  tmp=$(mktemp)
  jq --arg repo "$REPO" 'if .ackByRepo then del(.ackByRepo[$repo]) else . end' "$USER_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$USER_STATE_FILE" 'user-state'
}

clear_all_repo_acks() {
  with_user_state_lock clear_all_repo_acks_unlocked
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

  local tmp
  tmp=$(mktemp)
  jq '.byPrNumber //= {} | del(.ackByRepo, .reverifyByRepo, .inReviewByRepo, .flaggedByRepo)' "$PR_STATE_FILE" >"$tmp"
  replace_state_file "$tmp" "$PR_STATE_FILE" 'pr-data'
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
  local info_file now
  info_file=$(lock_info_file "$lock_dir")
  now=$(get_epoch_seconds)

  {
    printf 'pid=%s\n' "$$"
    printf 'createdAt=%s\n' "$now"
    printf 'script=%s\n' "$0"
  } >"$info_file" 2>/dev/null || true
}
recover_stale_lock_dir() {
  local lock_dir="$1"
  local lock_label="$2"
  local info_file pid created_at now age stale_after mtime

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

  if rm -rf "$lock_dir" 2>/dev/null; then
    debug_log "Recovered stale ${lock_label} lock: ${lock_dir}"
    return 0
  fi

  return 1
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
  return 0
}

release_pr_state_lock() {
  rm -f "$PR_STATE_LOCK_DIR/lock-info" 2>/dev/null || true
  rmdir "$PR_STATE_LOCK_DIR" 2>/dev/null || true
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
  return 0
}

release_user_state_lock() {
  rm -f "$USER_STATE_LOCK_DIR/lock-info" 2>/dev/null || true
  rmdir "$USER_STATE_LOCK_DIR" 2>/dev/null || true
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
  local number tmp row_file

  number=$(printf '%s' "$row_json" | jq -r '.number')
  tmp=$(mktemp)
  row_file=$(mktemp)
  printf '%s' "$row_json" >"$row_file"
  jq \
    --arg number "$number" \
    --arg repo "$REPO" \
    --arg section "$section" \
    --arg updatedAt "$RUN_TS" \
    --argjson rowOrder "$RUN_ROW_INDEX" \
    --slurpfile row_file "$row_file" \
    '
      .byPrNumber //= {} |
      .byPrNumber[$number] = (((.byPrNumber[$number] // {}) | del(.notes)) + {
        prNumber: $number,
        repo: $repo,
        section: $section,
        updatedAt: $updatedAt,
        rowOrder: ((.byPrNumber[$number].rowOrder // $rowOrder)),
        data: ($row_file[0] // {})
      }) |
      .lastRun = {
        repo: $repo,
        updatedAt: $updatedAt
      }
    ' "$PR_STATE_FILE" >"$tmp"
  rm -f "$row_file"

  replace_state_file "$tmp" "$PR_STATE_FILE" 'pr-data'
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
  # each review, so that normalize_pr_reviews_json can be enriched with URLs.
  # The gh CLI's --json reviews schema doesn't expose url, so we use the REST API.
  local result
  local api_output
  api_output=$(gh_with_retry gh api "/repos/$REPO_OWNER/$REPO_NAME/pulls/$number/reviews" 2>/dev/null) || api_output=''
  result=$(printf '%s' "$api_output" | jq -c 'if type == "array" then [.[] | select(.submitted_at != null and .submitted_at != "") | {
      key: (.submitted_at + "_" + (.user.login // "unknown")),
      value: (.html_url // "")
    }] | from_entries else {} end' 2>/dev/null) || result=''
    [[ -z "$result" ]] && result='{}'
  printf '%s' "$result" >"$cache_file"
  printf '%s' "$result"
}

get_pr_detail_json() {
  local number="$1"
  local cache_file="$DETAIL_CACHE_DIR/$number.json"

  if [[ -f "$cache_file" && "$number" != "$TARGET_PR_NUMBER" ]]; then
    cat "$cache_file"
    return
  fi

  gh_with_retry gh pr view "$number" -R "$REPO" --json comments,reviews,reviewRequests,commits,assignees,statusCheckRollup,mergeable,mergeStateStatus
}

prefetch_pr_details() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return

  printf '%s\n' "$numbers" | xargs -P "$JOBS" -I '{}' bash -c '
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

prefetch_review_threads() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return

  printf '%s\n' "$numbers" | xargs -P "$JOBS" -I '{}' bash -c 'fetch_review_threads_json "{}" > /dev/null' _ '{}' 2>/dev/null &
  wait
}

prefetch_review_comments() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return
  [[ -z "$REVIEW_COMMENT_CACHE_DIR" ]] && return

  printf '%s\n' "$numbers" | xargs -P "$JOBS" -I '{}' bash -c 'fetch_pr_review_comments_json "{}" > /dev/null' _ '{}' 2>/dev/null &
  wait
}

prefetch_review_urls() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return
  [[ -z "$REVIEW_URL_CACHE_DIR" ]] && return

  printf '%s\n' "$numbers" | xargs -P "$JOBS" -I '{}' bash -c 'fetch_pr_review_url_map_json "{}" > /dev/null' _ '{}' 2>/dev/null &
  wait
}

prefetch_viewed_files_stats() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return

  printf '%s\n' "$numbers" | xargs -P "$JOBS" -I '{}' bash -c 'fetch_pr_viewed_files_stats_json "{}" > /dev/null' _ '{}' 2>/dev/null &
  wait
}

prefetch_viewed_files_stats_fresh() {
  local numbers="$1"
  local previous_files_cache_dir
  local number

  [[ -z "$numbers" ]] && return
  [[ -z "$VIEWED_FILES_FRESH_CACHE_DIR" ]] && return

  previous_files_cache_dir="$FILES_CACHE_DIR"
  FILES_CACHE_DIR="$VIEWED_FILES_FRESH_CACHE_DIR"

  while IFS= read -r number; do
    [[ -z "$number" ]] && continue
    fetch_pr_viewed_files_stats_json "$number" >/dev/null 2>&1 || true
  done <<<"$numbers"

  FILES_CACHE_DIR="$previous_files_cache_dir"
}

prefetch_ci_merge_stats() {
  local numbers="$1"
  [[ -z "$numbers" ]] && return
  [[ -z "$CI_MERGE_CACHE_DIR" ]] && return

  printf '%s\n' "$numbers" | xargs -P "$JOBS" -I '{}' bash -c '
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

  for pid in "${active_pids[@]}"; do
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
        -f after="$cursor")
    else
      response=$(gh_with_retry gh api graphql \
        -f query='query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 100) { nodes { id isResolved isOutdated resolvedBy { login } comments(first: 100) { totalCount pageInfo { hasNextPage endCursor } nodes { id author { login } authorAssociation body createdAt publishedAt url replyTo { id } path line originalLine state } } } pageInfo { hasNextPage endCursor } } } } }' \
        -f owner="$REPO_OWNER" \
        -f name="$REPO_NAME" \
        -F number="$number")
    fi

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
  ' "$tmp_nodes" >"$cache_file"
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

  while true; do
    page_output=$(gh_with_retry gh api "/repos/$REPO_OWNER/$REPO_NAME/pulls/$number/comments?per_page=100&page=$page" 2>/dev/null) || page_output='[]'
    api_output=$(jq -cn --argjson current "$api_output" --argjson pageData "$page_output" '
      $current + (if ($pageData | type) == "array" then $pageData else [] end)
    ' 2>/dev/null) || api_output='[]'
    page_count=$(printf '%s' "$page_output" | jq -r 'if type == "array" then length else 0 end' 2>/dev/null) || page_count=0
    [[ "$page_count" -lt 100 ]] && break
    page=$((page + 1))
  done

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

  jq -cn \
    --argjson commentEvents "$comment_events_json" \
    --argjson reviews "$reviews_json" \
    --argjson commits "$commits_json" \
    --arg createdAt "$created_at" \
    --arg actor "$author_login" \
    --arg mergedAt "$merged_at" \
    --arg mergedBy "$merged_by_login" '
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
        | select((.login // "") != "")
        | {
            sourceId: ($commit.oid // ""),
            threadId: "",
            occurredAt: ($commit.committedAt // ""),
            date: (($commit.committedAt // "") | split("T") | .[0]),
            actor: .login,
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

fetch_pr_viewed_files_stats_json() {
  local number="$1"
  local response
  local fetch_failed=0
  local files_json='[]'

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

  if [[ -s "$tmp_nodes" ]]; then
    files_json=$(jq -s '.' "$tmp_nodes" 2>/dev/null || echo '[]')
  fi

  jq -cn --arg changedFiles "$changed_files" --argjson files "$files_json" '
    {
      changedFiles: (($changedFiles | split("\n") | map(select(length > 0)) | .[0] // "0") | tonumber? // 0),
      viewedFiles: (($files // []) | map(select((.viewerViewedState // "") == "VIEWED")) | length)
    }
  ' >"$cache_file"
  cat "$cache_file"
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

filter_prs_b64_by_filters() {
  local b64_lines="$1"
  local filtered=''
  local pr_json

  while IFS= read -r pr_item; do
    [[ -z "$pr_item" ]] && continue
    pr_json=$(printf '%s' "$pr_item" | base64 --decode)
    if pr_passes_label_filters "$pr_json" && pr_passes_author_filters "$pr_json"; then
      filtered+="$pr_item"$'\n'
    fi
  done <<<"$b64_lines"

  printf '%s' "$filtered"
}

row_passes_display_filters() {
  local row_json="$1"
  pr_passes_label_filters "$row_json" && pr_passes_author_filters "$row_json"
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

  detail_json=$(get_pr_detail_json "$number")
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
  threads_json=$(fetch_review_threads_json "$number")
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
  activity_events_json=$(build_activity_events_json "$comment_events_json" "$reviews_json" "$commits_json" "$created_at" "$author_login" "$merged_at" "$merged_by_login")
  activity_timeline_json=$(build_activity_timeline_json "$activity_events_json")
  activity_timeline_summary=$(build_activity_timeline_summary "$activity_timeline_json")
  metrics_json=$(build_pr_metrics_json "$comments_json" "$reviews_json" "$commits_json" "$threads_json" "$comment_events_json" "$activity_events_json" "$author_login" "$merged_at")

  my_last=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" '
    [
      (.comments[]? | select(.author.login == $me) | .createdAt),
      (.reviews[]? | select(.author.login == $me) | .submittedAt),
      (.commits[]? | .authors[]? | select(.login == $me) | .committedDate)
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
    external_top_comment_count=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" --arg since "$effective_last" '
      [.comments[]? | select((.author.login // "") != "" and .author.login != $me) | select((.createdAt // "") > $since)] | length
    ')
    external_review_count=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" --arg since "$effective_last" '
      [
        .reviews[]?
        | select((.author.login // "") != "" and .author.login != $me)
        | select((.submittedAt // "") > $since)
        | select((.state // "") != "APPROVED")
      ]
      | length
    ')
    external_commit_count=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" --arg since "$effective_last" '
      [
        .commits[]?
        | select(any(.authors[]?; .login != null and .login != $me))
        | select((.committedDate // "") > $since)
        | select(((.messageHeadline // "") | test("^(Merge (branch|remote-tracking branch).*(main|origin/main)|Merge main into )")) | not)
      ]
      | length
    ')
  else
    external_top_comment_count=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" '
      [.comments[]? | select((.author.login // "") != "" and .author.login != $me)] | length
    ')
    external_review_count=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" '
      [
        .reviews[]?
        | select((.author.login // "") != "" and .author.login != $me)
        | select((.state // "") != "APPROVED")
      ]
      | length
    ')
    external_commit_count=$(printf '%s' "$detail_json" | jq -r --arg me "$VIEWER_LOGIN" '
      [
        .commits[]?
        | select(any(.authors[]?; .login != null and .login != $me))
        | select(((.messageHeadline // "") | test("^(Merge (branch|remote-tracking branch).*(main|origin/main)|Merge main into )")) | not)
      ]
      | length
    ')
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

  viewed_files_stats_json=$(fetch_pr_viewed_files_stats_json "$number")
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

  reverify_required=$(get_reverify_required "$number")
  in_review_required=$(get_in_review_required "$number")
  if [[ "$status" == 'NO_CHANGE' && "$in_review_required" == 'true' ]]; then
    status='CHANGED'
    changed_reason='in-review'
  elif [[ "$reverify_required" == 'true' && "$status" == 'NO_CHANGE' ]]; then
    status='CHANGED'
    changed_reason='ack-cleared'
  fi

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

  number=$(printf '%s' "$row_json" | jq -r '.number')
  title=$(printf '%s' "$row_json" | jq -r '.title')
  title_display=$(printf '%s' "$row_json" | jq -r '.titleDisplay // .title')
  url=$(printf '%s' "$row_json" | jq -r '.url')
  author=$(printf '%s' "$row_json" | jq -r '.author')
  status=$(printf '%s' "$row_json" | jq -r '.status')
  approved=$(printf '%s' "$row_json" | jq -r '.approved')
  approval_count=$(printf '%s' "$row_json" | jq -r '.approvalCount // "0"')
  reason=$(printf '%s' "$row_json" | jq -r '.reason')

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

  [[ -n "$TARGET_PR_NUMBER" ]] && return 0
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
      | .key
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
    row_json=$(compute_pr_state_json "$fresh_pr_json")

    RUN_ROW_INDEX=$((RUN_ROW_INDEX + 1))
    upsert_pr_state "$row_json" "$fresh_section"
    RECONCILED_MISSING_OPEN_COUNT=$((RECONCILED_MISSING_OPEN_COUNT + 1))

    limit=$((limit - 1))
  done <"$stale_tmp"

  debug_log "reconciled_missing_open_rows=$RECONCILED_MISSING_OPEN_COUNT"

  rm -f "$current_open_tmp" "$stale_tmp"
}

cache_shortcut_allowed() {
  [[ "$ACK_ENABLED" -eq 0 && "$ACK_CLEAR_ENABLED" -eq 0 && "$ACK_CHANGED" -eq 0 && -z "$TARGET_PR_NUMBER" ]]
}

cache_shortcut_allowed_for_section() {
  local section="$1"
  cache_shortcut_allowed || return 1

  # Enable cache reuse for all sections, but require fresh source fingerprints
  # so stale cached rows are only reused when all fetched inputs match.
  # Check VIEW_PRS_SKIP_UNCHANGED=1 to opt into this behavior (defaults to off for now, can be enabled)
  if [[ "${VIEW_PRS_SKIP_UNCHANGED:-0}" != '1' ]]; then
    return 1
  fi

  return 0
}

get_cached_row_json_for_pr() {
  local pr_json="$1"
  local section="$2"
  local number source_updated_at source_fingerprint
  local now_epoch_seconds max_cache_age_seconds has_prefetched_fingerprint_data

  cache_shortcut_allowed_for_section "$section" || return 0

  number=$(printf '%s' "$pr_json" | jq -r '.number')
  source_updated_at=$(printf '%s' "$pr_json" | jq -r '.updatedAt // ""')
  source_fingerprint=''
  has_prefetched_fingerprint_data=0

  [[ -z "$number" || "$number" == 'null' ]] && return 0
  [[ -z "$source_updated_at" || "$source_updated_at" == 'null' ]] && return 0

  now_epoch_seconds=$(date '+%s' 2>/dev/null || echo '0')
  if ! [[ "$now_epoch_seconds" =~ ^[0-9]+$ ]]; then
    now_epoch_seconds=0
  fi

  max_cache_age_seconds="$VIEW_PRS_CACHE_REVALIDATE_SECONDS"
  if ! [[ "$max_cache_age_seconds" =~ ^[0-9]+$ ]]; then
    max_cache_age_seconds=1800
  fi

  if [[ -f "$DETAIL_CACHE_DIR/$number.json" && \
    -f "$THREAD_CACHE_DIR/$number.json" && \
    -f "$REVIEW_COMMENT_CACHE_DIR/$number.json" && \
    -f "$REVIEW_URL_CACHE_DIR/$number.json" && \
    -f "$FILES_CACHE_DIR/$number.json" && \
    -f "$CI_MERGE_CACHE_DIR/$number.json" ]]; then
    source_fingerprint=$(build_pr_source_fingerprint "$number")
    if [[ -n "$source_fingerprint" ]]; then
      has_prefetched_fingerprint_data=1
    fi
  fi

  if [[ "$has_prefetched_fingerprint_data" -eq 1 ]]; then
    jq -c \
      --arg number "$number" \
      --arg repo "$REPO" \
      --arg section "$section" \
      --arg viewerLogin "$VIEWER_LOGIN" \
      --arg sourceUpdatedAt "$source_updated_at" \
      --arg sourceFingerprint "$source_fingerprint" \
      '
        .byPrNumber[$number] // empty
        | select(.repo == $repo and .section == $section)
        | .data
        | select((.viewerLogin // "") == $viewerLogin)
        | select((.sourceUpdatedAt // "") == $sourceUpdatedAt)
        | select((.sourceFingerprint // "") == $sourceFingerprint)
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
      ' "$PR_STATE_FILE" 2>/dev/null || true
    return 0
  fi

  jq -c \
    --arg number "$number" \
    --arg repo "$REPO" \
    --arg section "$section" \
    --arg viewerLogin "$VIEWER_LOGIN" \
    --arg sourceUpdatedAt "$source_updated_at" \
    --argjson nowEpochSeconds "$now_epoch_seconds" \
    --argjson maxCacheAgeSeconds "$max_cache_age_seconds" \
    '
      def to_epoch($ts):
        (($ts | fromdateiso8601?) //
        (($ts | sub("\\.[0-9]+Z$"; "Z")) | fromdateiso8601?) //
        0);

      .byPrNumber[$number] // empty
      | select(.repo == $repo and .section == $section)
      | .data
      | select((.viewerLogin // "") == $viewerLogin)
      | select((.sourceUpdatedAt // "") == $sourceUpdatedAt)
      | select(($maxCacheAgeSeconds <= 0) or (
          ($nowEpochSeconds - to_epoch(.updatedAt // "")) <= $maxCacheAgeSeconds
        ))
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
    ' "$PR_STATE_FILE" 2>/dev/null || true
}

enrich_cached_row_with_ci_merge() {
  local cached_row_json="$1"
  local number="$2"
  local ci_merge_json

  [[ -z "$cached_row_json" ]] && return

  ci_merge_json=$(cat "$CI_MERGE_CACHE_DIR/$number.json" 2>/dev/null || echo '{}')
  [[ -z "$ci_merge_json" ]] && ci_merge_json='{}'

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
    '.checkState = $check_state | .mergeState = $merge_state | .titleDisplay = (.title + " [CHK:" + $check_state + "][MRG:" + $merge_state + "]")'
}

enrich_cached_row_with_viewed_files() {
  local cached_row_json="$1"
  local number="$2"
  local viewed_files_json
  local viewed_files_count
  local changed_files_count
  local viewed_files_summary

  [[ -z "$cached_row_json" ]] && return
  [[ -z "$VIEWED_FILES_FRESH_CACHE_DIR" ]] && {
    printf '%s' "$cached_row_json"
    return
  }

  viewed_files_json=$(cat "$VIEWED_FILES_FRESH_CACHE_DIR/$number.json" 2>/dev/null || echo '{}')
  [[ -z "$viewed_files_json" || "$viewed_files_json" == '{}' ]] && {
    printf '%s' "$cached_row_json"
    return
  }

  viewed_files_count=$(printf '%s' "$viewed_files_json" | jq -r '.viewedFiles // 0' 2>/dev/null || echo '0')
  changed_files_count=$(printf '%s' "$viewed_files_json" | jq -r '.changedFiles // 0' 2>/dev/null || echo '0')
  viewed_files_summary="${viewed_files_count}/${changed_files_count} viewed"

  printf '%s' "$cached_row_json" | jq -c \
    --arg viewedFilesCount "$viewed_files_count" \
    --arg changedFilesCount "$changed_files_count" \
    --arg viewedFilesSummary "$viewed_files_summary" \
    '.viewedFilesCount = $viewedFilesCount | .changedFilesCount = $changedFilesCount | .viewedFilesSummary = $viewedFilesSummary'
}

get_pr_row_json() {
  local pr_json="$1"
  local section="$2"
  local row_json number

  row_json=$(get_cached_row_json_for_pr "$pr_json" "$section")
  if [[ -z "$row_json" ]]; then
    compute_pr_state_json "$pr_json"
    return
  fi

  number=$(printf '%s' "$row_json" | jq -r '.number // ""')
  emit_pr_progress_marker 'START' "$number"
  row_json=$(enrich_cached_row_with_ci_merge "$row_json" "$number")
  row_json=$(enrich_cached_row_with_viewed_files "$row_json" "$number")
  emit_pr_progress_marker 'END' "$number"
  printf '%s' "$row_json"
}

build_pr_source_fingerprint() {
  local number="$1"
  local detail_json comments_json reviews_json requested_reviewers_json commits_json assignees_json threads_json review_comments_json review_url_map_json viewed_files_stats_json ci_merge_json

  [[ -z "$number" || "$number" == 'null' ]] && return 0

  detail_json=$(cat "$DETAIL_CACHE_DIR/$number.json" 2>/dev/null || echo '{}')
  comments_json=$(printf '%s' "$detail_json" | jq -c '.comments // []' 2>/dev/null || echo '[]')
  reviews_json=$(printf '%s' "$detail_json" | jq -c '.reviews // []' 2>/dev/null || echo '[]')
  requested_reviewers_json=$(printf '%s' "$detail_json" | jq -c '.reviewRequests // []' 2>/dev/null || echo '[]')
  commits_json=$(printf '%s' "$detail_json" | jq -c '.commits // []' 2>/dev/null || echo '[]')
  assignees_json=$(printf '%s' "$detail_json" | jq -c '.assignees // []' 2>/dev/null || echo '[]')
  threads_json=$(cat "$THREAD_CACHE_DIR/$number.json" 2>/dev/null || echo '[]')
  review_comments_json=$(cat "$REVIEW_COMMENT_CACHE_DIR/$number.json" 2>/dev/null || echo '[]')
  review_url_map_json=$(cat "$REVIEW_URL_CACHE_DIR/$number.json" 2>/dev/null || echo '{}')
  viewed_files_stats_json=$(cat "$FILES_CACHE_DIR/$number.json" 2>/dev/null || echo '{}')
  ci_merge_json=$(cat "$CI_MERGE_CACHE_DIR/$number.json" 2>/dev/null || echo '{}')

  build_pr_source_fingerprint_value \
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
    "$ci_merge_json"
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

parse_number_list() {
  local raw="$1"
  local out=''
  IFS=',' read -r -a parts <<<"$raw"
  for part in "${parts[@]}"; do
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

  if [[ "$REPO" != */* ]]; then
    echo "Invalid --repo value: $REPO (expected owner/name)" >&2
    exit 1
  fi

  REPO_OWNER="${REPO%%/*}"
  REPO_NAME="${REPO##*/}"
  debug_log "parsed repo=$REPO open_mode=$OPEN_MODE limit=$LIMIT merged_limit_set=$MERGED_LIMIT_SET jobs=$JOBS target_pr=${TARGET_PR_NUMBER:-none}"

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

  if [[ "$ACK_ENABLED" -eq 1 ]]; then
    ACK_NUMBERS=$(parse_number_list_or_fail "$ACK_RAW_INPUT" '--ack')
  fi

  ensure_ack_store
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

  if [[ "$ACK_CLEAR_ENABLED" -eq 1 ]]; then
    ACK_CLEAR_NUMBERS=$(parse_number_list_or_fail "$ACK_CLEAR_RAW_INPUT" '--ack-clear')
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

  if [[ -n "$TARGET_PR_NUMBER" ]]; then
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
  viewed_files_fresh_cache_tmp=0
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
  if [[ -z "$VIEWED_FILES_FRESH_CACHE_DIR" ]]; then
    VIEWED_FILES_FRESH_CACHE_DIR=$(mktemp -d)
    viewed_files_fresh_cache_tmp=1
  fi

  if [[ "$detail_cache_tmp" -eq 1 || "$thread_cache_tmp" -eq 1 || "$files_cache_tmp" -eq 1 || "$review_url_cache_tmp" -eq 1 || "$review_comment_cache_tmp" -eq 1 || "$ci_merge_cache_tmp" -eq 1 || "$viewed_files_fresh_cache_tmp" -eq 1 ]]; then
    cleanup_cmd=''
    if [[ "$detail_cache_tmp" -eq 1 ]]; then
      cleanup_cmd+=' "$DETAIL_CACHE_DIR"'
    fi
    if [[ "$thread_cache_tmp" -eq 1 ]]; then
      cleanup_cmd+=' "$THREAD_CACHE_DIR"'
    fi
    if [[ "$files_cache_tmp" -eq 1 ]]; then
      cleanup_cmd+=' "$FILES_CACHE_DIR"'
    fi
    if [[ "$review_url_cache_tmp" -eq 1 ]]; then
      cleanup_cmd+=' "$REVIEW_URL_CACHE_DIR"'
    fi
    if [[ "$review_comment_cache_tmp" -eq 1 ]]; then
      cleanup_cmd+=' "$REVIEW_COMMENT_CACHE_DIR"'
    fi
    if [[ "$ci_merge_cache_tmp" -eq 1 ]]; then
      cleanup_cmd+=' "$CI_MERGE_CACHE_DIR"'
    fi
    if [[ "$viewed_files_fresh_cache_tmp" -eq 1 ]]; then
      cleanup_cmd+=' "$VIEWED_FILES_FRESH_CACHE_DIR"'
    fi
    trap "rm -rf${cleanup_cmd}" EXIT
  fi

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

  # Prioritize data needed for open/draft rows so visible updates land sooner in the UI.
  run_prefetch_tasks_concurrently "$VIEW_PRS_PREFETCH_GROUP_CONCURRENCY" \
    prefetch_pr_details "$STALE_OPEN_DRAFT_PR_NUMBERS" \
    prefetch_review_threads "$STALE_OPEN_DRAFT_PR_NUMBERS" \
    prefetch_review_comments "$STALE_OPEN_DRAFT_PR_NUMBERS" \
    prefetch_review_urls "$STALE_OPEN_DRAFT_PR_NUMBERS" \
    prefetch_viewed_files_stats "$STALE_OPEN_DRAFT_PR_NUMBERS" \
    prefetch_ci_merge_stats "$current_open_numbers"

  if [[ "${VIEW_PRS_SKIP_UNCHANGED:-0}" == '1' ]]; then
    run_prefetch_tasks_concurrently "$VIEW_PRS_PREFETCH_GROUP_CONCURRENCY" \
      prefetch_viewed_files_stats_fresh "$current_open_numbers"
  fi

  deferred_prefetch_pid=''
  closed_merged_stale_numbers=$(
    {
      printf '%s\n' "$STALE_CLOSED_PR_NUMBERS"
      printf '%s\n' "$STALE_MERGED_PR_NUMBERS"
    } | awk 'NF' | sort -u
  )

  if [[ -n "$closed_merged_stale_numbers" || "${VIEW_PRS_SKIP_UNCHANGED:-0}" == '1' ]]; then
    (
      run_prefetch_tasks_concurrently "$VIEW_PRS_PREFETCH_GROUP_CONCURRENCY" \
        prefetch_pr_details "$closed_merged_stale_numbers" \
        prefetch_review_threads "$closed_merged_stale_numbers" \
        prefetch_review_comments "$closed_merged_stale_numbers" \
        prefetch_review_urls "$closed_merged_stale_numbers" \
        prefetch_viewed_files_stats "$closed_merged_stale_numbers"

      if [[ "${VIEW_PRS_SKIP_UNCHANGED:-0}" == '1' ]]; then
        run_prefetch_tasks_concurrently "$VIEW_PRS_PREFETCH_GROUP_CONCURRENCY" \
          prefetch_pr_details "$current_closed_numbers" \
          prefetch_review_threads "$current_closed_numbers" \
          prefetch_review_comments "$current_closed_numbers" \
          prefetch_review_urls "$current_closed_numbers" \
          prefetch_viewed_files_stats "$current_closed_numbers" \
          prefetch_ci_merge_stats "$current_closed_numbers" \
          prefetch_pr_details "$current_merged_numbers" \
          prefetch_review_threads "$current_merged_numbers" \
          prefetch_review_comments "$current_merged_numbers" \
          prefetch_review_urls "$current_merged_numbers" \
          prefetch_viewed_files_stats "$current_merged_numbers" \
          prefetch_ci_merge_stats "$current_merged_numbers"
      fi
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

    row_json=$(get_pr_row_json "$pr_json" 'open')
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

    row_json=$(get_pr_row_json "$pr_json" 'draft')
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

    row_json=$(get_pr_row_json "$pr_json" 'closed')

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

    row_json=$(get_pr_row_json "$pr_json" 'merged')

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
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
