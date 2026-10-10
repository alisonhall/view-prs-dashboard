/** @jest-environment jsdom */

const {
  createPrAckLabelActionsHelpers,
} = require("./pr-ack-label-actions.helpers.js");
const { createPrConcurrencyHelpers } = require("./pr-concurrency.helpers.js");

const { runWithConcurrencyLimit } = createPrConcurrencyHelpers();

function buildHarness(overrides = {}) {
  const calls = {
    setStatusMessage: [],
    setOutputMessage: [],
    showErrorNotification: [],
    showWarningNotification: [],
    renderPrData: [],
    loadStoredData: [],
    markPrsBusy: [],
    clearPrsBusy: [],
    markPrsQueued: [],
    clearPrsQueued: [],
    order: [],
    beginBulkActionBatch: [],
    markBulkActionChunkInFlight: [],
    markBulkActionChunkDone: [],
    finishBulkActionBatch: [],
  };
  const finishActivity = jest.fn();
  // Phase 7, sub-phase 7.3 follow-up (see REACT_MIGRATION_PLAN.md): a
  // fake "latestStoredPayload" so the loadStoredData-fallback branches'
  // return values are testable - loadStoredData itself doesn't actually
  // mutate this in production (that happens via applyLatestPrData inside
  // the real loadStoredData), so tests that exercise that branch set
  // `state.latestStoredPayload` explicitly before calling.
  const state = { latestStoredPayload: overrides.initialPayload ?? null };

  const helpers = createPrAckLabelActionsHelpers({
    postJson: overrides.postJson,
    setStatusMessage: (...args) => calls.setStatusMessage.push(args),
    setOutputMessage: (...args) => calls.setOutputMessage.push(args),
    beginRequestActivity: () => finishActivity,
    getGithubAuthFailureHint: overrides.getGithubAuthFailureHint || (() => ""),
    formatCommandOutput: overrides.formatCommandOutput || (() => "formatted output"),
    formatCommandOutputWithAuthHint: overrides.formatCommandOutputWithAuthHint || (() => "formatted with hint"),
    showErrorNotification: (...args) => calls.showErrorNotification.push(args),
    showWarningNotification: (...args) => calls.showWarningNotification.push(args),
    summarizeAckRefreshWarnings: overrides.summarizeAckRefreshWarnings || (() => null),
    renderPrData: (...args) => calls.renderPrData.push(args),
    loadStoredData: (...args) => {
      calls.loadStoredData.push(args);
      return Promise.resolve();
    },
    getFormBody: overrides.getFormBody || (() => ({})),
    defaultRepo: overrides.defaultRepo ?? "fallback/repo",
    markPrsBusy: (...args) => calls.markPrsBusy.push(args),
    clearPrsBusy: (...args) => calls.clearPrsBusy.push(args),
    markPrsQueued: (...args) => calls.markPrsQueued.push(args),
    clearPrsQueued: (...args) => calls.clearPrsQueued.push(args),
    beginBulkActionBatch: (...args) => {
      calls.beginBulkActionBatch.push(args);
      calls.order.push("begin");
    },
    markBulkActionChunkInFlight: (...args) => {
      calls.markBulkActionChunkInFlight.push(args);
      calls.order.push(`in-flight:${args[0]?.chunkIndex}`);
    },
    markBulkActionChunkDone: (...args) => {
      calls.markBulkActionChunkDone.push(args);
      calls.order.push(`done:${args[0]?.chunkIndex}`);
    },
    finishBulkActionBatch: (...args) => {
      calls.finishBulkActionBatch.push(args);
      calls.order.push("finish");
    },
    runWithConcurrencyLimit: overrides.runWithConcurrencyLimit || runWithConcurrencyLimit,
    getLatestStoredPayload: () => state.latestStoredPayload,
  });

  return { helpers, calls, finishActivity, state };
}

describe("pr ack label actions helpers", () => {
  describe("runAckAction", () => {
    test("given a successful ack with a full payload, when running, then it renders the fresh payload", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: true },
        result: { ok: true, prData: { byPrNumber: { 1: {} } } },
      }));
      const { helpers, calls, finishActivity } = buildHarness({ postJson });

      const result = await helpers.runAckAction({ repo: "o/r", ack: "1" }, "Ack only");

      expect(postJson).toHaveBeenCalledWith("/view-prs/ack", { repo: "o/r", ack: "1" });
      expect(calls.setStatusMessage).toEqual([["Ack only..."], ["Ack only completed"]]);
      expect(calls.renderPrData).toEqual([[{ byPrNumber: { 1: {} } }, "o/r"]]);
      expect(finishActivity).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ payload: { byPrNumber: { 1: {} } }, selectedRepo: "o/r" });
    });

    test("given a successful ack with warnings, when running, then a warning notification shows with the summary", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: true },
        result: { ok: true, refreshErrors: [{ prNumber: 2, error: "boom" }] },
      }));
      const summarizeAckRefreshWarnings = jest.fn(() => ({
        summaryText: "1 issue",
        sample: "#2: boom",
      }));
      const { helpers, calls } = buildHarness({ postJson, summarizeAckRefreshWarnings });

      await helpers.runAckAction({ repo: "o/r", ack: "2" }, "Ack only");

      expect(calls.showWarningNotification).toEqual([
        ["Ack only completed with warnings (1 issue)", "#2: boom"],
      ]);
      expect(calls.loadStoredData).toEqual([["o/r"]]);
    });

    test("given an auth failure response, when running, then the auth-aware failure message and notification show", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: false, status: 401 },
        result: { ok: false },
      }));
      const { helpers, calls } = buildHarness({ postJson, getGithubAuthFailureHint: () => "sign in" });

      const result = await helpers.runAckAction({ repo: "o/r", ack: "3" }, "Ack only");

      expect(calls.setStatusMessage).toEqual([["Ack only..."], ["Failed (401) - GitHub auth required"]]);
      expect(calls.showErrorNotification[0][0]).toBe("Ack only failed");
      expect(calls.showErrorNotification[0][1]).toMatch(/GitHub authentication/);
      expect(result).toBeNull();
    });

    test("given postJson throws, when running, then the network-failure path runs, finishActivity still fires, and it returns null", async () => {
      const postJson = jest.fn(async () => {
        throw new Error("offline");
      });
      const { helpers, calls, finishActivity } = buildHarness({ postJson });

      const result = await helpers.runAckAction({ repo: "o/r", ack: "4" }, "Ack only");

      expect(calls.setStatusMessage).toEqual([["Ack only..."], ["Failed (network/error)"]]);
      expect(calls.showErrorNotification[0]).toEqual(["Ack only failed", "Error: offline", 0]);
      expect(finishActivity).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    test("given a multi-PR ack value, when running, then every PR number is marked busy before the request and cleared after", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runAckAction({ repo: "o/r", ack: "1, 2,3" }, "Ack only");

      expect(calls.markPrsBusy).toEqual([[["1", "2", "3"], "o/r"]]);
      expect(calls.clearPrsBusy).toEqual([[["1", "2", "3"], "o/r"]]);
    });

    test("given a clear (ackClear) value and a failure, when running, then busy PRs are still cleared", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: false, status: 500 }, result: { ok: false } }));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runAckAction({ repo: "o/r", ackClear: "9" }, "Clear only");

      expect(calls.markPrsBusy).toEqual([[["9"], "o/r"]]);
      expect(calls.clearPrsBusy).toEqual([[["9"], "o/r"]]);
    });
  });

  describe("runAckAction (chunked - more than 5 PR numbers)", () => {
    test("given 7 PR numbers, when all chunks succeed, then it splits into 2 requests, clears busy per chunk, and refreshes once at the end", async () => {
      const postedBodies = [];
      const postJson = jest.fn(async (_url, body) => {
        postedBodies.push(body);
        return { response: { ok: true }, result: { ok: true } };
      });
      const { helpers, calls, state } = buildHarness({ postJson });
      const reloadedPayload = { byPrNumber: { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {} } };
      state.latestStoredPayload = reloadedPayload;

      const result = await helpers.runAckAction({ repo: "o/r", ack: "1,2,3,4,5,6,7" }, "Ack only");

      expect(postJson).toHaveBeenCalledTimes(2);
      expect(postedBodies).toEqual(
        expect.arrayContaining([
          { repo: "o/r", ack: "1,2,3,4,5" },
          { repo: "o/r", ack: "6,7" },
        ]),
      );
      expect(result).toEqual({ payload: reloadedPayload, selectedRepo: "o/r" });
      // Whole batch marked queued up front, exactly once (not busy - a
      // multi-chunk batch goes queued -> busy per chunk, see the dedicated
      // queued-state test below).
      expect(calls.markPrsQueued).toEqual([[["1", "2", "3", "4", "5", "6", "7"], "o/r"]]);
      // Each chunk marks itself busy (moving off queued) right before its
      // own request fires, and clears busy as that request resolves - not
      // one call for the whole batch.
      expect(calls.markPrsBusy).toEqual(
        expect.arrayContaining([
          [["1", "2", "3", "4", "5"], "o/r"],
          [["6", "7"], "o/r"],
        ]),
      );
      expect(calls.markPrsBusy).toHaveLength(2);
      expect(calls.clearPrsBusy).toEqual(
        expect.arrayContaining([
          [["1", "2", "3", "4", "5"], "o/r"],
          [["6", "7"], "o/r"],
        ]),
      );
      expect(calls.clearPrsBusy).toHaveLength(2);
      expect(calls.clearPrsQueued).toEqual(
        expect.arrayContaining([
          [["1", "2", "3", "4", "5"], "o/r"],
          [["6", "7"], "o/r"],
        ]),
      );
      // One refresh after all chunks settle, not one per chunk.
      expect(calls.loadStoredData).toEqual([["o/r"]]);
      expect(calls.showErrorNotification).toHaveLength(0);
    });

    test("given a 7-PR batch (2 chunks), when running, then the bulk-batch bridges fire begin -> per-chunk in-flight/done -> finish, in that order", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers, calls, state } = buildHarness({ postJson });
      state.latestStoredPayload = { byPrNumber: {} };

      await helpers.runAckAction({ repo: "o/r", ack: "1,2,3,4,5,6,7" }, "Ack only");

      expect(calls.beginBulkActionBatch).toHaveLength(1);
      expect(calls.beginBulkActionBatch[0][0]).toMatchObject({
        actionLabel: "Ack only",
        repo: "o/r",
        chunks: [["1", "2", "3", "4", "5"], ["6", "7"]],
      });
      expect(typeof calls.beginBulkActionBatch[0][0].batchId).toBe("string");

      expect(calls.markBulkActionChunkInFlight).toHaveLength(2);
      expect(calls.markBulkActionChunkDone).toHaveLength(2);
      expect(calls.finishBulkActionBatch).toHaveLength(1);

      // "begin" happens before any chunk transition, "finish" happens after
      // every chunk has reached "done", and each chunk's own in-flight
      // precedes its own done - exactly the real order the drawer renders.
      expect(calls.order[0]).toBe("begin");
      expect(calls.order[calls.order.length - 1]).toBe("finish");
      expect(calls.order.indexOf("in-flight:0")).toBeLessThan(calls.order.indexOf("done:0"));
      expect(calls.order.indexOf("in-flight:1")).toBeLessThan(calls.order.indexOf("done:1"));

      // Same batchId used for every bridge call in this batch.
      const batchId = calls.beginBulkActionBatch[0][0].batchId;
      expect(calls.markBulkActionChunkInFlight.every((args) => args[0].batchId === batchId)).toBe(true);
      expect(calls.finishBulkActionBatch[0][0].batchId).toBe(batchId);
    });

    test("given a single-chunk batch (5 or fewer PR numbers), when running, then the bulk-batch bridges are never called", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runAckAction({ repo: "o/r", ack: "1,2,3" }, "Ack only");

      expect(calls.beginBulkActionBatch).toHaveLength(0);
      expect(calls.finishBulkActionBatch).toHaveLength(0);
    });

    test("given 7 PR numbers where all chunks succeed, when running, then the final status message and output reflect all 7 PRs, not just the last chunk to resolve", async () => {
      const postJson = jest.fn(async (_url, body) => ({
        response: { ok: true },
        result: { ok: true, output: `ran for ${body.ack}` },
      }));
      const formatCommandOutput = jest.fn((result) => `formatted: ${result.output}`);
      const { helpers, calls } = buildHarness({ postJson, formatCommandOutput });

      await helpers.runAckAction({ repo: "o/r", ack: "1,2,3,4,5,6,7" }, "Ack only");

      const finalStatusMessage = calls.setStatusMessage.at(-1)[0];
      expect(finalStatusMessage).toBe("Ack only completed (7 PR(s))");

      const outputMessage = calls.setOutputMessage.at(-1)[0];
      expect(outputMessage).toContain("formatted: ran for 1,2,3,4,5");
      expect(outputMessage).toContain("formatted: ran for 6,7");
    });

    test("given 7 PR numbers where one chunk fails, when running, then the other chunk still completes and a combined warning is shown", async () => {
      const postJson = jest.fn(async (_url, body) => {
        if (body.ack === "6,7") {
          return { response: { ok: false, status: 500 }, result: { ok: false, error: "server error" } };
        }
        return { response: { ok: true }, result: { ok: true } };
      });
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runAckAction({ repo: "o/r", ack: "1,2,3,4,5,6,7" }, "Ack only");

      expect(postJson).toHaveBeenCalledTimes(2);
      expect(calls.showWarningNotification).toHaveLength(1);
      expect(calls.showWarningNotification[0][0]).toBe("Ack only completed with 1 of 2 chunk(s) failing");
      expect(calls.showErrorNotification).toHaveLength(0);
      // Status message reflects the true PR-level split (5 succeeded, 2 in
      // the one failed chunk), not just a chunk count.
      expect(calls.setStatusMessage.at(-1)[0]).toBe("Ack only completed with failures (5 of 7 PR(s) succeeded)");
      // Partial success still refreshes once at the end.
      expect(calls.loadStoredData).toEqual([["o/r"]]);

      // The drawer's queue section must be able to tell the failed chunk
      // apart from the successful one - markBulkActionChunkDone's `ok`
      // reflects each chunk's own real outcome, not just "it finished".
      expect(calls.markBulkActionChunkDone).toHaveLength(2);
      const doneCallsByChunkIndex = Object.fromEntries(
        calls.markBulkActionChunkDone.map((args) => [args[0].chunkIndex, args[0].ok]),
      );
      expect(doneCallsByChunkIndex[0]).toBe(true); // "1,2,3,4,5" succeeded
      expect(doneCallsByChunkIndex[1]).toBe(false); // "6,7" failed
    });

    test("given 7 PR numbers where every chunk fails, when running, then a single error notification is shown and no refresh happens", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: false, status: 500 },
        result: { ok: false, error: "server error" },
      }));
      const { helpers, calls } = buildHarness({ postJson });

      const result = await helpers.runAckAction({ repo: "o/r", ack: "1,2,3,4,5,6,7" }, "Ack only");

      expect(calls.showErrorNotification).toHaveLength(1);
      expect(calls.showErrorNotification[0][0]).toBe("Ack only failed");
      expect(calls.loadStoredData).toHaveLength(0);
      expect(result).toBeNull();
    });

    test("given a single-chunk batch (5 or fewer PR numbers), when running, then it never marks anything queued", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runAckAction({ repo: "o/r", ack: "1,2,3,4,5" }, "Ack only");

      expect(postJson).toHaveBeenCalledTimes(1);
      expect(calls.markPrsQueued).toHaveLength(0);
      expect(calls.clearPrsQueued).toHaveLength(0);
      expect(calls.markPrsBusy).toEqual([[["1", "2", "3", "4", "5"], "o/r"]]);
    });
  });

  describe("runAckOnlyWorkflow / runClearOnlyWorkflow", () => {
    test("given no PR numbers in the value or the form, when running ack-only, then it shows a validation message and never posts", async () => {
      const postJson = jest.fn();
      const { helpers, calls } = buildHarness({ postJson, getFormBody: () => ({}) });

      const result = await helpers.runAckOnlyWorkflow("", "");

      expect(postJson).not.toHaveBeenCalled();
      expect(calls.setStatusMessage).toEqual([['Ack only requires numeric value(s) in "PR number(s)"']]);
      expect(result).toBeNull();
    });

    test("given a value and repo override, when running ack-only, then it posts with the ack field and returns the reloaded payload", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers, state } = buildHarness({ postJson, getFormBody: () => ({ prNumbers: "9", repo: "form/repo" }) });
      const reloadedPayload = { byPrNumber: { 5: {} } };
      state.latestStoredPayload = reloadedPayload;

      const result = await helpers.runAckOnlyWorkflow("5", "override/repo");

      expect(postJson).toHaveBeenCalledWith("/view-prs/ack", { repo: "override/repo", ack: "5" });
      expect(result).toEqual({ payload: reloadedPayload, selectedRepo: "override/repo" });
    });

    test("given no clear value, when running clear-only, then it shows the clear-only validation message and returns null", async () => {
      const postJson = jest.fn();
      const { helpers, calls } = buildHarness({ postJson, getFormBody: () => ({}) });

      const result = await helpers.runClearOnlyWorkflow("", "");

      expect(postJson).not.toHaveBeenCalled();
      expect(calls.setStatusMessage).toEqual([['Clear only requires numeric value(s) in "PR number(s)"']]);
      expect(result).toBeNull();
    });

    test("given a clear value, when running clear-only, then it posts with the ackClear field", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers } = buildHarness({ postJson, getFormBody: () => ({ prNumbers: "7" }) });

      await helpers.runClearOnlyWorkflow("", "");

      expect(postJson).toHaveBeenCalledWith("/view-prs/ack", { repo: "", ackClear: "7" });
    });
  });

  describe("runApplyLabelAction / runApplyLabelWorkflow", () => {
    test("given a successful apply, when running the action, then it renders the fresh payload and shows the server summary", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: true },
        result: { ok: true, summary: "Applied to 2 PRs", prData: { byPrNumber: {} } },
      }));
      const { helpers, calls } = buildHarness({ postJson });

      const result = await helpers.runApplyLabelAction({ repo: "o/r", label: "bug", prNumbers: "1,2" }, "Apply label");

      expect(postJson).toHaveBeenCalledWith("/view-prs/labels/apply", { repo: "o/r", label: "bug", prNumbers: "1,2" });
      expect(calls.setStatusMessage).toEqual([["Apply label..."], ["Applied to 2 PRs"]]);
      expect(calls.renderPrData).toEqual([[{ byPrNumber: {} }, "o/r"]]);
      expect(result).toEqual({ payload: { byPrNumber: {} }, selectedRepo: "o/r" });
    });

    test("given apply errors and refresh errors, when running the action, then a combined warning notification shows", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: true },
        result: {
          ok: true,
          applyErrors: [{ prNumber: 1, error: "no label" }],
          refreshErrors: [{ prNumber: 2, error: "stale" }],
        },
      }));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runApplyLabelAction({ repo: "o/r", label: "bug", prNumbers: "1,2" }, "Apply label");

      expect(calls.showWarningNotification).toEqual([
        ["Apply label completed with 2 error(s)", "#1: no label\n#2: stale"],
      ]);
    });

    test("given multiple PR numbers, when running the action, then every PR number is marked busy before the request and cleared after", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runApplyLabelAction({ repo: "o/r", label: "bug", prNumbers: "1,2,3" }, "Apply label");

      expect(calls.markPrsBusy).toEqual([[["1", "2", "3"], "o/r"]]);
      expect(calls.clearPrsBusy).toEqual([[["1", "2", "3"], "o/r"]]);
    });

    test("given 7 PR numbers, when all chunks succeed, then it splits into 2 requests, clears busy per chunk, and refreshes once at the end", async () => {
      const postedBodies = [];
      const postJson = jest.fn(async (_url, body) => {
        postedBodies.push(body);
        return { response: { ok: true }, result: { ok: true, summary: "done" } };
      });
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runApplyLabelAction({ repo: "o/r", label: "bug", prNumbers: "1,2,3,4,5,6,7" }, "Apply label");

      expect(postJson).toHaveBeenCalledTimes(2);
      expect(postedBodies).toEqual(
        expect.arrayContaining([
          { repo: "o/r", label: "bug", prNumbers: "1,2,3,4,5" },
          { repo: "o/r", label: "bug", prNumbers: "6,7" },
        ]),
      );
      expect(calls.clearPrsBusy).toHaveLength(2);
      expect(calls.loadStoredData).toEqual([["o/r"]]);
      expect(calls.showErrorNotification).toHaveLength(0);
      // Whole batch queued up front, each chunk moves off queued right
      // before its own request fires.
      expect(calls.markPrsQueued).toEqual([[["1", "2", "3", "4", "5", "6", "7"], "o/r"]]);
      expect(calls.clearPrsQueued).toHaveLength(2);
    });

    test("given 7 PR numbers where all chunks succeed with different per-chunk summaries, when running, then the final status message reflects the true total PR count, not one arbitrary chunk's own summary", async () => {
      const postJson = jest.fn(async (_url, body) => ({
        response: { ok: true },
        result: { ok: true, summary: `Applied 'bug' to ${body.prNumbers}` },
      }));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runApplyLabelAction({ repo: "o/r", label: "bug", prNumbers: "1,2,3,4,5,6,7" }, "Apply label");

      const finalStatusMessage = calls.setStatusMessage.at(-1)[0];
      expect(finalStatusMessage).toBe("Apply label completed (7 PR(s))");
    });

    test("given a single-chunk batch (5 or fewer PR numbers), when running, then it never marks anything queued", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true } }));
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runApplyLabelAction({ repo: "o/r", label: "bug", prNumbers: "1,2,3" }, "Apply label");

      expect(calls.markPrsQueued).toHaveLength(0);
      expect(calls.clearPrsQueued).toHaveLength(0);
    });

    test("given 7 PR numbers where one chunk fails, when running, then the other chunk still completes and a combined warning is shown", async () => {
      const postJson = jest.fn(async (_url, body) => {
        if (body.prNumbers === "6,7") {
          return { response: { ok: false, status: 500 }, result: { ok: false, error: "server error" } };
        }
        return { response: { ok: true }, result: { ok: true } };
      });
      const { helpers, calls } = buildHarness({ postJson });

      await helpers.runApplyLabelAction({ repo: "o/r", label: "bug", prNumbers: "1,2,3,4,5,6,7" }, "Apply label");

      expect(calls.showWarningNotification).toHaveLength(1);
      expect(calls.showWarningNotification[0][0]).toBe("Apply label completed with 1 error(s)");
      expect(calls.loadStoredData).toEqual([["o/r"]]);
      expect(calls.setStatusMessage.at(-1)[0]).toBe("Apply label completed with failures (5 of 7 PR(s) succeeded)");
    });

    test("given 7 PR numbers where every chunk fails, when running, then a single error notification is shown and no refresh happens", async () => {
      const postJson = jest.fn(async () => ({
        response: { ok: false, status: 500 },
        result: { ok: false, error: "server error" },
      }));
      const { helpers, calls } = buildHarness({ postJson });

      const result = await helpers.runApplyLabelAction({ repo: "o/r", label: "bug", prNumbers: "1,2,3,4,5,6,7" }, "Apply label");

      expect(calls.showErrorNotification).toHaveLength(1);
      expect(calls.showErrorNotification[0][0]).toBe("Apply label failed");
      expect(calls.loadStoredData).toHaveLength(0);
      expect(result).toBeNull();
    });

    test("given no prNumbers value or form value, when running the workflow, then it shows a validation message, never posts, and returns null", async () => {
      const postJson = jest.fn();
      const { helpers, calls } = buildHarness({ postJson, getFormBody: () => ({}) });

      const result = await helpers.runApplyLabelWorkflow("", "bug", "");

      expect(postJson).not.toHaveBeenCalled();
      expect(calls.setStatusMessage).toEqual([['Apply label requires numeric value(s) in "PR number(s)"']]);
      expect(result).toBeNull();
    });

    test("given prNumbers but no label, when running the workflow, then it shows the choose-a-label message and returns null", async () => {
      const postJson = jest.fn();
      const { helpers, calls } = buildHarness({ postJson, getFormBody: () => ({ prNumbers: "1" }) });

      const result = await helpers.runApplyLabelWorkflow("1", "", "");

      expect(postJson).not.toHaveBeenCalled();
      expect(calls.setStatusMessage).toEqual([["Choose a label to apply"]]);
      expect(result).toBeNull();
    });

    test("given valid prNumbers and label, when running the workflow, then it delegates to runApplyLabelAction and returns its result", async () => {
      const postJson = jest.fn(async () => ({ response: { ok: true }, result: { ok: true, prData: { byPrNumber: { 3: {} } } } }));
      const { helpers } = buildHarness({ postJson, getFormBody: () => ({ repo: "form/repo" }) });

      const result = await helpers.runApplyLabelWorkflow("3,4", "enhancement", "");

      expect(postJson).toHaveBeenCalledWith("/view-prs/labels/apply", {
        repo: "form/repo",
        label: "enhancement",
        prNumbers: "3,4",
      });
      expect(result).toEqual({ payload: { byPrNumber: { 3: {} } }, selectedRepo: "form/repo" });
    });
  });
});
