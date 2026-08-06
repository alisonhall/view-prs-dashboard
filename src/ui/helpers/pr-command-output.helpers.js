(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrCommandOutputHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrCommandOutputHelpers = ({ stripAnsi }) => {
    const formatCommandOutput = (
      result,
      { includeError = true, includeStdout = true, includeStderr = true } = {},
    ) =>
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

    const getGithubAuthFailureHint = (result = {}) => {
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

    const formatCommandOutputWithAuthHint = (result, options = {}) => {
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

  return {
    createPrCommandOutputHelpers,
  };
});
