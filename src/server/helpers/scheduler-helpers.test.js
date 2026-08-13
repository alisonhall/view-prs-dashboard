const { createSchedulerHelpers } = require("./scheduler-helpers");

describe("Scheduler Helpers", () => {
  let mockFs;
  let mockPath;
  let mockDataHelpers;
  let schedulerHelpers;

  beforeEach(() => {
    // Mock fs
    mockFs = {
      existsSync: jest.fn(() => false),
      readFileSync: jest.fn(),
      writeFileSync: jest.fn(),
      mkdirSync: jest.fn(),
    };

    // Mock path
    mockPath = {
      dirname: jest.fn((p) => p.substring(0, p.lastIndexOf("/"))),
    };

    // Mock data helpers
    mockDataHelpers = {
      toTrimmedString: jest.fn((str) => String(str || "").trim()),
    };

    // Create helpers
    schedulerHelpers = createSchedulerHelpers({
      fs: mockFs,
      path: mockPath,
      dataHelpers: mockDataHelpers,
      viewPrsActionLogFile: "/test/action-log.json",
    });
  });

  describe("Given viewPrsProgressTracker", () => {
    test("When onStart called, Then increments PR count", () => {
      // Act
      schedulerHelpers.viewPrsProgressTracker.onStart("123");
      schedulerHelpers.viewPrsProgressTracker.onStart("123");

      // Assert
      const counts = schedulerHelpers._getActivePrCounts();
      expect(counts.get("123")).toBe(2);
    });

    test("When onEnd called, Then decrements PR count", () => {
      // Arrange
      schedulerHelpers.viewPrsProgressTracker.onStart("456");
      schedulerHelpers.viewPrsProgressTracker.onStart("456");

      // Act
      schedulerHelpers.viewPrsProgressTracker.onEnd("456");

      // Assert
      const counts = schedulerHelpers._getActivePrCounts();
      expect(counts.get("456")).toBe(1);
    });

    test("When onEnd called on count 1, Then removes from map", () => {
      // Arrange
      schedulerHelpers.viewPrsProgressTracker.onStart("789");

      // Act
      schedulerHelpers.viewPrsProgressTracker.onEnd("789");

      // Assert
      const counts = schedulerHelpers._getActivePrCounts();
      expect(counts.has("789")).toBe(false);
    });
  });

  describe("Given addSchedulerActivePrNumbers", () => {
    test("When array of PRs provided, Then adds all to tracking", () => {
      // Act
      schedulerHelpers.addSchedulerActivePrNumbers(["100", "200", "300"]);

      // Assert
      const counts = schedulerHelpers._getActivePrCounts();
      expect(counts.get("100")).toBe(1);
      expect(counts.get("200")).toBe(1);
      expect(counts.get("300")).toBe(1);
    });

    test("When duplicate PRs in array, Then deduplicates", () => {
      // Act
      schedulerHelpers.addSchedulerActivePrNumbers(["111", "111", "222"]);

      // Assert
      const counts = schedulerHelpers._getActivePrCounts();
      expect(counts.get("111")).toBe(1);
      expect(counts.get("222")).toBe(1);
    });

    test("When empty array provided, Then does nothing", () => {
      // Act
      schedulerHelpers.addSchedulerActivePrNumbers([]);

      // Assert
      const counts = schedulerHelpers._getActivePrCounts();
      expect(counts.size).toBe(0);
    });
  });

  describe("Given removeSchedulerActivePrNumbers", () => {
    test("When removing PRs, Then decrements counts", () => {
      // Arrange
      schedulerHelpers.addSchedulerActivePrNumbers(["500", "600"]);

      // Act
      schedulerHelpers.removeSchedulerActivePrNumbers(["500"]);

      // Assert
      const counts = schedulerHelpers._getActivePrCounts();
      expect(counts.has("500")).toBe(false);
      expect(counts.get("600")).toBe(1);
    });
  });

  describe("Given getLatestMergedPrNumbersForRepo", () => {
    test("When repo has merged PRs, Then returns sorted by merge date", () => {
      // Arrange
      const mockReadData = jest.fn(() => ({
        byPrNumber: {
          "1": {
            data: {
              number: "1",
              repo: "org/repo",
              state: "MERGED",
              mergedAt: "2024-01-15T10:00:00Z",
            },
          },
          "2": {
            data: {
              number: "2",
              repo: "org/repo",
              state: "MERGED",
              mergedAt: "2024-01-20T10:00:00Z",
            },
          },
          "3": {
            data: {
              number: "3",
              repo: "org/repo",
              state: "MERGED",
              mergedAt: "2024-01-10T10:00:00Z",
            },
          },
        },
      }));

      // Act
      const result = schedulerHelpers.getLatestMergedPrNumbersForRepo(
        "org/repo",
        15,
        mockReadData,
      );

      // Assert
      expect(result).toEqual(["2", "1", "3"]); // Most recent first
    });

    test("When limit provided, Then returns only limit PRs", () => {
      // Arrange
      const mockReadData = jest.fn(() => ({
        byPrNumber: {
          "1": {
            data: {
              number: "1",
              repo: "org/repo",
              state: "MERGED",
              mergedAt: "2024-01-15T10:00:00Z",
            },
          },
          "2": {
            data: {
              number: "2",
              repo: "org/repo",
              state: "MERGED",
              mergedAt: "2024-01-20T10:00:00Z",
            },
          },
        },
      }));

      // Act
      const result = schedulerHelpers.getLatestMergedPrNumbersForRepo(
        "org/repo",
        1,
        mockReadData,
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("2");
    });

    test("When repo is empty, Then returns empty array", () => {
      // Arrange
      const mockReadData = jest.fn(() => ({ byPrNumber: {} }));

      // Act
      const result = schedulerHelpers.getLatestMergedPrNumbersForRepo(
        "",
        15,
        mockReadData,
      );

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("Given appendActionLogEntry", () => {
    test("When log file does not exist, Then creates new log", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      schedulerHelpers.appendActionLogEntry({
        action: "test",
        result: "success",
      });

      // Assert
      expect(mockFs.mkdirSync).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "/test/action-log.json",
        expect.stringContaining('"action": "test"'),
        "utf8",
      );
    });

    test("When log file exists, Then appends entry", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify([{ action: "old", timestamp: "2024-01-01T00:00:00Z" }]),
      );

      // Act
      schedulerHelpers.appendActionLogEntry({
        action: "new",
        result: "done",
      });

      // Assert
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const written = JSON.parse(writeCall[1]);
      expect(written).toHaveLength(2);
      expect(written[1].action).toBe("new");
      expect(written[1].timestamp).toBeDefined();
    });

    test("When log exceeds max entries, Then truncates", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      const oldEntries = Array.from({ length: 500 }, (_, i) => ({
        action: `old-${i}`,
        timestamp: "2024-01-01T00:00:00Z",
      }));
      mockFs.readFileSync.mockReturnValue(JSON.stringify(oldEntries));

      // Act
      schedulerHelpers.appendActionLogEntry({ action: "new" });

      // Assert
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const written = JSON.parse(writeCall[1]);
      expect(written.length).toBe(500);
      expect(written[0].action).toBe("old-1"); // First entry removed
      expect(written[499].action).toBe("new");
    });
  });

  describe("Given readActionLog", () => {
    test("When log file does not exist, Then returns empty array", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = schedulerHelpers.readActionLog();

      // Assert
      expect(result).toEqual([]);
    });

    test("When log file exists, Then returns entries", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify([
          { action: "a", timestamp: "2024-01-01" },
          { action: "b", timestamp: "2024-01-02" },
        ]),
      );

      // Act
      const result = schedulerHelpers.readActionLog();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].action).toBe("a");
    });

    test("When limit provided, Then returns last N entries", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify([
          { action: "1" },
          { action: "2" },
          { action: "3" },
        ]),
      );

      // Act
      const result = schedulerHelpers.readActionLog({ limit: 2 });

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].action).toBe("2");
      expect(result[1].action).toBe("3");
    });
  });

  describe("Given createSchedulerState", () => {
    test("When created, Then returns initial state", () => {
      // Act
      const state = schedulerHelpers.createSchedulerState();

      // Assert
      expect(state.startedAt).toBeDefined();
      expect(state.lastManualRunAt).toBeNull();
      expect(state.lastAutoRunAt).toBeNull();
      expect(state.isAutoRunInProgress).toBe(false);
    });
  });
});
