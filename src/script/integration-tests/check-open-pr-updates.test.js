const { execFileSync } = require("child_process");
const path = require("path");

const scriptDir = path.join(__dirname, "..");
const scriptPath = path.join(scriptDir, "check-open-pr-updates.sh");

const runShell = (command) =>
  execFileSync("bash", ["-c", command], {
    cwd: scriptDir,
    encoding: "utf8",
    env: { ...process.env, BASH_ENV: "" },
  }).trim();

// check-open-pr-updates.sh defaults USER_STATE_FILE to
// $VIEW_PRS_DIR/data/check-open-pr-updates.user-state.json, and several
// helpers (get_ack_ts, get_reverify_required, get_in_review_required) read
// it directly via jq. On a real dev machine that file already exists (from
// having run the script for real), masking the fact that this suite never
// isolates it - on a fresh checkout (data/ is gitignored) jq fails against
// the missing file and compute_pr_state_json aborts. Point every sourced
// command at an isolated, empty-but-valid state file instead.
const isolatedUserStateFile = runShell("mktemp");
runShell(`printf '%s' '{}' > "${isolatedUserStateFile}"`);

// The row's computation (compute_pr_state_json's, before it moved there).
const { computePrRow, buildReasons, buildActivityEvents, buildActivityTimelineSummary, normalizeCommits } = require("../compute-pr-row");

const runScriptFn = (expression) =>
  runShell(`source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}"; ${expression}`);

// Fake GitHub pages for a fetch helper, one file each: gh_with_retry
// answers with the page its request names (page=N for REST, the cursor
// for GraphQL), so no fetch goes through the command line it used to.
const withFakePages = (pages, expression) => {
  const fs = require("fs");
  const os = require("os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-pages-"));
  pages.forEach((page, index) => fs.writeFileSync(path.join(dir, `${index + 1}.json`), JSON.stringify(page)));
  const bashDir = dir.replace(/\\/g, "/");
  try {
    return runScriptFn(`
      PAGES="${bashDir}"; REPO_OWNER=o; REPO_NAME=r; REVIEW_COMMENT_CACHE_DIR=$(mktemp -d); REVIEW_URL_CACHE_DIR=$(mktemp -d); FILES_CACHE_DIR=$(mktemp -d)
      gh_with_retry() {
        local arg page=1
        for arg in "$@"; do
          case "$arg" in
            *page=*) page=\${arg##*page=} ;;
            after=*) page=\${arg#after=} ;;
          esac
        done
        cat "$PAGES/$page.json"
      }
      ${expression}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe("fetches too big for a command line", () => {
  test("review comments: every page, though one page is past 32 KB", () => {
    const comment = (id) => ({ id, user: { login: "bob" }, body: "x", created_at: "2026-03-01T00:00:00Z", diff_hunk: "@@ -1 +1 @@\n" + "y".repeat(3000), pull_request_review_id: 1 });
    const pages = [Array.from({ length: 100 }, (_, i) => comment(i)), [comment(100), comment(101)]];
    expect(withFakePages(pages, `fetch_pr_review_comments_json 5 | jq 'length'`)).toBe("102");
  });

  describe("a PR's commits past gh's 100", () => {
    const gqlCommit = (i) => ({
      commit: {
        oid: `c${i}`,
        authoredDate: "2026-03-01T00:00:00Z",
        committedDate: "2026-03-01T00:00:00Z",
        messageHeadline: `commit ${i}`,
        messageBody: "",
        authors: { nodes: [{ email: "a@x", name: "Alice", user: { id: "U1", login: "alice" } }, { email: "g@x", name: "Ghost", user: null }] },
      },
    });
    // 250 commits, all GitHub returns of the PR's 389: pages of 100, 100
    // and 50.
    const pages = [0, 1, 2].map((p) => ({
      data: {
        repository: {
          pullRequest: {
            commits: {
              totalCount: 389,
              nodes: Array.from({ length: p < 2 ? 100 : 50 }, (_, i) => gqlCommit(p * 100 + i)),
              pageInfo: { hasNextPage: p < 2, endCursor: String(p + 2) },
            },
          },
        },
      },
    }));
    const detailWith = (count) => JSON.stringify({ comments: [], commits: Array.from({ length: count }, (_, i) => ({ oid: `c${i}` })) });

    test("are all fetched, in gh pr view's shape, with how many the PR has", () => {
      const output = withFakePages(
        pages,
        `complete_pr_detail_commits '${detailWith(100)}' 5 | jq -c '{n: (.commits | length), total: .commitTotalCount, last: .commits[-1].oid, first: .commits[0]}'`,
      );
      expect(JSON.parse(output)).toEqual({
        n: 250,
        total: 389,
        last: "c249",
        first: {
          authoredDate: "2026-03-01T00:00:00Z",
          authors: [
            { email: "a@x", id: "U1", login: "alice", name: "Alice" },
            { email: "g@x", id: "", login: "", name: "Ghost" },
          ],
          committedDate: "2026-03-01T00:00:00Z",
          messageBody: "",
          messageHeadline: "commit 0",
          oid: "c0",
        },
      });
    });

    test("under 100, the details are kept as they are, with no fetch", () => {
      expect(withFakePages([], `complete_pr_detail_commits '${detailWith(99)}' 5 | jq -c '[(.commits | length), .commitTotalCount]'`)).toBe("[99,null]");
    });

    test("without a totalCount, the total is what was fetched", () => {
      const untotalled = pages.map((page) => {
        const { totalCount, ...commits } = page.data.repository.pullRequest.commits;
        return { data: { repository: { pullRequest: { commits } } } };
      });
      expect(withFakePages(untotalled, `complete_pr_detail_commits '${detailWith(100)}' 5 | jq -c '.commitTotalCount'`)).toBe("250");
    });

    test("a page that can't be fetched: no details, so the stored row stays", () => {
      expect(withFakePages([pages[0]], `complete_pr_detail_commits '${detailWith(100)}' 5 >/dev/null && echo ok || echo failed`)).toBe("failed");
    });
  });

  test("review links: every page, and a path Git Bash won't rewrite into a Windows one", () => {
    const review = (i) => ({ submitted_at: `2026-03-01T00:00:${String(i % 60).padStart(2, "0")}Z`, user: { login: `u${i}` }, html_url: `https://github.com/o/r/pull/5#pullrequestreview-${i}` });
    const pages = [Array.from({ length: 100 }, (_, i) => review(i)), [review(100), review(101)]];
    // --paginate prints the pages one after another.
    const output = withFakePages(pages, `
      gh_with_retry() {
        local arg
        for arg in "$@"; do [[ "$arg" == /* ]] && { echo "leading slash: $arg" >&2; return 1; }; done
        cat "$PAGES/1.json" "$PAGES/2.json"
      }
      fetch_pr_review_url_map_json 5 | jq -c '[length, ."2026-03-01T00:00:41Z_u101"]'`);
    expect(output).toBe('[102,"https://github.com/o/r/pull/5#pullrequestreview-101"]');
  });

  test("viewed files: every file of a PR with over a thousand", () => {
    const pages = Array.from({ length: 12 }, (_, p) => ({
      data: {
        repository: {
          pullRequest: {
            changedFiles: 1200,
            files: {
              nodes: Array.from({ length: 100 }, (_, i) => ({ viewerViewedState: i % 2 === 0 ? "VIEWED" : "UNVIEWED" })),
              pageInfo: { hasNextPage: p < 11, endCursor: String(p + 2) },
            },
          },
        },
      },
    }));
    expect(withFakePages(pages, `fetch_pr_viewed_files_stats_json 5`)).toBe('{"changedFiles":1200,"viewedFiles":600}');
  });
});

describe("check-open-pr-updates shell helper behavior", () => {
  test("a row's source fingerprint is a versioned SHA-256 digest", () => {
    const { row } = computePrRow({ pr: { number: 1 }, viewedFilesStats: { changedFiles: 0, viewedFiles: 0 } });
    expect(row.sourceFingerprint).toMatch(/^fp:v2:sha256:[a-f0-9]{64}$/);
  });

  test("returns First Last when normalize_author_name receives Last, First input", () => {
    const output = runScriptFn(
      `normalize_author_name "kshar280_uhg" "Sharma, Karan"`,
    );

    expect(output).toBe("Karan Sharma");
  });

  test("returns the login when normalize_author_name receives an empty author name", () => {
    const output = runScriptFn(`normalize_author_name "ahall236_uhg" ""`);

    expect(output).toBe("ahall236_uhg");
  });

  test("REPO defaults to empty (not a crash) when VIEW_PRS_REPO is unset, and the real validation catches it with a clear message", () => {
    // Explicitly unset, rather than relying on the ambient test env not
    // having it set: this exercises the `set -u`-safety fix directly (a
    // bare `"${VIEW_PRS_REPO}"` here would abort with "unbound variable"
    // before REPO is even assigned, breaking --help along with everything
    // else - see the script's own comment on this line).
    const output = execFileSync(
      "bash",
      ["-c", `unset VIEW_PRS_REPO; source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";echo "[$REPO]"`],
      { cwd: scriptDir, encoding: "utf8", env: { ...process.env, BASH_ENV: "" } },
    ).trim();
    expect(output).toBe("[]");

    // main() calls `exit 1` directly on a missing repo, which terminates
    // the shell immediately (not interceptable with `|| true`) - so this
    // expects the real thrown execFileSync error and reads its stderr,
    // same as this suite's other exit-1-path assertions.
    let thrown = null;
    try {
      execFileSync(
        "bash",
        ["-c", `unset VIEW_PRS_REPO; source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";main --open none`],
        { cwd: scriptDir, encoding: "utf8", env: { ...process.env, BASH_ENV: "" } },
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown.stderr).toContain("No repo specified");
  });

  test("REPO uses VIEW_PRS_REPO when set, so a different repo can be targeted without editing the script", () => {
    const output = runShell(
      `VIEW_PRS_REPO='someone-else/their-repo'; source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";echo "$REPO"`,
    );
    expect(output).toBe("someone-else/their-repo");
  });

  test("the --repo CLI flag still overrides VIEW_PRS_REPO", () => {
    const output = runShell(
      `VIEW_PRS_REPO='someone-else/their-repo'; source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";parse_args --repo cli-wins/repo; echo "$REPO"`,
    );
    expect(output).toBe("cli-wins/repo");
  });

  test("a row's commits leave out merges of main", () => {
    const commits = normalizeCommits({
      commits: [
        { oid: "a1", committedDate: "2026-03-03T00:00:00Z", messageHeadline: "Merge branch 'main' into feature/test", authors: [{ login: "other" }] },
        { oid: "a2", committedDate: "2026-03-03T01:00:00Z", messageHeadline: "feat: keep this commit", authors: [{ login: "other" }] },
      ],
    });
    expect(commits.map((commit) => commit.oid)).toEqual(["a2"]);
  });

  test("the viewer's own commit counts as their last activity, so earlier comments aren't new", () => {
    const { row } = computePrRow({
      pr: { number: 1 },
      viewerLogin: "me",
      detail: {
        comments: [{ author: { login: "other" }, createdAt: "2026-03-02T00:00:00Z" }],
        commits: [{ oid: "a1", committedDate: "2026-03-03T00:00:00Z", messageHeadline: "feat: mine", authors: [{ login: "other" }, { login: "me" }] }],
      },
      viewedFilesStats: { changedFiles: 0, viewedFiles: 0 },
    });
    expect(row.baseline).toBe("2026-03-03T00:00:00Z");
    expect(row.status).toBe("NO_CHANGE");
  });

  describe("commits after the one the viewer reviewed", () => {
    // Committed at 10:00, the viewer reviewed "r1" at 11:00, pushed at 12:00.
    const lateCommitRow = (extra = {}) =>
      computePrRow({
        pr: { number: 1, author: { login: "alice" } },
        viewerLogin: "me",
        detail: {
          reviews: [{ author: { login: "me" }, state: "COMMENTED", submittedAt: "2026-03-01T11:00:00Z", commit: { oid: "r1" } }],
          commits: [
            { oid: "r1", committedDate: "2026-03-01T09:00:00Z", messageHeadline: "feat: first", authors: [{ login: "alice" }] },
            { oid: "x2", committedDate: "2026-03-01T10:00:00Z", messageHeadline: "fix: review", authors: [{ login: "alice" }] },
          ],
          ...extra.detail,
        },
        viewedFilesStats: { changedFiles: 0, viewedFiles: 0 },
        ...extra.input,
      }).row;

    test("count as new though made before the review, and are listed for the Activity tab", () => {
      const row = lateCommitRow();
      expect(row.status).toBe("CHANGED");
      expect(row.reason).toBe("commit");
      expect(row.commitsAfterReview).toEqual(["x2"]);
    });

    test("don't count once an ack after them is the baseline", () => {
      const row = lateCommitRow({ input: { ackAt: "2026-03-01T13:00:00Z" } });
      expect(row.status).toBe("NO_CHANGE");
      expect(row.commitsAfterReview).toEqual([]);
    });

    test("a PR with more commits than its details hold says how many (GitHub returns 250 at most); one without, doesn't", () => {
      expect(lateCommitRow({ detail: { commitTotalCount: 389 } }).commitTotalCount).toBe(389);
      expect(lateCommitRow({ detail: { commitTotalCount: 2 } })).not.toHaveProperty("commitTotalCount");
      expect(lateCommitRow()).not.toHaveProperty("commitTotalCount");
    });

    test("go by date when the reviewed commit is gone (a force-push)", () => {
      const row = lateCommitRow({
        detail: {
          commits: [{ oid: "y1", committedDate: "2026-03-01T10:00:00Z", messageHeadline: "feat: rebased", authors: [{ login: "alice" }] }],
        },
      });
      expect(row.status).toBe("NO_CHANGE");
    });
  });

  describe("reviews on the viewer's own PR", () => {
    const ownPrRow = (review) =>
      computePrRow({
        pr: { number: 2, author: { login: "me" } },
        viewerLogin: "me",
        detail: {
          comments: [{ author: { login: "me" }, createdAt: "2026-03-01T09:00:00Z" }],
          reviews: [{ author: { login: "bob" }, submittedAt: "2026-03-01T11:00:00Z", ...review }],
        },
        viewedFilesStats: { changedFiles: 0, viewedFiles: 0 },
      }).row;

    test("a changes-requested review marks it changed", () => {
      const row = ownPrRow({ state: "CHANGES_REQUESTED", body: "" });
      expect(row.status).toBe("CHANGED");
      expect(row.reason).toBe("review");
    });

    test("a commented review with a body marks it changed", () => {
      expect(ownPrRow({ state: "COMMENTED", body: "Some thoughts" }).reason).toBe("review");
    });

    test("an approval, or the empty review GitHub wraps an inline comment in, doesn't", () => {
      expect(ownPrRow({ state: "APPROVED", body: "LGTM" }).status).toBe("NO_CHANGE");
      expect(ownPrRow({ state: "COMMENTED", body: "  " }).status).toBe("NO_CHANGE");
    });
  });

  test("the Ack history: every Ack kept, Clear Ack takes back only the current one, new activity clearing it keeps it", () => {
    const fs = require("fs");
    const os = require("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ack-history-"));
    const stateFile = path.join(dir, "user-state.json").replace(/\\/g, "/");
    // An Ack from before there was a history.
    fs.writeFileSync(stateFile, JSON.stringify({ notesByPrNumber: {}, ackByRepo: { "o/r": { 5: "2026-01-01T00:00:00Z" } }, reverifyByRepo: {}, inReviewByRepo: {}, flaggedByRepo: {} }));
    const step = (command) =>
      JSON.parse(
        runShell(
          `source "${scriptPath}"; USER_STATE_FILE="${stateFile}"; STATE_BACKUP_DIR="${dir.replace(/\\/g, "/")}/backups"; REPO=o/r; ${command}; jq -c '{ack: .ackByRepo["o/r"]["5"], history: .ackHistoryByRepo["o/r"]["5"]}' "$USER_STATE_FILE"`,
        ),
      );
    try {
      expect(step("set_ack_ts 5 2026-01-02T00:00:00Z")).toEqual({ ack: "2026-01-02T00:00:00Z", history: ["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"] });
      expect(step("clear_ack_ts 5")).toEqual({ ack: null, history: ["2026-01-01T00:00:00Z"] });
      expect(step("set_ack_ts 5 2026-01-03T00:00:00Z")).toEqual({ ack: "2026-01-03T00:00:00Z", history: ["2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z"] });
      expect(step("clear_ack_ts 5 false")).toEqual({ ack: null, history: ["2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z"] });
      // Nothing current to take back.
      expect(step("clear_ack_ts 5")).toEqual({ ack: null, history: ["2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z"] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // Also without BASHPID, as on bash 3.2 (macOS's /bin/bash), where set -u
  // failed on it: unsetting it in bash 4+ takes away its special meaning.
  test.each([
    ["", "bash 4+"],
    ["unset BASHPID; ", "without BASHPID (bash 3.2)"],
  ])("a run stopped with SIGTERM lets go of the locks it holds, a subshell's too, and removes its temporary caches - %s%s", (unsetBashPid) => {
    const fs = require("fs");
    const os = require("os");
    const { spawnSync } = require("child_process");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exit-locks-")).replace(/\\/g, "/");
    // As main does (MAIN_SHELL_PID, set_exit_traps), with the locks and a
    // cache in the temporary folder.
    const setup = `${unsetBashPid}source "${scriptPath}"; PR_STATE_LOCK_DIR="${dir}/data.lock"; USER_STATE_LOCK_DIR="${dir}/user-state.lock"; set_current_shell_pid; MAIN_SHELL_PID=$CURRENT_SHELL_PID; set_exit_traps; mkdir "${dir}/cache"; EXIT_CLEANUP_PATHS+=("${dir}/cache")`;
    const run = (command) =>
      spawnSync("bash", ["-c", `${setup}; ${command}`], { cwd: scriptDir, encoding: "utf8", env: { ...process.env, BASH_ENV: "" } });
    const killSelf = "set_current_shell_pid; kill -TERM $CURRENT_SHELL_PID";
    try {
      // The main shell, stopped while it holds the PR-data lock.
      const stopped = run(`acquire_pr_state_lock; ${killSelf}; sleep 5`);
      expect(stopped.status).toBe(143);
      expect(fs.existsSync(`${dir}/data.lock`)).toBe(false);
      expect(fs.existsSync(`${dir}/cache`)).toBe(false);

      // A $(...) subshell (as get_pr_row_json's clear_ack_ts is), stopped
      // while it holds the user-state lock: it lets go of that, and leaves
      // main's caches to main, which carries on.
      const sub = run(`out=$(acquire_user_state_lock; ${killSelf}; sleep 5) || true; [[ -d "${dir}/user-state.lock" ]] && echo lock-held; [[ -d "${dir}/cache" ]] && echo cache-kept; true`);
      expect(sub.stdout.trim()).toBe("cache-kept");
      expect(fs.existsSync(`${dir}/cache`)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("main starts without BASHPID (bash 3.2, macOS's /bin/bash)", () => {
    const { spawnSync } = require("child_process");
    const result = spawnSync("bash", ["-c", `unset BASHPID; source "${scriptPath}"; main --help`], {
      cwd: scriptDir,
      encoding: "utf8",
      env: { ...process.env, BASH_ENV: "" },
    });

    expect(result.stderr).not.toMatch(/unbound variable/);
    expect(result.status).toBe(0);
  });

  test("a row's reason lists the kinds of change with any count", () => {
    expect(buildReasons([["comment", 0], ["review", 2], ["commit", 1]])).toBe("review|commit");
  });

  test("returns newline-separated PR numbers when parse_number_list receives comma-separated input", () => {
    const output = runScriptFn(`parse_number_list "912, 913,914"`);

    expect(output).toBe("912\n913\n914");
  });

  test("throws when parse_number_list receives an invalid PR number", () => {
    expect(() => runScriptFn(`parse_number_list "912,bad"`)).toThrow();
  });

  test("returns newline-separated labels when parse_label_list receives comma-separated input", () => {
    const output = runScriptFn(`parse_label_list "bug, frontend,  blocked "`);

    expect(output).toBe("bug\nfrontend\nblocked");
  });

  test("given additions and deletions in PR payload, when compute_pr_state_json builds the row, then line-change counts are persisted", () => {
    const prJson = JSON.stringify({
      number: 321,
      title: "Line stats",
      url: "https://github.com/owner/repo/pull/321",
      mergedAt: null,
      closedAt: null,
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-02T00:00:00Z",
      headRefName: "feature/line-stats",
      baseRefName: "main",
      additions: 37,
      deletions: 12,
      labels: [],
      author: { login: "octocat", name: "Octo Cat" },
      mergedBy: null,
    });

    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEWER_LOGIN='alice'; REPO='owner/repo'; emit_pr_progress_marker(){ :; }; get_pr_detail_json(){ printf '%s' '{"comments":[],"reviews":[],"reviewRequests":[],"commits":[],"assignees":[],"statusCheckRollup":[],"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}'; }; fetch_review_threads_json(){ printf '%s' '[]'; }; fetch_pr_review_comments_json(){ printf '%s' '[]'; }; fetch_pr_review_url_map_json(){ printf '%s' '{}'; }; fetch_pr_viewed_files_stats_json(){ printf '%s' '{"viewedFiles":0,"changedFiles":0}'; }; compute_pr_state_json '${prJson}'`,
    );

    const parsed = JSON.parse(output);
    expect(parsed.number).toBe("321");
    expect(parsed.additions).toBe("37");
    expect(parsed.deletions).toBe("12");
  });

  test("builds a stable phase-1 detail sidecar file path", () => {
    const output = runScriptFn(
      `PR_DETAIL_DIR='/tmp/pr-details'; build_pr_detail_file_path 'Optum-Rx-ClinicalProducts/orx_cpp-mp-uis' '1234'`,
    );

    expect(output).toBe(
      "/tmp/pr-details/optum_rx_clinicalproducts_orx_cpp_mp_uis__pr-1234.json",
    );
  });

  test("attaches detailRef and writes sidecar detail payload for a PR row", () => {
    const detailDir = runShell("mktemp -d");
    const row = JSON.stringify({
      number: "123",
      title: "Example PR",
      activityTimeline: [{ date: "2026-06-02" }],
      activityEvents: [{ type: "comment" }],
      reviewThreads: [{ id: "thread-1" }],
      commentEvents: [{ type: "thread" }],
    });

    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";REPO='owner/repo'; VIEW_PRS_DIR='${scriptDir}/../..'; PR_DETAIL_DIR='${detailDir}'; attach_pr_detail_ref '${row}'`,
    );

    const parsed = JSON.parse(output);
    // Compared by basename, not full path: on Windows, jq is a native
    // (non-MSYS) binary, so Git Bash's MSYS layer auto-translates the POSIX
    // `detailDir` argument (from `mktemp -d`) into a Windows-style path
    // before jq ever sees it - jq then embeds that translated form in its
    // JSON output, which never textually matches `detailDir` itself even
    // though both refer to the same real file (confirmed below via `cat`,
    // which resolves either form correctly through bash/coreutils).
    expect(parsed.detailRef.version).toBe("v1");
    expect(parsed.detailRef.file.split("/").pop()).toBe("owner_repo__pr-123.json");
    expect(parsed.activityTimeline).toBeUndefined();
    expect(parsed.activityEvents).toBeUndefined();
    expect(parsed.reviewThreads).toBeUndefined();
    expect(parsed.commentEvents).toBeUndefined();

    const sidecar = JSON.parse(
      runShell(`cat "${detailDir}/owner_repo__pr-123.json"`),
    );
    expect(sidecar.activityTimeline).toHaveLength(1);
    expect(sidecar.activityEvents).toHaveLength(1);
    expect(sidecar.reviewThreads).toHaveLength(1);
    expect(sidecar.commentEvents).toHaveLength(1);
  });

  test("keeps existing pr-detail sidecar when incoming payload is empty by default", () => {
    const detailDir = runShell("mktemp -d");
    runShell(
      `cat > "${detailDir}/owner_repo__pr-123.json" <<'EOF'\n{"activityTimeline":[{"date":"2026-06-02"}],"activityEvents":[{"type":"comment"}],"reviewThreads":[{"id":"thread-1"}],"commentEvents":[{"type":"thread"}]}\nEOF`,
    );

    const row = JSON.stringify({
      number: "123",
      title: "Example PR",
      activityTimeline: [],
      activityEvents: [],
      reviewThreads: [],
      commentEvents: [],
    });

    runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";REPO='owner/repo'; VIEW_PRS_DIR='${scriptDir}/../..'; PR_DETAIL_DIR='${detailDir}'; attach_pr_detail_ref '${row}' >/dev/null`,
    );

    const sidecar = JSON.parse(
      runShell(`cat "${detailDir}/owner_repo__pr-123.json"`),
    );
    expect(sidecar.activityTimeline).toHaveLength(1);
    expect(sidecar.activityEvents).toHaveLength(1);
    expect(sidecar.reviewThreads).toHaveLength(1);
    expect(sidecar.commentEvents).toHaveLength(1);
  });

  test("omits empty tokens when parse_label_list receives blank label segments", () => {
    const output = runScriptFn(`parse_label_list "bug, , frontend,   "`);

    expect(output).toBe("bug\nfrontend");
  });

  test("preserves the target file when replace_state_file receives an empty payload", () => {
    const target = runShell("mktemp");
    const empty = runShell("mktemp");
    runShell(
      `printf '%s' '{"notesByPrNumber":{},"ackByRepo":{"owner/repo":{"123":"2026-05-15T14:49:25Z"}},"reverifyByRepo":{},"inReviewByRepo":{}}' > "${target}"`,
    );

    expect(() =>
      runShell(
        `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";replace_state_file "${empty}" "${target}" "user-state"`,
      ),
    ).toThrow();

    const after = runShell(`cat "${target}"`);
    expect(after).toContain('"ackByRepo"');
    expect(after).toContain('"owner/repo"');
  });

  test("preserves the target file when replace_state_file receives invalid JSON", () => {
    const target = runShell("mktemp");
    const invalid = runShell("mktemp");
    runShell(
      `printf '%s' '{"notesByPrNumber":{},"ackByRepo":{"owner/repo":{"123":"2026-05-15T14:49:25Z"}},"reverifyByRepo":{},"inReviewByRepo":{}}' > "${target}"`,
    );
    runShell(`printf '%s' 'not-json' > "${invalid}"`);

    expect(() =>
      runShell(
        `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";replace_state_file "${invalid}" "${target}" "user-state"`,
      ),
    ).toThrow();

    const after = runShell(`cat "${target}"`);
    expect(after).toContain('"ackByRepo"');
    expect(after).toContain('"owner/repo"');
  });

  describe("cache_shortcut_allowed_for_section behavior", () => {
    test.each([
      ["open section is enabled by default", "open", 0, "", "0"],
      ["VIEW_PRS_SKIP_UNCHANGED=0 turns it off", "open", 0, "0", "1"],
      ["open section is blocked during ack mode", "open", 1, "1", "1"],
      ["closed section is enabled by default", "closed", 0, "", "0"],
      ["merged section is enabled by default", "merged", 0, "", "0"],
    ])(
      "%s",
      (_label, section, ackEnabled, skipUnchanged, expectedResult) => {
        const output = runScriptFn(
          `ACK_ENABLED=${ackEnabled}; ACK_CLEAR_ENABLED=0; ACK_CHANGED=0; TARGET_PR_NUMBER=''; ${skipUnchanged ? `VIEW_PRS_SKIP_UNCHANGED='${skipUnchanged}';` : "unset VIEW_PRS_SKIP_UNCHANGED;"} if cache_shortcut_allowed_for_section ${section} >/dev/null 2>&1; then echo 0; else echo 1; fi`,
        );

        expect(output).toBe(expectedResult);
      },
    );
  });

  test("groups stale PR numbers by open/draft first for prioritized refresh", () => {
    const openPr = Buffer.from(
      JSON.stringify({ number: 102, isDraft: false, updatedAt: "2026-05-26T12:00:00Z" }),
    ).toString("base64");
    const draftPr = Buffer.from(
      JSON.stringify({ number: 103, isDraft: true, updatedAt: "2026-05-26T12:00:00Z" }),
    ).toString("base64");
    const closedPr = Buffer.from(
      JSON.stringify({ number: 201, isDraft: false, updatedAt: "2026-05-26T12:00:00Z" }),
    ).toString("base64");
    const mergedPr = Buffer.from(
      JSON.stringify({ number: 301, isDraft: false, updatedAt: "2026-05-26T12:00:00Z" }),
    ).toString("base64");

    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";get_cached_row_json_for_pr() { printf ''; }; collect_prioritized_stale_number_sets '${openPr}\n${draftPr}' '${closedPr}' '${mergedPr}'; printf 'OPEN_DRAFT=%s\nCLOSED=%s\nMERGED=%s\nALL=%s' "$STALE_OPEN_DRAFT_PR_NUMBERS" "$STALE_CLOSED_PR_NUMBERS" "$STALE_MERGED_PR_NUMBERS" "$STALE_ALL_PR_NUMBERS"`,
    );

    expect(output).toContain("OPEN_DRAFT=102");
    expect(output).toContain("103");
    expect(output).toContain("CLOSED=201");
    expect(output).toContain("MERGED=301");
    expect(output).toContain("ALL=102");
  });

  test("refreshes check and merge state when enrich_cached_row_with_ci_merge receives cached CI data", () => {
    const cacheDir = runShell("mktemp -d");
    runShell(
      `cat > "${cacheDir}/123.json" <<'EOF'\n{"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}],"mergeable":"MERGEABLE"}\nEOF`,
    );

    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";CI_MERGE_CACHE_DIR="${cacheDir}"; enrich_cached_row_with_ci_merge '{"number":123,"title":"PR title","checkState":"RUN","mergeState":"UNK","titleDisplay":"PR title [CHK:RUN][MRG:UNK]"}' "123"`,
    );

    const row = JSON.parse(output);
    expect(row.checkState).toBe("PASS");
    expect(row.mergeState).toBe("YES");
    expect(row.titleDisplay).toContain("[CHK:PASS][MRG:YES]");
  });

  test("keeps the row's own check and merge state when enrich_cached_row_with_ci_merge has no fresh CI data", () => {
    const cacheDir = runShell("mktemp -d");
    const row = '{"number":456,"title":"Another PR","checkState":"RUN","mergeState":"YES","titleDisplay":"Another PR [CHK:RUN][MRG:YES]"}';
    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";CI_MERGE_CACHE_DIR="${cacheDir}"; enrich_cached_row_with_ci_merge '${row}' "456"`,
    );

    expect(JSON.parse(output)).toEqual(JSON.parse(row));
  });

  // A full run reuses a stored row whose PR hasn't changed (step 3 of the
  // data-freshness plan in ROADMAP.md).
  describe("reusing a stored row in a full run", () => {
    const sourceUpdatedAt = "2026-05-26T12:00:00Z";
    const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
    // For the empty user state every lookup here uses.
    const localStateKey = runScriptFn("REPO='owner/repo'; build_row_local_state_key 123");

    // A stored row that can be reused - every field a row has, the listed
    // updatedAt, this viewer and local state, fetched a minute ago; each
    // test changes one thing.
    const storedState = ({ entry = {}, data = {} } = {}) => ({
      byPrNumber: {
        "owner/repo#123": {
          repo: "owner/repo",
          section: "open",
          fetchedAt: minutesAgo(1),
          ...entry,
          data: {
            number: "123",
            title: "Stored title",
            titleDisplay: "Stored title [CHK:PASS][MRG:YES]",
            labels: ["old-label"],
            checkState: "PASS",
            mergeState: "YES",
            viewerLogin: "alice",
            sourceUpdatedAt,
            localStateKey,
            sourceBranch: "feature/x",
            targetBranch: "main",
            approvers: [],
            openConversationCount: "0",
            viewedFilesCount: "0",
            changedFilesCount: "0",
            viewedFilesSummary: "0/0 viewed",
            comments: [],
            reviews: [],
            commits: [],
            reviewThreads: [],
            commentEvents: [],
            activityEvents: [],
            metrics: {},
            activityTimeline: [],
            activityTimelineSummary: "-",
            ...data,
          },
        },
      },
    });
    const writeState = (state) => {
      const stateFile = runShell("mktemp");
      runShell(`printf '%s' '${JSON.stringify(state)}' > "${stateFile}"`);
      return stateFile;
    };
    const listed = (overrides = {}) => JSON.stringify({ number: 123, updatedAt: sourceUpdatedAt, ...overrides });
    const setup = (stateFile, { viewer = "alice", env = "" } = {}) =>
      `PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='${viewer}'; ACK_ENABLED=0; ACK_CLEAR_ENABLED=0; ACK_CHANGED=0; TARGET_PR_NUMBER=''; TARGET_PRS=''; ${env}`;
    const lookUp = (state, { section = "open", pr = listed(), ...options } = {}) =>
      runScriptFn(`${setup(writeState(state), options)} get_cached_row_json_for_pr '${pr}' '${section}'`);

    test("reuses an unchanged open row fetched within the revalidation window", () => {
      expect(JSON.parse(lookUp(storedState()))).toMatchObject({ number: "123", viewerLogin: "alice" });
    });

    test.each([
      ["the PR changed on GitHub", {}, { pr: listed({ updatedAt: "2026-05-27T00:00:00Z" }) }],
      ["another viewer", {}, { viewer: "bob" }],
      ["it was computed from other local state (an ack, a filter)", { data: { localStateKey: "other" } }, {}],
      ["rows from before localStateKey", { data: { localStateKey: undefined } }, {}],
      ["the PR moved section", {}, { section: "draft" }],
      ["an open row's last full fetch is past the revalidation window", { entry: { fetchedAt: minutesAgo(5) } }, { env: "VIEW_PRS_OPEN_REVALIDATE_SECONDS=60;" }],
      ["an open row never fully fetched (no fetchedAt)", { entry: { fetchedAt: undefined } }, {}],
      ["a field rows have is missing", { data: { metrics: null } }, {}],
      ["VIEW_PRS_SKIP_UNCHANGED=0", {}, { env: "VIEW_PRS_SKIP_UNCHANGED=0;" }],
      ["it's a run of one PR (-p)", {}, { env: "TARGET_PR_NUMBER='123';" }],
      ["it's a run of chosen PRs (--prs)", {}, { env: "TARGET_PRS='123';" }],
    ])("doesn't reuse it when %s", (_label, stateOverrides, options) => {
      expect(lookUp(storedState(stateOverrides), options)).toBe("");
    });

    test("reuses a merged row however long ago it was fetched, while its PR doesn't change", () => {
      const state = storedState({ entry: { section: "merged", fetchedAt: "2020-01-01T00:00:00Z" } });
      expect(lookUp(state, { section: "merged" })).toContain('"number":"123"');
      expect(lookUp(state, { section: "merged", pr: listed({ updatedAt: "2026-05-27T00:00:00Z" }) })).toBe("");
    });

    test("the local state key changes with the PR's ack, and with the change filters", () => {
      const ackedState = runShell("mktemp");
      runShell(`printf '%s' '{"ackByRepo":{"owner/repo":{"123":"2026-05-26T13:00:00Z"}}}' > "${ackedState}"`);
      const ackedKey = runShell(
        `source "${scriptPath}"; USER_STATE_FILE="${ackedState}"; REPO='owner/repo'; build_row_local_state_key 123`,
      );
      const filteredKey = runScriptFn("REPO='owner/repo'; CHANGE_FILTER_IGNORE_COMMENT_AUTHORS='bot'; build_row_local_state_key 123");

      expect(ackedKey).not.toBe(localStateKey);
      expect(filteredKey).not.toBe(localStateKey);
      expect(runScriptFn("REPO='owner/repo'; build_row_local_state_key 123")).toBe(localStateKey);
    });

    test("a row computed while acked is reused while the ack stands - the lookup works out the same key", () => {
      const ackedState = runShell("mktemp");
      runShell(`printf '%s' '{"ackByRepo":{"owner/repo":{"123":"2026-05-26T13:00:00Z"}}}' > "${ackedState}"`);
      const ackedKey = runShell(`source "${scriptPath}"; USER_STATE_FILE="${ackedState}"; REPO='owner/repo'; build_row_local_state_key 123`);
      const stateFile = writeState(storedState({ data: { localStateKey: ackedKey } }));
      const lookUpWith = (userStateFile) =>
        runShell(
          `source "${scriptPath}"; USER_STATE_FILE="${userStateFile}"; ${setup(stateFile)} get_cached_row_json_for_pr '${listed()}' open`,
        );

      expect(ackedKey).toMatch(/^\d+\|2026-05-26T13:00:00Z\|false\|false$/);
      expect(lookUpWith(ackedState)).toContain('"number":"123"');
      expect(lookUpWith(isolatedUserStateFile)).toBe("");
      // No user state file yet: the same as an empty one.
      expect(runShell(`source "${scriptPath}"; USER_STATE_FILE="/nonexistent/user-state.json"; REPO='owner/repo'; build_row_local_state_key 123`)).toBe(localStateKey);
    });

    test("the run's snapshot holds each of this repo's rows in its own file, and the lookup reads that instead", () => {
      const state = storedState();
      // Another repo's PR with the same number: not this repo's row.
      state.byPrNumber["other/repo#123"] = { ...state.byPrNumber["owner/repo#123"], repo: "other/repo" };
      const stateFile = writeState(state);
      const snapshotDir = runShell("mktemp -d");

      runScriptFn(`${setup(stateFile)} ROW_REUSE_SNAPSHOT_DIR="${snapshotDir}"; build_row_reuse_snapshot`);

      expect(runShell(`ls "${snapshotDir}"`).split("\n")).toEqual(["123.json"]);
      expect(JSON.parse(runShell(`cat "${snapshotDir}/123.json"`))).toEqual({ byPrNumber: { "owner/repo#123": state.byPrNumber["owner/repo#123"] } });

      const lookUpIn = (dir, pr = listed()) =>
        runScriptFn(`${setup(stateFile)} ROW_REUSE_SNAPSHOT_DIR="${dir}"; get_cached_row_json_for_pr '${pr}' open`);
      expect(lookUpIn(snapshotDir)).toContain('"number":"123"');
      // Not in the snapshot (a new PR): fetched.
      expect(lookUpIn(snapshotDir, listed({ number: 789 }))).toBe("");
      expect(lookUpIn(runShell("mktemp -d"))).toBe("");
    });

    test.each([
      ["VIEW_PRS_SKIP_UNCHANGED=0", "VIEW_PRS_SKIP_UNCHANGED=0;"],
      ["a run of chosen PRs", "TARGET_PRS='123';"],
    ])("no snapshot is taken when the run reuses nothing (%s)", (_label, env) => {
      const stateFile = writeState(storedState());
      const snapshotDir = runShell("mktemp -d");

      runScriptFn(`${setup(stateFile)} ${env} ROW_REUSE_SNAPSHOT_DIR="${snapshotDir}"; build_row_reuse_snapshot`);

      expect(runShell(`ls -A "${snapshotDir}"`)).toBe("");
    });

    describe("get_pr_row_json", () => {
      const rowFor = (state, { section = "open", pr, env = "" } = {}) =>
        runScriptFn(`${setup(writeState(state), { env })} get_pr_row_json '${pr}' '${section}' 2>&1`);

      test("a reused row emits progress markers, takes the listing's own fields, and is marked __reused", () => {
        const output = rowFor(storedState(), {
          pr: listed({ title: "Renamed", labels: [{ name: "new-label" }], additions: 7, deletions: 2 }),
          env: "VIEW_PRS_PROGRESS_MARKERS=1;",
        });

        expect(output).toContain("__VIEW_PRS_PROGRESS__:START:123");
        expect(output).toContain("__VIEW_PRS_PROGRESS__:END:123");
        const row = JSON.parse(output.split("\n").find((line) => line.startsWith("{")));
        expect(row).toMatchObject({
          title: "Renamed",
          titleDisplay: "Renamed [CHK:PASS][MRG:YES]",
          labels: ["new-label"],
          additions: "7",
          deletions: "2",
          __reused: true,
        });
      });

      test("a reused open row takes the run's fresh CI and mergeability; without any, keeps its own", () => {
        const ciMergeDir = runShell("mktemp -d");
        runShell(
          `printf '%s' '{"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"FAILURE"}],"mergeable":"CONFLICTING"}' > "${ciMergeDir}/123.json"`,
        );

        const fresh = JSON.parse(rowFor(storedState(), { pr: listed(), env: `CI_MERGE_CACHE_DIR="${ciMergeDir}";` }));
        // __ciFetched: upsert_pr_state stamps the row's ciFetchedAt.
        expect(fresh).toMatchObject({ checkState: "FAIL", mergeState: "NO", __ciFetched: true });

        const withoutCi = JSON.parse(rowFor(storedState(), { pr: listed(), env: `CI_MERGE_CACHE_DIR="$(mktemp -d)";` }));
        expect(withoutCi).toMatchObject({ checkState: "PASS", mergeState: "YES" });
        expect(withoutCi).not.toHaveProperty("__ciFetched");
      });

      test("a reused merged row isn't given CI data at all", () => {
        const ciMergeDir = runShell("mktemp -d");
        runShell(`printf '%s' '{"statusCheckRollup":[],"mergeable":"UNKNOWN"}' > "${ciMergeDir}/123.json"`);
        const state = storedState({ entry: { section: "merged" } });

        const row = JSON.parse(rowFor(state, { section: "merged", pr: listed(), env: `CI_MERGE_CACHE_DIR="${ciMergeDir}";` }));
        expect(row).toMatchObject({ checkState: "PASS", mergeState: "YES" });
      });
    });

    test("upsert_pr_state keeps a reused row's fetchedAt, and stamps a fetched one", () => {
      const fetchedAt = "2026-05-26T12:30:00Z";
      const stateFile = writeState(storedState({ entry: { fetchedAt } }));
      const upsert = (row) =>
        runScriptFn(
          `${setup(stateFile)} STATE_BACKUP_DIR="$(mktemp -d)"; RUN_TS='2026-05-26T13:00:00Z'; RUN_ROW_INDEX=1; upsert_pr_state_unlocked '${JSON.stringify(row)}' open; jq -c '.byPrNumber["owner/repo#123"] | {fetchedAt, reused: (.data | has("__reused"))}' "${stateFile}"`,
        );

      expect(JSON.parse(upsert({ number: "123", __reused: true }))).toEqual({ fetchedAt, reused: false });
      expect(JSON.parse(upsert({ number: "123" })).fetchedAt).not.toBe(fetchedAt);
    });

    test("upsert_pr_state stamps ciFetchedAt when the run fetched the row's CI, reused or not", () => {
      const fetchedAt = "2026-05-26T12:30:00Z";
      const upsert = (row, entry = { fetchedAt }) => {
        const stateFile = writeState(storedState({ entry }));
        return JSON.parse(
          runScriptFn(
            `${setup(stateFile)} RUN_TS='2026-05-26T13:00:00Z'; RUN_ROW_INDEX=1; upsert_pr_state_unlocked '${JSON.stringify(row)}' open; jq -c '.byPrNumber["owner/repo#123"] | {fetchedAt, ciFetchedAt, marked: (.data | has("__ciFetched"))}' "${stateFile}"`,
          ),
        );
      };

      // Reused, CI fetched: fetchedAt kept, ciFetchedAt now.
      const reusedWithCi = upsert({ number: "123", __reused: true, __ciFetched: true });
      expect(reusedWithCi).toMatchObject({ fetchedAt, marked: false });
      expect(Date.parse(reusedWithCi.ciFetchedAt)).toBeGreaterThan(Date.parse(fetchedAt));
      // Reused without CI: the row's own, else its fetchedAt.
      expect(upsert({ number: "123", __reused: true })).toMatchObject({ fetchedAt, ciFetchedAt: fetchedAt });
      expect(upsert({ number: "123", __reused: true }, { fetchedAt, ciFetchedAt: "2026-05-26T12:45:00Z" })).toMatchObject({
        ciFetchedAt: "2026-05-26T12:45:00Z",
      });
      // Fetched: both now.
      const fetched = upsert({ number: "123" });
      expect(fetched.ciFetchedAt).toBe(fetched.fetchedAt);
    });

    test("upsert_pr_state writes a row without a backup (the run takes one), and leaves the file as it was when it can't", () => {
      const stateFile = writeState(storedState());
      const backupDir = runShell("mktemp -d");
      const env = `${setup(stateFile)} STATE_BACKUP_DIR="${backupDir}"; RUN_TS='2026-05-26T13:00:00Z'; RUN_ROW_INDEX=1;`;

      runScriptFn(`${env} upsert_pr_state_unlocked '{"number":456,"title":"New"}' open`);
      expect(JSON.parse(runShell(`cat "${stateFile}"`)).byPrNumber["owner/repo#456"].data.title).toBe("New");
      expect(runShell(`ls -A "${backupDir}"`)).toBe("");
      expect(runShell(`ls -A "$(dirname "${stateFile}")" | grep -cF "$(basename "${stateFile}").tmp-" || true`)).toBe("0");

      const before = runShell(`cat "${stateFile}"`);
      expect(runScriptFn(`${env} upsert_pr_state_unlocked 'not json' open 2>/dev/null && echo ok || echo refused`)).toBe("refused");
      expect(runShell(`cat "${stateFile}"`)).toBe(before);
    });

    test("ensure_pr_state_store leaves a sound data file alone, and fixes one that needs it", () => {
      const backupDir = runShell("mktemp -d");
      const ensure = (stateFile) => runScriptFn(`PR_STATE_FILE="${stateFile}"; STATE_BACKUP_DIR="${backupDir}"; ensure_pr_state_store; cat "${stateFile}"`);

      const sound = writeState(storedState());
      const soundBefore = runShell(`cat "${sound}"`);
      expect(ensure(sound)).toBe(soundBefore);
      expect(runShell(`ls -A "${backupDir}"`)).toBe("");

      const legacy = writeState({ ...storedState(), ackByRepo: {} });
      expect(JSON.parse(ensure(legacy))).not.toHaveProperty("ackByRepo");
      expect(runShell(`ls -A "${backupDir}"`)).not.toBe("");

      // Rows keyed by their bare number (before 2026-11-02) move to their
      // repo's key; one without a repo keeps its number, and an existing
      // repo key (the newer row) wins.
      const row = storedState().byPrNumber["owner/repo#123"];
      const numeric = writeState({
        byPrNumber: {
          123: row,
          7: { ...row, repo: undefined, data: { number: "7" } },
          9: { ...row, data: { ...row.data, number: "9", title: "older" } },
          "owner/repo#9": { ...row, data: { ...row.data, number: "9", title: "newer" } },
        },
      });
      const migrated = JSON.parse(ensure(numeric)).byPrNumber;
      expect(Object.keys(migrated).sort()).toEqual(["7", "owner/repo#123", "owner/repo#9"]);
      expect(migrated["owner/repo#9"].data.title).toBe("newer");
    });

    test("a row still keyed by its bare number is found until it's migrated - only for its own repo", () => {
      const row = storedState().byPrNumber["owner/repo#123"];
      const stateFile = writeState({ byPrNumber: { 123: row } });
      expect(runScriptFn(`${setup(stateFile)} get_cached_row_json_for_pr '${listed()}' open`)).toContain('"number":"123"');
      const otherRepo = runScriptFn(
        `PR_STATE_FILE="${stateFile}"; REPO='other/repo'; VIEWER_LOGIN='alice'; ACK_ENABLED=0; ACK_CLEAR_ENABLED=0; ACK_CHANGED=0; TARGET_PR_NUMBER=''; TARGET_PRS=''; get_cached_row_json_for_pr '${listed()}' open`,
      );
      expect(otherRepo).toBe("");
    });

    test("a changed merged PR keeps its stored viewed-files counts instead of fetching them", () => {
      const stateFile = writeState(storedState({ entry: { section: "merged" }, data: { viewedFilesCount: "3", changedFilesCount: "4" } }));

      expect(JSON.parse(runScriptFn(`${setup(stateFile)} get_stored_viewed_files_stats_json 123`))).toEqual({
        viewedFiles: 3,
        changedFiles: 4,
      });
      // None stored (or "0" changed files - likely a failed fetch): fetched.
      const zeroState = writeState(storedState({ entry: { section: "merged" }, data: { changedFilesCount: "0" } }));
      expect(runScriptFn(`${setup(zeroState)} get_stored_viewed_files_stats_json 123`)).toBe("");
      // Stored while still open (just merged): files pushed or viewed since
      // that fetch would never be counted, so fetched once.
      const openState = writeState(storedState({ data: { viewedFilesCount: "3", changedFilesCount: "4" } }));
      expect(runScriptFn(`${setup(openState)} get_stored_viewed_files_stats_json 123`)).toBe("");
    });
  });

  test("run_for_each_number_in_parallel runs a script function for every number (the prefetches' xargs `bash -c` couldn't see them)", () => {
    const outDir = runShell("mktemp -d");
    runScriptFn(
      `JOBS=2; mark() { : > "${outDir}/$1"; return 1; }; run_for_each_number_in_parallel mark $'1\\n2\\n\\n3'; echo done`,
    );

    expect(runShell(`ls "${outDir}"`).split("\n")).toEqual(["1", "2", "3"]);
  });

  test.each([
    ["--jobs shared among the tasks run together", "6", "3", "2"],
    ["rounded down", "7", "2", "3"],
    ["at least one", "2", "3", "1"],
    ["a bad value counts as one", "x", "0", "1"],
  ])("prefetch_task_jobs: %s", (_label, jobs, groups, expected) => {
    expect(runScriptFn(`JOBS='${jobs}'; VIEW_PRS_PREFETCH_GROUP_CONCURRENCY='${groups}'; prefetch_task_jobs`)).toBe(expected);
  });

  test("move_into_state_file replaces a state file by a rename beside it, leaving no temp files", () => {
    const dir = runShell("mktemp -d");
    const output = runScriptFn(
      `printf '{"a":1}' > "${dir}/data.json"; src=$(mktemp); printf '{"a":2}' > "$src"; move_into_state_file "$src" "${dir}/data.json"; [[ -e "$src" ]] && echo src-left; state_file_tmp_path "${dir}/data.json"; echo; ls -A "${dir}"; cat "${dir}/data.json"`,
    );
    const [tmpPath, ...rest] = output.split("\n");

    expect(tmpPath.startsWith(`${dir}/data.json.tmp-`)).toBe(true);
    expect(rest).toEqual(["data.json", '{"a":2}']);
  });

  test("print_row prints each field from one row, a title with a tab or an empty reason included", () => {
    const row = { number: 42, title: "Fix\tthing", titleDisplay: "Fix\tthing [CHK:PASS][MRG:YES]", url: "https://x/42", author: "Ann", status: "NO_CHANGE", approved: "YES", approvalCount: 2, reason: "" };
    const output = runScriptFn(`print_row '${JSON.stringify(row)}' ''`);

    expect(output).toContain("#42");
    expect(output).toContain("Ann");
    expect(output).toContain("NO_CHANGE");
    expect(output).toContain("YES (2)");
    expect(output).toMatch(/Fix\tthing \[CHK:PASS\]\[MRG:YES\]$/);
  });

  // Regression coverage for a broken `jq` expression in both
  // external_commit_count blocks: the combined merge-pattern +
  // ignore-pattern expression put a nested if-expression as the left
  // operand of `+` inside a then-branch, which is a jq syntax error (the
  // `$combinedPattern` binding never evaluated). Because compute_pr_state_json
  // is only ever invoked as part of processing a real PR (never unit-tested
  // directly against realistic commit data before), commit-based CHANGED
  // detection silently never fired for any PR - the tests below exercise
  // that binding directly, not just "does the script not crash".
  describe("Given a PR with external commits, when compute_pr_state_json evaluates commit-based change detection", () => {
    const runComputePrStateJson = (prJson, detailJson) => {
      const output = runShell(
        `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEWER_LOGIN='alice'; REPO='owner/repo'; emit_pr_progress_marker(){ :; }; get_pr_detail_json(){ printf '%s' '${detailJson}'; }; fetch_review_threads_json(){ printf '%s' '[]'; }; fetch_pr_review_comments_json(){ printf '%s' '[]'; }; fetch_pr_review_url_map_json(){ printf '%s' '{}'; }; fetch_pr_viewed_files_stats_json(){ printf '%s' '{"viewedFiles":0,"changedFiles":0}'; }; compute_pr_state_json '${prJson}'`,
      );
      return JSON.parse(output);
    };

    const basePr = (overrides = {}) =>
      JSON.stringify({
        number: 501,
        title: "Commit change detection",
        url: "https://github.com/owner/repo/pull/501",
        mergedAt: null,
        closedAt: null,
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-02T00:00:00Z",
        headRefName: "feature/x",
        baseRefName: "main",
        additions: 1,
        deletions: 1,
        labels: [],
        author: { login: "alice", name: "Alice" },
        mergedBy: null,
        ...overrides,
      });

    test("a real external commit (not matching the merge pattern) flips status to CHANGED with a commit reason", () => {
      const detailJson = JSON.stringify({
        comments: [],
        reviews: [],
        reviewRequests: [],
        commits: [
          {
            oid: "sha-real-change",
            committedDate: "2026-06-02T00:00:00Z",
            messageHeadline: "Add new feature",
            messageBody: "",
            authors: [{ login: "bob", name: "Bob", email: "bob@example.com" }],
          },
        ],
        assignees: [],
        statusCheckRollup: [],
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
      });

      const row = runComputePrStateJson(basePr(), detailJson);

      expect(row.status).toBe("CHANGED");
      expect(row.reason).toContain("commit");
    });

    test("a merge commit from the built-in pattern is excluded, so status stays NO_CHANGE", () => {
      const detailJson = JSON.stringify({
        comments: [],
        reviews: [],
        reviewRequests: [],
        commits: [
          {
            oid: "sha-merge",
            committedDate: "2026-06-02T00:00:00Z",
            messageHeadline: "Merge branch 'main' into feature/x",
            messageBody: "",
            authors: [{ login: "bob", name: "Bob", email: "bob@example.com" }],
          },
        ],
        assignees: [],
        statusCheckRollup: [],
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
      });

      const row = runComputePrStateJson(basePr(), detailJson);

      expect(row.status).toBe("NO_CHANGE");
    });

    test("a commit matching a custom ignore pattern (combined with the built-in pattern) is also excluded", () => {
      const detailJson = JSON.stringify({
        comments: [],
        reviews: [],
        reviewRequests: [],
        commits: [
          {
            oid: "sha-automated",
            committedDate: "2026-06-02T00:00:00Z",
            messageHeadline: "Automated: bump dependency",
            messageBody: "",
            authors: [{ login: "bob", name: "Bob", email: "bob@example.com" }],
          },
        ],
        assignees: [],
        statusCheckRollup: [],
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
      });

      const output = runShell(
        `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEWER_LOGIN='alice'; REPO='owner/repo'; CHANGE_FILTER_IGNORE_COMMIT_PATTERNS='^Automated:'; emit_pr_progress_marker(){ :; }; get_pr_detail_json(){ printf '%s' '${detailJson}'; }; fetch_review_threads_json(){ printf '%s' '[]'; }; fetch_pr_review_comments_json(){ printf '%s' '[]'; }; fetch_pr_review_url_map_json(){ printf '%s' '{}'; }; fetch_pr_viewed_files_stats_json(){ printf '%s' '{"viewedFiles":0,"changedFiles":0}'; }; compute_pr_state_json '${basePr()}'`,
      );
      const row = JSON.parse(output);

      expect(row.status).toBe("NO_CHANGE");
    });
  });

  // Regression coverage: build_activity_events_json used to drop any commit
  // whose author had an empty GitHub `login` (select((.login // "") != "")),
  // which silently removed commits from external/corporate authors who
  // commit with a name+email but no linked GitHub account from the Activity
  // Timeline.
  describe("Given a commit author with no GitHub login, when a row's activity events are built", () => {
    const runBuildActivityEvents = (commitsJson) =>
      buildActivityEvents({
        commentEvents: [],
        reviews: [],
        commits: JSON.parse(commitsJson),
        createdAt: "",
        authorLogin: "",
        mergedAt: "",
        mergedByLogin: "",
        closedAt: "",
      });

    test("falls back to the commit author's name when login is empty", () => {
      const commitsJson = JSON.stringify([
        {
          oid: "sha-1",
          committedAt: "2026-06-02T00:00:00Z",
          messageHeadline: "Fix bug",
          messageBody: "",
          authors: [{ login: "", name: "External Author", email: "ext@example.com" }],
        },
      ]);

      const events = runBuildActivityEvents(commitsJson);
      const commitEvents = events.filter((e) => e.type === "commit");

      expect(commitEvents).toHaveLength(1);
      expect(commitEvents[0].actor).toBe("External Author");
    });

    test("falls back to email when both login and name are empty", () => {
      const commitsJson = JSON.stringify([
        {
          oid: "sha-2",
          committedAt: "2026-06-02T00:00:00Z",
          messageHeadline: "Fix bug",
          messageBody: "",
          authors: [{ login: "", name: "", email: "ext@example.com" }],
        },
      ]);

      const events = runBuildActivityEvents(commitsJson);
      const commitEvents = events.filter((e) => e.type === "commit");

      expect(commitEvents).toHaveLength(1);
      expect(commitEvents[0].actor).toBe("ext@example.com");
    });

    test("still uses login when present, unaffected by the fallback", () => {
      const commitsJson = JSON.stringify([
        {
          oid: "sha-3",
          committedAt: "2026-06-02T00:00:00Z",
          messageHeadline: "Fix bug",
          messageBody: "",
          authors: [{ login: "regular-user", name: "Regular User", email: "" }],
        },
      ]);

      const events = runBuildActivityEvents(commitsJson);
      const commitEvents = events.filter((e) => e.type === "commit");

      expect(commitEvents).toHaveLength(1);
      expect(commitEvents[0].actor).toBe("regular-user");
    });
  });

  // Feature: the Activity Timeline showed when a PR was opened but never
  // when it was closed (without merging) - closed_at was already threaded
  // through to the PR row's own `closedAt` field, but never into
  // build_activity_events_json, so no "closed" entry was ever synthesized.
  describe("Given a PR's closedAt/mergedAt, when a row's activity events get the 'closed' system event", () => {
    const runBuildActivityEvents = (closedAt, mergedAt) =>
      buildActivityEvents({ commentEvents: [], reviews: [], commits: [], createdAt: "", authorLogin: "", mergedAt, mergedByLogin: "", closedAt });

    test("given closed_at set and merged_at empty, when built, then includes a 'closed' entry with actor 'unknown'", () => {
      const events = runBuildActivityEvents("2026-06-10T00:00:00Z", "");
      const closedEvents = events.filter((e) => e.type === "closed");

      expect(closedEvents).toHaveLength(1);
      expect(closedEvents[0]).toMatchObject({
        type: "closed",
        actor: "unknown",
        date: "2026-06-10",
        occurredAt: "2026-06-10T00:00:00Z",
        channel: "system",
      });
    });

    test("given both closed_at and merged_at set (a merged PR), when built, then no 'closed' entry is added - only 'merged'", () => {
      const events = runBuildActivityEvents("2026-06-10T00:00:00Z", "2026-06-10T00:00:00Z");

      expect(events.filter((e) => e.type === "closed")).toHaveLength(0);
      expect(events.filter((e) => e.type === "merged")).toHaveLength(1);
    });

    test("given closed_at empty, when built, then no 'closed' entry is added", () => {
      const events = runBuildActivityEvents("", "");
      expect(events.filter((e) => e.type === "closed")).toHaveLength(0);
    });
  });

  describe("Given a 'closed' bucket, when a row's timeline summary renders its label", () => {
    test("renders 'closed PR', not generic pluralization", () => {
      const timelineJson = JSON.stringify([
        { date: "2026-06-10", actor: "unknown", type: "closed", count: 1, earliestAt: "2026-06-10T00:00:00Z", latestAt: "2026-06-10T00:00:00Z", channels: ["system"], events: [] },
      ]);
      const summary = buildActivityTimelineSummary(JSON.parse(timelineJson));
      expect(summary).toContain("closed PR");
    });
  });

  // Regression coverage: `my_last` (the viewer's own last-activity
  // timestamp, used as `effective_last`/`baseline`) only looked at
  // top-level PR comments, submitted reviews, and the viewer's own
  // commits - it never looked at the viewer's own review-thread replies
  // (fetch_review_threads_json). A viewer who only replies inline in
  // review threads (never posting a top-level comment or submitting a
  // formal review) therefore got an empty `baseline` ("You: -" in the UI)
  // and, since they aren't the PR's author, an incorrect `NO_ACTIVITY`
  // status (which also flags the PR as Needs Attention) - even though the
  // "N open conversations with me" summary elsewhere in the app
  // (getOpenConversationCountWithMe, pr-open-conversation-count.helpers.ts) already proves the
  // viewer has recent thread activity on the PR.
  describe("Given a non-author viewer whose only activity is a review-thread reply, when compute_pr_state_json evaluates status and baseline", () => {
    const runComputePrStateJsonWithThreads = (prJson, detailJson, threadsJson) => {
      const output = runShell(
        `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEWER_LOGIN='alice'; REPO='owner/repo'; emit_pr_progress_marker(){ :; }; get_pr_detail_json(){ printf '%s' '${detailJson}'; }; fetch_review_threads_json(){ printf '%s' '${threadsJson}'; }; fetch_pr_review_comments_json(){ printf '%s' '[]'; }; fetch_pr_review_url_map_json(){ printf '%s' '{}'; }; fetch_pr_viewed_files_stats_json(){ printf '%s' '{"viewedFiles":0,"changedFiles":0}'; }; compute_pr_state_json '${prJson}'`,
      );
      return JSON.parse(output);
    };

    const prJson = JSON.stringify({
      number: 701,
      title: "Thread-only viewer activity",
      url: "https://github.com/owner/repo/pull/701",
      mergedAt: null,
      closedAt: null,
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-02T00:00:00Z",
      headRefName: "feature/thread-reply",
      baseRefName: "main",
      additions: 1,
      deletions: 1,
      labels: [],
      author: { login: "octocat", name: "Octo Cat" },
      mergedBy: null,
    });

    const detailJsonWithNoTopLevelActivity = JSON.stringify({
      comments: [],
      reviews: [],
      reviewRequests: [],
      commits: [],
      assignees: [],
      statusCheckRollup: [],
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });

    test("a thread reply from the viewer sets baseline to that reply's timestamp, not empty", () => {
      const threadsJson = JSON.stringify([
        {
          id: "thread-1",
          isResolved: false,
          isOutdated: false,
          resolvedByLogin: "",
          commentCount: 1,
          hasMoreComments: false,
          comments: [
            {
              id: "comment-1",
              authorLogin: "alice",
              authorName: "Alice",
              authorAssociation: "COLLABORATOR",
              createdAt: "2026-06-02T12:00:00Z",
              publishedAt: "2026-06-02T12:00:00Z",
              body: "Looks good to me here",
              url: "https://github.com/owner/repo/pull/701#discussion_r1",
              replyToId: "",
              path: "src/file.js",
              line: 10,
              originalLine: 10,
              diffSide: "RIGHT",
              state: "",
            },
          ],
          participants: ["alice"],
          latestCommentAt: "2026-06-02T12:00:00Z",
        },
      ]);

      const row = runComputePrStateJsonWithThreads(
        prJson,
        detailJsonWithNoTopLevelActivity,
        threadsJson,
      );

      expect(row.baseline).toBe("2026-06-02T12:00:00Z");
    });

    test("with no external activity since that thread reply, status is NO_CHANGE, not NO_ACTIVITY", () => {
      const threadsJson = JSON.stringify([
        {
          id: "thread-1",
          isResolved: false,
          isOutdated: false,
          resolvedByLogin: "",
          commentCount: 1,
          hasMoreComments: false,
          comments: [
            {
              id: "comment-1",
              authorLogin: "alice",
              authorName: "Alice",
              authorAssociation: "COLLABORATOR",
              createdAt: "2026-06-02T12:00:00Z",
              publishedAt: "2026-06-02T12:00:00Z",
              body: "Looks good to me here",
              url: "https://github.com/owner/repo/pull/701#discussion_r1",
              replyToId: "",
              path: "src/file.js",
              line: 10,
              originalLine: 10,
              diffSide: "RIGHT",
              state: "",
            },
          ],
          participants: ["alice"],
          latestCommentAt: "2026-06-02T12:00:00Z",
        },
      ]);

      const row = runComputePrStateJsonWithThreads(
        prJson,
        detailJsonWithNoTopLevelActivity,
        threadsJson,
      );

      expect(row.status).toBe("NO_CHANGE");
    });

    test("without the fix's thread lookup, a viewer with only a top-level comment still sets baseline (control case, unaffected)", () => {
      const detailJsonWithTopLevelComment = JSON.stringify({
        comments: [
          {
            author: { login: "alice" },
            createdAt: "2026-06-02T09:00:00Z",
          },
        ],
        reviews: [],
        reviewRequests: [],
        commits: [],
        assignees: [],
        statusCheckRollup: [],
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
      });

      const row = runComputePrStateJsonWithThreads(prJson, detailJsonWithTopLevelComment, "[]");

      expect(row.baseline).toBe("2026-06-02T09:00:00Z");
      expect(row.status).toBe("NO_CHANGE");
    });

    test("with genuinely no viewer activity anywhere (no comments, no threads), status stays NO_ACTIVITY", () => {
      const row = runComputePrStateJsonWithThreads(prJson, detailJsonWithNoTopLevelActivity, "[]");

      expect(row.baseline).toBe("");
      expect(row.status).toBe("NO_ACTIVITY");
    });
  });
});

// A failed fetch used to read as "nothing there": a thread request that
// failed (bash clears set -e inside $(...)) returned no threads, the
// prefetch cached that, and the row was written without its threads - kept
// that way while full runs reused it.
describe("a PR whose threads or details couldn't be fetched", () => {
  const threadsResponse = JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [{ id: "t1", isResolved: false, comments: { nodes: [] } }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    },
  });
  const fetchThreads = (cacheDir, ghBody) =>
    runScriptFn(
      `THREAD_CACHE_DIR="${cacheDir}"; REPO_OWNER=owner; REPO_NAME=repo; gh_with_retry() { ${ghBody}; }; fetch_review_threads_json 5`,
    );

  test("fetch_review_threads_json fails and caches nothing when the request fails or GitHub answers with an error", () => {
    const cacheDir = runShell("mktemp -d");
    expect(() => fetchThreads(cacheDir, "return 1")).toThrow();
    expect(() => fetchThreads(cacheDir, `printf '%s' '{"errors":[{"message":"Something went wrong"}]}'`)).toThrow();
    expect(runShell(`ls -A "${cacheDir}"`)).toBe("");

    const threads = JSON.parse(fetchThreads(cacheDir, `printf '%s' '${threadsResponse}'`));
    expect(threads).toEqual([expect.objectContaining({ id: "t1", isResolved: false })]);
    expect(runShell(`ls -A "${cacheDir}"`)).toBe("5.json");
  });

  const computeRow = ({ detail = `printf '%s' '{"comments":[],"reviews":[],"commits":[]}'`, threads = "printf '%s' '[]'" }) =>
    runScriptFn(
      `VIEWER_LOGIN='alice'; REPO='owner/repo'; PR_DETAIL_DIR="$(mktemp -d)"; emit_pr_progress_marker(){ :; }; get_pr_detail_json(){ ${detail}; }; fetch_review_threads_json(){ ${threads}; }; fetch_pr_review_comments_json(){ printf '%s' '[]'; }; fetch_pr_review_url_map_json(){ printf '%s' '{}'; }; fetch_pr_viewed_files_stats_json(){ printf '%s' '{"viewedFiles":0,"changedFiles":0}'; }; get_pr_row_json '{"number":5,"title":"T","url":"u","author":{"login":"bob"},"updatedAt":"2026-01-01T00:00:00Z"}' open`,
    );

  test("gives no row (so the run keeps the stored one) when its threads or details can't be fetched", () => {
    expect(JSON.parse(computeRow({})).number).toBe("5");
    expect(() => computeRow({ threads: "return 1" })).toThrow();
    expect(() => computeRow({ detail: "return 1" })).toThrow();
    expect(() => computeRow({ detail: "printf ''" })).toThrow();
  });

  // What a run then does with them: run_unfetched_pr_tests in check-open-pr-updates.test.sh.
  test("note_unfetched_pr collects the PRs a run couldn't fetch", () => {
    const noted = runScriptFn(
      `note_unfetched_pr '{"number":7}'; note_unfetched_pr '{"number":9}'; printf '%s' "$UNFETCHED_PR_NUMBERS" | tr '\n' ','`,
    );
    expect(noted).toBe("7,9,");
  });
});

describe("create_state_backup keeps the newest backups, and one a day for a week", () => {
  const fs = require("fs");
  const os = require("os");
  // Backups named and timed as the script names them: day + time, newest last.
  const backupsByDay = [
    ["20261020", ["090000"]],
    ["20261025", ["090000"]],
    ["20261027", ["080000", "120000"]],
    ["20261028", ["080000", "120000"]],
    ["20261030", ["070000", "080000", "090000"]],
  ];
  const name = (day, time) => `data.json.pr-data.${day}T${time}Z-1-1.bak`;

  test("the newest STATE_BACKUP_RETENTION, then the newest of each older day until STATE_BACKUP_DAILY_DAYS days have one", () => {
    // Made here, not with mktemp: Node on Windows can't open bash's /tmp paths.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "state-backup-")).replace(/\\/g, "/");
    const backupDir = `${dir}/backups`;
    fs.mkdirSync(backupDir);
    fs.writeFileSync(`${dir}/data.json`, "{}");
    backupsByDay.forEach(([day, times]) =>
      times.forEach((time) => {
        const file = `${backupDir}/${name(day, time)}`;
        fs.writeFileSync(file, "{}");
        const at = new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00Z`);
        fs.utimesSync(file, at, at);
      }),
    );

    // A new backup (today), keeping the newest 3, and days until 4 have one.
    runScriptFn(`STATE_BACKUP_DIR="${backupDir}"; STATE_BACKUP_RETENTION=3; STATE_BACKUP_DAILY_DAYS=4; create_state_backup "${dir}/data.json" pr-data`);

    const kept = fs.readdirSync(backupDir).sort();
    const today = kept.filter((file) => !backupsByDay.some(([day]) => file.includes(`.${day}T`)));
    expect(today).toHaveLength(1);
    // The newest 3: today's, and 10-30's two latest. Then one a day, newest
    // first, until 4 days have one: 10-28's latest and 10-27's latest.
    expect(kept.filter((file) => !today.includes(file))).toEqual(
      [
        name("20261027", "120000"),
        name("20261028", "120000"),
        name("20261030", "080000"),
        name("20261030", "090000"),
      ].sort(),
    );
  });
});
