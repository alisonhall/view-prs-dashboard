#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/data/backfill-missing.pid"
LOG_FILE="$SCRIPT_DIR/data/backfill-missing.log"

MAX_PRS="${BACKFILL_MAX_PRS:-100}"
DELAY_MS="${BACKFILL_DELAY_MS:-3000}"
JOBS="${BACKFILL_JOBS:-1}"
CONCURRENCY="${BACKFILL_CONCURRENCY:-2}"
EXTRA_ARGS="${BACKFILL_EXTRA_ARGS:-}"

is_running_pid() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  ps -p "$pid" >/dev/null 2>&1
}

pid_matches_backfill() {
  local pid="$1"
  local cmd
  cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
  [[ "$cmd" == *"backfill-missing-data.js"* ]]
}

read_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  cat "$PID_FILE"
}

cleanup_stale_pid_file() {
  local pid
  pid=$(read_pid || true)
  [[ -n "$pid" ]] || return 0
  if ! is_running_pid "$pid" || ! pid_matches_backfill "$pid"; then
    rm -f "$PID_FILE"
  fi
}

start_backfill() {
  mkdir -p "$SCRIPT_DIR/data"
  cleanup_stale_pid_file

  local existing_pid
  existing_pid=$(read_pid || true)
  if [[ -n "$existing_pid" ]] && is_running_pid "$existing_pid" && pid_matches_backfill "$existing_pid"; then
    echo "Backfill is already running (PID: $existing_pid)."
    echo "Log: $LOG_FILE"
    return 0
  fi

  # shellcheck disable=SC2086
  nohup node "$SCRIPT_DIR/backfill-missing-data.js" --max-prs "$MAX_PRS" --delay-ms "$DELAY_MS" --jobs "$JOBS" --concurrency "$CONCURRENCY" $EXTRA_ARGS >"$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" >"$PID_FILE"

  echo "Started background backfill (PID: $pid)."
  echo "Log: $LOG_FILE"
}

stop_backfill() {
  cleanup_stale_pid_file

  local pid
  pid=$(read_pid || true)
  if [[ -z "$pid" ]]; then
    echo "Backfill is not running."
    return 0
  fi

  if ! is_running_pid "$pid" || ! pid_matches_backfill "$pid"; then
    rm -f "$PID_FILE"
    echo "Backfill is not running."
    return 0
  fi

  kill "$pid" >/dev/null 2>&1 || true

  local tries=0
  while is_running_pid "$pid" && ((tries < 20)); do
    sleep 0.2
    tries=$((tries + 1))
  done

  if is_running_pid "$pid"; then
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi

  rm -f "$PID_FILE"
  echo "Stopped background backfill (PID: $pid)."
}

status_backfill() {
  cleanup_stale_pid_file

  local pid
  pid=$(read_pid || true)
  if [[ -z "$pid" ]]; then
    echo "Backfill status: not running"
    return 0
  fi

  if is_running_pid "$pid" && pid_matches_backfill "$pid"; then
    echo "Backfill status: running (PID: $pid)"
    echo "Log: $LOG_FILE"
    return 0
  fi

  rm -f "$PID_FILE"
  echo "Backfill status: not running"
}

usage() {
  cat <<'EOF'
Usage: backfill-missing-bg.sh <start|stop|status>

Environment variables:
  BACKFILL_MAX_PRS    Max PR rows per run (default: 100)
  BACKFILL_DELAY_MS   Delay between PR refreshes in ms (default: 3000)
  BACKFILL_JOBS       --jobs passed to refresh script (default: 1)
  BACKFILL_CONCURRENCY Number of parallel backfill workers (default: 2)
  BACKFILL_EXTRA_ARGS Extra args passed to backfill-missing-data.js (optional)
EOF
}

cmd="${1:-status}"
case "$cmd" in
  start)
    start_backfill
    ;;
  stop)
    stop_backfill
    ;;
  status)
    status_backfill
    ;;
  *)
    usage
    exit 1
    ;;
esac
