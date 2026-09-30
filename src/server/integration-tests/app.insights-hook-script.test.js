// Exercises runInsightsHookScript's *actual* bash invocation end-to-end
// against a real script (no mocking of runViewPrsBashCommand/spawn) - the
// rest of the suite mocks runInsightsHookScript/buildInsightsHookMetadata
// directly, which would not have caught a regression in the
// `bash -c 'exec "$0" "$@"'` argv construction itself (e.g. the classic
// `bash -c` off-by-one where the first extra arg becomes $0, not $1).
//
// VIEW_PRS_INSIGHTS_HOOK_SCRIPT must be set before app.js is first required,
// since app-config.js reads it once at module load - hence the isolated file
// (Jest gives each test file its own module registry) and jest.resetModules()
// in beforeAll rather than reusing the shared app.js instance other test
// files import at the top level.
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("runInsightsHookScript (real bash invocation)", () => {
  let tempDir;
  let scriptPath;
  let app;
  let originalEnvValue;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-insights-hook-"));
    scriptPath = path.join(tempDir, "insights-hook.sh");
    fs.writeFileSync(
      scriptPath,
      [
        "#!/bin/bash",
        "if [[ \"$1\" == *fail* ]]; then",
        "  echo 'boom' >&2",
        "  exit 7",
        "fi",
        "echo \"<div>received:$1</div>\"",
      ].join("\n"),
      "utf8",
    );
    fs.chmodSync(scriptPath, 0o755);

    originalEnvValue = process.env.VIEW_PRS_INSIGHTS_HOOK_SCRIPT;
    process.env.VIEW_PRS_INSIGHTS_HOOK_SCRIPT = scriptPath;
    jest.resetModules();
    app = require("../app.js");
  });

  afterAll(() => {
    if (originalEnvValue === undefined) {
      delete process.env.VIEW_PRS_INSIGHTS_HOOK_SCRIPT;
    } else {
      process.env.VIEW_PRS_INSIGHTS_HOOK_SCRIPT = originalEnvValue;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("passes the JSON metadata through to the real script as $1 (via bash -c 'exec \"$0\" \"$@\"') and returns its stdout", async () => {
    const result = await app.runInsightsHookScript({
      repo: "owner/repo",
      prNumber: "42",
      data: { number: "42", title: "hello" },
    });

    expect(result.error).toBeNull();
    expect(result.html).toContain("<div>received:");
    expect(result.html).toContain('"title":"hello"');
  });

  test("surfaces the script's stderr/exit code in the error field when the real script fails", async () => {
    const result = await app.runInsightsHookScript({
      repo: "owner/repo",
      prNumber: "42",
      data: { number: "42", title: "please fail" },
    });

    expect(result.html).toBeNull();
    expect(result.error).toEqual(expect.stringContaining("code 7"));
    expect(result.error).toEqual(expect.stringContaining("boom"));
  });
});
