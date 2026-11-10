# shellcheck shell=bash
# The data folder (README "Data folder"), as src/server/config/data-dir.js
# finds it - sourced by check-open-pr-updates.sh and backfill-missing-bg.sh.
#
# resolve_data_dir <app folder>: prints the first of DATA_DIR (the
# scripts' own name for it - the server always passes its data folder in
# it, and a test can point a run elsewhere), VIEW_PRS_DATA_DIR from the
# environment, it from the app's .env, else the app's data/. A relative
# path is from the app's folder. Runs on bash 3.2.
resolve_data_dir() {
  local app_dir="$1"
  local setting="${DATA_DIR:-${VIEW_PRS_DATA_DIR:-}}"
  if [[ -z "$setting" && -f "$app_dir/.env" ]]; then
    setting=$(sed -n 's/^[[:space:]]*VIEW_PRS_DATA_DIR[[:space:]]*=[[:space:]]*//p' "$app_dir/.env" | tail -n 1 | tr -d '\r')
    # A quoted value's contents, else up to a " #" comment (as Node's .env
    # loader and data-dir.js read it).
    case "$setting" in
      \"*) setting="${setting#\"}" && setting="${setting%%\"*}" ;;
      \'*) setting="${setting#\'}" && setting="${setting%%\'*}" ;;
      *) setting=$(printf '%s' "$setting" | sed -e 's/[[:space:]][[:space:]]*#.*$//' -e 's/[[:space:]]*$//') ;;
    esac
  fi
  case "$setting" in
    '') printf '%s\n' "$app_dir/data" ;;
    /* | [A-Za-z]:[\\/]*) printf '%s\n' "$setting" ;;
    *) printf '%s\n' "$app_dir/$setting" ;;
  esac
}
