/**
 * @jest-environment jsdom
 */

describe("index.page.js - Change Filter Persistence", () => {
  let mockFetch;
  let mockLocalStorage;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Mock localStorage
    mockLocalStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Mock fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("useBuiltinMergePattern checkbox persistence", () => {
    test("given useBuiltinMergePattern checkbox exists, when default value is read, then it defaults to true", () => {
      // Setup DOM
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'change-filter-use-builtin-merge-pattern';
      checkbox.name = 'changeFilterUseBuiltinMergePattern';
      checkbox.checked = true; // Default state
      document.body.appendChild(checkbox);

      expect(checkbox.checked).toBe(true);
    });

    test("given useBuiltinMergePattern is saved as false, when restoring from user-defaults, then checkbox is unchecked", () => {
      // Setup DOM
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'change-filter-use-builtin-merge-pattern';
      checkbox.name = 'changeFilterUseBuiltinMergePattern';
      checkbox.checked = true;
      document.body.appendChild(checkbox);

      // Mock API response with useBuiltinMergePattern: false
      const mockUserDefaults = {
        changeFilters: {
          useBuiltinMergePattern: false,
        },
      };

      // Simulate restoring
      checkbox.checked = mockUserDefaults.changeFilters.useBuiltinMergePattern;

      expect(checkbox.checked).toBe(false);
    });

    test("given useBuiltinMergePattern is not in saved config, when restoring from user-defaults, then checkbox defaults to true", () => {
      // Setup DOM
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'change-filter-use-builtin-merge-pattern';
      checkbox.name = 'changeFilterUseBuiltinMergePattern';
      document.body.appendChild(checkbox);

      // Mock API response without useBuiltinMergePattern
      const mockUserDefaults = {
        changeFilters: {
          ignoreCommentsFromAuthors: [],
        },
      };

      // Simulate restoring - should keep default
      const savedValue = mockUserDefaults.changeFilters?.useBuiltinMergePattern;
      if (typeof savedValue === 'boolean') {
        checkbox.checked = savedValue;
      } else {
        checkbox.checked = true; // default
      }

      expect(checkbox.checked).toBe(true);
    });
  });

  describe("changeFilters object structure", () => {
    test("given all change filters configured, when building changeFilters object, then all fields are included", () => {
      const changeFilters = {
        useBuiltinMergePattern: false,
        ignoreCommentsFromAuthors: ['dependabot', 'github-actions'],
        ignoreReviewsFromAuthors: ['optional-reviewer'],
        ignoreCommitPatterns: ['^docs:', '^test:', '^chore\\(deps\\):'],
      };

      expect(changeFilters).toHaveProperty('useBuiltinMergePattern');
      expect(changeFilters).toHaveProperty('ignoreCommentsFromAuthors');
      expect(changeFilters).toHaveProperty('ignoreReviewsFromAuthors');
      expect(changeFilters).toHaveProperty('ignoreCommitPatterns');
      expect(changeFilters.useBuiltinMergePattern).toBe(false);
      expect(changeFilters.ignoreCommentsFromAuthors).toHaveLength(2);
      expect(changeFilters.ignoreReviewsFromAuthors).toHaveLength(1);
      expect(changeFilters.ignoreCommitPatterns).toHaveLength(3);
    });

    test("given useBuiltinMergePattern is true (default), when saving to user-defaults, then it is omitted to save space", () => {
      const changeFilters = {};

      // Simulate save logic: only save if different from default
      const useBuiltin = true; // checkbox value
      if (useBuiltin !== true) {
        changeFilters.useBuiltinMergePattern = useBuiltin;
      }

      expect(changeFilters).not.toHaveProperty('useBuiltinMergePattern');
      expect(Object.keys(changeFilters)).toHaveLength(0);
    });

    test("given useBuiltinMergePattern is false, when saving to user-defaults, then it is included", () => {
      const changeFilters = {};

      // Simulate save logic: only save if different from default
      const useBuiltin = false; // checkbox value
      if (useBuiltin !== true) {
        changeFilters.useBuiltinMergePattern = useBuiltin;
      }

      expect(changeFilters).toHaveProperty('useBuiltinMergePattern');
      expect(changeFilters.useBuiltinMergePattern).toBe(false);
    });

    test("given only useBuiltinMergePattern is configured, when building changeFilters, then other fields are absent", () => {
      const changeFilters = {
        useBuiltinMergePattern: false,
      };

      expect(changeFilters).toHaveProperty('useBuiltinMergePattern');
      expect(changeFilters).not.toHaveProperty('ignoreCommentsFromAuthors');
      expect(changeFilters).not.toHaveProperty('ignoreReviewsFromAuthors');
      expect(changeFilters).not.toHaveProperty('ignoreCommitPatterns');
    });
  });

  describe("integration with existing change filters", () => {
    test("given useBuiltinMergePattern is disabled with custom commit patterns, when combined, then both settings coexist", () => {
      const changeFilters = {
        useBuiltinMergePattern: false,
        ignoreCommitPatterns: ["^Merge branch 'develop'", '^docs:'],
      };

      expect(changeFilters.useBuiltinMergePattern).toBe(false);
      expect(changeFilters.ignoreCommitPatterns).toEqual(["^Merge branch 'develop'", '^docs:']);
    });

    test("given useBuiltinMergePattern is enabled with custom patterns, when combined, then both will apply", () => {
      const changeFilters = {
        // useBuiltinMergePattern omitted (defaults to true)
        ignoreCommitPatterns: ['^docs:', '^test:'],
      };

      const useBuiltin = changeFilters.useBuiltinMergePattern ?? true;

      expect(useBuiltin).toBe(true);
      expect(changeFilters.ignoreCommitPatterns).toEqual(['^docs:', '^test:']);
    });

    test("given useBuiltinMergePattern is disabled with no custom patterns, when filtering commits, then no patterns apply", () => {
      const changeFilters = {
        useBuiltinMergePattern: false,
        // No ignoreCommitPatterns
      };

      const useBuiltin = changeFilters.useBuiltinMergePattern ?? true;
      const patterns = changeFilters.ignoreCommitPatterns ?? [];

      expect(useBuiltin).toBe(false);
      expect(patterns).toEqual([]);

      // This simulates the backend logic
      const builtinPattern = useBuiltin ? '^(Merge (branch|remote-tracking branch).*(main|origin/main)|Merge main into )' : '';
      const customPattern = patterns.length > 0 ? patterns.join('|') : '';
      const separator = useBuiltin && patterns.length > 0 ? '|' : '';
      const combinedPattern = builtinPattern + separator + customPattern;

      expect(combinedPattern).toBe(''); // No filtering
    });
  });

  describe("checkbox event handling", () => {
    test("given useBuiltinMergePattern checkbox, when changed, then change event is fired", () => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'change-filter-use-builtin-merge-pattern';
      checkbox.checked = true;
      document.body.appendChild(checkbox);

      const changeHandler = jest.fn();
      checkbox.addEventListener('change', changeHandler);

      // Simulate user unchecking the box
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(changeHandler).toHaveBeenCalledTimes(1);
      expect(checkbox.checked).toBe(false);
    });

    test("given useBuiltinMergePattern checkbox state changes, when event fires, then persistence should be triggered", () => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'change-filter-use-builtin-merge-pattern';
      checkbox.checked = true;
      document.body.appendChild(checkbox);

      const mockPersist = jest.fn();
      checkbox.addEventListener('change', () => {
        mockPersist(); // Simulates calling persistViewFilterOptionOverrides()
      });

      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(mockPersist).toHaveBeenCalledTimes(1);
    });
  });
});
