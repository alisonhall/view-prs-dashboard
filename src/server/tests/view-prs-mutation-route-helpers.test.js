const {
  createViewPrsMutationRouteHelpers,
} = require("../helpers/view-prs-mutation-route-helpers");

describe("view-prs mutation route helpers", () => {
  const createHelpers = () =>
    createViewPrsMutationRouteHelpers({
      formatScriptFailureMessage: (failure, fallback) =>
        failure?.scriptMessage || fallback,
    });

  test("given valid run request input, when building the run request, then command args, display command, and normalized detail are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildRunRequest({
        body: {
          repo: " owner/repo ",
          prNumber: "42",
          limit: "5",
          mergedLimit: 3,
          jobs: "2",
          openMode: "changed",
          ack: "101",
          ackClear: "102",
          ackChanged: true,
          quiet: true,
          showReason: false,
        },
        viewPrsRunScriptRelativePath: "run-prs/check-open-pr-updates.sh",
      }),
    ).toEqual({
      args: [
        "run-prs/check-open-pr-updates.sh",
        "--repo",
        "owner/repo",
        "--pr",
        "42",
        "--limit",
        "5",
        "--merged-limit",
        "3",
        "--jobs",
        "2",
        "--open",
        "changed",
        "--ack",
        "101",
        "--ack-clear",
        "102",
        "--ack-changed",
        "--hide-reason",
        "--quiet",
      ],
      detail: {
        repo: "owner/repo",
        prNumber: "42",
      },
      displayCommand:
        "bash run-prs/check-open-pr-updates.sh --repo owner/repo --pr 42 --limit 5 --merged-limit 3 --jobs 2 --open changed --ack 101 --ack-clear 102 --ack-changed --hide-reason --quiet",
    });
  });

  test("given no prior timing context, when creating timing context, then triggered timestamp and start time fields are returned", () => {
    const helpers = createHelpers();
    const timingContext = helpers.createTimingContext();

    expect(typeof timingContext.triggeredAt).toBe("string");
    expect(Number.isFinite(Date.parse(timingContext.triggeredAt))).toBe(true);
    expect(typeof timingContext.startedAtMs).toBe("number");
  });

  test("given missing dependency names, when building missing dependency message, then shared message text matches route contract", () => {
    const helpers = createHelpers();

    expect(helpers.buildMissingDependenciesMessage(["gh", "jq"])).toBe(
      "Missing required command(s): gh, jq",
    );
  });

  test("given parse-validation error text, when building bad-request result, then status and payload follow mutation route contract", () => {
    const helpers = createHelpers();

    expect(helpers.buildBadRequestResult("Invalid --repo value: demo/repo")).toEqual({
      responseStatusCode: 400,
      responsePayload: {
        ok: false,
        error: "Invalid --repo value: demo/repo",
      },
    });
  });

  test("given ack script runner dependencies, when creating and invoking the runner, then route script execution uses mutation defaults with optional timeout override", async () => {
    const helpers = createHelpers();
    const callRunViewPrsScript = jest.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const runScript = helpers.createAckScriptRunner({
      callRunViewPrsScript,
      viewPrsAckScriptTimeoutMs: 1234,
    });

    await runScript(["run-prs/check-open-pr-updates.sh", "--ack-only"]);
    await runScript(["run-prs/check-open-pr-updates.sh", "--ack", "99"], 4321);

    expect(callRunViewPrsScript).toHaveBeenNthCalledWith(
      1,
      ["run-prs/check-open-pr-updates.sh", "--ack-only"],
      4 * 1024 * 1024,
      { timeoutMs: 1234 },
    );
    expect(callRunViewPrsScript).toHaveBeenNthCalledWith(
      2,
      ["run-prs/check-open-pr-updates.sh", "--ack", "99"],
      4 * 1024 * 1024,
      { timeoutMs: 4321 },
    );
  });

  test("given command arguments, when building display command, then bash-prefixed command string matches request contract", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildDisplayCommand([
        "run-prs/check-open-pr-updates.sh",
        "--repo",
        "owner/repo",
        "--open",
        "none",
      ]),
    ).toBe("bash run-prs/check-open-pr-updates.sh --repo owner/repo --open none");
  });

  test("given invalid run request input, when building the run request, then an endpoint-compatible validation error is thrown", () => {
    const helpers = createHelpers();

    expect(() =>
      helpers.buildRunRequest({
        body: { openMode: "bad-mode" },
        viewPrsRunScriptRelativePath: "run-prs/check-open-pr-updates.sh",
      }),
    ).toThrow("Invalid --open mode: bad-mode");
  });

  test("given missing dependencies, when building the missing dependency result, then command context and install guidance are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildRunMissingDependenciesResult({
        displayCommand: "bash run-prs/check-open-pr-updates.sh --open none",
        missing: ["gh", "jq"],
      }),
    ).toEqual({
      responseStatusCode: 500,
      responsePayload: {
        ok: false,
        command: "bash run-prs/check-open-pr-updates.sh --open none",
        error: "Missing required command(s): gh, jq",
        output: "",
        stderr: "Install missing CLI dependencies and retry.",
      },
    });
  });

  test("given a manual run success, when building the success result, then command output and refreshed pr data are returned with status 200", () => {
    const helpers = createHelpers();
    const prData = { byPrNumber: { 1: { number: 1 } } };

    expect(
      helpers.buildRunSuccessResult({
        displayCommand: "bash run-prs/check-open-pr-updates.sh --open none",
        stdout: "ok",
        stderr: "",
        prData,
      }),
    ).toEqual({
      responseStatusCode: 200,
      responsePayload: {
        ok: true,
        command: "bash run-prs/check-open-pr-updates.sh --open none",
        output: "ok",
        stderr: "",
        prData,
      },
    });
  });

  test("given a manual run failure, when building the failure result, then formatted failure message and captured output are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildRunFailureResult({
        failure: {
          scriptMessage: "Manual run failed via helper",
          stdout: "partial",
          stderr: "broken",
        },
        displayCommand: "bash run-prs/check-open-pr-updates.sh --open none",
      }),
    ).toEqual({
      responseStatusCode: 500,
      responsePayload: {
        ok: false,
        command: "bash run-prs/check-open-pr-updates.sh --open none",
        error: "Manual run failed via helper",
        output: "partial",
        stderr: "broken",
      },
    });
  });

  test("given run timing and detail, when building action-log entries, then run success and failure contracts preserve action and detail fields", () => {
    const helpers = createHelpers();
    const timingContext = {
      triggeredAt: "2026-07-23T00:00:00.000Z",
      startedAtMs: Date.now() - 5,
    };
    const detail = {
      repo: "owner/repo",
      prNumber: "42",
    };

    expect(
      helpers.buildRunSuccessActionLogEntry({
        timingContext,
        detail,
      }),
    ).toMatchObject({
      action: "post/run",
      ok: true,
      detail: {
        repo: "owner/repo",
        prNumber: "42",
      },
    });

    expect(
      helpers.buildRunFailureActionLogEntry({
        timingContext,
        detail,
        error: "Manual run failed",
      }),
    ).toMatchObject({
      action: "post/run",
      ok: false,
      error: "Manual run failed",
      detail: {
        repo: "owner/repo",
        prNumber: "42",
      },
    });
  });

  test("given a run-auto conflict, when building the result, then status 409 and contract error payload are returned", () => {
    const helpers = createHelpers();

    expect(helpers.buildRunAutoAlreadyInProgressResult()).toEqual({
      responseStatusCode: 409,
      responsePayload: {
        ok: false,
        error: "Auto run already in progress",
      },
    });
  });

  test("given missing dependencies for run-auto, when building the result, then status 500 and missing-command message are returned", () => {
    const helpers = createHelpers();

    expect(helpers.buildRunAutoMissingDependenciesResult(["gh", "jq"])).toEqual({
      responseStatusCode: 500,
      responsePayload: {
        ok: false,
        error: "Missing required command(s): gh, jq",
      },
    });
  });

  test("given a run-auto success, when building the result, then status 202 and ok payload are returned", () => {
    const helpers = createHelpers();

    expect(helpers.buildRunAutoSuccessResult()).toEqual({
      responseStatusCode: 202,
      responsePayload: { ok: true },
    });
  });

  test("given run-auto timing context, when building action-log entries, then success and failure entries preserve route action and detail fields", () => {
    const helpers = createHelpers();
    const timingContext = {
      triggeredAt: "2026-07-23T00:00:00.000Z",
      startedAtMs: Date.now() - 5,
    };

    expect(
      helpers.buildRunAutoFailureActionLogEntry({
        timingContext,
        error: "Auto run already in progress",
      }),
    ).toMatchObject({
      action: "post/run-auto",
      ok: false,
      error: "Auto run already in progress",
    });

    expect(
      helpers.buildRunAutoSuccessActionLogEntry({
        timingContext,
      }),
    ).toMatchObject({
      action: "post/run-auto",
      ok: true,
      detail: {
        mode: "manual-trigger",
      },
    });
  });

  test("given valid ack request input, when building the request, then command args, display command, and normalized operation detail are returned", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildAckRequest({
        body: {
          repo: " owner/repo ",
          ack: "123, 124",
          ackClear: "125",
          inReview: "200",
          inReviewClear: "201",
          flagged: "300",
          flaggedClear: "301",
        },
        viewPrsRunScriptRelativePath: "run-prs/check-open-pr-updates.sh",
      }),
    ).toEqual({
      args: [
        "run-prs/check-open-pr-updates.sh",
        "--ack-only",
        "--quiet",
        "--repo",
        "owner/repo",
        "--ack",
        "123, 124",
        "--ack-clear",
        "125",
        "--in-review",
        "200",
        "--in-review-clear",
        "201",
        "--flagged",
        "300",
        "--flagged-clear",
        "301",
      ],
      detail: {
        repo: "owner/repo",
        ack: "123, 124",
        ackClear: "125",
        inReview: "200",
        inReviewClear: "201",
        flagged: "300",
        flaggedClear: "301",
      },
      displayCommand:
        "bash run-prs/check-open-pr-updates.sh --ack-only --quiet --repo owner/repo --ack 123, 124 --ack-clear 125 --in-review 200 --in-review-clear 201 --flagged 300 --flagged-clear 301",
    });
  });

  test("given an ack request without any operation, when building the request, then the endpoint-compatible validation error is thrown", () => {
    const helpers = createHelpers();

    expect(() =>
      helpers.buildAckRequest({
        body: { repo: "owner/repo" },
        viewPrsRunScriptRelativePath: "run-prs/check-open-pr-updates.sh",
      }),
    ).toThrow("Provide at least one operation");
  });

  test("given mixed ack csv values, when parsing refresh numbers, then only numeric entries are returned trimmed", () => {
    const helpers = createHelpers();

    expect(helpers.parseNumberCsv("123, nope, 456 , , 789x, 900")).toEqual([
      "123",
      "456",
      "900",
    ]);
  });

  test("given normalized ack detail with overlapping operation values, when building the refresh list, then numeric pr numbers are deduplicated in encounter order", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildAckRefreshList({
        ack: "123, 456",
        ackClear: "456",
        inReview: "789",
        inReviewClear: "",
        flagged: "123, 900",
        flaggedClear: "900, 901",
      }),
    ).toEqual(["123", "456", "789", "900", "901"]);
  });

  test("given ack timing and detail, when building success and failure action-log entries, then refreshed count and failure error are preserved", () => {
    const helpers = createHelpers();
    const timingContext = {
      triggeredAt: "2026-07-23T00:00:00.000Z",
      startedAtMs: Date.now() - 5,
    };
    const detail = {
      repo: "owner/repo",
      ack: "123",
      ackClear: "",
      inReview: "",
      inReviewClear: "",
      flagged: "",
      flaggedClear: "",
    };

    expect(
      helpers.buildAckSuccessActionLogEntry({
        timingContext,
        detail,
        refreshedCount: 2,
      }),
    ).toMatchObject({
      action: "post/ack",
      ok: true,
      detail: {
        repo: "owner/repo",
        ack: "123",
        refreshedCount: 2,
      },
    });

    expect(
      helpers.buildAckFailureActionLogEntry({
        timingContext,
        detail,
        error: "Ack operation failed",
      }),
    ).toMatchObject({
      action: "post/ack",
      ok: false,
      error: "Ack operation failed",
      detail: {
        repo: "owner/repo",
        ack: "123",
      },
    });
  });

  test("given ack success and failure payload inputs, when building results, then route contract payloads are returned with expected status codes", () => {
    const helpers = createHelpers();
    const prData = { byPrNumber: { 123: { number: 123 } } };

    expect(
      helpers.buildAckSuccessResult({
        displayCommand: "bash run-prs/check-open-pr-updates.sh --ack-only --quiet --ack 123",
        stdout: "ok",
        stderr: "",
        refreshedPrs: ["123"],
        refreshErrors: [],
        prData,
      }),
    ).toEqual({
      responseStatusCode: 200,
      responsePayload: {
        ok: true,
        command: "bash run-prs/check-open-pr-updates.sh --ack-only --quiet --ack 123",
        output: "ok",
        stderr: "",
        refreshedPrs: ["123"],
        refreshErrors: [],
        prData,
      },
    });

    expect(
      helpers.buildAckFailureResult({
        failure: {
          scriptMessage: "Ack operation failed via helper",
          stdout: "partial",
          stderr: "broken",
        },
        displayCommand: "bash run-prs/check-open-pr-updates.sh --ack-only --quiet --ack 123",
      }),
    ).toEqual({
      responseStatusCode: 500,
      responsePayload: {
        ok: false,
        command: "bash run-prs/check-open-pr-updates.sh --ack-only --quiet --ack 123",
        error: "Ack operation failed via helper",
        output: "partial",
        stderr: "broken",
      },
    });
  });

  test("given ack refresh candidates, when refresh scripts succeed, then refreshed pr list is returned without errors", async () => {
    const helpers = createHelpers();

    const result = await helpers.runAckRefreshes({
      refreshList: ["123", "456"],
      effectiveRepo: "owner/repo",
      viewPrsRunScriptRelativePath: "run-prs/check-open-pr-updates.sh",
      runScript: async () => ({ stdout: "ok", stderr: "" }),
      viewPrsAckRefreshScriptTimeoutMs: 5000,
      viewPrsAckTotalRefreshTimeoutMs: 30000,
      buildAckRefreshBudgetSkipErrors: () => [],
    });

    expect(result).toEqual({
      refreshedPrs: ["123", "456"],
      refreshErrors: [],
    });
  });

  test("given a failing ack refresh script, when running refreshes, then refreshed list excludes failed pr and refreshErrors includes formatted failure", async () => {
    const helpers = createHelpers();

    const result = await helpers.runAckRefreshes({
      refreshList: ["123", "456"],
      effectiveRepo: "owner/repo",
      viewPrsRunScriptRelativePath: "run-prs/check-open-pr-updates.sh",
      runScript: async (_args) => {
        if (_args.includes("456")) {
          const error = new Error("failed");
          error.scriptMessage = "Refresh failed via helper";
          throw error;
        }
        return { stdout: "ok", stderr: "" };
      },
      viewPrsAckRefreshScriptTimeoutMs: 5000,
      viewPrsAckTotalRefreshTimeoutMs: 30000,
      buildAckRefreshBudgetSkipErrors: () => [],
    });

    expect(result.refreshedPrs).toEqual(["123"]);
    expect(result.refreshErrors).toEqual([
      { prNumber: "456", error: "Refresh failed via helper" },
    ]);
  });

  test("given a consumed refresh budget, when running refreshes, then remaining prs are skipped via budget skip helper", async () => {
    const helpers = createHelpers();
    const dateNowSpy = jest.spyOn(Date, "now");
    dateNowSpy.mockReturnValueOnce(1000).mockReturnValue(1000);

    try {
      const result = await helpers.runAckRefreshes({
        refreshList: ["123", "456", "789"],
        effectiveRepo: "owner/repo",
        viewPrsRunScriptRelativePath: "run-prs/check-open-pr-updates.sh",
        runScript: async () => ({ stdout: "ok", stderr: "" }),
        viewPrsAckRefreshScriptTimeoutMs: 5000,
        viewPrsAckTotalRefreshTimeoutMs: 0,
        buildAckRefreshBudgetSkipErrors: ({ refreshList, startIndex }) =>
          refreshList.slice(startIndex).map((prNumber) => ({
            prNumber,
            error: "Skipped due to refresh budget",
          })),
      });

      expect(result.refreshedPrs).toEqual([]);
      expect(result.refreshErrors).toEqual([
        { prNumber: "123", error: "Skipped due to refresh budget" },
        { prNumber: "456", error: "Skipped due to refresh budget" },
        { prNumber: "789", error: "Skipped due to refresh budget" },
      ]);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  test("given merged request-more body values, when building request-more request, then repo and bounded count/scan limits are normalized", () => {
    const helpers = createHelpers();

    expect(
      helpers.buildRequestMoreRequest({
        body: {
          repo: " owner/repo ",
          count: "75",
          scanLimit: "10",
        },
        defaultViewPrsRepo: "default/repo",
      }),
    ).toEqual({
      repo: "owner/repo",
      requestCount: 50,
      scanLimit: 50,
    });
  });

  test("given stored and merged candidate lists, when deriving repo sets and missing candidates, then only missing items within request count are returned", () => {
    const helpers = createHelpers();

    const storedForRepo = helpers.buildStoredPrNumbersForRepo({
      currentData: {
        byPrNumber: {
          100: { repo: "owner/repo" },
          200: { repo: "owner/repo" },
          300: { repo: "other/repo" },
        },
      },
      repo: "owner/repo",
    });

    const missing = helpers.buildMissingMergedCandidates({
      mergedCandidates: [
        { number: "100" },
        { number: "101" },
        { number: "200" },
        { number: "102" },
      ],
      storedForRepo,
      requestCount: 2,
    });

    expect(storedForRepo.has("100")).toBe(true);
    expect(storedForRepo.has("200")).toBe(true);
    expect(missing).toEqual([{ number: "101" }, { number: "102" }]);
  });

  test("given missing merged candidates, when running request-more refreshes, then refreshed and failed pr numbers are split correctly", async () => {
    const helpers = createHelpers();

    const result = await helpers.runRequestMoreRefreshes({
      missingCandidates: [{ number: "101" }, { number: "102" }],
      viewPrsRunScriptRelativePath: "run-prs/check-open-pr-updates.sh",
      repo: "owner/repo",
      callRunViewPrsScript: async (args) => {
        if (args.includes("102")) {
          const error = new Error("failed");
          error.scriptMessage = "Refresh failed via helper";
          throw error;
        }
        return { stdout: "ok", stderr: "" };
      },
      viewPrsAckRefreshScriptTimeoutMs: 5000,
    });

    expect(result).toEqual({
      refreshedPrs: ["101"],
      refreshErrors: [
        { prNumber: "102", error: "Refresh failed via helper" },
      ],
    });
  });

  test("given merged request-more success and failure contexts, when building results, then route contracts and summary text are preserved", () => {
    const helpers = createHelpers();
    const prData = { byPrNumber: { 1: { number: 1 } } };

    expect(
      helpers.buildRequestMoreSuccessResult({
        repo: "owner/repo",
        requestCount: 2,
        scanLimit: 10,
        mergedCandidates: [{ number: "101" }, { number: "102" }],
        missingCandidates: [{ number: "101" }],
        refreshedPrs: ["101"],
        refreshErrors: [],
        prData,
      }),
    ).toEqual({
      responseStatusCode: 200,
      responsePayload: {
        ok: true,
        repo: "owner/repo",
        requestCount: 2,
        scanLimit: 10,
        scannedCandidates: 2,
        missingCandidates: ["101"],
        refreshedPrs: ["101"],
        refreshErrors: [],
        summary: "Fetched 1 missing merged PR.",
        prData,
      },
    });

    expect(helpers.buildRequestMoreFailureResult(new Error("boom"))).toEqual({
      responseStatusCode: 500,
      responsePayload: {
        ok: false,
        error: "boom",
      },
    });
  });
});