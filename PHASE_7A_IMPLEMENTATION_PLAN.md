# Phase 7A: PR Data Tab Orchestrator - Implementation Plan

**Date:** 2026-08-13  
**Status:** 📋 READY TO START  
**Estimated Effort:** 1-2 days  
**Target:** Extract ~1,500 lines from index.page.js

---

## Objective

Extract PR Data tab orchestration logic from `index.page.js` into a dedicated orchestrator module as a **proof-of-concept** for the full Phase 7 work.

---

## Current State Analysis

### File Stats
- **index.page.js:** 6,887 lines (massive monolith)
- **Estimated PR Data tab code:** ~1,500 lines (22% of file)

### Key Dependencies Found
```javascript
// Helpers already extracted:
require("./helpers/pr-run-pr-data-context.helpers.js")
require("./helpers/pr-data-polling.helpers.js")
require("./helpers/pr-data-tabs.helpers.js")
```

These helpers already exist - good sign that some extraction has been done!

---

## Recommended Approach

### **Option A: Incremental Extraction (RECOMMENDED)** ⭐

**Strategy:** Extract in small, testable steps

**Steps:**
1. Analyze current structure (2-4 hours)
2. Create orchestrator skeleton (1 hour)
3. Move tab initialization (2-3 hours)
4. Move event handlers (3-4 hours)
5. Move state management (2-3 hours)
6. Wire into index.page.js (2-3 hours)
7. Test thoroughly (2-3 hours)
8. Document pattern (1-2 hours)

**Benefits:**
- ✅ Lower risk (test after each step)
- ✅ Easier to debug issues
- ✅ Can pause/resume work
- ✅ Establishes pattern for remaining tabs

**Risks:**
- ⚠️ Time-consuming (2-3 days)
- ⚠️ Requires deep understanding of dependencies

---

### **Option B: AI-Assisted Analysis First** ⭐⭐⭐ **RECOMMENDED**

**Strategy:** Let AI analyze and plan before extracting

**Steps:**
1. **Analysis phase** (2-4 hours)
   - Map all PR Data tab functionality
   - Identify state dependencies
   - Identify event handlers
   - Identify helper usage
   - Create dependency graph

2. **Planning phase** (1-2 hours)
   - Design orchestrator API
   - Define factory function signature
   - Plan state management
   - Plan integration points

3. **Implementation phase** (1-2 days)
   - Create orchestrator module
   - Extract code systematically
   - Wire into index.page.js
   - Add tests

4. **Validation phase** (2-4 hours)
   - Run all UI tests
   - Manual testing
   - Verify no regressions

**Benefits:**
- ✅ Better planning reduces errors
- ✅ Clearer understanding before coding
- ✅ Documentation comes naturally
- ✅ Pattern can be applied to other tabs

**Risks:**
- ⚠️ Analysis takes time upfront
- ⚠️ May discover unexpected dependencies

---

## Detailed Implementation Steps (Option B)

### **Step 1: Comprehensive Analysis** 🔍

**Goal:** Understand exactly what needs to be extracted

**Tasks:**
1. Search for all tab-related code:
   ```bash
   # Find tab switching logic
   grep -n "tab.*pr.*data\|data.*tab" src/ui/index.page.js
   
   # Find PR table rendering
   grep -n "renderPr.*Table\|render.*pr.*row" src/ui/index.page.js
   
   # Find PR data state
   grep -n "prData\|latestPr\|prRows" src/ui/index.page.js
   ```

2. Map state variables:
   - Which global variables are PR Data tab specific?
   - Which are shared across tabs?
   - How is state passed to helpers?

3. Identify event handlers:
   - What user interactions trigger PR Data tab updates?
   - Which handlers are tab-specific vs global?

4. Map helper dependencies:
   - Which helpers are used by PR Data tab?
   - Are they already extracted?
   - What parameters do they need?

**Deliverable:** Analysis document with:
- List of functions to extract
- List of state variables to manage
- Dependency diagram
- Integration points

---

### **Step 2: Design Orchestrator API** 📐

**Goal:** Define clear interface for orchestrator

**Factory Function Design:**
```javascript
/**
 * Creates PR Data tab orchestrator
 * 
 * @param {Object} deps - Dependencies
 * @param {Function} deps.prRowHelpers - PR row rendering helpers
 * @param {Function} deps.prFilterHelpers - Filter application helpers
 * @param {Function} deps.prSectionHelpers - Section rendering helpers
 * @param {Function} deps.prDataPollingHelpers - Data polling helpers
 * @param {Object} deps.domHelpers - DOM manipulation utilities
 * @param {Object} deps.stateHelpers - State management utilities
 * @returns {Object} Orchestrator API
 * @returns {Function} returns.initialize - Initialize tab
 * @returns {Function} returns.handleDataRefresh - Handle new data
 * @returns {Function} returns.handleFilterChange - Apply filters
 * @returns {Function} returns.handleRowAction - Handle row interactions
 * @returns {Function} returns.render - Render tab content
 * @returns {Function} returns.cleanup - Cleanup on tab switch
 */
function createPrDataTabOrchestrator({ deps }) {
  // State (private)
  let currentPrData = [];
  let appliedFilters = {};
  
  // Public API
  return {
    initialize: () => { /* ... */ },
    handleDataRefresh: (newData) => { /* ... */ },
    handleFilterChange: (filters) => { /* ... */ },
    handleRowAction: (prNumber, action) => { /* ... */ },
    render: () => { /* ... */ },
    cleanup: () => { /* ... */ }
  };
}
```

**State Management Design:**
- Orchestrator owns tab-specific state
- Receives global state via function parameters
- Returns state updates via callbacks
- No direct DOM access (uses helpers)

**Event Handling Design:**
- Orchestrator registers event handlers
- Handlers call orchestrator methods
- Orchestrator delegates to helpers
- Helpers return render instructions

---

### **Step 3: Create Orchestrator Skeleton** 🏗️

**File:** `src/ui/orchestrators/pr-data-tab.orchestrator.js`

**Initial Structure:**
```javascript
// UMD pattern (browser + Jest compatible)
(function (global, factory) {
  if (typeof module !== "undefined" && module.exports) {
    // CommonJS (Node/Jest)
    module.exports = factory();
  } else {
    // Browser
    global.ViewPrsPrDataTabOrchestrator = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createPrDataTabOrchestrator({
    // Dependencies will be injected
    prRowHelpers,
    prFilterHelpers,
    prSectionHelpers,
    prDataPollingHelpers,
    domHelpers,
    stateHelpers,
  }) {
    // Private state
    let currentPrData = [];
    let appliedFilters = {};
    let isInitialized = false;

    // Private functions
    function renderPrTable(data) {
      // Delegate to helpers
    }

    function applyFilters(filters) {
      // Delegate to helpers
    }

    // Public API
    return {
      initialize() {
        // Setup initial state
        // Register event handlers
        isInitialized = true;
      },

      handleDataRefresh(newData) {
        currentPrData = newData;
        renderPrTable(newData);
      },

      handleFilterChange(filters) {
        appliedFilters = filters;
        applyFilters(filters);
      },

      render() {
        if (isInitialized) {
          renderPrTable(currentPrData);
        }
      },

      cleanup() {
        // Remove event handlers
        // Clear state
        isInitialized = false;
      },
    };
  }

  return { createPrDataTabOrchestrator };
});
```

**Test File:** `src/ui/orchestrators/pr-data-tab.orchestrator.test.js`

```javascript
const { createPrDataTabOrchestrator } = require("./pr-data-tab.orchestrator.js");

describe("PR Data Tab Orchestrator", () => {
  describe("Given orchestrator is created", () => {
    test("When initialize is called, Then tab is ready", () => {
      // Arrange
      const mockDeps = {
        prRowHelpers: {},
        prFilterHelpers: {},
        // ... other mocks
      };
      
      const orchestrator = createPrDataTabOrchestrator(mockDeps);
      
      // Act
      orchestrator.initialize();
      
      // Assert
      expect(orchestrator).toBeDefined();
    });
  });
});
```

---

### **Step 4: Extract Code Systematically** 📤

**Extraction Order:**

1. **Tab initialization code** (lowest risk)
   - Find: Tab setup, initial render
   - Move to: `orchestrator.initialize()`
   - Test: Tab loads correctly

2. **Rendering logic** (medium risk)
   - Find: PR table rendering code
   - Move to: `renderPrTable()` private function
   - Test: Table renders with data

3. **Event handlers** (medium-high risk)
   - Find: Click handlers, form submissions
   - Move to: orchestrator methods
   - Test: Interactions work

4. **State management** (highest risk)
   - Find: PR data state updates
   - Move to: orchestrator private state
   - Test: State changes propagate

5. **Polling/refresh** (high risk)
   - Find: Auto-refresh logic
   - Move to: `handleDataRefresh()`
   - Test: Polling still works

**For each extraction:**
```bash
# 1. Create a branch/commit point
git add -A && git commit -m "Before extracting [feature]"

# 2. Extract code
# 3. Test
npm run test:ui

# 4. If tests fail, rollback
git reset --hard HEAD

# 5. If tests pass, continue
git add -A && git commit -m "Extracted [feature]"
```

---

### **Step 5: Wire Into index.page.js** 🔌

**Integration Pattern:**

```javascript
// In index.page.js

// Import orchestrator
const prDataTabOrchestratorFactory =
  typeof module !== "undefined" && module.exports
    ? require("./orchestrators/pr-data-tab.orchestrator.js")
    : globalThis.ViewPrsPrDataTabOrchestrator;

// Create instance with dependencies
const prDataTabOrchestrator = prDataTabOrchestratorFactory.createPrDataTabOrchestrator({
  prRowHelpers: createPrRowHelpers({ /* deps */ }),
  prFilterHelpers: createPrFilterHelpers({ /* deps */ }),
  prSectionHelpers: createPrSectionHelpers({ /* deps */ }),
  prDataPollingHelpers: createPrDataPollingHelpers({ /* deps */ }),
  domHelpers: createDomHelpers(),
  stateHelpers: createStateHelpers(),
});

// Initialize on page load
function initializePage() {
  // ... other initialization
  
  prDataTabOrchestrator.initialize();
  
  // ... rest of initialization
}

// Use in tab switching
function switchToTab(tabName) {
  if (tabName === "pr-data") {
    prDataTabOrchestrator.render();
  }
}

// Use in data refresh
function handleDataRefresh(newData) {
  prDataTabOrchestrator.handleDataRefresh(newData);
}
```

**Integration Testing:**
```bash
# Test full UI suite
npm run test:ui

# Test specific integration tests
npm run test:app -- src/ui/integration-tests/index.html.test.js

# Manual testing checklist:
# - [ ] PR Data tab loads
# - [ ] Table renders with data
# - [ ] Filters work
# - [ ] Row actions work
# - [ ] Auto-refresh works
# - [ ] Tab switching works
```

---

### **Step 6: Add Comprehensive Tests** ✅

**Unit Tests** (orchestrator logic):
```javascript
describe("PR Data Tab Orchestrator", () => {
  describe("Given data refresh occurs", () => {
    test("When handleDataRefresh called, Then table re-renders", () => {
      // Test orchestrator method
    });
  });
  
  describe("Given filters applied", () => {
    test("When handleFilterChange called, Then data is filtered", () => {
      // Test filter logic
    });
  });
  
  describe("Given user clicks row", () => {
    test("When handleRowAction called, Then action executes", () => {
      // Test action handling
    });
  });
});
```

**Integration Tests** (already exist, should pass):
- index.html.test.js already has ~99 tests
- These should all pass after extraction
- If any fail, the extraction broke something

---

### **Step 7: Document Pattern** 📚

**Create:** `src/ui/orchestrators/README.md`

```markdown
# UI Orchestrators

Orchestrators coordinate tab-level features using helper modules.

## Pattern

All orchestrators follow this pattern:

1. Factory function: `createXxxOrchestrator({ deps })`
2. UMD module (browser + Jest compatible)
3. Private state (encapsulated)
4. Public API (initialize, render, cleanup, handlers)
5. No direct DOM access (use helpers)
6. Co-located unit tests

## Example

See `pr-data-tab.orchestrator.js` for reference implementation.
```

---

## Success Criteria

### ✅ **Code Quality**
- [ ] Orchestrator follows factory pattern
- [ ] UMD module format (browser + Jest)
- [ ] All dependencies injected (no globals)
- [ ] Private state properly encapsulated
- [ ] Clean public API (6-8 methods max)

### ✅ **Testing**
- [ ] Unit tests for orchestrator (80%+ coverage)
- [ ] All integration tests passing (99/99)
- [ ] Manual testing complete (checklist passed)
- [ ] No regressions in behavior

### ✅ **Metrics**
- [ ] index.page.js reduced by ~1,500 lines (22%)
- [ ] New orchestrator module ~1,500 lines
- [ ] Total code unchanged (just moved)
- [ ] All quality gates passing

### ✅ **Documentation**
- [ ] Orchestrator has JSDoc comments
- [ ] Pattern documented in README
- [ ] Integration documented in index.page.js
- [ ] Phase 7A marked complete in plan

---

## Risk Mitigation

### **Risk: Breaking existing functionality**
**Mitigation:**
- Extract in small steps
- Test after each step
- Git commit points for rollback
- Comprehensive test suite already exists

### **Risk: Dependencies not clear**
**Mitigation:**
- Analysis phase identifies dependencies first
- Dependency injection makes dependencies explicit
- Tests verify all dependencies wired correctly

### **Risk: State management issues**
**Mitigation:**
- Keep state private to orchestrator
- Pass state via function parameters
- Return state updates via callbacks
- No shared mutable state

### **Risk: Takes longer than estimated**
**Mitigation:**
- Start with analysis (understand scope)
- Can pause/resume at commit points
- Pattern established, speeds up remaining tabs

---

## Timeline

### **Day 1: Analysis & Design**
- **Morning** (4 hours):
  - Analyze index.page.js structure
  - Map PR Data tab code
  - Identify dependencies
  - Create dependency diagram

- **Afternoon** (4 hours):
  - Design orchestrator API
  - Create skeleton code
  - Write initial tests
  - Set up integration

### **Day 2: Implementation**
- **Morning** (4 hours):
  - Extract initialization code
  - Extract rendering logic
  - Test after each extraction
  - Fix any issues

- **Afternoon** (4 hours):
  - Extract event handlers
  - Extract state management
  - Wire into index.page.js
  - Integration testing

### **Day 3: Testing & Documentation** (if needed)
- **Morning** (2-3 hours):
  - Comprehensive testing
  - Fix any remaining issues
  - Manual testing checklist

- **Afternoon** (2-3 hours):
  - Add JSDoc documentation
  - Update README
  - Mark Phase 7A complete
  - Prepare for Phase 7B

**Total: 2-3 days** (16-24 hours)

---

## Next Steps After Phase 7A

### **Immediate:**
1. Document the pattern
2. Note lessons learned
3. Improve template for next tab

### **Phase 7B: Author Insights Tab**
- Apply same pattern
- Should be faster (pattern established)
- ~800 lines to extract
- Estimated: 1-2 days

### **Remaining Phases 7C-7E:**
- Each should get progressively faster
- Pattern becomes muscle memory
- Total remaining: 3-5 days

---

## Ready to Start?

**Next action:**
```bash
# Create orchestrators directory
mkdir -p src/ui/orchestrators

# Create branch for Phase 7A work
git checkout -b phase-7a-pr-data-orchestrator

# Start with analysis
# Option 1: Let AI analyze
# Option 2: Manual analysis
```

**Would you like me to:**
- A) Start the analysis phase (map PR Data tab code)
- B) Create the orchestrator skeleton files
- C) Proceed with full extraction now
- D) Review plan first, adjust approach

What would you prefer?
