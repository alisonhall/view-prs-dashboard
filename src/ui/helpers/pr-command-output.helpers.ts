// Formats a script/command result (command, error, stdout, stderr) for the
// output panels, optionally with a hint when the failure looks like a
// GitHub CLI auth or org-SAML problem.
export interface CommandResult {
  command?: string;
  error?: string;
  output?: string;
  stderr?: string;
}

export interface CommandOutputOptions {
  includeError?: boolean;
  includeStdout?: boolean;
  includeStderr?: boolean;
}

export interface PrCommandOutputDeps {
  stripAnsi: (text: unknown) => string;
}

const createPrCommandOutputHelpers = ({ stripAnsi }: PrCommandOutputDeps) => {
  const formatCommandOutput = (
    result: CommandResult | null | undefined,
    { includeError = true, includeStdout = true, includeStderr = true }: CommandOutputOptions = {},
  ): string =>
    [
      result?.command ? `Command: ${result.command}` : "",
      includeError && result?.error ? `Error:\n${result.error}` : "",
      includeStdout && result?.output
        ? `Stdout:\n${stripAnsi(result.output)}`
        : "",
      includeStderr && result?.stderr
        ? `Stderr:\n${stripAnsi(result.stderr)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

  const getGithubAuthFailureHint = (result: CommandResult | null | undefined = {}): string => {
    const combined = [result?.error, result?.stderr, result?.output]
      .map((value) => String(value || ""))
      .join("\n")
      .toLowerCase();

    if (!combined.trim()) {
      return "";
    }

    const isSamlError =
      combined.includes(
        "resource protected by organization saml enforcement",
      ) || combined.includes("authorize in your web browser");
    const isAuthError =
      combined.includes("gh auth login") ||
      combined.includes("authentication failed") ||
      combined.includes("http 401") ||
      combined.includes("forbidden") ||
      combined.includes("http 403");

    if (!isSamlError && !isAuthError) {
      return "";
    }

    if (isSamlError) {
      return [
        "GitHub access is blocked by org SAML authorization.",
        "Authorize the GitHub CLI token in the browser URL shown above, then rerun.",
      ].join(" ");
    }

    return [
      "GitHub CLI authentication appears invalid or expired.",
      "Run gh auth status, refresh/login, then rerun.",
    ].join(" ");
  };

  const formatCommandOutputWithAuthHint = (
    result: CommandResult | null | undefined,
    options: CommandOutputOptions = {},
  ): string => {
    const output = formatCommandOutput(result, options);
    const hint = getGithubAuthFailureHint(result);
    if (!hint) {
      return output;
    }
    return [output, `Auth hint: ${hint}`].filter(Boolean).join("\n\n");
  };

  return {
    formatCommandOutput,
    getGithubAuthFailureHint,
    formatCommandOutputWithAuthHint,
  };
};

export { createPrCommandOutputHelpers };
