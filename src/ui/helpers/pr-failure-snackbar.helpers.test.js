const {
  buildFailureSnackbarNotification,
  isTimeoutFailureMessage,
} = require("./pr-failure-snackbar.helpers.ts");

describe("pr failure snackbar helpers", () => {
  describe("isTimeoutFailureMessage", () => {
    test.each([
      ["script timeout wording", "Script timed out after 120s", true],
      ["deadline wording", "deadline exceeded while refreshing", true],
      ["unrelated error", "HTTP 500 failed", false],
      ["empty string", "", false],
    ])("returns %s detection for %s", (_label, message, expected) => {
      expect(isTimeoutFailureMessage(message)).toBe(expected);
    });
  });

  describe("buildFailureSnackbarNotification", () => {
    test("given a string error source, when building the notification, then the string itself is used as the detail", () => {
      expect(buildFailureSnackbarNotification("Update failed", "network down")).toEqual({
        title: "Update failed",
        detail: "network down",
      });
    });

    test("given an object error source with multiple candidate fields, when building the notification, then error takes priority over summary/message/stderr/output", () => {
      const result = buildFailureSnackbarNotification("Update failed", {
        error: "from error",
        summary: "from summary",
        message: "from message",
        stderr: "from stderr",
        output: "from output",
      });
      expect(result.detail).toBe("from error");
    });

    test("given an object error source missing the higher-priority fields, when building the notification, then it falls through to the next populated candidate", () => {
      const result = buildFailureSnackbarNotification("Update failed", {
        stderr: "from stderr",
        output: "from output",
      });
      expect(result.detail).toBe("from stderr");
    });

    test("given no usable candidate anywhere, when building the notification, then the fallback message is used", () => {
      const result = buildFailureSnackbarNotification("Update failed", {}, "fallback text");
      expect(result.detail).toBe("fallback text");
    });

    test("given a candidate containing timeout wording, when building the notification, then the title is suffixed with (timed out)", () => {
      const result = buildFailureSnackbarNotification("Update failed", {
        error: "Script timed out after 120s",
      });
      expect(result.title).toBe("Update failed (timed out)");
    });

    test("given no timeout wording anywhere, when building the notification, then the title is unchanged", () => {
      const result = buildFailureSnackbarNotification("Update failed", {
        error: "HTTP 500",
      });
      expect(result.title).toBe("Update failed");
    });
  });
});
