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
      applyFiltersFromCache: jest.fn(),
      loadStoredData: jest.fn(),
      activateDataTab: jest.fn(),
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
      expect(orchestrator.handleDataRefresh).toBeDefined();
      expect(orchestrator.handleFilterChange).toBeDefined();
      expect(orchestrator.activateTab).toBeDefined();
      expect(orchestrator.loadData).toBeDefined();
      expect(orchestrator.cleanup).toBeDefined();
    });

    test("When checking API types, Then all are functions", () => {
      expect(typeof orchestrator.initialize).toBe("function");
      expect(typeof orchestrator.renderPrData).toBe("function");
      expect(typeof orchestrator.handleDataRefresh).toBe("function");
      expect(typeof orchestrator.handleFilterChange).toBe("function");
      expect(typeof orchestrator.activateTab).toBe("function");
      expect(typeof orchestrator.loadData).toBe("function");
      expect(typeof orchestrator.cleanup).toBe("function");
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

  describe("Given tab activation", () => {
    test("When activateTab called, Then activateDataTab helper called with pr-data", () => {
      // Act
      orchestrator.activateTab();

      // Assert
      expect(mockDeps.activateDataTab).toHaveBeenCalledWith("pr-data");
      expect(mockDeps.activateDataTab).toHaveBeenCalledTimes(1);
    });
  });

  describe("Given data loading", () => {
    test("When loadData called with repo, Then loadStoredData helper called", async () => {
      // Arrange
      mockDeps.loadStoredData.mockResolvedValue(undefined);

      // Act
      await orchestrator.loadData("test-repo");

      // Assert
      expect(mockDeps.loadStoredData).toHaveBeenCalledWith("test-repo");
      expect(mockDeps.loadStoredData).toHaveBeenCalledTimes(1);
    });

    test("When loadData called without repo, Then loadStoredData called with empty string", async () => {
      // Arrange
      mockDeps.loadStoredData.mockResolvedValue(undefined);

      // Act
      await orchestrator.loadData();

      // Assert
      expect(mockDeps.loadStoredData).toHaveBeenCalledWith("");
    });
  });

  describe("Given filter changes", () => {
    beforeEach(() => {
      orchestrator.initialize();
    });

    test("When handleFilterChange called, Then applyFiltersFromCache helper called", () => {
      // Act
      orchestrator.handleFilterChange();

      // Assert
      expect(mockDeps.applyFiltersFromCache).toHaveBeenCalledTimes(1);
    });

    test("When not initialized and handleFilterChange called, Then helpers not called", () => {
      // Arrange
      orchestrator.cleanup(); // Uninitialize

      // Act
      orchestrator.handleFilterChange();

      // Assert
      expect(mockDeps.applyFiltersFromCache).not.toHaveBeenCalled();
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
        insightsViewState: {},
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
  });

  describe("Given data refresh handling", () => {
    beforeEach(() => {
      orchestrator.initialize();

      // Setup DOM mocks
      mockDeps.getOptionalElementById.mockImplementation((id) => {
        if (id === "repo") return { value: "" };
        if (id === "filter-pr-numbers") return { value: "" };
        return null;
      });

      mockDeps.deriveRunPrDataContext.mockReturnValue({
        allEntries: [],
        rowsForRepo: [],
        sectionsHost: {},
        meta: {},
      });

      mockDeps.deriveRenderPipelineState.mockReturnValue({
        lastSuccessfulRenderedCheckAt: "",
        committedRenderState: {
          pendingAutoRenderPayload: null,
          lastRenderedPrFingerprint: "",
          latestPrManifest: {},
        },
      });
    });

    test("When handleDataRefresh called, Then renderPrData coordinated", () => {
      // Arrange
      const mockPayload = { entries: [] };

      // Act
      orchestrator.handleDataRefresh(mockPayload, "test-repo");

      // Assert
      expect(mockDeps.deriveRunPrDataContext).toHaveBeenCalled();
      expect(mockDeps.stateSetters.setLatestStoredPayload).toHaveBeenCalledWith(
        mockPayload
      );
    });

    test("When not initialized and handleDataRefresh called, Then no rendering", () => {
      // Arrange
      orchestrator.cleanup(); // Uninitialize
      const mockPayload = { entries: [] };

      // Act
      orchestrator.handleDataRefresh(mockPayload);

      // Assert
      expect(mockDeps.deriveRunPrDataContext).not.toHaveBeenCalled();
    });
  });

  describe("Given cleanup", () => {
    test("When cleanup called, Then orchestrator marked as uninitialized", () => {
      // Arrange
      orchestrator.initialize();

      // Act
      orchestrator.cleanup();

      // Assert - verify filter change doesn't work after cleanup
      orchestrator.handleFilterChange();
      expect(mockDeps.applyFiltersFromCache).not.toHaveBeenCalled();
    });
  });
});
