const { createFileIoHelpers } = require("./file-io-helpers");

describe("File I/O Helpers", () => {
  let mockFs;
  let mockPath;
  let mockIsObject;
  let fileIoHelpers;

  beforeEach(() => {
    // Create mock dependencies
    mockFs = {
      existsSync: jest.fn(),
      readFileSync: jest.fn(),
      writeFileSync: jest.fn(),
      mkdirSync: jest.fn(),
    };

    mockPath = {
      dirname: jest.fn((p) => p.substring(0, p.lastIndexOf("/"))),
    };

    mockIsObject = jest.fn((val) => val !== null && typeof val === "object" && !Array.isArray(val));

    // Create helpers instance
    fileIoHelpers = createFileIoHelpers({
      fs: mockFs,
      path: mockPath,
      isObject: mockIsObject,
    });
  });

  describe("Given readJsonFileIfExists", () => {
    test("When file exists and is valid JSON, Then returns parsed content", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{"key": "value"}');

      // Act
      const result = fileIoHelpers.readJsonFileIfExists("/test/file.json", {});

      // Assert
      expect(result).toEqual({ key: "value" });
      expect(mockFs.existsSync).toHaveBeenCalledWith("/test/file.json");
      expect(mockFs.readFileSync).toHaveBeenCalledWith("/test/file.json", "utf8");
    });

    test("When file does not exist, Then returns fallback value", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = fileIoHelpers.readJsonFileIfExists("/test/file.json", { fallback: true });

      // Assert
      expect(result).toEqual({ fallback: true });
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    test("When file exists but has invalid JSON, Then returns fallback value", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue("invalid json{");

      // Act
      const result = fileIoHelpers.readJsonFileIfExists("/test/file.json", null);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("Given readJsonFileIfExistsDetailed", () => {
    test("When file does not exist, Then returns exists:false", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = fileIoHelpers.readJsonFileIfExistsDetailed("/test/file.json");

      // Assert
      expect(result).toEqual({
        exists: false,
        value: null,
        parseError: null,
      });
    });

    test("When file exists with valid JSON, Then returns exists:true with value", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{"data": 123}');

      // Act
      const result = fileIoHelpers.readJsonFileIfExistsDetailed("/test/file.json");

      // Assert
      expect(result.exists).toBe(true);
      expect(result.value).toEqual({ data: 123 });
      expect(result.parseError).toBeNull();
    });

    test("When file exists with invalid JSON, Then returns exists:true with parseError", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue("bad json{");

      // Act
      const result = fileIoHelpers.readJsonFileIfExistsDetailed("/test/file.json");

      // Assert
      expect(result.exists).toBe(true);
      expect(result.value).toBeNull();
      expect(result.parseError).toBeInstanceOf(Error);
    });
  });

  describe("Given safeReadJsonFile", () => {
    test("When file exists, Then returns parsed content", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('[1, 2, 3]');

      // Act
      const result = fileIoHelpers.safeReadJsonFile("/test/array.json");

      // Assert
      expect(result).toEqual([1, 2, 3]);
    });

    test("When file does not exist and no fallback, Then returns null", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = fileIoHelpers.safeReadJsonFile("/test/file.json");

      // Assert
      expect(result).toBeNull();
    });

    test("When file does not exist with fallback, Then returns fallback", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = fileIoHelpers.safeReadJsonFile("/test/file.json", "default");

      // Assert
      expect(result).toBe("default");
    });
  });

  describe("Given writeJsonFileBestEffort", () => {
    test("When writing succeeds, Then creates directory and writes file", () => {
      // Arrange
      mockPath.dirname.mockReturnValue("/test");

      // Act
      fileIoHelpers.writeJsonFileBestEffort("/test/output.json", { result: "data" });

      // Assert
      expect(mockFs.mkdirSync).toHaveBeenCalledWith("/test", { recursive: true });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "/test/output.json",
        '{\n  "result": "data"\n}',
        "utf8"
      );
    });

    test("When writing fails, Then silently fails (no throw)", () => {
      // Arrange
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error("Cannot create directory");
      });

      // Act & Assert - should not throw
      expect(() => {
        fileIoHelpers.writeJsonFileBestEffort("/test/output.json", {});
      }).not.toThrow();
    });
  });

  describe("Given writeJsonFile", () => {
    test("When writing, Then creates directory and writes file", () => {
      // Arrange
      mockPath.dirname.mockReturnValue("/output");

      // Act
      fileIoHelpers.writeJsonFile("/output/data.json", { test: true });

      // Assert
      expect(mockFs.mkdirSync).toHaveBeenCalledWith("/output", { recursive: true });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "/output/data.json",
        '{\n  "test": true\n}',
        "utf8"
      );
    });

    test("When mkdir fails, Then throws error", () => {
      // Arrange
      const error = new Error("Permission denied");
      mockFs.mkdirSync.mockImplementation(() => {
        throw error;
      });

      // Act & Assert
      expect(() => {
        fileIoHelpers.writeJsonFile("/test/file.json", {});
      }).toThrow("Permission denied");
    });
  });

  describe("Given createUserFileHelpers", () => {
    let userHelpers;
    let config;

    beforeEach(() => {
      config = {
        viewPrsUserDefaultsFile: "/config/user-defaults.json",
        viewPrsAuthorCommentsFile: "/data/author-comments.json",
        viewPrsActorLoginAliasesFile: "/data/actor-aliases.json",
        viewPrsActorNameCacheFile: "/cache/actor-names.json",
        viewPrsUserStateFile: "/state/user-state.json",
      };

      userHelpers = fileIoHelpers.createUserFileHelpers(config);
    });

    test("When readUserDefaults with existing file, Then returns parsed object", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{"theme": "dark"}');
      mockIsObject.mockReturnValue(true);

      // Act
      const result = userHelpers.readUserDefaults();

      // Assert
      expect(result).toEqual({ theme: "dark" });
    });

    test("When readUserDefaults with missing file, Then returns empty object", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = userHelpers.readUserDefaults();

      // Assert
      expect(result).toEqual({});
    });

    test("When writeUserDefaults, Then writes to configured file", () => {
      // Arrange
      mockIsObject.mockReturnValue(true);
      mockPath.dirname.mockReturnValue("/config");

      // Act
      userHelpers.writeUserDefaults({ setting: "value" });

      // Assert
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "/config/user-defaults.json",
        expect.stringContaining('"setting"'),
        "utf8"
      );
    });

    test("When readViewPrsAuthorComments, Then reads from configured file", () => {
      // Arrange
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{"author1": "comment"}');

      // Act
      const result = userHelpers.readViewPrsAuthorComments();

      // Assert
      expect(result).toEqual({ author1: "comment" });
      expect(mockFs.existsSync).toHaveBeenCalledWith("/data/author-comments.json");
    });
  });
});
