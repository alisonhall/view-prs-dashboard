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

const runScriptFn = (expression) => runShell(`source "${scriptPath}"; ${expression}`);

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
    `source "${scriptPath}"; DETAIL_CACHE_DIR="${detailDir}"; THREAD_CACHE_DIR="${threadDir}"; REVIEW_COMMENT_CACHE_DIR="${reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${reviewUrlDir}"; FILES_CACHE_DIR="${filesDir}"; CI_MERGE_CACHE_DIR="${ciMergeDir}"; build_pr_source_fingerprint "123"`,
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
      `source "${scriptPath}"; VIEWER_LOGIN='alice'; REPO='owner/repo'; emit_pr_progress_marker(){ :; }; get_pr_detail_json(){ printf '%s' '{"comments":[],"reviews":[],"reviewRequests":[],"commits":[],"assignees":[],"statusCheckRollup":[],"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}'; }; fetch_review_threads_json(){ printf '%s' '[]'; }; fetch_pr_review_comments_json(){ printf '%s' '[]'; }; fetch_pr_review_url_map_json(){ printf '%s' '{}'; }; build_comment_events_json(){ printf '%s' '[]'; }; build_activity_events_json(){ printf '%s' '[]'; }; build_activity_timeline_json(){ printf '%s' '[]'; }; build_activity_timeline_summary(){ printf '%s' '-'; }; build_pr_metrics_json(){ printf '%s' '{"conversationSummary":{"estimatedOpenConversations":0}}'; }; fetch_pr_viewed_files_stats_json(){ printf '%s' '{"viewedFiles":0,"changedFiles":0}'; }; compute_pr_state_json '${prJson}'`,
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
      `source "${scriptPath}"; REPO='owner/repo'; VIEW_PRS_DIR='${scriptDir}/../..'; PR_DETAIL_DIR='${detailDir}'; attach_pr_detail_ref '${row}'`,
    );

    const parsed = JSON.parse(output);
    expect(parsed.detailRef).toEqual({
      file: `${detailDir}/owner_repo__pr-123.json`,
      version: "v1",
    });
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
      `source "${scriptPath}"; REPO='owner/repo'; VIEW_PRS_DIR='${scriptDir}/../..'; PR_DETAIL_DIR='${detailDir}'; attach_pr_detail_ref '${row}' >/dev/null`,
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
        `source "${scriptPath}"; replace_state_file "${empty}" "${target}" "user-state"`,
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
        `source "${scriptPath}"; replace_state_file "${invalid}" "${target}" "user-state"`,
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
      `source "${scriptPath}"; get_cached_row_json_for_pr() { printf ''; }; collect_prioritized_stale_number_sets '${openPr}\n${draftPr}' '${closedPr}' '${mergedPr}'; printf 'OPEN_DRAFT=%s\nCLOSED=%s\nMERGED=%s\nALL=%s' "$STALE_OPEN_DRAFT_PR_NUMBERS" "$STALE_CLOSED_PR_NUMBERS" "$STALE_MERGED_PR_NUMBERS" "$STALE_ALL_PR_NUMBERS"`,
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
      `source "${scriptPath}"; CI_MERGE_CACHE_DIR="${cacheDir}"; enrich_cached_row_with_ci_merge '{"number":123,"title":"PR title","checkState":"RUN","mergeState":"UNK","titleDisplay":"PR title [CHK:RUN][MRG:UNK]"}' "123"`,
    );

    const row = JSON.parse(output);
    expect(row.checkState).toBe("PASS");
    expect(row.mergeState).toBe("YES");
    expect(row.titleDisplay).toContain("[CHK:PASS][MRG:YES]");
  });

  test("falls back to NA and UNK when enrich_cached_row_with_ci_merge cannot find cached CI data", () => {
    const cacheDir = runShell("mktemp -d");
    const output = runShell(
      `source "${scriptPath}"; CI_MERGE_CACHE_DIR="${cacheDir}"; enrich_cached_row_with_ci_merge '{"number":456,"title":"Another PR","checkState":"RUN","mergeState":"YES","titleDisplay":"Another PR [CHK:RUN][MRG:YES]"}' "456"`,
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
      `source "${scriptPath}"; VIEW_PRS_SKIP_UNCHANGED=1; PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='bob'; DETAIL_CACHE_DIR="${caches.detailDir}"; THREAD_CACHE_DIR="${caches.threadDir}"; REVIEW_COMMENT_CACHE_DIR="${caches.reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${caches.reviewUrlDir}"; FILES_CACHE_DIR="${caches.filesDir}"; CI_MERGE_CACHE_DIR="${caches.ciMergeDir}"; get_cached_row_json_for_pr '${prJson}' 'open'`,
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
      `source "${scriptPath}"; VIEW_PRS_SKIP_UNCHANGED=1; PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='alice'; DETAIL_CACHE_DIR="${caches.detailDir}"; THREAD_CACHE_DIR="${caches.threadDir}"; REVIEW_COMMENT_CACHE_DIR="${caches.reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${caches.reviewUrlDir}"; FILES_CACHE_DIR="${caches.filesDir}"; CI_MERGE_CACHE_DIR="${caches.ciMergeDir}"; get_cached_row_json_for_pr '${prJson}' 'open'`,
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
      `source "${scriptPath}"; VIEW_PRS_SKIP_UNCHANGED=1; VIEW_PRS_CACHE_REVALIDATE_SECONDS=1800; PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='alice'; DETAIL_CACHE_DIR="${detailDir}"; THREAD_CACHE_DIR="${threadDir}"; REVIEW_COMMENT_CACHE_DIR="${reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${reviewUrlDir}"; FILES_CACHE_DIR="${filesDir}"; CI_MERGE_CACHE_DIR="${ciMergeDir}"; get_cached_row_json_for_pr '${prJson}' 'open'`,
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
      `source "${scriptPath}"; VIEW_PRS_SKIP_UNCHANGED=1; VIEW_PRS_PROGRESS_MARKERS=1; VIEW_PRS_CACHE_REVALIDATE_SECONDS=1800; PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='alice'; DETAIL_CACHE_DIR="${detailDir}"; THREAD_CACHE_DIR="${threadDir}"; REVIEW_COMMENT_CACHE_DIR="${reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${reviewUrlDir}"; FILES_CACHE_DIR="${filesDir}"; CI_MERGE_CACHE_DIR="${ciMergeDir}"; VIEWED_FILES_FRESH_CACHE_DIR="${freshViewedDir}"; get_pr_row_json '${prJson}' 'open' 2>&1`,
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
      `source "${scriptPath}"; VIEW_PRS_SKIP_UNCHANGED=1; VIEW_PRS_CACHE_REVALIDATE_SECONDS=60; PR_STATE_FILE="${stateFile}"; REPO='owner/repo'; VIEWER_LOGIN='alice'; DETAIL_CACHE_DIR="${detailDir}"; THREAD_CACHE_DIR="${threadDir}"; REVIEW_COMMENT_CACHE_DIR="${reviewCommentDir}"; REVIEW_URL_CACHE_DIR="${reviewUrlDir}"; FILES_CACHE_DIR="${filesDir}"; CI_MERGE_CACHE_DIR="${ciMergeDir}"; get_cached_row_json_for_pr '${prJson}' 'open'`,
    );

    expect(output).toBe("");
  });

  test("refreshes viewed-file progress when enrich_cached_row_with_viewed_files receives fresh cache data", () => {
    const freshViewedDir = runShell("mktemp -d");
    runShell(
      `cat > "${freshViewedDir}/789.json" <<'EOF'\n{"changedFiles":20,"viewedFiles":13}\nEOF`,
    );

    const output = runShell(
      `source "${scriptPath}"; VIEWED_FILES_FRESH_CACHE_DIR="${freshViewedDir}"; enrich_cached_row_with_viewed_files '{"number":789,"title":"Viewed files","viewedFilesCount":"1","changedFilesCount":"2","viewedFilesSummary":"1/2 viewed"}' "789"`,
    );

    const row = JSON.parse(output);
    expect(row.viewedFilesCount).toBe("13");
    expect(row.changedFilesCount).toBe("20");
    expect(row.viewedFilesSummary).toBe("13/20 viewed");
  });
});
