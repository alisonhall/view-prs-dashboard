const {
  createPrMergedRequestMoreActionHelpers,
} = require("./pr-merged-request-more-action.helpers.js");

describe("pr merged request more action helpers", () => {
  test("given a pending merged request more action, when handling request more, then no request is sent", async () => {
    const postJson = jest.fn();
    const { handleRequestMoreMerged } =
      createPrMergedRequestMoreActionHelpers({
        getIsRequestMoreMergedPending: () => true,
        postJson,
      });

    await handleRequestMoreMerged("org/repo");

    expect(postJson).not.toHaveBeenCalled();
  });

  test("given merged request more returns PR data, when handling request more, then optimistic render and success text are applied", async () => {
    const setIsRequestMoreMergedPending = jest.fn();
    const setStatusMessage = jest.fn();
    const setLatestStoredPayload = jest.fn();
    const setLatestSelectedRepo = jest.fn();
    const renderPrData = jest.fn();
    const loadStoredData = jest.fn();
    const finishActivity = jest.fn();
    const onPendingChange = jest.fn();
    const onStatusChange = jest.fn();

    const { handleRequestMoreMerged } =
      createPrMergedRequestMoreActionHelpers({
        getIsRequestMoreMergedPending: () => false,
        setIsRequestMoreMergedPending,
        getLatestSelectedRepo: () => "saved/repo",
        defaultRepo: "fallback/repo",
        beginRequestActivity: () => finishActivity,
        postJson: async () => ({
          response: { ok: true },
          result: {
            ok: true,
            prData: { byPrNumber: { 1: {} } },
            refreshedPrs: [{ number: 1 }, { number: 2 }],
          },
        }),
        setLatestStoredPayload,
        setLatestSelectedRepo,
        renderPrData,
        loadStoredData,
        setStatusMessage,
        notifyFailureSnackbar: jest.fn(),
      });

    await handleRequestMoreMerged("org/repo", { onPendingChange, onStatusChange });

    expect(setIsRequestMoreMergedPending).toHaveBeenNthCalledWith(1, true);
    expect(onPendingChange).toHaveBeenNthCalledWith(1, true);
    expect(setLatestStoredPayload).toHaveBeenCalledWith({ byPrNumber: { 1: {} } });
    expect(setLatestSelectedRepo).toHaveBeenCalledWith("org/repo");
    expect(renderPrData).toHaveBeenCalledWith(
      { byPrNumber: { 1: {} } },
      "org/repo",
      { useLastRunScope: false },
    );
    expect(loadStoredData).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalledWith("Loaded 2 merged PRs.");
    expect(setStatusMessage).toHaveBeenNthCalledWith(
      1,
      "Requesting more merged PRs...",
    );
    expect(setStatusMessage).toHaveBeenNthCalledWith(2, "Loaded 2 merged PRs.");
    expect(setIsRequestMoreMergedPending).toHaveBeenNthCalledWith(2, false);
    expect(onPendingChange).toHaveBeenNthCalledWith(2, false);
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });

  test("given merged request more returns no PR data, when handling request more, then stored data reload is used", async () => {
    const loadStoredData = jest.fn(async () => {});
    const { handleRequestMoreMerged } =
      createPrMergedRequestMoreActionHelpers({
        getIsRequestMoreMergedPending: () => false,
        setIsRequestMoreMergedPending: () => {},
        getLatestSelectedRepo: () => "saved/repo",
        defaultRepo: "fallback/repo",
        beginRequestActivity: () => () => {},
        postJson: async () => ({
          response: { ok: true },
          result: { ok: true, refreshedPrs: [] },
        }),
        setLatestStoredPayload: () => {},
        setLatestSelectedRepo: () => {},
        renderPrData: () => {},
        loadStoredData,
        setStatusMessage: () => {},
        notifyFailureSnackbar: jest.fn(),
      });

    await handleRequestMoreMerged("");

    expect(loadStoredData).toHaveBeenCalledWith("saved/repo", {
      useLastRunScope: false,
    });
  });

  test("given merged request more fails, when handling request more, then failure status and snackbar are shown", async () => {
    const setStatusMessage = jest.fn();
    const notifyFailureSnackbar = jest.fn();
    const onStatusChange = jest.fn();

    const { handleRequestMoreMerged } =
      createPrMergedRequestMoreActionHelpers({
        getIsRequestMoreMergedPending: () => false,
        setIsRequestMoreMergedPending: () => {},
        getLatestSelectedRepo: () => "saved/repo",
        defaultRepo: "fallback/repo",
        beginRequestActivity: () => () => {},
        postJson: async () => ({
          response: { ok: false },
          result: { ok: false, error: "request failed" },
        }),
        setLatestStoredPayload: () => {},
        setLatestSelectedRepo: () => {},
        renderPrData: () => {},
        loadStoredData: async () => {},
        setStatusMessage,
        notifyFailureSnackbar,
      });

    await handleRequestMoreMerged("org/repo", { onStatusChange });

    expect(onStatusChange).toHaveBeenCalledWith("request failed");
    expect(setStatusMessage).toHaveBeenNthCalledWith(
      1,
      "Requesting more merged PRs...",
    );
    expect(setStatusMessage).toHaveBeenNthCalledWith(
      2,
      "Failed to request more merged PRs",
    );
    expect(notifyFailureSnackbar).toHaveBeenCalledWith(
      "Request more failed",
      expect.any(Error),
      "Unable to fetch more merged PRs",
    );
  });

  test("given no onPendingChange/onStatusChange callbacks are provided, when handling request more, then nothing throws", async () => {
    const { handleRequestMoreMerged } = createPrMergedRequestMoreActionHelpers({
      getIsRequestMoreMergedPending: () => false,
      postJson: async () => ({
        response: { ok: true },
        result: { ok: true, refreshedPrs: [] },
      }),
    });

    await expect(handleRequestMoreMerged("org/repo")).resolves.not.toThrow();
  });
});
