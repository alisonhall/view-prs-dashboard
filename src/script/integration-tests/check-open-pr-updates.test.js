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

const runScriptFn = (expression) =>
  runShell(`source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}"; ${expression}`);

const seedCacheFingerprint = () => {
  const detailDir = runShell("mktemp -d");
  const threadDir = runShell("mktemp -d");
  const reviewCommentDir = runShell("mktemp -d");
  const reviewUrlDir = runShell("mktemp -d");
  const filesDir = runShell("mktemp -d");
  const ciMergeDir = runShell("mktemp -d");

  runShell(
    `cat > "${detailDir}/123.json" <<'EOF'\n{"comments":[],"reviews":[],"reviewRequests":[],"commits":[],"assignees":[],"statusCheckRollup":[],"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}\nEOF`,
  );
  runShell(`printf '%s' '[]' > "${threadDir}/123.json"`);
  runShell(`printf '%s' '[]' > "${reviewCommentDir}/123.json"`);
  runShell(`printf '%s' '{}' > "${reviewUrlDir}/123.json"`);
  runShell(`printf '%s' '{"changedFiles":0,"viewedFiles":0}' > "${filesDir}/123.json"`);
  runShell(
    `printf '%s' '{"statusCheckRollup":[],"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}' > "${ciMergeDir}/123.json"`,
  );

  const fingerprint = runShell(
    `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";DETAIL_CACHE_DIR="${detailDir}"; THREAD_CACHE_DIR="${threadDir}"; REVIEW_COMMENT_CACHE_DIR="${reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${reviewUrlDir}"; FILES_CACHE_DIR="${filesDir}"; CI_MERGE_CACHE_DIR="${ciMergeDir}"; build_pr_source_fingerprint "123"`,
  );

  return {
    detailDir,
    threadDir,
    reviewCommentDir,
    reviewUrlDir,
    filesDir,
    ciMergeDir,
    fingerprint,
  };
};

describe("check-open-pr-updates shell helper behavior", () => {
  test("returns a versioned SHA-256 digest when build_pr_source_fingerprint is called", () => {
    const caches = seedCacheFingerprint();
    expect(caches.fingerprint).toMatch(/^fp:v2:sha256:[a-f0-9]{64}$/);
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

  test("returns active reasons when build_reasons receives mixed change flags", () => {
    const output = runScriptFn(
      `build_reasons "comment" 0 "review" 2 "commit" 1`,
    );

    expect(output).toBe("review|commit");
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
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEWER_LOGIN='alice'; REPO='owner/repo'; emit_pr_progress_marker(){ :; }; get_pr_detail_json(){ printf '%s' '{"comments":[],"reviews":[],"reviewRequests":[],"commits":[],"assignees":[],"statusCheckRollup":[],"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}'; }; fetch_review_threads_json(){ printf '%s' '[]'; }; fetch_pr_review_comments_json(){ printf '%s' '[]'; }; fetch_pr_review_url_map_json(){ printf '%s' '{}'; }; build_comment_events_json(){ printf '%s' '[]'; }; build_activity_events_json(){ printf '%s' '[]'; }; build_activity_timeline_json(){ printf '%s' '[]'; }; build_activity_timeline_summary(){ printf '%s' '-'; }; build_pr_metrics_json(){ printf '%s' '{"conversationSummary":{"estimatedOpenConversations":0}}'; }; fetch_pr_viewed_files_stats_json(){ printf '%s' '{"viewedFiles":0,"changedFiles":0}'; }; compute_pr_state_json '${prJson}'`,
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
      ["open section is disabled by default", "open", 0, "", "1"],
      ["open section is enabled when skip flag is set", "open", 0, "1", "0"],
      ["open section is blocked during ack mode even when skip flag is set", "open", 1, "1", "1"],
      ["closed section is enabled when skip flag is set", "closed", 0, "1", "0"],
      ["merged section is enabled when skip flag is set", "merged", 0, "1", "0"],
    ])(
      "%s",
      (_label, section, ackEnabled, skipUnchanged, expectedResult) => {
        const output = runScriptFn(
          `ACK_ENABLED=${ackEnabled}; ACK_CLEAR_ENABLED=0; ACK_CHANGED=0; TARGET_PR_NUMBER=''; VIEW_PRS_SKIP_UNCHANGED='${skipUnchanged}'; if cache_shortcut_allowed_for_section ${section} >/dev/null 2>&1; then echo 0; else echo 1; fi`,
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

  test("falls back to NA and UNK when enrich_cached_row_with_ci_merge cannot find cached CI data", () => {
    const cacheDir = runShell("mktemp -d");
    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";CI_MERGE_CACHE_DIR="${cacheDir}"; enrich_cached_row_with_ci_merge '{"number":456,"title":"Another PR","checkState":"RUN","mergeState":"YES","titleDisplay":"Another PR [CHK:RUN][MRG:YES]"}' "456"`,
    );

    const row = JSON.parse(output);
    expect(row.checkState).toBe("NA");
    expect(row.mergeState).toBe("UNK");
    expect(row.titleDisplay).toContain("[CHK:NA][MRG:UNK]");
  });

  test("returns no cached row when get_cached_row_json_for_pr receives a different viewer", () => {
    const stateFile = runShell("mktemp");
    const prJson = '{"number":123,"updatedAt":"2026-05-26T12:00:00Z"}';
    const caches = seedCacheFingerprint();
    const statePayload = {
      byPrNumber: {
        123: {
          repo: "owner/repo",
          section: "open",
          data: {
            number: "123",
            viewerLogin: "alice",
            sourceUpdatedAt: "2026-05-26T12:00:00Z",
            sourceFingerprint: caches.fingerprint,
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
          },
        },
      },
    };

    runShell(`printf '%s' '${JSON.stringify(statePayload)}' > "${stateFile}"`);

    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEW_PRS_SKIP_UNCHANGED=1; PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='bob'; DETAIL_CACHE_DIR="${caches.detailDir}"; THREAD_CACHE_DIR="${caches.threadDir}"; REVIEW_COMMENT_CACHE_DIR="${caches.reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${caches.reviewUrlDir}"; FILES_CACHE_DIR="${caches.filesDir}"; CI_MERGE_CACHE_DIR="${caches.ciMergeDir}"; get_cached_row_json_for_pr '${prJson}' 'open'`,
    );

    expect(output).toBe("");
  });

  test("returns cached row data when get_cached_row_json_for_pr receives the same viewer", () => {
    const stateFile = runShell("mktemp");
    const prJson = '{"number":123,"updatedAt":"2026-05-26T12:00:00Z"}';
    const caches = seedCacheFingerprint();
    const statePayload = {
      byPrNumber: {
        123: {
          repo: "owner/repo",
          section: "open",
          data: {
            number: "123",
            viewerLogin: "alice",
            sourceUpdatedAt: "2026-05-26T12:00:00Z",
            sourceFingerprint: caches.fingerprint,
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
          },
        },
      },
    };

    runShell(`printf '%s' '${JSON.stringify(statePayload)}' > "${stateFile}"`);

    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEW_PRS_SKIP_UNCHANGED=1; PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='alice'; DETAIL_CACHE_DIR="${caches.detailDir}"; THREAD_CACHE_DIR="${caches.threadDir}"; REVIEW_COMMENT_CACHE_DIR="${caches.reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${caches.reviewUrlDir}"; FILES_CACHE_DIR="${caches.filesDir}"; CI_MERGE_CACHE_DIR="${caches.ciMergeDir}"; get_cached_row_json_for_pr '${prJson}' 'open'`,
    );

    expect(output).toContain('"number":"123"');
    expect(output).toContain('"viewerLogin":"alice"');
  });

  test("reuses cached row via bounded fallback when fingerprint caches are unavailable", () => {
    const stateFile = runShell("mktemp");
    const detailDir = runShell("mktemp -d");
    const threadDir = runShell("mktemp -d");
    const reviewCommentDir = runShell("mktemp -d");
    const reviewUrlDir = runShell("mktemp -d");
    const filesDir = runShell("mktemp -d");
    const ciMergeDir = runShell("mktemp -d");
    const sourceUpdatedAt = "2026-05-26T12:00:00Z";
    const cachedAt = new Date(Date.now() - 60 * 1000).toISOString();
    const prJson = JSON.stringify({ number: 123, updatedAt: sourceUpdatedAt });

    const statePayload = {
      byPrNumber: {
        123: {
          repo: "owner/repo",
          section: "open",
          data: {
            number: "123",
            viewerLogin: "alice",
            sourceUpdatedAt,
            sourceFingerprint: "stale-or-missing-fingerprint-ok-in-fallback",
            updatedAt: cachedAt,
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
          },
        },
      },
    };

    runShell(`printf '%s' '${JSON.stringify(statePayload)}' > "${stateFile}"`);

    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEW_PRS_SKIP_UNCHANGED=1; VIEW_PRS_CACHE_REVALIDATE_SECONDS=1800; PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='alice'; DETAIL_CACHE_DIR="${detailDir}"; THREAD_CACHE_DIR="${threadDir}"; REVIEW_COMMENT_CACHE_DIR="${reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${reviewUrlDir}"; FILES_CACHE_DIR="${filesDir}"; CI_MERGE_CACHE_DIR="${ciMergeDir}"; get_cached_row_json_for_pr '${prJson}' 'open'`,
    );

    expect(output).toContain('"number":"123"');
    expect(output).toContain('"viewerLogin":"alice"');
  });

  test("emits progress markers when cached rows are reused", () => {
    const stateFile = runShell("mktemp");
    const detailDir = runShell("mktemp -d");
    const threadDir = runShell("mktemp -d");
    const reviewCommentDir = runShell("mktemp -d");
    const reviewUrlDir = runShell("mktemp -d");
    const filesDir = runShell("mktemp -d");
    const ciMergeDir = runShell("mktemp -d");
    const freshViewedDir = runShell("mktemp -d");
    const sourceUpdatedAt = "2026-05-26T12:00:00Z";
    const cachedAt = new Date(Date.now() - 60 * 1000).toISOString();
    const prJson = JSON.stringify({ number: 123, updatedAt: sourceUpdatedAt });

    const statePayload = {
      byPrNumber: {
        123: {
          repo: "owner/repo",
          section: "open",
          data: {
            number: "123",
            title: "Cached PR",
            titleDisplay: "Cached PR [CHK:NA][MRG:UNK]",
            viewerLogin: "alice",
            sourceUpdatedAt,
            sourceFingerprint: "stale-or-missing-fingerprint-ok-in-fallback",
            updatedAt: cachedAt,
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
          },
        },
      },
    };

    runShell(`printf '%s' '${JSON.stringify(statePayload)}' > "${stateFile}"`);
    runShell(
      `printf '%s' '{"changedFiles":0,"viewedFiles":0}' > "${freshViewedDir}/123.json"`,
    );

    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEW_PRS_SKIP_UNCHANGED=1; VIEW_PRS_PROGRESS_MARKERS=1; VIEW_PRS_CACHE_REVALIDATE_SECONDS=1800; PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='alice'; DETAIL_CACHE_DIR="${detailDir}"; THREAD_CACHE_DIR="${threadDir}"; REVIEW_COMMENT_CACHE_DIR="${reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${reviewUrlDir}"; FILES_CACHE_DIR="${filesDir}"; CI_MERGE_CACHE_DIR="${ciMergeDir}"; VIEWED_FILES_FRESH_CACHE_DIR="${freshViewedDir}"; get_pr_row_json '${prJson}' 'open' 2>&1`,
    );

    expect(output).toContain("__VIEW_PRS_PROGRESS__:START:123");
    expect(output).toContain("__VIEW_PRS_PROGRESS__:END:123");
    expect(output).toContain('"number":"123"');
  });

  test("does not reuse fallback cached row when revalidation age is exceeded", () => {
    const stateFile = runShell("mktemp");
    const detailDir = runShell("mktemp -d");
    const threadDir = runShell("mktemp -d");
    const reviewCommentDir = runShell("mktemp -d");
    const reviewUrlDir = runShell("mktemp -d");
    const filesDir = runShell("mktemp -d");
    const ciMergeDir = runShell("mktemp -d");
    const sourceUpdatedAt = "2026-05-26T12:00:00Z";
    const prJson = JSON.stringify({ number: 123, updatedAt: sourceUpdatedAt });

    const statePayload = {
      byPrNumber: {
        123: {
          repo: "owner/repo",
          section: "open",
          data: {
            number: "123",
            viewerLogin: "alice",
            sourceUpdatedAt,
            sourceFingerprint: "stale-or-missing-fingerprint-ok-in-fallback",
            updatedAt: "2020-01-01T00:00:00Z",
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
          },
        },
      },
    };

    runShell(`printf '%s' '${JSON.stringify(statePayload)}' > "${stateFile}"`);

    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEW_PRS_SKIP_UNCHANGED=1; VIEW_PRS_CACHE_REVALIDATE_SECONDS=60; PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='alice'; DETAIL_CACHE_DIR="${detailDir}"; THREAD_CACHE_DIR="${threadDir}"; REVIEW_COMMENT_CACHE_DIR="${reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${reviewUrlDir}"; FILES_CACHE_DIR="${filesDir}"; CI_MERGE_CACHE_DIR="${ciMergeDir}"; get_cached_row_json_for_pr '${prJson}' 'open'`,
    );

    expect(output).toBe("");
  });

  test("refreshes viewed-file progress when enrich_cached_row_with_viewed_files receives fresh cache data", () => {
    const freshViewedDir = runShell("mktemp -d");
    runShell(
      `cat > "${freshViewedDir}/789.json" <<'EOF'\n{"changedFiles":20,"viewedFiles":13}\nEOF`,
    );

    const output = runShell(
      `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEWED_FILES_FRESH_CACHE_DIR="${freshViewedDir}"; enrich_cached_row_with_viewed_files '{"number":789,"title":"Viewed files","viewedFilesCount":"1","changedFilesCount":"2","viewedFilesSummary":"1/2 viewed"}' "789"`,
    );

    const row = JSON.parse(output);
    expect(row.viewedFilesCount).toBe("13");
    expect(row.changedFilesCount).toBe("20");
    expect(row.viewedFilesSummary).toBe("13/20 viewed");
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
        `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEWER_LOGIN='alice'; REPO='owner/repo'; emit_pr_progress_marker(){ :; }; get_pr_detail_json(){ printf '%s' '${detailJson}'; }; fetch_review_threads_json(){ printf '%s' '[]'; }; fetch_pr_review_comments_json(){ printf '%s' '[]'; }; fetch_pr_review_url_map_json(){ printf '%s' '{}'; }; build_comment_events_json(){ printf '%s' '[]'; }; build_activity_events_json(){ printf '%s' '[]'; }; build_activity_timeline_json(){ printf '%s' '[]'; }; build_activity_timeline_summary(){ printf '%s' '-'; }; build_pr_metrics_json(){ printf '%s' '{"conversationSummary":{"estimatedOpenConversations":0}}'; }; fetch_pr_viewed_files_stats_json(){ printf '%s' '{"viewedFiles":0,"changedFiles":0}'; }; compute_pr_state_json '${prJson}'`,
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
        `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEWER_LOGIN='alice'; REPO='owner/repo'; CHANGE_FILTER_IGNORE_COMMIT_PATTERNS='^Automated:'; emit_pr_progress_marker(){ :; }; get_pr_detail_json(){ printf '%s' '${detailJson}'; }; fetch_review_threads_json(){ printf '%s' '[]'; }; fetch_pr_review_comments_json(){ printf '%s' '[]'; }; fetch_pr_review_url_map_json(){ printf '%s' '{}'; }; build_comment_events_json(){ printf '%s' '[]'; }; build_activity_events_json(){ printf '%s' '[]'; }; build_activity_timeline_json(){ printf '%s' '[]'; }; build_activity_timeline_summary(){ printf '%s' '-'; }; build_pr_metrics_json(){ printf '%s' '{"conversationSummary":{"estimatedOpenConversations":0}}'; }; fetch_pr_viewed_files_stats_json(){ printf '%s' '{"viewedFiles":0,"changedFiles":0}'; }; compute_pr_state_json '${basePr()}'`,
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
  describe("Given a commit author with no GitHub login, when build_activity_events_json builds commit events", () => {
    const runBuildActivityEvents = (commitsJson) =>
      JSON.parse(
        runScriptFn(
          `build_activity_events_json '[]' '[]' '${commitsJson}' "" "" "" ""`,
        ),
      );

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
  // (getOpenConversationCountWithMe, index.page.js) already proves the
  // viewer has recent thread activity on the PR.
  describe("Given a non-author viewer whose only activity is a review-thread reply, when compute_pr_state_json evaluates status and baseline", () => {
    const runComputePrStateJsonWithThreads = (prJson, detailJson, threadsJson) => {
      const output = runShell(
        `source "${scriptPath}"; USER_STATE_FILE="${isolatedUserStateFile}";VIEWER_LOGIN='alice'; REPO='owner/repo'; emit_pr_progress_marker(){ :; }; get_pr_detail_json(){ printf '%s' '${detailJson}'; }; fetch_review_threads_json(){ printf '%s' '${threadsJson}'; }; fetch_pr_review_comments_json(){ printf '%s' '[]'; }; fetch_pr_review_url_map_json(){ printf '%s' '{}'; }; build_comment_events_json(){ printf '%s' '[]'; }; build_activity_events_json(){ printf '%s' '[]'; }; build_activity_timeline_json(){ printf '%s' '[]'; }; build_activity_timeline_summary(){ printf '%s' '-'; }; build_pr_metrics_json(){ printf '%s' '{"conversationSummary":{"estimatedOpenConversations":1}}'; }; fetch_pr_viewed_files_stats_json(){ printf '%s' '{"viewedFiles":0,"changedFiles":0}'; }; compute_pr_state_json '${prJson}'`,
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
