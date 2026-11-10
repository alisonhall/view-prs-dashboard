/**
 * Realistic rows for the long-session heap check (--rich): each PR's
 * details (comments with markdown bodies, reviews, commits, review threads)
 * are made up and computed into a row by the script's own computePrRow, so
 * the rows have the shape and size of real ones - activity events, the
 * activity timeline, review threads - which the plain dataset's rows lack.
 * Anything the page keeps per data change grows with its rows, so a leak
 * too small to see with the plain rows can show with these.
 *
 * `generation` 0 is the initial dataset. Each later one adds a comment and
 * a commit to a different ~10% of PRs, as a real refresh would, dropping
 * their oldest, so the rows change but the dataset stays the same size.
 */

const { computePrRow } = require("../../src/script/compute-pr-row");

const REPO = "owner/repo";
const VIEWER = "stability-viewer";
const PEOPLE = ["alice", "bob", "carol", "dave", "erin", "frank", VIEWER];
const DAY_MS = 86400000;
const START = Date.UTC(2026, 0, 1);

const iso = (ms) => new Date(ms).toISOString();

// A comment body like a real review comment: a paragraph, a list, a code
// block and a link - what the Activity tab renders as markdown.
const body = (pr, i) =>
  [
    `Looked at the change to \`src/module-${pr}/file-${i}.ts\` - mostly fine, a few things before this goes in.`,
    "",
    `- The retry loop in \`fetchItems\` never gives up when the server answers 5xx; cap it (see #${pr + i}).`,
    "- The new option isn't in the README yet.",
    "- A test for the empty list would help.",
    "",
    "```ts",
    `const items = await fetchItems({ page: ${i}, retries: 3 });`,
    "if (items.length === 0) return [];",
    "```",
    "",
    `Details: https://github.com/${REPO}/pull/${pr}#discussion_r${pr * 1000 + i}`,
  ].join("\n");

function prDetails(n, generation) {
  // How many data changes have touched this PR so far.
  let touches = 0;
  for (let g = 1; g <= generation; g += 1) if ((n + g) % 10 === 0) touches += 1;
  const created = START + (n % 20) * DAY_MS;
  const author = PEOPLE[n % 6];
  const at = (k) => iso(created + k * 3600000);
  const other = (k) => PEOPLE[(n + k) % 6] === author ? PEOPLE[(n + k + 1) % 6] : PEOPLE[(n + k) % 6];

  const comments = [];
  // The newest 12 comments and 15 commits: each change adds one of each and
  // drops the oldest, so a row changes without growing (a growing dataset
  // would look like a leak).
  for (let i = touches; i < 12 + touches; i += 1) {
    const login = i % 4 === 3 ? VIEWER : other(i);
    comments.push({ id: `c-${n}-${i}`, author: { login, name: login.toUpperCase() }, createdAt: at(i * 5), body: body(n, i), url: `https://github.com/${REPO}/pull/${n}#issuecomment-${n * 100 + i}` });
  }
  const commits = [];
  for (let i = touches; i < 15 + touches; i += 1) {
    commits.push({
      oid: `oid-${n}-${i}`,
      committedDate: at(i * 4 + 1),
      authoredDate: at(i * 4 + 1),
      messageHeadline: `Change ${i} to module ${n}: handle the empty list and cap retries`,
      messageBody: "",
      authors: [{ login: author, name: author.toUpperCase(), email: `${author}@example.com` }],
    });
  }
  const reviews = [];
  for (let i = 0; i < 6; i += 1) {
    const login = i === 5 ? VIEWER : other(i + 2);
    reviews.push({ id: `r-${n}-${i}`, author: { login }, state: ["COMMENTED", "CHANGES_REQUESTED", "APPROVED"][i % 3], submittedAt: at(i * 9 + 2), body: i % 2 ? body(n, 50 + i) : "", url: `https://github.com/${REPO}/pull/${n}#pullrequestreview-${n * 100 + i}`, commit: { oid: `oid-${n}-${Math.min(i * 2, 14)}` } });
  }
  const threads = [];
  for (let t = 0; t < 5; t += 1) {
    const threadComments = [];
    for (let i = 0; i < 4; i += 1) {
      const login = i % 2 ? author : other(t + i);
      threadComments.push({ id: `tc-${n}-${t}-${i}`, authorLogin: login, author: { login }, body: body(n, 100 + t * 4 + i), createdAt: at(t * 6 + i + 3), url: `https://github.com/${REPO}/pull/${n}#discussion_r${n * 1000 + t * 10 + i}` });
    }
    threads.push({ id: `t-${n}-${t}`, isResolved: t % 2 === 0, path: `src/module-${n}/file-${t}.ts`, line: 10 + t, comments: threadComments });
  }
  const updatedAt = at(Math.max(12 + touches, 15 + touches) * 5);
  return {
    pr: {
      number: String(n),
      title: `Handle the empty list in module ${n}${touches ? ` (rev ${touches})` : ""}`,
      url: `https://github.com/${REPO}/pull/${n}`,
      labels: [{ name: n % 5 === 0 ? "bug" : "enhancement" }],
      isDraft: n % 7 === 0,
      author: { login: author, name: author.toUpperCase() },
      createdAt: iso(created),
      updatedAt,
      headRefName: `feature/${n}`,
      baseRefName: "main",
      additions: 120 + n,
      deletions: 30 + n,
      mergedAt: "",
      closedAt: "",
    },
    detail: {
      comments,
      reviews,
      commits,
      reviewRequests: [{ requestedReviewer: { login: VIEWER } }],
      assignees: [{ login: other(3) }],
      statusCheckRollup: [{ __typename: "CheckRun", status: "COMPLETED", conclusion: n % 6 ? "SUCCESS" : "FAILURE", startedAt: at(1), completedAt: at(2) }],
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    },
    threads,
    updatedAt,
  };
}

function buildRichDataset(count, generation = 0) {
  const byPrNumber = {};
  for (let n = 1; n <= count; n += 1) {
    const { pr, detail, threads, updatedAt } = prDetails(n, generation);
    const { row } = computePrRow({ pr, detail, threads, viewerLogin: VIEWER, viewedFilesStats: { changedFiles: 12, viewedFiles: n % 12 } });
    byPrNumber[String(n)] = { prNumber: String(n), repo: REPO, section: "open", updatedAt, rowOrder: n, data: row };
  }
  return { byPrNumber, lastRun: { repo: REPO, updatedAt: iso(START + generation * 60000) } };
}

module.exports = { buildRichDataset };
