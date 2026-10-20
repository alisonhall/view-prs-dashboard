const { createPrSchedulerStatusHelpers } = require("./pr-scheduler-status.helpers.js");

describe("pr scheduler status helpers", () => {
  test("given a successful response, when loadSchedulerStatus is called, then it renders the scheduler payload and returns the result", async () => {
    const renderSchedulerStatus = jest.fn();
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, scheduler: { activePrNumbers: [{ prNumber: "1", repo: "owner/repo" }] } }),
    });
    const { loadSchedulerStatus } = createPrSchedulerStatusHelpers({ fetch, renderSchedulerStatus });

    const result = await loadSchedulerStatus();

    expect(fetch).toHaveBeenCalledWith("/view-prs/scheduler");
    expect(renderSchedulerStatus).toHaveBeenCalledWith({
      activePrNumbers: [{ prNumber: "1", repo: "owner/repo" }],
    });
    expect(result).toEqual({ ok: true, scheduler: { activePrNumbers: [{ prNumber: "1", repo: "owner/repo" }] } });
  });

  test("given a 404 response, when loadSchedulerStatus is called, then it returns a null-scheduler result without rendering", async () => {
    const renderSchedulerStatus = jest.fn();
    const fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const { loadSchedulerStatus } = createPrSchedulerStatusHelpers({ fetch, renderSchedulerStatus });

    const result = await loadSchedulerStatus();

    expect(result).toEqual({ ok: false, scheduler: null });
    expect(renderSchedulerStatus).not.toHaveBeenCalled();
  });

  test("given a non-ok, non-404 response, when loadSchedulerStatus is called, then it throws the server-provided error", async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: "boom" }),
    });
    const { loadSchedulerStatus } = createPrSchedulerStatusHelpers({ fetch, renderSchedulerStatus: jest.fn() });

    await expect(loadSchedulerStatus()).rejects.toThrow("boom");
  });

  test("given no fetch/renderSchedulerStatus deps, when loadSchedulerStatus is called, then it rejects safely instead of throwing synchronously", async () => {
    const { loadSchedulerStatus } = createPrSchedulerStatusHelpers({});

    await expect(loadSchedulerStatus()).rejects.toThrow("fetch is not available");
  });
});
