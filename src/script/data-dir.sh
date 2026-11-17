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
    # "export VIEW_PRS_DATA_DIR=..." too, as Node's loader takes it.
    setting=$(sed -n -e 's/^[[:space:]]*export[[:space:]][[:space:]]*/ /' -e 's/^[[:space:]]*VIEW_PRS_DATA_DIR[[:space:]]*=[[:space:]]*//p' "$app_dir/.env" | tail -n 1 | tr -d '\r')
    # As Node's .env loader (the server's) and data-dir.js read it: a quoted
    # value's contents up to the first closing quote, with \n a new line
    # inside double quotes; else up to any #. (Both strings in variables:
    # bash 3.2 reads $'...' and \\ in a quoted ${//} differently.)
    local backslash_n='\n' newline=$'\n'
    case "$setting" in
      \"*\"*) setting="${setting#\"}" && setting="${setting%%\"*}" && setting="${setting//"$backslash_n"/$newline}" ;;
      \'*\'*) setting="${setting#\'}" && setting="${setting%%\'*}" ;;
      \`*\`*) setting="${setting#\`}" && setting="${setting%%\`*}" ;;
      *) setting=$(printf '%s' "$setting" | sed -e 's/#.*$//' -e 's/[[:space:]]*$//') ;;
    esac
  fi
  # ~ is your home folder (as data-dir.js reads it).
  case "$setting" in
    "~" | "~/"* | "~\\"*) setting="$HOME${setting:1}" ;;
  esac
  # On Windows (Git Bash) a Windows path - the server passes its folder as
  # one - is made bash's (/d/...): a backslash is an escape character in the
  # script's file patterns, so D:\...\backups/*.bak would match nothing.
  if command -v cygpath >/dev/null 2>&1; then
    case "$setting" in
      *\\* | [A-Za-z]:*) setting=$(cygpath -u "$setting") ;;
    esac
  fi
  case "$setting" in
    '') printf '%s\n' "$app_dir/data" ;;
    /* | [A-Za-z]:[\\/]*) printf '%s\n' "$setting" ;;
    *) printf '%s\n' "$app_dir/$setting" ;;
  esac
}

# data_dir_problem <app folder> <data folder>: prints why not to run with
# this data folder, and succeeds, when it's set elsewhere but doesn't exist
# while the app's data/ still holds the data (data-dir.js's
# findDataDirProblem: set before the data was moved, or mistyped).
data_dir_problem() {
  local app_dir="$1" data_dir="$2"
  [[ "$data_dir" == "$app_dir/data" || -d "$data_dir" ]] && return 1
  [[ -f "$app_dir/data/check-open-pr-updates.data.json" ]] || return 1
  printf '%s\n' "The data folder $data_dir (VIEW_PRS_DATA_DIR) doesn't exist, and your data is still in $app_dir/data. Move it there with \`npm run data:move -- <folder>\`, fix the setting, or create the folder to start with no data."
}
