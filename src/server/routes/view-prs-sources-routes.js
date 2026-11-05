const { parsePrUrl, isRepoName } = require("../helpers/view-prs-pr-url");

// The sources file's routes (view-prs-sources-storage.js): what's in view,
// and PRs added to it one by one, by URL - from any repo, a GitHub
// Enterprise one included.
const registerViewPrsSourcesRoutes = ({
  app,
  sourcesStorage,
  // () => the repos to seed the sources file from (see
  // view-prs-scheduler-helpers.js), for one written before it was seeded.
  seedSubscriptionRepos,
  // ({ repo, number, host }) => resolves once gh finds the PR, rejects
  // with why not.
  verifyGithubPr,
  // Refreshes the PR, so its row appears: runViewPrsAutoRefresh.
  runViewPrsAutoRefresh,
  emitDataChanged,
  // () => the sources as the page gets them (with the PRs that couldn't be
  // fetched); the stored ones without it.
  getSourcesForPage,
  console: logger = console,
  // How long the add route waits for its fetch before answering, how long
  // that waits on its repo's run in progress, and how often it looks.
  responseWaitMs = 25000,
  maxWaitMs = 10 * 60 * 1000,
  retryDelayMs = 2000,
}) => {
  const emitDataChangedSafe = typeof emitDataChanged === "function" ? emitDataChanged : () => {};

  const readSourcesForResponse = () =>
    (typeof getSourcesForPage === "function" ? getSourcesForPage() : null) ||
    sourcesStorage.loadSources({ seedRepos: seedSubscriptionRepos }) ||
    sourcesStorage.normalizeSources({});

  app.get("/view-prs/sources", (_req, res) => {
    res.json({ ok: true, sources: readSourcesForResponse() });
  });

  // { repo, mode: "recent" | "numbers", numbers? } - subscribes a repo, or
  // changes how: its recent PRs, or only the numbers listed. Its rows show
  // again (the data's version moves with the sources file), and the
  // background updates take it up at their next tick.
  app.put("/view-prs/subscriptions", (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    if (!isRepoName(repo)) {
      res.status(400).json({ ok: false, error: `Not a repo (owner/name): ${repo}` });
      return;
    }
    const mode = String(req.body?.mode || "recent");
    const numbers = Array.isArray(req.body?.numbers)
      ? req.body.numbers.map((value) => String(value).trim())
      : String(req.body?.numbers || "").split(/[\s,]+/).filter(Boolean);
    const invalidNumber = numbers.find((value) => !/^[1-9]\d*$/.test(value));
    if (invalidNumber !== undefined) {
      res.status(400).json({ ok: false, error: `Not a PR number: ${invalidNumber}` });
      return;
    }
    if (mode === "numbers" && numbers.length === 0) {
      res.status(400).json({ ok: false, error: "List the PR numbers to follow" });
      return;
    }
    try {
      const subscription = sourcesStorage.upsertSubscription(
        { repo, mode, numbers: mode === "numbers" ? numbers : undefined },
        { seedRepos: seedSubscriptionRepos },
      );
      res.json({ ok: true, subscription, sources: readSourcesForResponse() });
      emitDataChangedSafe();
    } catch (error) {
      res.status(/^Not a /.test(error.message) ? 400 : 500).json({ ok: false, error: error.message });
    }
  });

  // { repo } - unsubscribes a repo: its rows are hidden, not deleted (notes
  // and all), and PRs added from it by URL stay.
  app.delete("/view-prs/subscriptions", (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    try {
      const removed = sourcesStorage.removeSubscription(repo);
      res.json({ ok: true, removed, sources: readSourcesForResponse() });
      if (removed) emitDataChangedSafe();
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Fetches a just-added PR: { fetched: true }, or { fetched: false, error }.
  // While its repo's run is in progress (which, begun before, won't have
  // it), waits for that to finish, then fetches it - for up to
  // maxWaitMs.
  const fetchAddedPr = async (pr) => {
    const deadlineMs = Date.now() + maxWaitMs;
    for (;;) {
      const result = await runViewPrsAutoRefresh({
        reposOverride: [pr.repo],
        prNumbersByRepo: { [pr.repo]: [pr.number] },
        skipCooldownChecks: true,
        progressKind: "addPr",
        progressOrigin: "you",
      });
      if (result?.skipped && result.skipReason === "already-in-progress" && Date.now() < deadlineMs) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      if (result?.skipped) return { fetched: false, error: `Not fetched (${result.skipReason})` };
      if (result?.missingPrNumbersByRepo?.[pr.repo]?.includes(pr.number)) {
        return { fetched: false, error: "gh couldn't fetch it" };
      }
      if (result?.failedRepos?.includes(pr.repo)) {
        return { fetched: false, error: result.failedRepoErrors?.[pr.repo] || result.error || "Its refresh failed" };
      }
      return { fetched: true };
    }
  };

  // { url } - a PR's URL, or owner/repo#12. Tracked once gh finds it, then
  // fetched: the response waits for that (responseWaitMs at most - past it,
  // fetched: null, and it carries on in the background; its row arrives with
  // the data's next change), so the page can say whether it worked.
  app.post("/view-prs/tracked-prs", async (req, res) => {
    const pr = parsePrUrl(req.body?.url);
    if (!pr) {
      res.status(400).json({ ok: false, error: "Not a pull request URL (https://github.com/owner/repo/pull/123)" });
      return;
    }
    const key = `${pr.repo}#${pr.number}`;
    try {
      await verifyGithubPr(pr);
    } catch (error) {
      res.status(422).json({ ok: false, key, error: `Couldn't find ${key}: ${error.message}` });
      return;
    }
    let result;
    try {
      result = sourcesStorage.addTrackedPr(pr, { seedRepos: seedSubscriptionRepos });
    } catch (error) {
      res.status(500).json({ ok: false, key, error: error.message });
      return;
    }
    const fetching = fetchAddedPr(pr).catch((error) => ({ fetched: false, error: error.message }));
    fetching.then((outcome) => {
      if (outcome.fetched) emitDataChangedSafe();
      else logger.warn?.(`[view-prs] fetching added PR ${key} failed: ${outcome.error}`);
    });
    let timer;
    const outcome = await Promise.race([
      fetching,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ fetched: null }), responseWaitMs);
      }),
    ]);
    clearTimeout(timer);
    res.status(outcome.fetched === null ? 202 : 200).json({
      ok: true,
      key,
      added: result.added,
      trackedPr: result.entry,
      ...outcome,
    });
  });

  // { repo, number } - stops tracking a PR added by URL. Its row stays
  // stored, but is hidden unless its repo is subscribed.
  app.delete("/view-prs/tracked-prs", (req, res) => {
    const repo = String(req.body?.repo || "").trim();
    const number = String(req.body?.number || "").trim();
    try {
      const removed = sourcesStorage.removeTrackedPr(repo, number);
      res.json({ ok: true, removed, sources: readSourcesForResponse() });
      if (removed) emitDataChangedSafe();
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });
};

module.exports = { registerViewPrsSourcesRoutes };
