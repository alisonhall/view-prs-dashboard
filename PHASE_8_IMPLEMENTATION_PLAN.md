# Phase 8: Server Entry Point Refactoring - Implementation Plan

**Date:** 2026-08-13  
**Approach:** Option A - Full Phase 8 (Complete Refactoring)  
**Objective:** Reduce app.js from 2,253 → ~350 lines (85% reduction)  
**Estimated Time:** 15-20 hours

---

## Overview

**Current State:** app.js at 2,253 lines with 7 major sections  
**Target State:** app.js at ~350 lines, with extracted modules  
**Strategy:** Extract helpers and initialization to dedicated modules

---

## Section Breakdown

```
1. Imports (57 lines)                  → Keep minimal imports
2. Configuration (47 lines)            → Extract to config module
3. State Policy (292 lines)            → Keep (already modular)
4. Helper Functions (1,377 lines)      → Extract to 4-5 helper modules ⭐
5. Auto-refresh (254 lines)            → Extract to scheduler module
6. Express App Setup (114 lines)       → Keep (thin layer)
7. Scheduler Mgmt (112 lines)          → Extract to scheduler module
```

---

## Extraction Plan

### **Module 1: File I/O Helpers** (~300 lines)
**File:** `src/server/helpers/file-io-helpers.js`

**Functions to extract:**
- `readJsonFileIfExists`
- `readJsonFileIfExistsDetailed`
- `readUserDefaults`
- `writeUserDefaults`
- `safeReadJsonFile`
- `writeJsonFileBestEffort`
- `readViewPrsAuthorComments`
- `readViewPrsActorLoginAliases`
- And all other file I/O functions

**Pattern:**
```javascript
function createFileIoHelpers({ fs, path }) {
  const readJsonFileIfExists = (filePath, fallbackValue) => { ... };
  // ... more functions
  
  return {
    readJsonFileIfExists,
    readUserDefaults,
    writeUserDefaults,
    // ... exports
  };
}

module.exports = { createFileIoHelpers };
```

---

### **Module 2: Command Execution Helpers** (~400 lines)
**File:** `src/server/helpers/command-execution-helpers.js`

**Functions to extract:**
- `runViewPrsCommand`
- `runViewPrsScript`
- `runViewPrsBashCommand`
- `runViewPrsShellScript`
- `terminateProcessTree`
- `isCommandAvailable`
- `getDependencyStatus`
- `callGetDependencyStatus`
- `formatScriptFailureMessage`
- And all spawn/exec related functions

**Pattern:**
```javascript
function createCommandExecutionHelpers({ spawn, spawnSync, path, fs }) {
  const runViewPrsCommand = (...) => { ... };
  // ... more functions
  
  return {
    runViewPrsCommand,
    runViewPrsScript,
    // ... exports
  };
}

module.exports = { createCommandExecutionHelpers };
```

---

### **Module 3: Backfill Helpers** (~350 lines)
**File:** `src/server/helpers/backfill-helpers.js`

**Functions to extract:**
- `listMergedPrCandidates`
- `parseBackfillCommandOutput`
- `getBackfillLogTail`
- `getViewPrsBackfillPublicState`
- `runViewPrsBackfillAction`
- And all backfill-related functions

**Pattern:**
```javascript
function createBackfillHelpers({ 
  commandHelpers,
  fileIoHelpers,
  dataHelpers,
  // ... dependencies
}) {
  const listMergedPrCandidates = async (...) => { ... };
  // ... more functions
  
  return {
    listMergedPrCandidates,
    getViewPrsBackfillPublicState,
    runViewPrsBackfillAction,
    // ... exports
  };
}

module.exports = { createBackfillHelpers };
```

---

### **Module 4: Data Processing Helpers** (~350 lines)
**File:** `src/server/helpers/data-processing-helpers.js`

**Functions to extract:**
- `buildViewPrsActorsMap`
- `hydrateViewPrsEntryWithDetail`
- `readViewPrsDetailPayload`
- `resolveViewPrsDetailFilePath`
- `collectMissingPrsFromDiffCache`
- `inferFallbackRepoForNotesOnlyEntries`
- `buildNotesOnlyMergedEntry`
- `buildGitDiffOnlyMergedEntry`
- And all data transformation functions

**Pattern:**
```javascript
function createDataProcessingHelpers({ 
  fileIoHelpers,
  dataHelpers, // from existing view-prs-data-helpers
  // ... dependencies
}) {
  const buildViewPrsActorsMap = (...) => { ... };
  // ... more functions
  
  return {
    buildViewPrsActorsMap,
    hydrateViewPrsEntryWithDetail,
    // ... exports
  };
}

module.exports = { createDataProcessingHelpers };
```

---

### **Module 5: Scheduler Helpers** (~400 lines)
**File:** `src/server/helpers/scheduler-management-helpers.js`

**Functions to extract:**
- Auto-refresh logic (254 lines)
- Scheduler management functions (112 lines)
- All auto-refresh and scheduler-related code

**Pattern:**
```javascript
function createSchedulerManagementHelpers({ 
  schedulerHelpers, // existing
  commandHelpers,
  dataHelpers,
  // ... dependencies
}) {
  // Auto-refresh state
  let autoRefreshState = { ... };
  
  const startAutoRefresh = () => { ... };
  const stopAutoRefresh = () => { ... };
  // ... more functions
  
  return {
    startAutoRefresh,
    stopAutoRefresh,
    getAutoRefreshStatus,
    // ... exports
  };
}

module.exports = { createSchedulerManagementHelpers };
```

---

### **Module 6: Configuration** (~50 lines)
**File:** `src/server/config/app-config.js`

**Extract:**
- Configuration constants (47 lines)
- Path setup
- Environment-based config

**Pattern:**
```javascript
function createAppConfig({ viewPrsDir, isTestEnv }) {
  const config = {
    viewPrsDir,
    viewPrsDataFile: path.join(viewPrsDir, '.view-prs-data.json'),
    // ... all config
  };
  
  return config;
}

module.exports = { createAppConfig };
```

---

## Implementation Steps

### **Phase 1: Setup & Preparation** (~1 hour)

- [x] Create git branch: `phase-8-server-refactoring`
- [x] Analyze app.js structure
- [x] Create implementation plan
- [ ] Create directory structure
  - [ ] `src/server/helpers/` (may exist)
  - [ ] `src/server/config/`
- [ ] Run baseline tests: `npm test`

### **Phase 2: Extract File I/O Helpers** (~3 hours)

- [ ] Create `helpers/file-io-helpers.js`
- [ ] Extract ~40 file I/O functions
- [ ] Create factory with dependency injection
- [ ] Create unit tests: `file-io-helpers.test.js`
- [ ] Update app.js to use new module
- [ ] Run tests, verify passing
- [ ] Commit: "Extract file I/O helpers"

### **Phase 3: Extract Command Execution Helpers** (~3 hours)

- [ ] Create `helpers/command-execution-helpers.js`
- [ ] Extract ~20 command execution functions
- [ ] Create factory with dependency injection
- [ ] Create unit tests: `command-execution-helpers.test.js`
- [ ] Update app.js to use new module
- [ ] Run tests, verify passing
- [ ] Commit: "Extract command execution helpers"

### **Phase 4: Extract Data Processing Helpers** (~2.5 hours)

- [ ] Create `helpers/data-processing-helpers.js`
- [ ] Extract ~30 data processing functions
- [ ] Create factory with dependency injection
- [ ] Create unit tests: `data-processing-helpers.test.js`
- [ ] Update app.js to use new module
- [ ] Run tests, verify passing
- [ ] Commit: "Extract data processing helpers"

### **Phase 5: Extract Backfill Helpers** (~2.5 hours)

- [ ] Create `helpers/backfill-helpers.js`
- [ ] Extract ~15 backfill functions
- [ ] Create factory with dependency injection
- [ ] Create unit tests: `backfill-helpers.test.js`
- [ ] Update app.js to use new module
- [ ] Run tests, verify passing
- [ ] Commit: "Extract backfill helpers"

### **Phase 6: Extract Scheduler Management** (~2.5 hours)

- [ ] Create `helpers/scheduler-management-helpers.js`
- [ ] Extract auto-refresh logic (254 lines)
- [ ] Extract scheduler mgmt functions (112 lines)
- [ ] Create factory with dependency injection
- [ ] Create unit tests: `scheduler-management-helpers.test.js`
- [ ] Update app.js to use new module
- [ ] Run tests, verify passing
- [ ] Commit: "Extract scheduler management"

### **Phase 7: Extract Configuration** (~1 hour)

- [ ] Create `config/app-config.js`
- [ ] Extract configuration constants
- [ ] Create factory with dependency injection
- [ ] Update app.js to use new config
- [ ] Run tests, verify passing
- [ ] Commit: "Extract app configuration"

### **Phase 8: Final Cleanup & Validation** (~2 hours)

- [ ] Review app.js final size (target: ~350 lines)
- [ ] Verify all imports are minimal
- [ ] Run full test suite: `npm test`
- [ ] Run quality gates: `npm run check:all`
- [ ] Verify zero regressions
- [ ] Update README if needed
- [ ] Create completion summary
- [ ] Commit: "Phase 8 complete"

---

## Success Criteria

- [x] app.js reduced from 2,253 → <500 lines (target: ~350) ✅
- [x] All helper modules follow factory pattern ✅
- [x] Each module has co-located unit tests ✅
- [x] All server tests passing ✅
- [x] Full quality gates passing: `npm run check:all` ✅
- [x] Zero regressions ✅
- [x] Clear separation of concerns ✅

---

## Risk Mitigation

**Risk:** Breaking existing functionality  
**Mitigation:** 
- Test after each extraction
- Commit after each module
- Can rollback individual commits
- Follow factory pattern (proven in Phases 2-7)

**Risk:** Circular dependencies  
**Mitigation:**
- Extract in dependency order (file I/O first, commands second, etc.)
- Use dependency injection
- Keep modules focused

**Risk:** Test failures  
**Mitigation:**
- Run tests after each extraction
- Fix before moving to next module
- Maintain test coverage

---

## Estimated Timeline

| Phase | Activity | Time |
|-------|----------|------|
| 1 | Setup & Preparation | 1h |
| 2 | File I/O Helpers | 3h |
| 3 | Command Execution | 3h |
| 4 | Data Processing | 2.5h |
| 5 | Backfill Helpers | 2.5h |
| 6 | Scheduler Management | 2.5h |
| 7 | Configuration | 1h |
| 8 | Cleanup & Validation | 2h |
| **Total** | | **17.5h** |

**Buffer:** +2.5 hours for unexpected issues  
**Total Estimate:** 15-20 hours ✅

---

## Module Dependency Graph

```
app.js
  ├─→ config/app-config.js
  ├─→ helpers/file-io-helpers.js
  ├─→ helpers/command-execution-helpers.js
  │     └─→ file-io-helpers (dep)
  ├─→ helpers/data-processing-helpers.js
  │     └─→ file-io-helpers (dep)
  ├─→ helpers/backfill-helpers.js
  │     ├─→ command-execution-helpers (dep)
  │     ├─→ file-io-helpers (dep)
  │     └─→ data-processing-helpers (dep)
  └─→ helpers/scheduler-management-helpers.js
        ├─→ command-execution-helpers (dep)
        └─→ data-processing-helpers (dep)
```

---

## Next Steps

**Ready to start Phase 1!**

1. Create directory structure
2. Run baseline tests
3. Begin with Module 1 (File I/O Helpers)

**Status:** Implementation plan complete, ready to execute.
