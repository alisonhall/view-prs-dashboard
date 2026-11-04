// Open PRs' live summary: one paginated GraphQL listing per repo, run with
// each quick check, holding what a collapsed table row shows - including
// what GitHub changes without moving a PR's updatedAt (CI finishing,
// mergeability as the target branch moves, files marked viewed, threads
// resolved), which the updatedAt-based quick check can't see and a full
// refresh only catches on its next sweep.
//
// Kept in its own file (VIEW_PRS_LIVE_SUMMARY_FILE), written only by the
// server, and laid over the script's rows when they're read
// (applyLiveSummaryToEntry), so it never contends for the script's lock on
// the data file. Each value is in the shape the script writes, so the UI
// reads an overlaid row exactly like a freshly fetched one.

// 25 PRs a page keeps a page's nested connections (100 threads and 100
// files per PR) well inside GitHub's per-query node limit.
const LIVE_SUMMARY_PAGE_SIZE = 25;
// 500 open PRs; a repo with more lists only its newest ones.
const LIVE_SUMMARY_MAX_PAGES = 20;

// Pages in order of creation, which never changes: GitHub's cursors mark a
// place in the order, so with UPDATED_AT a PR updated while the pages were
// read moved ahead of the cursor and was skipped - and a complete listing
// without it marked its row "No longer open".
const LIVE_SUMMARY_QUERY = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: ${LIVE_SUMMARY_PAGE_SIZE}, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url isDraft updatedAt additions deletions changedFiles mergeable
        labels(first: 50) { nodes { name } }
        assignees(first: 25) { nodes { login name } }
        reviewRequests(first: 25) { nodes { requestedReviewer { ... on User { login name } } } }
        commits(last: 1) {
          nodes { commit { statusCheckRollup {
            state
            contexts(first: 1) {
              checkRunCountsByState { state count }
              statusContextCountsByState { state count }
            }
          } } }
        }
        reviewThreads(first: 100) { totalCount nodes { isResolved } }
        files(first: 100) { totalCount nodes { viewerViewedState } }
      }
    }
  }
}`;

const asArray = (value) => (Array.isArray(value) ? value : []);
const asString = (value) => (value === null || value === undefined ? "" : String(value));
const toMs = (value) => {
  const ms = Date.parse(asString(value));
  return Number.isFinite(ms) ? ms : 0;
};

// The script's CHK state (check-open-pr-updates.sh, compute_pr_state_json):
// any failure, else anything running, else a pass, else all skipped. From
// the rollup's per-state counts, so all-skipped reads SKIP as it does there;
// the rollup's own overall state is the fallback.
const CHECK_RUN_STATE_TO_CHK = {
  SUCCESS: "PASS",
  NEUTRAL: "SKIP",
  SKIPPED: "SKIP",
  QUEUED: "RUN",
  IN_PROGRESS: "RUN",
  PENDING: "RUN",
  WAITING: "RUN",
  REQUESTED: "RUN",
  COMPLETED: "RUN",
};
const STATUS_STATE_TO_CHK = { SUCCESS: "PASS", PENDING: "RUN", EXPECTED: "RUN" };

const toCheckState = (rollup) => {
  if (!rollup || typeof rollup !== "object") {
    return "NA";
  }
  const checkRunCounts = asArray(rollup.contexts?.checkRunCountsByState);
  const statusCounts = asArray(rollup.contexts?.statusContextCountsByState);
  const states = [
    ...checkRunCounts
      .filter((entry) => Number(entry?.count) > 0)
      .map((entry) => CHECK_RUN_STATE_TO_CHK[asString(entry.state).toUpperCase()] || "FAIL"),
    ...statusCounts
      .filter((entry) => Number(entry?.count) > 0)
      .map((entry) => STATUS_STATE_TO_CHK[asString(entry.state).toUpperCase()] || "FAIL"),
  ];
  if (states.length === 0) {
    const overall = asString(rollup.state).toUpperCase();
    if (!overall) return "NA";
    return STATUS_STATE_TO_CHK[overall] || "FAIL";
  }
  for (const state of ["FAIL", "RUN", "PASS", "SKIP"]) {
    if (states.includes(state)) return state;
  }
  return "NA";
};

// null for UNKNOWN: GitHub is still working it out, and the row keeps what
// it had rather than flicker to UNK.
const toMergeState = (mergeable) => {
  const value = asString(mergeable).toUpperCase();
  if (value === "MERGEABLE") return "YES";
  if (value === "CONFLICTING") return "NO";
  return null;
};

const toPeople = (nodes) =>
  asArray(nodes)
    .map((node) => ({ login: asString(node?.login), name: asString(node?.name) }))
    .filter((person) => person.login !== "");

// One listed PR, in the script's field shapes. A count from a connection
// cut off at its first page is null - the row keeps the full refresh's.
const normalizeLiveSummaryPr = (node = {}) => {
  const threads = node.reviewThreads || {};
  const threadNodes = asArray(threads.nodes);
  const threadsComplete = Number(threads.totalCount) === threadNodes.length;
  const files = node.files || {};
  const fileNodes = asArray(files.nodes);
  const filesComplete = Number(files.totalCount) === fileNodes.length;
  const requestedReviewers = toPeople(
    asArray(node.reviewRequests?.nodes).map((request) => request?.requestedReviewer),
  );
  // As the script lists them (jq's unique_by): one per login, by login.
  const uniqueReviewers = [...new Map(requestedReviewers.map((person) => [person.login, person])).values()].sort(
    (a, b) => (a.login < b.login ? -1 : a.login > b.login ? 1 : 0),
  );
  const rollup = asArray(node.commits?.nodes)[0]?.commit?.statusCheckRollup || null;

  return {
    number: asString(node.number),
    title: asString(node.title),
    url: asString(node.url),
    isDraft: node.isDraft === true,
    updatedAt: asString(node.updatedAt),
    labels: asArray(node.labels?.nodes).map((label) => asString(label?.name)).filter(Boolean),
    additions: asString(node.additions ?? 0),
    deletions: asString(node.deletions ?? 0),
    changedFiles: asString(node.changedFiles ?? 0),
    viewedFiles: filesComplete
      ? String(fileNodes.filter((file) => file?.viewerViewedState === "VIEWED").length)
      : null,
    checkState: toCheckState(rollup),
    mergeState: toMergeState(node.mergeable),
    assignees: toPeople(node.assignees?.nodes),
    requestedReviewers: uniqueReviewers,
    // The script counts unresolved threads when a PR has any; without
    // threads it estimates from comments, which only a full refresh has.
    openConversationCount:
      threadNodes.length > 0 && threadsComplete
        ? String(threadNodes.filter((thread) => thread?.isResolved === false).length)
        : null,
  };
};

// The row's data fields this summary replaces, when it's newer than the
// row's full refresh. CI and mergeability only with `includeCi`: a run that
// reused the row fetched those again (ciFetchedAt), after this listing.
const overlayLiveSummaryFields = (data = {}, summary, { includeCi = true } = {}) => {
  const checkState = includeCi ? summary.checkState : asString(data.checkState) || "UNK";
  const mergeState = (includeCi && summary.mergeState) || asString(data.mergeState) || "UNK";
  const next = {
    ...data,
    title: summary.title || data.title,
    url: summary.url || data.url,
    labels: summary.labels,
    additions: summary.additions,
    deletions: summary.deletions,
    changedFilesCount: summary.changedFiles,
    checkState,
    mergeState,
    titleDisplay: `${summary.title || data.title || ""} [CHK:${checkState}][MRG:${mergeState}]`,
    assignees: summary.assignees,
    requestedReviewers: summary.requestedReviewers,
  };
  if (summary.viewedFiles !== null) {
    next.viewedFilesCount = summary.viewedFiles;
    next.viewedFilesSummary = `${summary.viewedFiles}/${summary.changedFiles} viewed`;
  }
  if (summary.openConversationCount !== null) {
    next.openConversationCount = summary.openConversationCount;
  }
  return next;
};

// A data-file entry with its repo's live summary laid over it. Only open
// and draft rows: the listing is of open PRs, and merged/closed rows don't
// change in the ways it's for. A listed row gets `data.live`:
//   updatedAt      - GitHub's updatedAt for it when listed;
//   detailsBehind  - GitHub has activity the full refresh hasn't fetched;
//   stillOpen      - true.
// A row a complete listing after its refresh didn't have (merged or closed
// since; the quick check queues it) gets `data.live = { stillOpen: false }`.
// When the repo was listed is per repo, in the data meta
// (getLiveSummaryMeta), not per row: a listing that changes nothing for a
// row leaves the row as it was, so the page doesn't refetch every open row
// with each one.
// The summary's values replace the row's only when listed after the row
// was written (`fetchedAt`, from the script; `updatedAt`, the run's start,
// for rows written before it had one) - a newer full refresh is just as
// current, and more complete. CI and mergeability only when listed after
// the script last fetched them (`ciFetchedAt`: a run that reuses an open
// row still fetches its CI, without moving `fetchedAt`).
const applyLiveSummaryToEntry = (entry, repoSummary) => {
  if (!entry || typeof entry !== "object" || !repoSummary || !repoSummary.checkedAt) {
    return entry;
  }
  const section = asString(entry.section);
  if (section !== "open" && section !== "draft") {
    return entry;
  }
  const data = entry.data && typeof entry.data === "object" ? entry.data : {};
  const checkedAtMs = toMs(repoSummary.checkedAt);
  const isNewer = checkedAtMs > toMs(entry.fetchedAt || entry.updatedAt);
  const summary = repoSummary.prs?.[asString(entry.prNumber || data.number)];

  if (!summary) {
    // A listing cut off at its page limit doesn't show it's gone.
    if (!isNewer || repoSummary.complete !== true) {
      return entry;
    }
    return { ...entry, data: { ...data, live: { stillOpen: false } } };
  }

  const live = {
    updatedAt: summary.updatedAt,
    detailsBehind: toMs(summary.updatedAt) > toMs(data.sourceUpdatedAt),
    stillOpen: true,
  };
  if (!isNewer) {
    return { ...entry, data: { ...data, live } };
  }
  const includeCi = checkedAtMs > toMs(entry.ciFetchedAt || entry.fetchedAt || entry.updatedAt);
  return {
    ...entry,
    section: summary.isDraft ? "draft" : "open",
    data: { ...overlayLiveSummaryFields(data, summary, { includeCi }), live },
  };
};

// The repo's open rows whose review threads changed since they were
// fetched: their unresolved-thread count differs from a listing newer than
// the fetch. Resolving a thread doesn't move a PR's updatedAt, so the quick
// check (which compares updatedAt) doesn't see it, and a full run reuses
// the row - threads, status reason and all - for up to 4 hours. Compares
// the script's own count of unresolved threads (metrics), the same count
// the listing makes, so a refreshed row matches and isn't queued again.
const findPrsWithChangedThreads = (entries, repo, repoSummary) => {
  const checkedAtMs = toMs(repoSummary?.checkedAt);
  if (!repoSummary?.prs || !Number.isFinite(checkedAtMs)) {
    return [];
  }
  return asArray(entries)
    .filter((entry) => {
      const section = asString(entry?.section);
      if (asString(entry?.repo) !== repo || (section !== "open" && section !== "draft")) {
        return false;
      }
      if (!(checkedAtMs > toMs(entry.fetchedAt || entry.updatedAt))) {
        return false;
      }
      const listed = repoSummary.prs[asString(entry.prNumber || entry.data?.number)];
      const stored = entry.data?.metrics?.conversationSummary?.openThreads;
      return (
        listed?.openConversationCount !== null &&
        listed?.openConversationCount !== undefined &&
        stored !== null &&
        stored !== undefined &&
        String(stored) !== String(listed.openConversationCount)
      );
    })
    .map((entry) => Number(entry.prNumber || entry.data?.number))
    .filter((number) => Number.isInteger(number) && number > 0);
};

const createViewPrsLiveSummaryHelpers = ({
  fs,
  liveSummaryFile,
  runViewPrsCommand,
  // (repo) => the env gh needs for it (GH_HOST for a GitHub Enterprise
  // repo); none without it.
  getRepoGhEnv = () => ({}),
  timeoutMs = 60 * 1000,
  now = () => new Date(),
}) => {
  const readLiveSummary = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(liveSummaryFile, "utf8"));
      return parsed && typeof parsed === "object" && parsed.byRepo && typeof parsed.byRepo === "object"
        ? parsed
        : { byRepo: {} };
    } catch (_error) {
      return { byRepo: {} };
    }
  };

  // Synchronous read-modify-write, then a rename: nothing else writes this
  // file, and no other server code runs in between.
  const writeRepoLiveSummary = (repo, update) => {
    const current = readLiveSummary();
    const next = {
      byRepo: { ...current.byRepo, [repo]: { ...(current.byRepo[repo] || {}), ...update } },
    };
    const tmpFile = `${liveSummaryFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmpFile, JSON.stringify(next), "utf8");
    fs.renameSync(tmpFile, liveSummaryFile);
  };

  const fetchPage = async (owner, name, after, env) => {
    const args = ["api", "graphql", "-f", `query=${LIVE_SUMMARY_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`];
    if (after) {
      args.push("-f", `after=${after}`);
    }
    let stdout;
    try {
      ({ stdout } = await runViewPrsCommand("gh", args, 20 * 1024 * 1024, { timeoutMs, env }));
    } catch (failure) {
      // gh exits non-zero on a GraphQL error, with the reason on stdout.
      stdout = failure?.stdout;
      if (!stdout) {
        throw new Error(
          failure?.didTimeout ? "timed out" : asString(failure?.stderr).trim() || failure?.error?.message || "gh failed",
          { cause: failure },
        );
      }
    }
    const parsed = JSON.parse(asString(stdout) || "{}");
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      throw new Error(parsed.errors.map((error) => error?.message).filter(Boolean).join("; ") || "GraphQL error");
    }
    const connection = parsed?.data?.repository?.pullRequests;
    if (!connection) {
      throw new Error("no pull requests in the response");
    }
    return connection;
  };

  // `complete`: every open PR was listed, not stopped at the page limit.
  const fetchRepoLiveSummary = async (repo) => {
    const [owner, name] = asString(repo).split("/");
    const prs = {};
    let after = null;
    for (let page = 0; page < LIVE_SUMMARY_MAX_PAGES; page += 1) {
      const connection = await fetchPage(owner, name, after, getRepoGhEnv(repo));
      asArray(connection.nodes).forEach((node) => {
        const summary = normalizeLiveSummaryPr(node);
        if (summary.number) prs[summary.number] = summary;
      });
      if (!connection.pageInfo?.hasNextPage || !connection.pageInfo?.endCursor) {
        return { prs, complete: true };
      }
      after = connection.pageInfo.endCursor;
    }
    return { prs, complete: false };
  };

  // Lists the repo and saves it. A failure keeps the last good listing (its
  // checkedAt shows how old it is) and records why; it never throws.
  const refreshRepoLiveSummary = async (repo) => {
    const startedAt = now().toISOString();
    try {
      const { prs, complete } = await fetchRepoLiveSummary(repo);
      writeRepoLiveSummary(repo, { checkedAt: startedAt, complete, prs, lastError: null, lastErrorAt: null });
      return { ok: true, prCount: Object.keys(prs).length, complete };
    } catch (error) {
      const message = error?.message || String(error);
      try {
        writeRepoLiveSummary(repo, { lastError: message, lastErrorAt: startedAt });
      } catch (_writeError) {
        // Reported below either way.
      }
      return { ok: false, error: message };
    }
  };

  // Part of the data version the page polls: a new listing re-renders.
  const getLiveSummaryVersion = () => {
    try {
      const stats = fs.statSync(liveSummaryFile);
      return `${Math.trunc(stats.mtimeMs)}:${stats.size}`;
    } catch (_error) {
      return "none";
    }
  };

  // Each repo's listing state, for the data meta: when it was last listed,
  // and the last failure (cleared by the next success).
  const getLiveSummaryMeta = () =>
    Object.fromEntries(
      Object.entries(readLiveSummary().byRepo).map(([repo, summary]) => [
        repo,
        {
          checkedAt: summary?.checkedAt || null,
          complete: summary?.complete === true,
          lastError: summary?.lastError || null,
          lastErrorAt: summary?.lastErrorAt || null,
        },
      ]),
    );

  return { readLiveSummary, refreshRepoLiveSummary, getLiveSummaryVersion, getLiveSummaryMeta };
};

module.exports = {
  LIVE_SUMMARY_QUERY,
  toCheckState,
  toMergeState,
  normalizeLiveSummaryPr,
  applyLiveSummaryToEntry,
  findPrsWithChangedThreads,
  createViewPrsLiveSummaryHelpers,
};
