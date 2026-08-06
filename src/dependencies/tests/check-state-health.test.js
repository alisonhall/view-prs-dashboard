const fs = require("fs");
const os = require("os");
const path = require("path");

const { evaluateStateHealth } = require("../check-state-health.js");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-state-health-"));

describe("check-state-health", () => {
  test("returns warnings when files are missing", () => {
    const tempDir = makeTempDir();
    const summary = evaluateStateHealth({
      dataFile: path.join(tempDir, "missing-data.json"),
      userStateFile: path.join(tempDir, "missing-user-state.json"),
    });

    expect(summary.failures).toEqual([]);
    expect(summary.warnings.length).toBe(2);
  });

  test("flags missing top-level keys", () => {
    const tempDir = makeTempDir();
    const dataFile = path.join(tempDir, "data.json");
    const userStateFile = path.join(tempDir, "user-state.json");

    fs.writeFileSync(dataFile, JSON.stringify({}), "utf8");
    fs.writeFileSync(
      userStateFile,
      JSON.stringify({
        notesByPrNumber: {},
      }),
      "utf8",
    );

    const summary = evaluateStateHealth({ dataFile, userStateFile });

    expect(summary.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("data file missing expected keys: byPrNumber"),
        expect.stringContaining("user-state file missing expected keys"),
      ]),
    );
  });

  test("passes for healthy files", () => {
    const tempDir = makeTempDir();
    const dataFile = path.join(tempDir, "data.json");
    const userStateFile = path.join(tempDir, "user-state.json");

    fs.writeFileSync(
      dataFile,
      JSON.stringify({
        byPrNumber: {
          "123": { repo: "owner/repo" },
        },
      }),
      "utf8",
    );

    fs.writeFileSync(
      userStateFile,
      JSON.stringify({
        notesByPrNumber: {},
        ackByRepo: {},
        reverifyByRepo: {},
        inReviewByRepo: {},
      }),
      "utf8",
    );

    const summary = evaluateStateHealth({ dataFile, userStateFile });

    expect(summary.failures).toEqual([]);
  });
});
