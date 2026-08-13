const { createCommandExecutionHelpers } = require("./command-execution-helpers");

describe("Command Execution Helpers", () => {
  let mockSpawn;
  let mockSpawnSync;
  let mockProcess;
  let commandHelpers;
  let mockChild;

  beforeEach(() => {
    // Mock child process
    mockChild = {
      pid: 12345,
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn(),
    };

    // Mock spawn
    mockSpawn = jest.fn(() => mockChild);

    // Mock spawnSync
    mockSpawnSync = jest.fn(() => ({ status: 0 }));

    // Mock process
    mockProcess = {
      env: { TEST_ENV: "test" },
      kill: jest.fn(),
    };

    // Create helpers
    commandHelpers = createCommandExecutionHelpers({
      spawn: mockSpawn,
      spawnSync: mockSpawnSync,
      process: mockProcess,
      viewPrsDir: "/test/view-prs",
      viewPrsScriptsDir: "/test/scripts",
      requiredCommands: ["bash", "gh", "jq"],
      requiredPackages: ["marked"],
      viewPrsProgressTracker: null,
    });
  });

  describe("Given terminateProcessTree", () => {
    test("When called with valid PID, Then kills process group", () => {
      // Act
      commandHelpers.terminateProcessTree(1234, "SIGTERM");

      // Assert
      expect(mockProcess.kill).toHaveBeenCalledWith(-1234, "SIGTERM");
    });

    test("When process group kill fails, Then falls back to individual kill", () => {
      // Arrange
      mockProcess.kill.mockImplementationOnce(() => {
        throw new Error("No such process group");
      });

      // Act
      commandHelpers.terminateProcessTree(1234, "SIGTERM");

      // Assert
      expect(mockProcess.kill).toHaveBeenCalledWith(-1234, "SIGTERM");
      expect(mockProcess.kill).toHaveBeenCalledWith(1234, "SIGTERM");
    });

    test("When PID is invalid, Then does nothing", () => {
      // Act
      commandHelpers.terminateProcessTree(0, "SIGTERM");
      commandHelpers.terminateProcessTree(-5, "SIGTERM");
      commandHelpers.terminateProcessTree("invalid", "SIGTERM");

      // Assert
      expect(mockProcess.kill).not.toHaveBeenCalled();
    });
  });

  describe("Given formatScriptFailureMessage", () => {
    test("When script timed out, Then returns timeout message", () => {
      // Arrange
      const failure = {
        didTimeout: true,
        timeoutMs: 30000,
      };

      // Act
      const result = commandHelpers.formatScriptFailureMessage(failure);

      // Assert
      expect(result).toBe("Script timed out after 30s");
    });

    test("When script has error message, Then returns error message", () => {
      // Arrange
      const failure = {
        error: new Error("Command not found"),
      };

      // Act
      const result = commandHelpers.formatScriptFailureMessage(failure);

      // Assert
      expect(result).toBe("Command not found");
    });

    test("When no error details, Then returns fallback message", () => {
      // Arrange
      const failure = {};

      // Act
      const result = commandHelpers.formatScriptFailureMessage(
        failure,
        "Custom fallback",
      );

      // Assert
      expect(result).toBe("Custom fallback");
    });
  });

  describe("Given runViewPrsCommand", () => {
    test("When command succeeds, Then resolves with stdout and stderr", async () => {
      // Arrange
      let stdoutHandler;
      let stderrHandler;
      let closeHandler;

      mockChild.stdout.on.mockImplementation((event, handler) => {
        if (event === "data") stdoutHandler = handler;
      });

      mockChild.stderr.on.mockImplementation((event, handler) => {
        if (event === "data") stderrHandler = handler;
      });

      mockChild.on.mockImplementation((event, handler) => {
        if (event === "close") closeHandler = handler;
      });

      // Act
      const promise = commandHelpers.runViewPrsCommand("gh", ["--version"]);

      // Simulate command execution
      stdoutHandler(Buffer.from("gh version 2.0.0"));
      stderrHandler(Buffer.from(""));
      closeHandler(0, null);

      const result = await promise;

      // Assert
      expect(result.stdout).toBe("gh version 2.0.0");
      expect(result.stderr).toBe("");
      expect(mockSpawn).toHaveBeenCalledWith("gh", ["--version"], expect.objectContaining({
        cwd: "/test/view-prs",
        detached: true,
      }));
    });

    test("When command fails with non-zero exit, Then rejects", async () => {
      // Arrange
      let closeHandler;

      mockChild.on.mockImplementation((event, handler) => {
        if (event === "close") closeHandler = handler;
      });

      // Act
      const promise = commandHelpers.runViewPrsCommand("gh", ["invalid"]);

      // Simulate failure
      closeHandler(1, null);

      // Assert
      await expect(promise).rejects.toMatchObject({
        error: expect.objectContaining({
          message: "Command exited with code 1",
        }),
      });
    });

    test("When command times out, Then rejects with timeout error", async () => {
      // Arrange
      jest.useFakeTimers();
      let closeHandler;

      mockChild.on.mockImplementation((event, handler) => {
        if (event === "close") closeHandler = handler;
      });

      // Act
      const promise = commandHelpers.runViewPrsCommand(
        "gh",
        ["slow-command"],
        10 * 1024 * 1024,
        { timeoutMs: 1000 },
      );

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      // Simulate close after timeout
      closeHandler(null, null);

      // Assert
      await expect(promise).rejects.toMatchObject({
        didTimeout: true,
      });

      jest.useRealTimers();
    });
  });

  describe("Given runViewPrsBashCommand", () => {
    test("When bash command succeeds, Then resolves with output", async () => {
      // Arrange
      let stdoutHandler;
      let closeHandler;

      mockChild.stdout.on.mockImplementation((event, handler) => {
        if (event === "data") stdoutHandler = handler;
      });

      mockChild.on.mockImplementation((event, handler) => {
        if (event === "close") closeHandler = handler;
      });

      // Act
      const promise = commandHelpers.runViewPrsBashCommand(["-c", "echo test"]);

      // Simulate execution
      stdoutHandler(Buffer.from("test\n"));
      closeHandler(0, null);

      const result = await promise;

      // Assert
      expect(result.stdout).toBe("test\n");
      expect(result.command).toBe("bash -c echo test");
    });

    test("When progress markers detected, Then tracks progress", async () => {
      // Arrange
      const mockProgressTracker = {
        onStart: jest.fn(),
        onEnd: jest.fn(),
        onRunDone: jest.fn(),
      };

      const helpersWithTracker = createCommandExecutionHelpers({
        spawn: mockSpawn,
        spawnSync: mockSpawnSync,
        process: mockProcess,
        viewPrsDir: "/test",
        viewPrsScriptsDir: "/test/scripts",
        requiredCommands: [],
        requiredPackages: [],
        viewPrsProgressTracker: null,
      });

      let stdoutHandler;
      let closeHandler;

      mockChild.stdout.on.mockImplementation((event, handler) => {
        if (event === "data") stdoutHandler = handler;
      });

      mockChild.on.mockImplementation((event, handler) => {
        if (event === "close") closeHandler = handler;
      });

      // Act
      const promise = helpersWithTracker.runViewPrsBashCommand(
        ["-c", "test"],
        10 * 1024 * 1024,
        { progressTracker: mockProgressTracker },
      );

      // Simulate progress markers
      stdoutHandler(Buffer.from("__VIEW_PRS_PROGRESS__:START:123\n"));
      stdoutHandler(Buffer.from("__VIEW_PRS_PROGRESS__:END:123\n"));
      closeHandler(0, null);

      await promise;

      // Assert
      expect(mockProgressTracker.onStart).toHaveBeenCalledWith("123");
      expect(mockProgressTracker.onEnd).toHaveBeenCalledWith("123");
      expect(mockProgressTracker.onRunDone).toHaveBeenCalled();
    });
  });

  describe("Given runViewPrsScript", () => {
    test("When script executes, Then sets progress markers env var", async () => {
      // Arrange
      let closeHandler;

      mockChild.on.mockImplementation((event, handler) => {
        if (event === "close") closeHandler = handler;
      });

      // Act
      const promise = commandHelpers.runViewPrsScript(["test.sh"]);

      closeHandler(0, null);
      await promise;

      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        "bash",
        ["test.sh"],
        expect.objectContaining({
          env: expect.objectContaining({
            VIEW_PRS_PROGRESS_MARKERS: "1", // Defaults to "1" when trackSchedulerPrProgress is true
          }),
        }),
      );
    });
  });

  describe("Given runViewPrsShellScript", () => {
    test("When shell script called, Then executes bash command", async () => {
      // Arrange
      let closeHandler;

      mockChild.on.mockImplementation((event, handler) => {
        if (event === "close") closeHandler = handler;
      });

      // Act
      const promise = commandHelpers.runViewPrsShellScript("backup.sh", ["--force"]);

      closeHandler(0, null);
      await promise;

      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        "bash",
        ["backup.sh", "--force"],
        expect.any(Object),
      );
    });
  });

  describe("Given isCommandAvailable", () => {
    test("When command exists, Then returns true", () => {
      // Arrange
      mockSpawnSync.mockReturnValue({ status: 0 });

      // Act
      const result = commandHelpers.isCommandAvailable("gh");

      // Assert
      expect(result).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledWith(
        "bash",
        ["-lc", "command -v gh"],
        { stdio: "ignore" },
      );
    });

    test("When command does not exist, Then returns false", () => {
      // Arrange
      mockSpawnSync.mockReturnValue({ status: 1 });

      // Act
      const result = commandHelpers.isCommandAvailable("nonexistent");

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("Given getDependencyStatus", () => {
    test("When all dependencies available, Then returns ok status", () => {
      // Arrange
      mockSpawnSync.mockReturnValue({ status: 0 });

      // Act
      const result = commandHelpers.getDependencyStatus();

      // Assert
      expect(result.ok).toBe(true);
      expect(result.commands).toEqual({
        bash: true,
        gh: true,
        jq: true,
      });
      expect(result.packages.marked).toBe(true);
      expect(result.missingCommands).toEqual([]);
      expect(result.missingPackages).toEqual([]);
    });

    test("When some dependencies missing, Then returns not ok status", () => {
      // Arrange
      mockSpawnSync.mockImplementation((cmd, args) => {
        const command = args[1];
        if (command.includes("jq")) {
          return { status: 1 }; // jq not found
        }
        return { status: 0 };
      });

      // Act
      const result = commandHelpers.getDependencyStatus();

      // Assert
      expect(result.ok).toBe(false);
      expect(result.commands.jq).toBe(false);
      expect(result.missingCommands).toContain("jq");
    });
  });
});
