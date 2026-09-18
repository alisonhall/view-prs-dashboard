const { createAppConfig } = require("./app-config");
const path = require("path");

describe("App Configuration", () => {
  describe("Given createAppConfig", () => {
    test("When created with defaults, Then returns full config", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";

      // Act - pass empty env to avoid Jest's test env vars
      const config = createAppConfig({ viewPrsDir, env: {}, isTestEnv: false });

      // Assert
      expect(config.viewPrsDir).toBe("/test/view-prs");
      expect(config.viewPrsDataFile).toBe(
        "/test/view-prs/data/check-open-pr-updates.data.json",
      );
      expect(config.viewPrsUserStateFile).toBe(
        "/test/view-prs/data/check-open-pr-updates.user-state.json",
      );
      expect(config.viewPrsAutoIntervalMs).toBe(15 * 60 * 1000);
      expect(config.requiredCommands).toEqual(["bash", "gh", "jq"]);
    });

    // Deliberately no hardcoded fallback repo (removed - it was the repo
    // owner's own private repo, not something any other user of this tool
    // would want defaulted for them). Every real consumer of
    // defaultViewPrsRepo downstream (mutation routes' isRepoSlug guards,
    // the scheduler's addRepo) already treats an empty/undefined repo as
    // "nothing to do" rather than crashing - see check-open-pr-updates.sh's
    // own equivalent fix for the one place that DID need one (a `set -u`
    // "unbound variable" crash), which isn't reachable from this Node-side
    // config at all.
    test("When VIEW_PRS_REPO is not set, Then defaultViewPrsRepo is undefined rather than falling back to a hardcoded repo", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";

      // Act - pass empty env to avoid Jest's test env vars
      const config = createAppConfig({ viewPrsDir, env: {}, isTestEnv: false });

      // Assert
      expect(config.defaultViewPrsRepo).toBeUndefined();
    });

    test("When VIEW_PRS_REPO is set, Then it overrides the default repo", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";
      const env = { VIEW_PRS_REPO: "someone-else/their-repo" };

      // Act
      const config = createAppConfig({ viewPrsDir, env, isTestEnv: false });

      // Assert
      expect(config.defaultViewPrsRepo).toBe("someone-else/their-repo");
    });

    test("When env overrides provided, Then uses env values", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";
      const env = {
        VIEW_PRS_DATA_FILE: "/custom/data.json",
        VIEW_PRS_USER_STATE_FILE: "/custom/state.json",
        VIEW_PRS_ACTOR_NAME_CACHE_FILE: "/tmp/cache.json",
        VIEW_PRS_ACTOR_LOGIN_ALIASES_FILE: "/tmp/aliases.json",
        VIEW_PRS_BACKUP_RETENTION: "100",
        VIEW_PRS_AUTO_CIRCUIT_FAILURE_THRESHOLD: "5",
      };

      // Act
      const config = createAppConfig({ viewPrsDir, env, isTestEnv: true });

      // Assert
      expect(config.viewPrsDataFile).toBe("/custom/data.json");
      expect(config.viewPrsBackupRetention).toBe(100);
      expect(config.viewPrsAutoCircuitFailureThreshold).toBe(5);
    });

    test("When test env without overrides, Then throws error", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";

      // Act & Assert
      expect(() => {
        createAppConfig({ viewPrsDir, env: {}, isTestEnv: true });
      }).toThrow("NODE_ENV=test but real production state file paths are in use");
    });

    test("When test env with data overrides, Then validates actor cache", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";
      const env = {
        VIEW_PRS_DATA_FILE: "/tmp/data.json",
        VIEW_PRS_USER_STATE_FILE: "/tmp/state.json",
        // Missing actor cache overrides
      };

      // Act & Assert
      expect(() => {
        createAppConfig({ viewPrsDir, env, isTestEnv: true });
      }).toThrow("NODE_ENV=test but real actor cache file paths are in use");
    });

    test("When test env with all overrides, Then succeeds", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";
      const env = {
        VIEW_PRS_DATA_FILE: "/tmp/data.json",
        VIEW_PRS_USER_STATE_FILE: "/tmp/state.json",
        VIEW_PRS_ACTOR_NAME_CACHE_FILE: "/tmp/cache.json",
        VIEW_PRS_ACTOR_LOGIN_ALIASES_FILE: "/tmp/aliases.json",
      };

      // Act
      const config = createAppConfig({ viewPrsDir, env, isTestEnv: true });

      // Assert
      expect(config.viewPrsDataFile).toBe("/tmp/data.json");
      expect(config.viewPrsActorNameCacheFile).toBe("/tmp/cache.json");
    });

    test("When timeout env vars provided, Then parses and validates", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";
      const env = {
        VIEW_PRS_AUTO_SCRIPT_TIMEOUT_MS: "500000",
        VIEW_PRS_MANUAL_SCRIPT_TIMEOUT_MS: "800000",
        VIEW_PRS_ACK_SCRIPT_TIMEOUT_MS: "400000",
      };

      // Act
      const config = createAppConfig({ viewPrsDir, env });

      // Assert
      expect(config.viewPrsAutoScriptTimeoutMs).toBe(500000);
      expect(config.viewPrsManualScriptTimeoutMs).toBe(800000);
      expect(config.viewPrsAckScriptTimeoutMs).toBe(400000);
    });

    test("When timeout below minimum, Then clamps to minimum", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";
      const env = {
        VIEW_PRS_AUTO_SCRIPT_TIMEOUT_MS: "30000", // Below 60k min
        VIEW_PRS_BACKFILL_STATUS_TIMEOUT_MS: "5000", // Below 10k min
      };

      // Act
      const config = createAppConfig({ viewPrsDir, env });

      // Assert
      expect(config.viewPrsAutoScriptTimeoutMs).toBe(60000); // Clamped to min
      expect(config.viewPrsBackfillStatusTimeoutMs).toBe(10000); // Clamped to min
    });

    test("When concurrency env vars provided, Then validates ranges", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";
      const env = {
        VIEW_PRS_PR_DIFF_CONCURRENCY: "3",
      };

      // Act
      const config = createAppConfig({ viewPrsDir, env });

      // Assert
      expect(config.viewPrsPrDiffConcurrency).toBe(3);
    });

    test("When concurrency exceeds maximum, Then clamps to max", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";
      const env = {
        VIEW_PRS_PR_DIFF_CONCURRENCY: "10", // Max is 4
      };

      // Act
      const config = createAppConfig({ viewPrsDir, env });

      // Assert
      expect(config.viewPrsPrDiffConcurrency).toBe(4); // Clamped to max
    });

    test("When creating paths, Then uses path.join correctly", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";

      // Act
      const config = createAppConfig({ viewPrsDir });

      // Assert
      expect(config.viewPrsUiDir).toBe(path.join(viewPrsDir, "src/ui"));
      expect(config.viewPrsBackfillManagerScript).toContain("src/backfill");
      expect(config.viewPrsBackfillPidFile).toBe(
        path.join(viewPrsDir, "data/backfill-missing.pid"),
      );
    });

    test("When PR detail dir not set, Then derives from data file", () => {
      // Arrange
      const viewPrsDir = "/test/view-prs";
      const env = {
        VIEW_PRS_DATA_FILE: "/custom/location/data.json",
        VIEW_PRS_USER_STATE_FILE: "/custom/location/state.json",
        VIEW_PRS_ACTOR_NAME_CACHE_FILE: "/tmp/cache.json",
        VIEW_PRS_ACTOR_LOGIN_ALIASES_FILE: "/tmp/aliases.json",
      };

      // Act
      const config = createAppConfig({ viewPrsDir, env, isTestEnv: true });

      // Assert
      expect(config.viewPrsPrDetailDir).toBe("/custom/location/pr-details");
    });
  });
});
