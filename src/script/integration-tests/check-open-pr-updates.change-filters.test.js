const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const scriptDir = path.join(__dirname, "..");
const scriptPath = path.join(scriptDir, "check-open-pr-updates.sh");

const runShell = (command) =>
  execFileSync("bash", ["-c", command], {
    cwd: scriptDir,
    encoding: "utf8",
    env: { ...process.env, BASH_ENV: "" },
  }).trim();

describe("change filter configuration loading", () => {
  test("given user-defaults.json with changeFilters, when load_change_filter_config is called, then filter variables are populated", () => {
    const tempDir = runShell("mktemp -d");
    const userDefaultsPath = `${tempDir}/user-defaults.json`;

    runShell(
      `cat > "${userDefaultsPath}" <<'EOF'\n{\n  "repo": "owner/repo",\n  "changeFilters": {\n    "ignoreCommentsFromAuthors": ["bot1", "bot2"],\n    "ignoreReviewsFromAuthors": ["optional-reviewer"],\n    "ignoreCommitPatterns": ["^docs:", "^test:"]\n  }\n}\nEOF`,
    );

    const result = runShell(
      `source "${scriptPath}"; DATA_DIR="${tempDir}"; load_change_filter_config; echo "comments=$CHANGE_FILTER_IGNORE_COMMENT_AUTHORS|reviews=$CHANGE_FILTER_IGNORE_REVIEW_AUTHORS|patterns=$CHANGE_FILTER_IGNORE_COMMIT_PATTERNS"`,
    );

    expect(result).toContain("comments=bot1,bot2");
    expect(result).toContain("reviews=optional-reviewer");
    expect(result).toContain("patterns=^docs:|^test:");
  });

  test("given user-defaults.json without changeFilters, when load_change_filter_config is called, then filter variables are empty", () => {
    const tempDir = runShell("mktemp -d");
    const userDefaultsPath = `${tempDir}/user-defaults.json`;

    runShell(
      `cat > "${userDefaultsPath}" <<'EOF'\n{\n  "repo": "owner/repo"\n}\nEOF`,
    );

    const result = runShell(
      `source "${scriptPath}"; DATA_DIR="${tempDir}"; load_change_filter_config; echo "comments=$CHANGE_FILTER_IGNORE_COMMENT_AUTHORS|reviews=$CHANGE_FILTER_IGNORE_REVIEW_AUTHORS|patterns=$CHANGE_FILTER_IGNORE_COMMIT_PATTERNS"`,
    );

    expect(result).toBe("comments=|reviews=|patterns=");
  });

  test("given no user-defaults.json file, when load_change_filter_config is called, then it returns successfully with empty variables", () => {
    const tempDir = runShell("mktemp -d");

    const result = runShell(
      `source "${scriptPath}"; DATA_DIR="${tempDir}"; load_change_filter_config; echo "success:$CHANGE_FILTER_IGNORE_COMMENT_AUTHORS"`,
    );

    expect(result).toBe("success:");
  });

  test("given empty arrays in changeFilters, when load_change_filter_config is called, then filter variables are empty strings", () => {
    const tempDir = runShell("mktemp -d");
    const userDefaultsPath = `${tempDir}/user-defaults.json`;

    runShell(
      `cat > "${userDefaultsPath}" <<'EOF'\n{\n  "repo": "owner/repo",\n  "changeFilters": {\n    "ignoreCommentsFromAuthors": [],\n    "ignoreReviewsFromAuthors": [],\n    "ignoreCommitPatterns": []\n  }\n}\nEOF`,
    );

    const result = runShell(
      `source "${scriptPath}"; DATA_DIR="${tempDir}"; load_change_filter_config; echo "$CHANGE_FILTER_IGNORE_COMMENT_AUTHORS|$CHANGE_FILTER_IGNORE_REVIEW_AUTHORS|$CHANGE_FILTER_IGNORE_COMMIT_PATTERNS"`,
    );

    expect(result).toBe("||");
  });

  test("given single filter values, when load_change_filter_config is called, then patterns are joined correctly", () => {
    const tempDir = runShell("mktemp -d");
    const userDefaultsPath = `${tempDir}/user-defaults.json`;

    runShell(
      `cat > "${userDefaultsPath}" <<'EOF'\n{\n  "repo": "owner/repo",\n  "changeFilters": {\n    "ignoreCommentsFromAuthors": ["single-bot"],\n    "ignoreReviewsFromAuthors": ["single-reviewer"],\n    "ignoreCommitPatterns": ["^single-pattern:"]\n  }\n}\nEOF`,
    );

    const result = runShell(
      `source "${scriptPath}"; DATA_DIR="${tempDir}"; load_change_filter_config; echo "$CHANGE_FILTER_IGNORE_COMMENT_AUTHORS|$CHANGE_FILTER_IGNORE_REVIEW_AUTHORS|$CHANGE_FILTER_IGNORE_COMMIT_PATTERNS"`,
    );

    expect(result).toBe("single-bot|single-reviewer|^single-pattern:");
  });
});

describe("change filter application in jq queries", () => {
  test("given detail JSON with comments from ignored authors, when counting external comments, then ignored authors are excluded", () => {
    const detailJson = JSON.stringify({
      comments: [
        { author: { login: "alice" }, createdAt: "2024-01-15T10:00:00Z" },
        { author: { login: "bot1" }, createdAt: "2024-01-15T11:00:00Z" },
        { author: { login: "bob" }, createdAt: "2024-01-15T12:00:00Z" },
        { author: { login: "bot2" }, createdAt: "2024-01-15T13:00:00Z" },
      ],
    });

    const count = runShell(
      `printf '%s' '${detailJson}' | jq -r --arg me "viewer" --arg ignoreAuthors "bot1,bot2" '($ignoreAuthors | split(",") | map(select(length > 0))) as $ignored | [.comments[]? | select((.author.login // "") != "" and .author.login != $me) | select(($ignored | length) == 0 or (.author.login as $author | $ignored | index($author) | not))] | length'`,
    );

    expect(count).toBe("2"); // Only alice and bob counted
  });

  test("given detail JSON with no ignored comment authors, when counting external comments, then all non-viewer comments are counted", () => {
    const detailJson = JSON.stringify({
      comments: [
        { author: { login: "alice" }, createdAt: "2024-01-15T10:00:00Z" },
        { author: { login: "bob" }, createdAt: "2024-01-15T11:00:00Z" },
        { author: { login: "carol" }, createdAt: "2024-01-15T12:00:00Z" },
      ],
    });

    const count = runShell(
      `printf '%s' '${detailJson}' | jq -r --arg me "viewer" --arg ignoreAuthors "" '($ignoreAuthors | split(",") | map(select(length > 0))) as $ignored | [.comments[]? | select((.author.login // "") != "" and .author.login != $me) | select(($ignored | length) == 0 or (.author.login as $author | $ignored | index($author) | not))] | length'`,
    );

    expect(count).toBe("3");
  });

  test("given detail JSON with reviews from ignored authors, when counting external reviews, then ignored authors and approved reviews are excluded", () => {
    const detailJson = JSON.stringify({
      reviews: [
        { author: { login: "alice" }, submittedAt: "2024-01-15T10:00:00Z", state: "COMMENTED" },
        { author: { login: "optional-reviewer" }, submittedAt: "2024-01-15T11:00:00Z", state: "COMMENTED" },
        { author: { login: "bob" }, submittedAt: "2024-01-15T12:00:00Z", state: "CHANGES_REQUESTED" },
        { author: { login: "optional-reviewer" }, submittedAt: "2024-01-15T13:00:00Z", state: "APPROVED" },
      ],
    });

    const count = runShell(
      `printf '%s' '${detailJson}' | jq -r --arg me "viewer" --arg ignoreAuthors "optional-reviewer" '($ignoreAuthors | split(",") | map(select(length > 0))) as $ignored | [.reviews[]? | select((.author.login // "") != "" and .author.login != $me) | select((.state // "") != "APPROVED") | select(($ignored | length) == 0 or (.author.login as $author | $ignored | index($author) | not))] | length'`,
    );

    expect(count).toBe("2"); // alice COMMENTED and bob CHANGES_REQUESTED
  });
});

// A temp directory the tests write JSON into with Node rather than a bash
// heredoc (on Windows the command line passed to bash -c loses backslashes,
// e.g. in a ^Merge\b pattern), as a forward-slash path bash and jq accept.
const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "change-filters-")).split(path.sep).join("/");
const writeJson = (dir, name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));

// The script's own count_external_commits (sourced, not a copy of its jq),
// with the config load_change_filter_config reads from user-defaults.json.
const countCommits = ({ commits, userDefaults, since = "" }) => {
  const tempDir = makeTempDir();
  writeJson(tempDir, "detail.json", { commits });
  if (userDefaults) {
    writeJson(tempDir, "user-defaults.json", userDefaults);
  }
  return runShell(
    `source "${scriptPath}"; DATA_DIR="${tempDir}"; VIEWER_LOGIN="viewer"; load_change_filter_config; count_external_commits "$(cat "${tempDir}/detail.json")" "${since}"`,
  );
};

const commit = (login, messageHeadline, committedDate = "2024-01-15T10:00:00Z") => ({
  authors: [{ login }],
  committedDate,
  messageHeadline,
});

describe("count_external_commits (merge commit rules and ignore patterns)", () => {
  test("given the default rules, when counting, then any 'Merge ...' headline (any case) and the viewer's own commits are left out", () => {
    const count = countCommits({
      commits: [
        commit("alice", "Merge branch 'feature-x' into y"),
        commit("alice", "merge main into feature"),
        commit("bob", "feat: add banner"),
        commit("viewer", "fix: my own change"),
      ],
    });

    expect(count).toBe("1");
  });

  test("given saved headline patterns, when counting, then they replace the default", () => {
    const count = countCommits({
      userDefaults: { mergeCommitRules: { headlinePatterns: ["^Sync "], logins: [] } },
      commits: [commit("alice", "Merge branch 'main' into x"), commit("alice", "Sync upstream")],
    });

    expect(count).toBe("1");
  });

  test("given an invalid headline pattern, when counting, then it is skipped and the valid ones still apply", () => {
    const count = countCommits({
      userDefaults: { mergeCommitRules: { headlinePatterns: ["(", "^Merge\\b"], logins: [] } },
      commits: [commit("alice", "Merge branch 'main' into x"), commit("bob", "feat: real work")],
    });

    expect(count).toBe("1");
  });

  test("given merge logins, when counting, then commits whose every author is listed (any case) are left out, but not co-authored ones", () => {
    const count = countCommits({
      userDefaults: { mergeCommitRules: { headlinePatterns: [], logins: ["Dependabot[bot]"] } },
      commits: [
        commit("dependabot[bot]", "chore(deps): bump x"),
        { authors: [{ login: "dependabot[bot]" }, { login: "alice" }], committedDate: "2024-01-15T10:00:00Z", messageHeadline: "chore(deps): bump y" },
        commit("bob", "feat: real work"),
      ],
    });

    expect(count).toBe("2");
  });

  test("given ignore patterns, when counting, then matching commits are still left out alongside merges", () => {
    const count = countCommits({
      userDefaults: { changeFilters: { ignoreCommitPatterns: ["^docs:"] } },
      commits: [commit("alice", "docs: readme"), commit("alice", "Merge main into x"), commit("bob", "feat: real work")],
    });

    expect(count).toBe("1");
  });

  test("given a since time, when counting, then only later commits count", () => {
    const count = countCommits({
      since: "2024-01-15T12:00:00Z",
      commits: [commit("alice", "feat: before", "2024-01-15T11:00:00Z"), commit("bob", "feat: after", "2024-01-15T13:00:00Z")],
    });

    expect(count).toBe("1");
  });

  test("given settings saved with the old built-in merge filter turned off, when counting, then 'Merge ...' commits count", () => {
    const count = countCommits({
      userDefaults: { changeFilters: { useBuiltinMergePattern: false } },
      commits: [commit("alice", "Merge branch 'main' into x"), commit("bob", "feat: real work")],
    });

    expect(count).toBe("2");
  });
});

describe("merge commit rules configuration", () => {
  const loadRules = (userDefaults) => {
    const tempDir = makeTempDir();
    if (userDefaults) {
      writeJson(tempDir, "user-defaults.json", userDefaults);
    }
    return runShell(
      `source "${scriptPath}"; DATA_DIR="${tempDir}"; load_change_filter_config; echo "$MERGE_COMMIT_HEADLINE_PATTERNS_JSON|$MERGE_COMMIT_LOGINS_JSON"`,
    );
  };

  test("given saved mergeCommitRules, when loading, then both lists are read", () => {
    expect(loadRules({ mergeCommitRules: { headlinePatterns: ["^Sync "], logins: ["bot[bot]"] } })).toBe(
      '["^Sync "]|["bot[bot]"]',
    );
  });

  test("given no mergeCommitRules, when loading, then the default ^Merge\\b pattern and no logins are used", () => {
    expect(loadRules({ repo: "owner/repo" })).toBe('["^Merge\\\\b"]|[]');
    expect(loadRules(null)).toBe('["^Merge\\\\b"]|[]');
  });

  test("given the old built-in merge filter turned off and no mergeCommitRules, when loading, then there are no headline patterns", () => {
    expect(loadRules({ changeFilters: { useBuiltinMergePattern: false } })).toBe("[]|[]");
  });
});
