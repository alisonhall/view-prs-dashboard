/** @jest-environment jsdom */

const {
  createPrSinglePrUpdateHelpers,
} = require("./pr-single-pr-update.helpers.js");

describe("pr single pr update helpers", () => {
  test("given a successful single-pr refresh with latest data, when running the update, then optimistic render and stored reload both run", async () => {
    const finishActivity = jest.fn();
    const beginRequestActivity = jest.fn(() => finishActivity);
    const setStatusMessage = jest.fn();
    const setOutputMessage = jest.fn();
    const setLatestStoredPayload = jest.fn();
    const setLatestSelectedRepo = jest.fn();
    const renderPrData = jest.fn();
    const loadStoredData = jest.fn(async () => {});
    const postJson = jest.fn(async () => ({
      response: { ok: true },
      result: {
        ok: true,
        output: "ansi-output",
        prData: { byPrNumber: { 7: {} } },
      },
    }));

    const { runSinglePrUpdate } = createPrSinglePrUpdateHelpers({
      postJson,
      beginRequestActivity,
      setStatusMessage,
      setOutputMessage,
      getGithubAuthFailureHint: () => "",
      formatCommandOutputWithAuthHint: () => "",
      notifyFailureSnackbar: jest.fn(),
      stripAnsi: (value) => `clean:${value}`,
      setLatestStoredPayload,
      setLatestSelectedRepo,
      renderPrData,
      loadStoredData,
      defaultRepo: "fallback/repo",
    });

    await runSinglePrUpdate({ repo: "org/repo", prNumber: 7 }, { number: 7 });

    expect(postJson).toHaveBeenCalledWith("/view-prs/run", {
      repo: "org/repo",
      prNumber: "7",
      openMode: "none",
      quiet: true,
    });
    expect(setStatusMessage).toHaveBeenNthCalledWith(1, "Updating PR #7...");
    expect(setStatusMessage).toHaveBeenNthCalledWith(2, "PR #7 updated");
    expect(setOutputMessage).toHaveBeenNthCalledWith(1, "");
    expect(setOutputMessage).toHaveBeenNthCalledWith(2, "clean:ansi-output");
    expect(setLatestStoredPayload).toHaveBeenCalledWith({ byPrNumber: { 7: {} } });
    expect(setLatestSelectedRepo).toHaveBeenCalledWith("org/repo");
    expect(renderPrData).toHaveBeenCalledWith(
      { byPrNumber: { 7: {} } },
      "org/repo",
      { useLastRunScope: false },
    );
    expect(loadStoredData).toHaveBeenCalledWith("org/repo", {
      useLastRunScope: false,
    });
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });

  test("given a failed single-pr refresh with auth hint, when running the update, then auth-aware failure messaging is shown", async () => {
    const setStatusMessage = jest.fn();
    const setOutputMessage = jest.fn();
    const notifyFailureSnackbar = jest.fn();

    const { runSinglePrUpdate } = createPrSinglePrUpdateHelpers({
      postJson: async () => ({
        response: { ok: false },
        result: { ok: false, error: "bad token" },
      }),
      beginRequestActivity: () => () => {},
      setStatusMessage,
      setOutputMessage,
      getGithubAuthFailureHint: () => "sign in",
      formatCommandOutputWithAuthHint: () => "formatted-output",
      notifyFailureSnackbar,
      stripAnsi: (value) => value,
      loadStoredData: async () => {},
      defaultRepo: "fallback/repo",
    });

    await runSinglePrUpdate({}, { number: 11 });

    expect(setStatusMessage).toHaveBeenNthCalledWith(1, "Updating PR #11...");
    expect(setStatusMessage).toHaveBeenNthCalledWith(2, "Failed to update PR #11");
    expect(setStatusMessage).toHaveBeenNthCalledWith(
      3,
      "Failed to update PR #11 (GitHub auth required)",
    );
    expect(setOutputMessage).toHaveBeenNthCalledWith(1, "");
    expect(setOutputMessage).toHaveBeenNthCalledWith(2, "formatted-output");
    expect(notifyFailureSnackbar).toHaveBeenCalledWith(
      "Update failed for PR #11",
      { ok: false, error: "bad token" },
      "Failed to update PR #11",
    );
  });

  test("given an exception during single-pr refresh, when running the update, then failure output and notification are emitted", async () => {
    const finishActivity = jest.fn();
    const setStatusMessage = jest.fn();
    const setOutputMessage = jest.fn();
    const notifyFailureSnackbar = jest.fn();

    const { runSinglePrUpdate } = createPrSinglePrUpdateHelpers({
      postJson: async () => {
        throw new Error("network down");
      },
      beginRequestActivity: () => finishActivity,
      setStatusMessage,
      setOutputMessage,
      getGithubAuthFailureHint: () => "",
      formatCommandOutputWithAuthHint: () => "",
      notifyFailureSnackbar,
      stripAnsi: (value) => value,
      loadStoredData: async () => {},
      defaultRepo: "fallback/repo",
    });

    await runSinglePrUpdate({}, { number: 19 });

    expect(setStatusMessage).toHaveBeenNthCalledWith(1, "Updating PR #19...");
    expect(setStatusMessage).toHaveBeenNthCalledWith(2, "Failed to update PR #19");
    expect(setOutputMessage).toHaveBeenNthCalledWith(1, "");
    expect(setOutputMessage).toHaveBeenNthCalledWith(2, "Error: network down");
    expect(notifyFailureSnackbar).toHaveBeenCalledWith(
      "Update failed for PR #19",
      expect.any(Error),
      "Failed to update PR #19",
    );
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });
});
