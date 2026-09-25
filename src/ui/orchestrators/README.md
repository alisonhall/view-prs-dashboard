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

### 2. ES Module Format
All orchestrators are real ES modules (see REACT_MIGRATION_PLAN.md's "ES
module cleanup" entries) - the factory body is wrapped in an IIFE purely so
its internals stay private, with only the named factory function exported:

```javascript
export const { createFeatureOrchestrator } = (function () {
  "use strict";
  // Factory implementation
  return { createFeatureOrchestrator };
})();
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
  ├── backfill-tab.orchestrator.js
  └── backfill-tab.orchestrator.test.js (co-located)
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
3. **Create skeleton** - ES module with factory pattern
4. **Extract logic** - Move coordination code from index.page.js
5. **Compose helpers** - Use existing helper modules
6. **Add tests** - Co-located unit tests
7. **Integrate** - Wire into index.page.js
8. **Validate** - Run `npm run check:all`

## Integration with index.page.js

```javascript
// In index.page.js

// 1. Import orchestrator factory (index.page.js's own <script> tag is
// type="module" - see index.html - so every dependency it needs, this
// included, is a real top-level `import`)
import * as prDataTabOrchestratorFactory from "./orchestrators/pr-data-tab.orchestrator.js";

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

- ✅ **Clear feature boundaries** - Each tab/feature in own file
- ✅ **Easier navigation** - Jump directly to feature code
- ✅ **Better testability** - Each orchestrator tested independently
- ✅ **Easier onboarding** - Understand one feature at a time
- ✅ **Parallel development** - Multiple features modified simultaneously
- ✅ **Reduced merge conflicts** - Features isolated in separate files

## Existing Orchestrators

See the files in this directory:
- `pr-data-tab.orchestrator.js` - PR Data tab coordination
- `backfill-tab.orchestrator.js` - Backfill tab coordination

`author-insights-tab.orchestrator.js`/`review-stats-tab.orchestrator.js`
were deleted (2026-09-16, see REACT_MIGRATION_PLAN.md) - both had become
fully dead code once Author Insights/Review Stats' real data path moved to
`pr-render-apply.helpers.js`'s `applyRenderResults`, with nothing left
calling either orchestrator's methods beyond a no-op `.initialize()`.

Each remaining orchestrator has co-located tests following the same pattern.
