const { createDataProcessingHelpers } = require("./data-processing-helpers");

describe("Data Processing Helpers", () => {
  let mockFs;
  let mockPath;
  let mockSpawnSync;
  let mockFileIoHelpers;
  let mockDataHelpers;
  let mockActorHelpers;
  let mockStateStorage;
  let mockPrDetailHelpers;
  let dataProcessingHelpers;

  beforeEach(() => {
    // Mock fs
    mockFs = {
      existsSync: jest.fn(() => false),
      readFileSync: jest.fn(),
      readdirSync: jest.fn(() => []),
      statSync: jest.fn(),
    };

    // Mock path
    mockPath = {
      resolve: jest.fn((...args) => args.join("/")),
      relative: jest.fn((from, to) => to.replace(from + "/", "")),
      isAbsolute: jest.fn((p) => p.startsWith("/")),
      join: jest.fn((...args) => args.join("/")),
    };

    // Mock spawnSync
    mockSpawnSync = jest.fn(() => ({ status: 0, stdout: "" }));

    // Mock file I/O helpers
    mockFileIoHelpers = {
      readJsonFileIfExists: jest.fn(() => ({})),
      safeReadJsonFile: jest.fn(() => null),
      writeJsonFileBestEffort: jest.fn(),
    };

    // Mock data helpers
    mockDataHelpers = {
      isViewPrsFixtureRow: jest.fn(() => false),
      toTrimmedString: jest.fn((str) => String(str || "").trim()),
      isRepoSlug: jest.fn(() => true),
      isObject: jest.fn((val) => val !== null && typeof val === "object" && !Array.isArray(val)),
      inferFallbackRepoForNotesOnlyEntries: jest.fn(() => "org/repo"),
      buildNotesOnlyMergedEntry: jest.fn((repo, prNum, notes, r) => ({ prNumber: prNum, notes })),
      buildGitDiffOnlyMergedEntry: jest.fn((repo, prNum, r, f) => ({ prNumber: prNum, repo: r })),
      normalizeViewPrsUserState: jest.fn((state) => ({
        ackByRepo: {},
        reverifyByRepo: {},
        inReviewByRepo: {},
        flaggedByRepo: {},
        notesByPrNumber: {},
        ...state,
      })),
      buildViewPrsDataManifest: jest.fn(() => ({})),
    };

    // Mock actor helpers
    mockActorHelpers = {
      addActorName: jest.fn(),
      normalizeDisplayName: jest.fn((str) => String(str || "").trim()),
      normalizeActorLoginAliases: jest.fn((data) => data),
      normalizeActorNameCacheEntries: jest.fn((data) => data),
    };

    // Mock state storage
    mockStateStorage = {
      migrateLegacyViewPrsUserState: jest.fn((parsed, normalized) => normalized),
    };

    // Mock PR detail helpers
    mockPrDetailHelpers = {
      mergePrDetailFields: jest.fn((data, payload) => ({ ...data, ...payload })),
    };

    // Create helpers
    dataProcessingHelpers = createDataProcessingHelpers({
      fs: mockFs,
      path: mockPath,
      spawnSync: mockSpawnSync,
      fileIoHelpers: mockFileIoHelpers,
      dataHelpers: mockDataHelpers,
      actorHelpers: mockActorHelpers,
      stateStorage: mockStateStorage,
      prDetailHelpers: mockPrDetailHelpers,
      viewPrsDir: "/test/view-prs",
      viewPrsDataFile: "/test/view-prs/.view-prs-data.json",
      viewPrsUserStateFile: "/test/view-prs/.view-prs-user-state.json",
      viewPrsPrDetailDir: "/test/view-prs/.view-prs-split-storage",
      viewPrsPrDiffDir: "/test/view-prs/.view-prs-pr-diff",
      viewPrsActorLoginAliasesFile: "/test/view-prs/.view-prs-actor-login-aliases.json",
      viewPrsActorNameCacheFile: "/test/view-prs/.view-prs-actor-name-cache.json",
      defaultViewPrsRepo: "default/repo",
    });
  });

  describe("Given isPathInside", () => {
    test("When path is inside root, Then returns true", () => {
      // Arrange
      mockPath.relative.mockReturnValue("subfolder/file.txt");

      // Act
      const result = dataProcessingHelpers.isPathInside("/root/subfolder/file.txt", "/root");

      // Assert
      expect(result).toBe(true);
    });

    test("When path is outside root, Then returns false", () => {
      // Arrange
      mockPath.relative.mockReturnValue("../outside/file.txt");

      // Act
      const result = dataProcessingHelpers.isPathInside("/outside/file.txt", "/root");

      // Assert
      expect(result).toBe(false);
    });

    test("When path equals root, Then returns true", () => {
      // Arrange
      mockPath.relative.mockReturnValue("");

      // Act
      const result = dataProcessingHelpers.isPathInside("/root", "/root");

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("Given resolveViewPrsDetailFilePath", () => {
    test("When detailRef is not an object, Then returns empty string", () => {
      // Act
      const result = dataProcessingHelpers.resolveViewPrsDetailFilePath(null);

      // Assert
      expect(result).toBe("");
    });

    test("When file path is empty, Then returns empty string", () => {
      // Act
      const result = dataProcessingHelpers.resolveViewPrsDetailFilePath({ file: "" });

      // Assert
      expect(result).toBe("");
    });

    test("When absolute path inside detail dir, Then returns path", () => {
      // Arrange
      mockPath.resolve.mockReturnValue("/test/view-prs/.view-prs-split-storage/detail.json");
      mockPath.relative.mockReturnValue("detail.json");

      // Act
      const result = dataProcessingHelpers.resolveViewPrsDetailFilePath({
        file: "/test/view-prs/.view-prs-split-storage/detail.json",
      });

      // Assert
      expect(result).toBe("/test/view-prs/.view-prs-split-storage/detail.json");
    });
  });

  describe("Given readViewPrsDetailPayload", () => {
    test("When detail file does not exist, Then returns null", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = dataProcessingHelpers.readViewPrsDetailPayload({ file: "test.json" });

      // Assert
      expect(result).toBeNull();
    });

    test("When detail file exists with valid JSON, Then returns payload", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockPath.resolve.mockReturnValue("/test/detail.json");
      mockPath.relative.mockReturnValue("detail.json");
      mockFileIoHelpers.readJsonFileIfExists.mockReturnValue({ title: "Test PR" });
      mockDataHelpers.isObject.mockReturnValue(true);

      // Act
      const result = dataProcessingHelpers.readViewPrsDetailPayload({ file: "detail.json" });

      // Assert
      expect(result).toEqual({ title: "Test PR" });
    });
  });

  describe("Given hydrateViewPrsEntryWithDetail", () => {
    test("When entry has no data, Then returns entry unchanged", () => {
      // Arrange
      const entry = { id: 123 };

      // Act
      const result = dataProcessingHelpers.hydrateViewPrsEntryWithDetail(entry);

      // Assert
      expect(result).toEqual(entry);
    });

    test("When entry has data with detail, Then merges detail payload", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockPath.resolve.mockReturnValue("/test/detail.json");
      mockPath.relative.mockReturnValue("detail.json");
      mockFileIoHelpers.readJsonFileIfExists.mockReturnValue({ description: "Full description" });
      mockDataHelpers.isObject.mockReturnValue(true);
      mockPrDetailHelpers.mergePrDetailFields.mockReturnValue({
        title: "Test",
        description: "Full description",
      });

      const entry = {
        data: {
          title: "Test",
          detailRef: { file: "detail.json" },
        },
      };

      // Act
      const result = dataProcessingHelpers.hydrateViewPrsEntryWithDetail(entry);

      // Assert
      expect(result.data.description).toBe("Full description");
    });
  });

  describe("Given collectMissingPrsFromDiffCache", () => {
    test("When diff dir does not exist, Then returns empty array", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = dataProcessingHelpers.collectMissingPrsFromDiffCache();

      // Assert
      expect(result).toEqual([]);
    });

    test("When diff cache has files, Then collects missing PRs", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(["repo__pr-123.json", "repo__pr-456.json"]);
      mockFileIoHelpers.safeReadJsonFile
        .mockReturnValueOnce({ prNumber: "123", repo: "org/repo", fetchedAt: "2024-01-01" })
        .mockReturnValueOnce({ prNumber: "456", repo: "org/repo", fetchedAt: "2024-01-02" });
      mockDataHelpers.isObject.mockReturnValue(true);

      // Act
      const result = dataProcessingHelpers.collectMissingPrsFromDiffCache({}, "fallback/repo");

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        prNumber: "123",
        repo: "org/repo",
        fetchedAt: "2024-01-01",
      });
    });

    test("When PR already exists, Then skips it", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(["repo__pr-123.json"]);
      mockFileIoHelpers.safeReadJsonFile.mockReturnValue({
        prNumber: "123",
        repo: "org/repo",
      });
      mockDataHelpers.isObject.mockReturnValue(true);

      const existingByPrNumber = { "123": { data: {} } };

      // Act
      const result = dataProcessingHelpers.collectMissingPrsFromDiffCache(
        existingByPrNumber,
        "fallback/repo",
      );

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("Given resolveActorNameFromGitHub", () => {
    test("When login is copilot-pull-request-reviewer, Then returns Copilot", () => {
      // Act
      const result = dataProcessingHelpers.resolveActorNameFromGitHub(
        "copilot-pull-request-reviewer",
      );

      // Assert
      expect(result).toBe("Copilot");
    });

    test("When login is unknown, Then returns empty string", () => {
      // Act
      const result = dataProcessingHelpers.resolveActorNameFromGitHub("unknown");

      // Assert
      expect(result).toBe("");
    });

    test("When gh API succeeds, Then returns normalized name", () => {
      // Arrange
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: "  John Doe  ",
      });

      // Act
      const result = dataProcessingHelpers.resolveActorNameFromGitHub("johndoe");

      // Assert
      expect(result).toBe("John Doe");
      expect(mockSpawnSync).toHaveBeenCalledWith(
        "gh",
        ["api", "users/johndoe", "--jq", '.name // ""'],
        expect.any(Object),
      );
    });

    test("When gh API fails, Then returns empty string", () => {
      // Arrange
      mockSpawnSync.mockReturnValue({ status: 1, stdout: "" });

      // Act
      const result = dataProcessingHelpers.resolveActorNameFromGitHub("nonexistent");

      // Assert
      expect(result).toBe("");
    });
  });

  describe("Given buildViewPrsActorsMap", () => {
    test("When byPrNumber is empty, Then returns cache entries", () => {
      // Arrange
      mockFileIoHelpers.readJsonFileIfExists.mockReturnValue({
        user1: "User One",
      });
      mockActorHelpers.normalizeActorNameCacheEntries.mockReturnValue({
        user1: "User One",
      });

      // Act
      const result = dataProcessingHelpers.buildViewPrsActorsMap({});

      // Assert
      expect(result).toEqual({ user1: "User One" });
    });

    test("When PR has actors, Then adds them to map", () => {
      // Arrange
      mockFileIoHelpers.readJsonFileIfExists.mockReturnValue({});
      mockActorHelpers.normalizeActorNameCacheEntries.mockReturnValue({});
      mockActorHelpers.addActorName.mockImplementation((map, login, name) => {
        if (name) map[login] = name;
      });

      const byPrNumber = {
        "123": {
          data: {
            authorLogin: "alice",
            author: "Alice Smith",
          },
        },
      };

      // Act
      const result = dataProcessingHelpers.buildViewPrsActorsMap(byPrNumber);

      // Assert
      expect(mockActorHelpers.addActorName).toHaveBeenCalledWith(
        expect.any(Object),
        "alice",
        "Alice Smith",
      );
    });
  });

  describe("Given getViewPrsDataMeta", () => {
    test("When data file does not exist, Then returns missing status", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = dataProcessingHelpers.getViewPrsDataMeta();

      // Assert
      expect(result.dataVersion).toBe("missing");
      expect(result.sizeBytes).toBe(0);
    });

    test("When data file exists, Then returns metadata", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        mtimeMs: 1640000000000,
        size: 1024,
      });

      // Act
      const result = dataProcessingHelpers.getViewPrsDataMeta();

      // Assert
      expect(result.dataVersion).toBe("1640000000000:1024");
      expect(result.sizeBytes).toBe(1024);
      expect(result.lastModifiedAt).toBe("2021-12-20T11:33:20.000Z");
    });
  });

  describe("Given createReadViewPrsData", () => {
    test("When data file does not exist, Then returns empty data", () => {
      // Arrange
      const mockGetViewerLogin = jest.fn(() => "testuser");
      const readViewPrsData = dataProcessingHelpers.createReadViewPrsData(mockGetViewerLogin);
      mockFs.existsSync.mockReturnValue(false);
      mockFileIoHelpers.readJsonFileIfExists.mockReturnValue({});

      // Act
      const result = readViewPrsData();

      // Assert
      expect(result.byPrNumber).toEqual({});
      expect(result.viewerLogin).toBe("testuser");
      expect(result.lastRun).toBeNull();
    });

    test("When data file exists, Then returns parsed data", () => {
      // Arrange
      const mockGetViewerLogin = jest.fn(() => "testuser");
      const readViewPrsData = dataProcessingHelpers.createReadViewPrsData(mockGetViewerLogin);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          byPrNumber: {
            "123": { data: { title: "Test PR" } },
          },
          lastRun: "2024-01-01T00:00:00Z",
        }),
      );
      mockFileIoHelpers.readJsonFileIfExists.mockReturnValue({});
      mockDataHelpers.isObject.mockReturnValue(true);
      mockDataHelpers.isViewPrsFixtureRow.mockReturnValue(false);
      mockActorHelpers.normalizeActorNameCacheEntries.mockReturnValue({});

      // Act
      const result = readViewPrsData();

      // Assert
      expect(result.byPrNumber).toBeDefined();
      expect(result.viewerLogin).toBeDefined();
      expect(result.actorsMap).toBeDefined();
      expect(result.ackByRepo).toBeDefined();
    });
  });
});
