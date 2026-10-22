/** @jest-environment jsdom */

const {
  isIgnoredCredentialFieldError,
  installCredentialFieldErrorFilters,
} = require("./credential-field-error-filter.helpers.js");

// Window-bridge elimination Phase 7.5: moved from index.page.js's module-load
// listeners, which had no tests of their own.
describe("credential-field error filter", () => {
  let uninstall;
  let consoleError;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    uninstall = installCredentialFieldErrorFilters(window);
  });

  afterEach(() => {
    uninstall();
    consoleError.mockRestore();
  });

  test.each([
    ["the password-field marker", "ControlLooksLikePasswordCredentialField: blah", true],
    ["the username marker", "UsernameElementUniqueID missing", true],
    ["an unrelated message", "TypeError: x is undefined", false],
    ["an empty value", "", false],
    ["undefined", undefined, false],
  ])("given %s, when classified, then ignored is %s", (_label, value, expected) => {
    expect(isIgnoredCredentialFieldError(value)).toBe(expected);
  });

  test("given a credential-field error event, when dispatched, then it is suppressed", () => {
    const event = new ErrorEvent("error", { message: "ControlLooksLikePasswordCredentialField", cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  test("given another error event, when dispatched, then it is left alone", () => {
    const event = new ErrorEvent("error", { message: "Real failure", cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  const dispatchRejection = (reason) => {
    const event = new Event("unhandledrejection", { cancelable: true });
    event.reason = reason;
    window.dispatchEvent(event);
    return event;
  };

  test("given an unhandled rejection from a credential-field error, when dispatched, then it is suppressed without logging", () => {
    const event = dispatchRejection(new Error("UsernameElementUniqueID"));
    expect(event.defaultPrevented).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  test("given any other unhandled rejection, when dispatched, then it is logged and not suppressed", () => {
    const reason = new Error("network down");
    const event = dispatchRejection(reason);
    expect(event.defaultPrevented).toBe(false);
    expect(consoleError).toHaveBeenCalledWith("Unhandled promise rejection:", reason);
  });

  test("given the filters are uninstalled, when a credential-field error is dispatched, then it is no longer suppressed", () => {
    uninstall();
    uninstall = () => {};
    const event = new ErrorEvent("error", { message: "ControlLooksLikePasswordCredentialField", cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
