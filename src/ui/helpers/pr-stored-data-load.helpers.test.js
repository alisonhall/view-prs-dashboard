/** @jest-environment jsdom */

const {
  createPrStoredDataLoadHelpers,
} = require("./pr-stored-data-load.helpers.js");

describe("pr stored data load helpers", () => {
  test("given stored data fetch succeeds, when loading stored data, then metadata, backfill status, and render wiring are updated", async () => {
    const finishActivity = jest.fn();
    const beginRequestActivity = jest.fn(() => finishActivity);
    const setLastSeenDataVersion = jest.fn();
    const setLastRenderedRunStamp = jest.fn();
    const setLastSuccessfulRenderedCheckAt = jest.fn();
    const setLatestStoredPayload = jest.fn();
    const getLatestSelectedRepo = jest.fn(() => "saved/repo");
    const setLatestSelectedRepo = jest.fn();
    const updateBackfillStatusFromPayload = jest.fn();
    const renderPrData = jest.fn();
    const payload = {
      ok: true,
      dataMeta: { dataVersion: "123:45" },
      lastRun: { updatedAt: "2026-07-20T00:00:00.000Z" },
    };
    const fetch = jest.fn(async () => ({
      ok: true,
      json: async () => payload,
    }));

    const { loadStoredData } = createPrStoredDataLoadHelpers({
      fetch,
      beginRequestActivity,
      setLastSeenDataVersion,
      setLastRenderedRunStamp,
      setLastSuccessfulRenderedCheckAt,
      setLatestStoredPayload,
      getLatestSelectedRepo,
      setLatestSelectedRepo,
      updateBackfillStatusFromPayload,
      renderPrData,
    });

    const result = await loadStoredData("org/repo", { useLastRunScope: false });

    expect(beginRequestActivity).toHaveBeenCalledWith("dataLoad");
    expect(fetch).toHaveBeenCalledWith("/view-prs/data");
    expect(setLastSeenDataVersion).toHaveBeenCalledWith("123:45");
    expect(setLastRenderedRunStamp).toHaveBeenCalledWith("2026-07-20T00:00:00.000Z");
    expect(setLastSuccessfulRenderedCheckAt).toHaveBeenCalledWith("2026-07-20T00:00:00.000Z");
    expect(setLatestStoredPayload).toHaveBeenCalledWith(payload);
    expect(setLatestSelectedRepo).toHaveBeenCalledWith("org/repo");
    expect(updateBackfillStatusFromPayload).toHaveBeenCalledWith(payload);
    expect(renderPrData).toHaveBeenCalledWith(payload, "org/repo", {
      useLastRunScope: false,
    });
    expect(finishActivity).toHaveBeenCalledTimes(1);
    expect(result).toBe(payload);
  });

  test("given stored data fetch succeeds without selected repo, when loading stored data, then the previous selected repo fallback is preserved", async () => {
    const setLatestSelectedRepo = jest.fn();
    const { loadStoredData } = createPrStoredDataLoadHelpers({
      fetch: async () => ({
        ok: true,
        json: async () => ({ ok: true }),
      }),
      beginRequestActivity: () => () => {},
      getLatestSelectedRepo: () => "saved/repo",
      setLatestSelectedRepo,
      renderPrData: () => {},
    });

    await loadStoredData("");

    expect(setLatestSelectedRepo).toHaveBeenCalledWith("saved/repo");
  });

  test("given stored data fetch fails, when loading stored data, then the request activity still finishes", async () => {
    const finishActivity = jest.fn();
    const { loadStoredData } = createPrStoredDataLoadHelpers({
      fetch: async () => ({
        ok: false,
        json: async () => ({ ok: false, error: "boom" }),
      }),
      beginRequestActivity: () => finishActivity,
    });

    await expect(loadStoredData()).rejects.toThrow("boom");
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });
});
