const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  findProtectedWriteViolations,
  shouldScanFile,
} = require("../check-protected-state-writes.js");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-state-writes-"));

const writeFile = (rootDir, relativePath, content) => {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
};

describe("check-protected-state-writes", () => {
  test("ignores test files when scanning", () => {
    expect(shouldScanFile("src/example.test.js")).toBe(false);
    expect(shouldScanFile("src/example.test.sh")).toBe(false);
    expect(shouldScanFile("src/example.js")).toBe(true);
  });

  test("flags disallowed protected-state writers", () => {
    const rootDir = makeTempDir();

    writeFile(
      rootDir,
      "src/unsafe-writer.js",
      'const p = "check-open-pr-updates.data.json";\nrequire("fs").writeFileSync(p, "{}");\n',
    );

    const violations = findProtectedWriteViolations({ rootDir });

    expect(violations).toContain("src/unsafe-writer.js");
  });

  test("allows sanctioned writer paths and ignores test paths", () => {
    const rootDir = makeTempDir();

    writeFile(
      rootDir,
      "src/server/storage/view-prs-state-storage.js",
      'const p = "check-open-pr-updates.data.json";\nrequire("fs").writeFileSync(p, "{}");\n',
    );

    writeFile(
      rootDir,
      "src/also-ignored.test.js",
      'const p = "check-open-pr-updates.data.json";\nrequire("fs").writeFileSync(p, "{}");\n',
    );

    const violations = findProtectedWriteViolations({ rootDir });

    expect(violations).toEqual([]);
  });
});
