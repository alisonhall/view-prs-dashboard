# UI Orchestrators

Orchestrators coordinate tab-level and feature-level UI logic by composing helper modules.

## Purpose

Orchestrators sit between `index.page.js` (the main entry point) and helper modules:

- **index.page.js** - Application initialization, global state, top-level coordination
- **Orchestrators** - Feature/tab-specific coordination and composition
- **Helpers** - Pure functions and focused utilities (already extracted, 150+ modules)
- **Components** - Complex UI features (modals, charts, insights panels)

## Pattern

All orchestrators follow this pattern:

### 1. Factory Function
```javascript
function createFeatureOrchestrator({ dependencies }) {
  // Private state
  let privateState = {};
  
  // Private functions
  function privateHelper() { ... }
  
  // Public API
  return {
    initialize: () => { ... },
    render: () => { ... },
    handleAction: (...) => { ... },
    cleanup: () => { ... }
  };
}
```

### 2. UMD Module Format
All orchestrators use UMD pattern for browser + Jest compatibility:

```javascript
(function (global, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    global.ViewPrsFeatureOrchestrator = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Factory implementation
  return { createFeatureOrchestrator };
});
```

### 3. Dependency Injection
- All dependencies passed via factory parameters
- No global variable access (except through injected getters)
- Makes testing and composition easier

### 4. Private State Encapsulation
- Tab/feature-specific state kept private in orchestrator
- Global state accessed via injected functions
- State updates returned via callbacks

### 5. Clean Public API
- 4-8 public methods typical
- Methods named for clarity: `initialize`, `render`, `handleX`, `cleanup`
- No implementation details leaked

### 6. Helper Composition
- Orchestrators compose existing helper modules
- Little to no DOM manipulation (delegate to helpers)
- Focus on coordination logic

## File Organization

```text
src/ui/orchestrators/
  ├── README.md (this file)
  ├── pr-data-tab.orchestrator.js
  ├── pr-data-tab.orchestrator.test.js (co-located)
  ├── author-insights-tab.orchestrator.js
  ├── author-insights-tab.orchestrator.test.js
  └── ... (other orchestrators)
```

## Testing Strategy

### Unit Tests (co-located)
- Test orchestrator logic in isolation
- Mock all dependencies
- Use Given/When/Then naming convention
- Co-locate tests next to source files

### Integration Tests (in integration-tests/)
- Test orchestrator integration with real helpers
- Test full tab workflows
- Existing tests in `src/ui/integration-tests/index.html.test.js`

## Example: PR Data Tab Orchestrator

See `pr-data-tab.orchestrator.js` for reference implementation.

## Creating a New Orchestrator

1. **Analyze** - Identify feature/tab code in index.page.js
2. **Design API** - Define public methods and dependencies
3. **Create skeleton** - UMD module with factory pattern
4. **Extract logic** - Move coordination code from index.page.js
5. **Compose helpers** - Use existing helper modules
6. **Add tests** - Co-located unit tests
7. **Integrate** - Wire into index.page.js
8. **Validate** - Run `npm run check:all`

## Integration with index.page.js

```javascript
// In index.page.js

// 1. Import orchestrator factory
const prDataTabOrchestratorFactory =
  typeof module !== "undefined" && module.exports
    ? require("./orchestrators/pr-data-tab.orchestrator.js")
    : globalThis.ViewPrsPrDataTabOrchestrator;

// 2. Create instance with dependencies
const prDataTab = prDataTabOrchestratorFactory.createPrDataTabOrchestrator({
  // Inject all required dependencies
  prRowHelpers: createPrRowHelpers({ ... }),
  // ... other helpers
});

// 3. Use in initialization
function initApp() {
  prDataTab.initialize();
}

// 4. Use in event handlers
function handleDataRefresh(data) {
  prDataTab.handleDataRefresh(data);
}
```

## Benefits

- ✅ **Reduced index.page.js size** - From 6,887 lines to manageable size
- ✅ **Clear feature boundaries** - Each tab/feature in own file
- ✅ **Easier navigation** - Jump directly to feature code
- ✅ **Parallel development** - Multiple features modified simultaneously
- ✅ **Better testability** - Each orchestrator tested independently
- ✅ **Easier onboarding** - Understand one feature at a time
- ✅ **Reduced merge conflicts** - Features isolated in separate files

## Migration Status

- \[x] Phase 7A: PR Data Tab - **IN PROGRESS**
- \[ ] Phase 7B: Author Insights Tab
- \[ ] Phase 7C: Backfill Tab
- \[ ] Phase 7D: Review Stats Tab
- \[ ] Phase 7E: Cross-cutting orchestrators

## Questions?

See `AI_MODERNIZATION_PLAN.md` Phase 7 for full implementation plan.
