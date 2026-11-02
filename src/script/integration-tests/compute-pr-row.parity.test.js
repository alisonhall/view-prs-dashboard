// compute-pr-row.js gives the rows compute_pr_state_json gave in bash and jq
// (legacy-compute-pr-state.sh, kept for this): the same JSON, key order
// included, and the same decision to clear an ack. Cases from a fixed seed,
// built to hit the jq's edges - ties in time, fractional seconds (which
// fromdateiso8601 refuses), non-ASCII names (code point order), "Last,
// First" names, review URLs with review ids, merge commits, invalid
// patterns - plus some by hand. PARITY_CASES=n runs more.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { computePrRow } = require("../compute-pr-row");

const scriptDir = path.join(__dirname, "..");
const toBashPath = (p) => p.replace(/\\/g, "/");

// mulberry32
const makeRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const buildRandomCase = (random) => {
  const pick = (items) => items[Math.floor(random() * items.length)];
  const some = (max, make) => Array.from({ length: Math.floor(random() * (max + 1)) }, make);
  const chance = (p) => random() < p;
  const logins = ["me", "alice", "bob", "Carol", "éclair", "zed", "dependabot[bot]"];
  const times = [
    "2026-03-01T00:00:00Z",
    "2026-03-01T09:30:00Z",
    "2026-03-02T00:00:00Z",
    "2026-03-02T00:00:00Z",
    "2026-03-02T01:00:00Z",
    "2026-03-03T12:00:00Z",
    "2026-03-03T12:00:00.250Z",
    "2026-03-05T08:15:00Z",
  ];
  const time = () => (chance(0.05) ? "" : chance(0.03) ? null : pick(times));
  const person = () => ({ login: pick(logins), name: pick(["", "Smith, Ann", "  Bob   Jones ", "Zoë Ångström", "😀 Fun", null]) });
  const reviewIds = ["1001", "1002", "1003"];
  const reviews = some(5, () => {
    const author = person();
    const id = pick(reviewIds);
    return {
      id: chance(0.8) ? `R_${id}` : undefined,
      author: chance(0.95) ? author : null,
      state: pick(["APPROVED", "COMMENTED", "CHANGES_REQUESTED", "DISMISSED", "PENDING"]),
      submittedAt: time(),
      body: pick(["", "Looks good", "Needs work\nsee below"]),
      url: pick(["", `https://github.com/o/r/pull/1#pullrequestreview-${id}`, `https://github.com/o/r/pull/1#pullrequestreview-${id}?x=1`]),
      commit: chance(0.5) ? { oid: pick(["abc", "def"]) } : undefined,
    };
  });
  const detail = {
    comments: some(4, () => ({
      id: chance(0.9) ? `C_${Math.floor(random() * 5)}` : undefined,
      author: person(),
      createdAt: time(),
      body: pick(["Hi", "Hi", "Question?", ""]),
      url: pick(["", "https://github.com/o/r/pull/1#issuecomment-9"]),
    })),
    reviews,
    reviewRequests: some(2, () =>
      pick([{ requestedReviewer: person() }, { requestedReviewer: { login: "me", name: "Me" } }, { reviewer: person() }, { requestedReviewer: null }]),
    ),
    commits: some(4, () => ({
      oid: pick(["c1", "c2", "c3"]),
      committedDate: time(),
      messageHeadline: pick(["feat: add", "Merge branch 'main' into feature", "Merge pull request #2", "chore: deps", "docs: readme", "Merge main into x"]),
      messageBody: "",
      authors: some(2, () => (chance(0.1) ? { login: null, name: "Ghost", email: "g@x" } : { login: pick(logins), name: "", email: "" })),
    })),
    assignees: some(2, () => (chance(0.8) ? person() : { login: "" })),
    statusCheckRollup: some(3, () =>
      pick([
        { __typename: "CheckRun", status: "COMPLETED", conclusion: pick(["SUCCESS", "FAILURE", "NEUTRAL", "skipped", null]) },
        { __typename: "CheckRun", status: "IN_PROGRESS", conclusion: null },
        { __typename: "StatusContext", state: pick(["SUCCESS", "PENDING", "ERROR", "expected"]) },
      ]),
    ),
    mergeable: pick(["MERGEABLE", "CONFLICTING", "UNKNOWN", "", "blocked", undefined]),
    mergeStateStatus: pick(["CLEAN", "DIRTY", undefined]),
  };
  const threads = some(3, () => ({
    id: `T_${Math.floor(random() * 4)}`,
    isResolved: chance(0.5),
    comments: some(3, () => ({
      id: `TC_${Math.floor(random() * 6)}`,
      authorLogin: pick(logins),
      authorName: pick(["", "Bob Jones", "Zoë"]),
      createdAt: time(),
      body: pick(["fix this", "done", ""]),
      url: pick(["", "https://github.com/o/r/pull/1#discussion_r1"]),
      replyToId: chance(0.3) ? "TC_0" : "",
    })),
  }));
  const reviewComments = some(3, () => ({
    id: `RC_${Math.floor(random() * 4)}`,
    reviewId: chance(0.8) ? pick(reviewIds) : "",
    authorLogin: pick(logins),
    createdAt: time(),
    body: pick(["inline note", ""]),
    url: pick(["", "https://github.com/o/r/pull/1#discussion_r2"]),
    inReplyToId: "",
  }));
  const reviewUrlMap = {};
  reviews.forEach((review) => {
    if (chance(0.3) && review.author) reviewUrlMap[`${review.submittedAt}_${review.author.login}`] = `https://github.com/o/r/pull/1#pullrequestreview-${pick(reviewIds)}`;
  });
  const merged = chance(0.25);
  const closed = !merged && chance(0.15);
  const author = person();
  const pr = {
    number: Math.floor(random() * 900) + 1,
    title: pick(["Add widgets", "Fix: thing\n", "Ünïcode title", "Tabs\tinside"]),
    url: "https://github.com/o/r/pull/1",
    labels: some(3, () => (chance(0.7) ? { name: pick(["bug", "feature", ""]) } : pick(["plain", 5]))),
    author: chance(0.95) ? author : null,
    createdAt: pick(["2026-02-28T10:00:00Z", ""]),
    mergedAt: merged ? pick(times.filter(Boolean)) : chance(0.5) ? null : "",
    closedAt: merged || closed ? pick(times.filter(Boolean)) : null,
    mergedBy: merged ? { login: pick(logins) } : null,
    updatedAt: pick(times),
    headRefName: "feature/x",
    baseRefName: "main",
    additions: pick([0, 12, undefined]),
    deletions: pick([3, undefined]),
  };
  return {
    pr,
    detail,
    threads,
    reviewComments,
    reviewUrlMap,
    viewedFilesStats: pick([{ viewedFiles: 2, changedFiles: 5 }, { changedFiles: 1 }, {}]),
    viewerLogin: chance(0.7) ? "me" : "alice",
    ackAt: chance(0.3) ? pick(times.filter(Boolean)) : "",
    reverifyRequired: chance(0.2) ? "true" : "false",
    inReviewRequired: chance(0.2) ? "true" : "false",
    ignoreCommentAuthors: pick(["", "bob", "bob,zed"]),
    ignoreReviewAuthors: pick(["", "alice"]),
    ignoreCommitPatterns: pick(["", "^docs:", "^chore:|^docs:", "("]),
    mergeHeadlinePatterns: pick([["^Merge\\b"], ["^Merge pull"], ["^Merge\\b", "("], []]),
    mergeLogins: pick([[], ["dependabot[bot]"], ["ME"]]),
  };
};

const handCases = () => {
  const base = buildRandomCase(makeRandom(1));
  return [
    // Nothing at all.
    { ...base, detail: {}, threads: [], reviewComments: [], reviewUrlMap: {}, viewedFilesStats: {}, pr: { number: 7 } },
    // The viewer authored it, with approvals and an unanswered thread.
    {
      ...base,
      viewerLogin: "me",
      pr: { ...base.pr, author: { login: "me", name: "Doe, Jane" } },
      detail: {
        reviews: [
          { author: { login: "alice", name: "Alice" }, state: "APPROVED", submittedAt: "2026-03-02T00:00:00Z" },
          { author: { login: "bob", name: "" }, state: "APPROVED", submittedAt: "2026-03-02T00:00:00Z" },
          { author: { login: "me", name: "Me" }, state: "APPROVED", submittedAt: "2026-03-01T00:00:00Z" },
        ],
        commits: [{ oid: "x", committedDate: "2026-03-03T00:00:00Z", messageHeadline: "feat", authors: [{ login: "alice" }] }],
      },
      threads: [{ id: "T1", isResolved: false, comments: [{ id: "a", authorLogin: "alice", createdAt: "2026-03-04T00:00:00Z" }] }],
    },
  ];
};

const writeCase = (dir, input) => {
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    "pr.json": JSON.stringify(input.pr),
    "detail.json": JSON.stringify(input.detail),
    "threads.json": JSON.stringify(input.threads),
    "review-comments.json": JSON.stringify(input.reviewComments),
    "review-url-map.json": JSON.stringify(input.reviewUrlMap),
    "viewed-files.json": JSON.stringify(input.viewedFilesStats),
    viewer: input.viewerLogin,
    ack: input.ackAt,
    reverify: input.reverifyRequired,
    "in-review": input.inReviewRequired,
    "ignore-comment-authors": input.ignoreCommentAuthors,
    "ignore-review-authors": input.ignoreReviewAuthors,
    "ignore-commit-patterns": input.ignoreCommitPatterns,
    "merge-patterns.json": JSON.stringify(input.mergeHeadlinePatterns),
    "merge-logins.json": JSON.stringify(input.mergeLogins),
  };
  Object.entries(files).forEach(([name, text]) => fs.writeFileSync(path.join(dir, name), text));
};

// Every case through compute_pr_state_json, in one process: the bash and jq
// version (legacy) or the script's own, which runs compute-pr-row.js. Its
// outputs go to <prefix>.json, <prefix>-cleared and <prefix>-failed.
const runBash = (casesDir, { legacy, prefix }) => {
  const driver = `
source "${toBashPath(path.join(scriptDir, "check-open-pr-updates.sh"))}"
${legacy ? `source "${toBashPath(path.join(__dirname, "legacy-compute-pr-state.sh"))}"` : ""}
emit_pr_progress_marker() { :; }
attach_pr_detail_ref() { printf '%s' "$1"; }
strip_inline_pr_detail_fields() { printf '%s' "$1"; }
get_stored_viewed_files_stats_json() { :; }
get_pr_detail_json() { cat "$CASE/detail.json"; }
fetch_review_threads_json() { cat "$CASE/threads.json"; }
fetch_pr_review_comments_json() { cat "$CASE/review-comments.json"; }
fetch_pr_review_url_map_json() { cat "$CASE/review-url-map.json"; }
fetch_pr_viewed_files_stats_json() { cat "$CASE/viewed-files.json"; }
get_ack_ts() { cat "$CASE/ack"; }
get_reverify_required() { cat "$CASE/reverify"; }
get_in_review_required() { cat "$CASE/in-review"; }
clear_ack_ts() { printf 'cleared' >"$CASE/${prefix}-cleared"; }
for CASE in "${toBashPath(casesDir)}"/*; do
  VIEWER_LOGIN=$(cat "$CASE/viewer")
  CHANGE_FILTER_IGNORE_COMMENT_AUTHORS=$(cat "$CASE/ignore-comment-authors")
  CHANGE_FILTER_IGNORE_REVIEW_AUTHORS=$(cat "$CASE/ignore-review-authors")
  CHANGE_FILTER_IGNORE_COMMIT_PATTERNS=$(cat "$CASE/ignore-commit-patterns")
  MERGE_COMMIT_HEADLINE_PATTERNS_JSON=$(cat "$CASE/merge-patterns.json")
  MERGE_COMMIT_LOGINS_JSON=$(cat "$CASE/merge-logins.json")
  compute_pr_state_json "$(cat "$CASE/pr.json")" >"$CASE/${prefix}.json" 2>"$CASE/${prefix}-err.txt" || printf 'failed' >"$CASE/${prefix}-failed"
done
`;
  execFileSync("bash", ["-c", driver], { cwd: scriptDir, encoding: "utf8", env: { ...process.env, BASH_ENV: "" }, maxBuffer: 64 * 1024 * 1024 });
};

describe("compute-pr-row.js gives the rows the bash and jq gave", () => {
  test("each case: the same row JSON, and the same ack decision", () => {
    // 16 by default (each runs the bash and jq, slow on Windows); 302 matched
    // when the computation moved.
    const count = Number(process.env.PARITY_CASES || 16);
    const random = makeRandom(20261102);
    const cases = [...handCases(), ...Array.from({ length: count }, () => buildRandomCase(random))];
    const casesDir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-row-parity-"));
    try {
      cases.forEach((input, index) => writeCase(path.join(casesDir, String(index).padStart(4, "0")), input));
      runBash(casesDir, { legacy: true, prefix: "legacy" });
      runBash(casesDir, { legacy: false, prefix: "script" });

      const mismatches = [];
      cases.forEach((input, index) => {
        const dir = path.join(casesDir, String(index).padStart(4, "0"));
        for (const prefix of ["legacy", "script"]) {
          if (fs.existsSync(path.join(dir, `${prefix}-failed`))) {
            mismatches.push(`case ${index}: ${prefix} failed: ${fs.readFileSync(path.join(dir, `${prefix}-err.txt`), "utf8").slice(0, 300)}`);
          }
        }
        if (mismatches.length > 0) return;
        const legacyParsed = JSON.parse(fs.readFileSync(path.join(dir, "legacy.json"), "utf8"));
        // jq.exe -r writes its newlines as CRLF on Windows, so the jq's summary had
        // them there (LF elsewhere); the Node one has LF everywhere.
        if (typeof legacyParsed.activityTimelineSummary === "string") {
          legacyParsed.activityTimelineSummary = legacyParsed.activityTimelineSummary.split("\r\n").join("\n");
        }
        const legacyRow = JSON.stringify(legacyParsed);
        const legacyCleared = fs.existsSync(path.join(dir, "legacy-cleared"));
        // The script itself (bash, then Node): the same row and ack.
        const scriptRow = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, "script.json"), "utf8")));
        if (scriptRow !== legacyRow) mismatches.push(`case ${index}: the script's row differs from the jq's`);
        if (fs.existsSync(path.join(dir, "script-cleared")) !== legacyCleared) mismatches.push(`case ${index}: the script's ack decision differs`);
        // As the script will pass it: parsed JSON (no undefined values).
        const { row, clearAck } = computePrRow(JSON.parse(JSON.stringify(input)));
        const nodeRow = JSON.stringify(row);
        if (nodeRow !== legacyRow) {
          const legacy = JSON.parse(legacyRow);
          const differing = Object.keys({ ...legacy, ...row }).filter((key) => JSON.stringify(legacy[key]) !== JSON.stringify(row[key]));
          const keyOrder = JSON.stringify(Object.keys(legacy)) === JSON.stringify(Object.keys(row)) ? "" : " (key order differs)";
          mismatches.push(
            `case ${index}: ${differing.join(", ")}${keyOrder}\n  jq:   ${differing.map((key) => JSON.stringify(legacy[key])).join(" | ").slice(0, 600)}\n  node: ${differing.map((key) => JSON.stringify(row[key])).join(" | ").slice(0, 600)}`,
          );
        }
        if (clearAck !== legacyCleared) mismatches.push(`case ${index}: clear ack ${clearAck} vs ${legacyCleared}`);
      });
      expect(mismatches.slice(0, 8).join("\n\n")).toBe("");
    } finally {
      fs.rmSync(casesDir, { recursive: true, force: true });
    }
  }, 900000);
});
