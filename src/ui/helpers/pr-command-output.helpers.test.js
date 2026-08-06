const { createPrCommandOutputHelpers } = require("./pr-command-output.helpers.js");

const stripAnsi = (text) => {
  const input = String(text || "");
  let output = "";
  let idx = 0;

  while (idx < input.length) {
    const current = input.charCodeAt(idx);
    const next = input[idx + 1];

    if (current === 27 && next === "[") {
      idx += 2;
      while (idx < input.length && /[0-9;]/.test(input[idx])) {
        idx += 1;
      }
      if (idx < input.length && input[idx] === "m") {
        idx += 1;
        continue;
      }
    }

    output += input[idx] || "";
    idx += 1;
  }

  return output;
};

describe("pr command output helpers", () => {
  const {
    formatCommandOutput,
    getGithubAuthFailureHint,
    formatCommandOutputWithAuthHint,
  } = createPrCommandOutputHelpers({ stripAnsi });

  test("formatCommandOutput includes command, error, stdout, and stderr", () => {
    const result = {
      command: "gh pr view 123",
      error: "request failed",
      output: "\u001b[31mstdout text\u001b[0m",
      stderr: "\u001b[32mstderr text\u001b[0m",
    };

    const formatted = formatCommandOutput(result);
    expect(formatted).toContain("Command: gh pr view 123");
    expect(formatted).toContain("Error:\nrequest failed");
    expect(formatted).toContain("Stdout:\nstdout text");
    expect(formatted).toContain("Stderr:\nstderr text");
  });

  test("formatCommandOutput respects include options", () => {
    const result = {
      command: "gh pr view 123",
      error: "request failed",
      output: "stdout text",
      stderr: "stderr text",
    };

    const formatted = formatCommandOutput(result, {
      includeError: false,
      includeStdout: false,
    });

    expect(formatted).toContain("Command: gh pr view 123");
    expect(formatted).not.toContain("Error:");
    expect(formatted).not.toContain("Stdout:");
    expect(formatted).toContain("Stderr:\nstderr text");
  });

  test("getGithubAuthFailureHint returns saml and auth hints", () => {
    expect(
      getGithubAuthFailureHint({
        error: "Resource protected by organization SAML enforcement",
      }),
    ).toContain("SAML authorization");

    expect(
      getGithubAuthFailureHint({
        stderr: "HTTP 401 authentication failed",
      }),
    ).toContain("authentication appears invalid or expired");

    expect(
      getGithubAuthFailureHint({
        output: "all good",
      }),
    ).toBe("");
  });

  test("formatCommandOutputWithAuthHint appends hint when relevant", () => {
    const result = {
      command: "gh auth status",
      stderr: "HTTP 403 forbidden",
    };

    const formatted = formatCommandOutputWithAuthHint(result);
    expect(formatted).toContain("Command: gh auth status");
    expect(formatted).toContain("Auth hint:");
  });
});
