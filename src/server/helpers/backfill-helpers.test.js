const { createBackfillHelpers } = require("./backfill-helpers");

describe("Backfill Helpers", () => {
  let mockFs;
  let mockCommandHelpers;
  let mockDataHelpers;
  let backfillHelpers;

  beforeEach(() => {
    // Mock fs
    mockFs = {
      existsSync: jest.fn(() => false),
      readFileSync: jest.fn(),
      statSync: jest.fn(),
    };

    // Mock command helpers
    mockCommandHelpers = {
      runViewPrsBashCommand: jest.fn(),
      runViewPrsShellScript: jest.fn(),
      formatScriptFailureMessage: jest.fn((failure, fallback) => fallback),
    };

    // Mock data helpers
    mockDataHelpers = {
      toTrimmedString: jest.fn((str) => String(str || "").trim()),
      isRepoSlug: jest.fn(() => true),
    };

    // Create helpers
    backfillHelpers = createBackfillHelpers({
      fs: mockFs,
      commandHelpers: mockCommandHelpers,
      dataHelpers: mockDataHelpers,
      viewPrsBackfillLogFile: "/test/backfill.log",
      viewPrsBackfillPidFile: "/test/backfill.pid",
      viewPrsBackfillManagerRelativePath: "scripts/backfill-manager.sh",
      viewPrsBackfillStatusTimeoutMs: 10000,
      viewPrsBackfillActionTimeoutMs: 30000,
    });
  });

  describe("Given listMergedPrCandidates", () => {
    test("When repo is valid, Then returns sorted PRs", async () => {
      // Arrange
      mockCommandHelpers.runViewPrsBashCommand.mockResolvedValue({
        stdout: JSON.stringify([
          { number: 123, mergedAt: "2024-01-15T10:00:00Z" },
          { number: 456, mergedAt: "2024-01-20T10:00:00Z" },
          { number: 789, mergedAt: "2024-01-10T10:00:00Z" },
        ]),
        stderr: "",
      });

      // Act
      const result = await backfillHelpers.listMergedPrCandidates({
        repo: "org/repo",
        limit: 100,
      });

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0].number).toBe("456"); // Most recent first
      expect(result[1].number).toBe("123");
      expect(result[2].number).toBe("789");
      expect(mockCommandHelpers.runViewPrsBashCommand).toHaveBeenCalledWith(
        expect.arrayContaining(["-lc"]),
        2 * 1024 * 1024,
        { timeoutMs: 120000 },
      );
    });

    test("When repo is invalid, Then throws error", async () => {
      // Arrange
      mockDataHelpers.isRepoSlug.mockReturnValue(false);

      // Act & Assert
      await expect(
        backfillHelpers.listMergedPrCandidates({ repo: "invalid" }),
      ).rejects.toThrow("Invalid repo: invalid");
    });

    test("When limit is out of range, Then clamps to 1-200", async () => {
      // Arrange
      mockCommandHelpers.runViewPrsBashCommand.mockResolvedValue({
        stdout: "[]",
        stderr: "",
      });

      // Act
      await backfillHelpers.listMergedPrCandidates({ repo: "org/repo", limit: 500 });

      // Assert
      const callArgs = mockCommandHelpers.runViewPrsBashCommand.mock.calls[0][0];
      expect(callArgs[1]).toContain("--limit 200");
    });

    test("When response is invalid JSON, Then returns empty array", async () => {
      // Arrange
      mockCommandHelpers.runViewPrsBashCommand.mockResolvedValue({
        stdout: "invalid json{",
        stderr: "",
      });

      // Act
      const result = await backfillHelpers.listMergedPrCandidates({
        repo: "org/repo",
      });

      // Assert
      expect(result).toEqual([]);
    });

    test("When PRs have invalid numbers, Then filters them out", async () => {
      // Arrange
      mockCommandHelpers.runViewPrsBashCommand.mockResolvedValue({
        stdout: JSON.stringify([
          { number: 123, mergedAt: "2024-01-15T10:00:00Z" },
          { number: "abc", mergedAt: "2024-01-20T10:00:00Z" },
          { number: 456, mergedAt: "" },
        ]),
        stderr: "",
      });

      // Act
      const result = await backfillHelpers.listMergedPrCandidates({
        repo: "org/repo",
      });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].number).toBe("123");
    });
  });

  describe("Given parseBackfillCommandOutput", () => {
    test("When output shows running status, Then returns running true", () => {
      // Arrange
      const stdout = "Backfill status: running\nPID: 12345\nLog: /test/log.txt";

      // Act
      const result = backfillHelpers.parseBackfillCommandOutput(stdout, "");

      // Assert
      expect(result.running).toBe(true);
      expect(result.pid).toBe("12345");
      expect(result.logFile).toBe("/test/log.txt");
      expect(result.summary).toContain("Backfill status");
    });

    test("When output shows not running, Then returns running false", () => {
      // Arrange
      const stdout = "Backfill is not running";

      // Act
      const result = backfillHelpers.parseBackfillCommandOutput(stdout, "");

      // Assert
      expect(result.running).toBe(false);
      expect(result.pid).toBeNull();
    });

    test("When output has started message, Then extracts status line", () => {
      // Arrange
      const stdout = "Started background backfill\nPID: 99999";

      // Act
      const result = backfillHelpers.parseBackfillCommandOutput(stdout, "");

      // Assert
      expect(result.summary).toBe("Started background backfill");
      expect(result.pid).toBe("99999");
    });

    test("When combining stdout and stderr, Then merges them", () => {
      // Arrange
      const stdout = "Line from stdout";
      const stderr = "Line from stderr\nBackfill status: running";

      // Act
      const result = backfillHelpers.parseBackfillCommandOutput(stdout, stderr);

      // Assert
      expect(result.rawOutput).toContain("Line from stdout");
      expect(result.rawOutput).toContain("Line from stderr");
      expect(result.running).toBe(true);
    });
  });

  describe("Given getBackfillLogTail", () => {
    test("When log file does not exist, Then returns not exist status", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = backfillHelpers.getBackfillLogTail();

      // Assert
      expect(result.ok).toBe(true);
      expect(result.lineCount).toBe(0);
      expect(result.tail).toBe("");
      expect(result.summary).toContain("does not exist yet");
    });

    test("When log file exists with content, Then returns tail", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        mtime: new Date("2024-01-15T10:00:00Z"),
      });
      mockFs.readFileSync.mockReturnValue(
        "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n",
      );

      // Act
      const result = backfillHelpers.getBackfillLogTail({ maxLines: 3 });

      // Assert
      expect(result.ok).toBe(true);
      expect(result.lineCount).toBe(3);
      expect(result.totalLineCount).toBe(5);
      expect(result.tail).toBe("Line 3\nLine 4\nLine 5");
      expect(result.isTruncated).toBe(true);
      expect(result.updatedAt).toBe("2024-01-15T10:00:00.000Z");
    });

    test("When maxLines exceeds total lines, Then returns all lines", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ mtime: new Date() });
      mockFs.readFileSync.mockReturnValue("Line 1\nLine 2\n");

      // Act
      const result = backfillHelpers.getBackfillLogTail({ maxLines: 100 });

      // Assert
      expect(result.lineCount).toBe(2);
      expect(result.isTruncated).toBe(false);
    });

    test("When maxLines is out of range, Then clamps to 1-500", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ mtime: new Date() });
      mockFs.readFileSync.mockReturnValue("Line 1\n");

      // Act
      const result = backfillHelpers.getBackfillLogTail({ maxLines: 1000 });

      // Assert
      expect(result.linesRequested).toBe(500);
    });
  });

  describe("Given getViewPrsBackfillPublicState", () => {
    test("When status check succeeds, Then returns state", async () => {
      // Arrange
      mockCommandHelpers.runViewPrsShellScript.mockResolvedValue({
        stdout: "Backfill status: running\nPID: 12345",
        stderr: "",
        command: "bash scripts/backfill-manager.sh status",
      });

      // Act
      const result = await backfillHelpers.getViewPrsBackfillPublicState();

      // Assert
      expect(result.ok).toBe(true);
      expect(result.running).toBe(true);
      expect(result.pid).toBe("12345");
      expect(result.error).toBeNull();
      expect(mockCommandHelpers.runViewPrsShellScript).toHaveBeenCalledWith(
        "scripts/backfill-manager.sh",
        ["status"],
        1024 * 1024,
        { timeoutMs: 10000 },
      );
    });

    test("When status check fails, Then returns error state", async () => {
      // Arrange
      mockCommandHelpers.runViewPrsShellScript.mockRejectedValue({
        command: "bash scripts/backfill-manager.sh status",
        stdout: "",
        stderr: "Script failed",
      });
      mockCommandHelpers.formatScriptFailureMessage.mockReturnValue(
        "Backfill status failed",
      );

      // Act
      const result = await backfillHelpers.getViewPrsBackfillPublicState();

      // Assert
      expect(result.ok).toBe(false);
      expect(result.running).toBe(false);
      expect(result.pid).toBeNull();
      expect(result.error).toBe("Backfill status failed");
    });
  });

  describe("Given runViewPrsBackfillAction", () => {
    test("When action succeeds, Then returns success result", async () => {
      // Arrange
      mockCommandHelpers.runViewPrsShellScript.mockResolvedValue({
        stdout: "Started background backfill\nPID: 54321",
        stderr: "",
        command: "bash scripts/backfill-manager.sh start",
      });

      // Act
      const result = await backfillHelpers.runViewPrsBackfillAction("start");

      // Assert
      expect(result.ok).toBe(true);
      expect(result.pid).toBe("54321");
      expect(result.summary).toContain("Started background backfill");
      expect(result.error).toBeNull();
      expect(mockCommandHelpers.runViewPrsShellScript).toHaveBeenCalledWith(
        "scripts/backfill-manager.sh",
        ["start"],
        4 * 1024 * 1024,
        { timeoutMs: 30000 },
      );
    });

    test("When action is stop, Then executes stop command", async () => {
      // Arrange
      mockCommandHelpers.runViewPrsShellScript.mockResolvedValue({
        stdout: "Stopped background backfill",
        stderr: "",
        command: "bash scripts/backfill-manager.sh stop",
      });

      // Act
      const result = await backfillHelpers.runViewPrsBackfillAction("stop");

      // Assert
      expect(result.ok).toBe(true);
      expect(result.summary).toContain("Stopped background backfill");
    });
  });
});
