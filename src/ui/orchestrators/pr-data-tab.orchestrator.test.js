const {
  createPrDataTabOrchestrator,
} = require("./pr-data-tab.orchestrator.js");

describe("PR Data Tab Orchestrator", () => {
  let mockDeps;
  let orchestrator;

  beforeEach(() => {
    // Create mock dependencies
    mockDeps = {
      deriveRunPrDataContext: jest.fn(),
      deriveRenderPipelineState: jest.fn(),
      initDataTabs: jest.fn(),
      getOptionalElementById: jest.fn(),
      stateGetters: {
        getLatestStoredPayload: jest.fn(() => null),
        getLatestSelectedRepo: jest.fn(() => ""),
        getLastSuccessfulRenderedCheckAt: jest.fn(() => ""),
        getLatestSchedulerState: jest.fn(() => ({})),
      },
      stateSetters: {
        setLatestStoredPayload: jest.fn(),
        setLastSuccessfulRenderedCheckAt: jest.fn(),
        setLastRenderedPrFingerprint: jest.fn(),
        setLatestPrManifest: jest.fn(),
        setPendingAutoRenderPayload: jest.fn(),
      },
    };

    // Create orchestrator instance
    orchestrator = createPrDataTabOrchestrator(mockDeps);
  });

  describe("Given orchestrator is created", () => {
    test("When checking API, Then all methods are defined", () => {
      expect(orchestrator.initialize).toBeDefined();
      expect(orchestrator.renderPrData).toBeDefined();
    });

    test("When checking API types, Then all are functions", () => {
      expect(typeof orchestrator.initialize).toBe("function");
      expect(typeof orchestrator.renderPrData).toBe("function");
    });
  });

  describe("Given orchestrator initialization", () => {
    test("When initialize called, Then initDataTabs helper is called", () => {
      // Act
      orchestrator.initialize();

      // Assert
      expect(mockDeps.initDataTabs).toHaveBeenCalledTimes(1);
    });

    test("When initialize called twice, Then initDataTabs only called once", () => {
      // Act
      orchestrator.initialize();
      orchestrator.initialize();

      // Assert
      expect(mockDeps.initDataTabs).toHaveBeenCalledTimes(1);
    });
  });

  describe("Given PR data rendering", () => {
    beforeEach(() => {
      // Setup DOM element mocks
      mockDeps.getOptionalElementById.mockImplementation((id) => {
        if (id === "repo") {
          return { value: "test-repo" };
        }
        if (id === "filter-pr-numbers") {
          return { value: "" };
        }
        return null;
      });

      // Setup helper mocks
      mockDeps.deriveRunPrDataContext.mockReturnValue({
        allEntries: [],
        repoFilter: "test-repo",
        normalizedRunStamp: "2026-08-13T00:00:00Z",
        rowsForRepo: [],
        ignoreScopeForPrNumberFilter: false,
        runStamp: "2026-08-13T00:00:00Z",
        useLastRunScope: false,
        selectedScope: "all",
        attentionConfig: {},
        filterPrNumbers: [],
        filterPrNumbersRaw: "",
        allStoredRows: [],
        sectionsHost: {},
        meta: {},
        prSectionOpenState: {},
      });

      mockDeps.deriveRenderPipelineState.mockReturnValue({
        lastSuccessfulRenderedCheckAt: "2026-08-13T00:00:00Z",
        committedRenderState: {
          pendingAutoRenderPayload: null,
          lastRenderedPrFingerprint: "fingerprint-123",
          latestPrManifest: { count: 10 },
        },
      });
    });

    test("When renderPrData called with payload, Then helpers coordinated correctly", () => {
      // Arrange
      const mockPayload = { entries: [], meta: {} };

      // Act
      orchestrator.renderPrData(mockPayload, "test-repo");

      // Assert
      expect(mockDeps.deriveRunPrDataContext).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: mockPayload,
          selectedRepo: "test-repo",
        })
      );
      expect(mockDeps.deriveRenderPipelineState).toHaveBeenCalled();
      expect(mockDeps.stateSetters.setLatestStoredPayload).toHaveBeenCalledWith(
        mockPayload
      );
    });

    // Regression test: renderPrData used to return only { filteredRows },
    // so a caller invoked with an empty/no selectedRepo (e.g. index.page.js's
    // initial page-load render) had no way to learn the repo this pipeline
    // actually resolved against (deriveRunPrDataContext's repoFilter, which
    // falls back through the #repo input value / lastRun.repo when
    // selectedRepo is blank) - the caller kept using its own blank
    // selectedRepo for the React table's `selectedRepo` prop, which
    // resolved a DIFFERENT effective repo (via its own lastRun.repo
    // fallback) than the one filteredRows was actually filtered against,
    // filtering every row out silently.
    test("When renderPrData called with a blank selectedRepo, Then the returned repoFilter reflects what deriveRunPrDataContext actually resolved (not the blank input)", () => {
      const mockPayload = { entries: [], meta: {} };

      const result = orchestrator.renderPrData(mockPayload, "");

      expect(result.repoFilter).toBe("test-repo");
    });

    test("When renderPrData called, Then state setters called with correct values", () => {
      // Arrange
      const mockPayload = { entries: [], meta: {} };

      // Act
      orchestrator.renderPrData(mockPayload);

      // Assert
      expect(mockDeps.stateSetters.setLastSuccessfulRenderedCheckAt).toHaveBeenCalledWith(
        "2026-08-13T00:00:00Z"
      );
      expect(mockDeps.stateSetters.setPendingAutoRenderPayload).toHaveBeenCalledWith(null);
      expect(mockDeps.stateSetters.setLastRenderedPrFingerprint).toHaveBeenCalledWith(
        "fingerprint-123"
      );
      expect(mockDeps.stateSetters.setLatestPrManifest).toHaveBeenCalledWith(
        expect.objectContaining({ count: 10 })
      );
    });

    test("When renderPrData called without required DOM elements, Then early return", () => {
      // Arrange
      mockDeps.getOptionalElementById.mockReturnValue(null);
      const mockPayload = { entries: [] };

      // Act
      orchestrator.renderPrData(mockPayload);

      // Assert
      expect(mockDeps.deriveRunPrDataContext).not.toHaveBeenCalled();
      expect(mockDeps.deriveRenderPipelineState).not.toHaveBeenCalled();
    });

    // Phase 6 (see REACT_MIGRATION_PLAN.md): "filter-pr-numbers" is
    // migrated onto FilterStateProvider's Context.
    describe("Given getFilterStateValue is provided (Phase 6)", () => {
      test("When it returns a string for filterPrNumbers, Then that value is used instead of the DOM read", () => {
        // Arrange
        const orchestratorWithFilterState = createPrDataTabOrchestrator({
          ...mockDeps,
          getFilterStateValue: (key) => (key === "filterPrNumbers" ? "42, 43" : undefined),
        });
        orchestratorWithFilterState.initialize();
        const mockPayload = { entries: [], meta: {} };

        // Act
        orchestratorWithFilterState.renderPrData(mockPayload, "test-repo");

        // Assert
        expect(mockDeps.deriveRunPrDataContext).toHaveBeenCalledWith(
          expect.objectContaining({ filterPrNumbersRaw: "42, 43" }),
        );
      });

      test("When it returns undefined, Then the original DOM read is used", () => {
        // Arrange
        const orchestratorWithFilterState = createPrDataTabOrchestrator({
          ...mockDeps,
          getFilterStateValue: () => undefined,
        });
        orchestratorWithFilterState.initialize();
        const mockPayload = { entries: [], meta: {} };

        // Act
        orchestratorWithFilterState.renderPrData(mockPayload, "test-repo");

        // Assert (the "filter-pr-numbers" DOM mock above returns { value: "" })
        expect(mockDeps.deriveRunPrDataContext).toHaveBeenCalledWith(
          expect.objectContaining({ filterPrNumbersRaw: "" }),
        );
      });
    });

    // Sub-phase 7.2 follow-up (see REACT_MIGRATION_PLAN.md): "repo" is
    // read from PrDataProvider's Context (via a dedicated bridge) when
    // available, same handled/fallback shape as getFilterStateValue above.
    describe("Given getSelectedRepoOverride is provided", () => {
      test("When it returns a string, Then that value is used instead of the DOM read", () => {
        // Arrange
        const orchestratorWithRepoOverride = createPrDataTabOrchestrator({
          ...mockDeps,
          getSelectedRepoOverride: () => "override-repo",
        });
        orchestratorWithRepoOverride.initialize();
        const mockPayload = { entries: [], meta: {} };

        // Act
        orchestratorWithRepoOverride.renderPrData(mockPayload, "test-repo");

        // Assert (the "repo" DOM mock above returns { value: "test-repo" })
        expect(mockDeps.deriveRunPrDataContext).toHaveBeenCalledWith(
          expect.objectContaining({ inputRepo: "override-repo" }),
        );
      });

      test("When it returns undefined, Then the original DOM read is used", () => {
        // Arrange
        const orchestratorWithRepoOverride = createPrDataTabOrchestrator({
          ...mockDeps,
          getSelectedRepoOverride: () => undefined,
        });
        orchestratorWithRepoOverride.initialize();
        const mockPayload = { entries: [], meta: {} };

        // Act
        orchestratorWithRepoOverride.renderPrData(mockPayload, "test-repo");

        // Assert (the "repo" DOM mock above returns { value: "test-repo" })
        expect(mockDeps.deriveRunPrDataContext).toHaveBeenCalledWith(
          expect.objectContaining({ inputRepo: "test-repo" }),
        );
      });
    });
  });

});
