# Phase 8: Complete Extraction Guide

**Purpose:** Step-by-step guide to complete Phase 8 server refactoring  
**Approach:** Extract remaining 5 modules following Module 1 pattern  
**Estimated Time:** ~13.5 hours remaining

---

## Overview

**Completed:**
- ✅ Module 1: File I/O Helpers (226 lines, 17 tests)

**Remaining:**
- ⏳ Module 2: Command Execution Helpers (~400 lines)
- ⏳ Module 3: Data Processing Helpers (~350 lines)
- ⏳ Module 4: Backfill Helpers (~350 lines)
- ⏳ Module 5: Scheduler Management (~400 lines)
- ⏳ Module 6: Configuration (~50 lines)
- ⏳ Integration: Wire all modules into app.js (~2 hours)

---

## Module 2: Command Execution Helpers

**File:** `src/server/helpers/command-execution-helpers.js`  
**Estimated:** ~400 lines, ~20 functions, 3 hours

### Functions to Extract (from app.js)

**Core Command Functions:**
- `runViewPrsCommand` (line ~462) - Execute view-prs command
- `runViewPrsBashCommand` (line ~1065) - Execute bash command
- `runViewPrsScript` (line ~1333) - Execute view-prs script
- `runViewPrsShellScript` (line ~1378) - Execute shell script
- `callRunViewPrsScript` (line ~1372) - Wrapper for script execution

**Process Management:**
- `terminateProcessTree` (line ~1048) - Kill process tree
- `formatScriptFailureMessage` (line ~1034) - Format failure messages

**Dependency Checks:**
- `isCommandAvailable` (line ~1557) - Check if command exists
- `getDependencyStatus` (line ~1564) - Get all dependency statuses
- `callGetDependencyStatus` (line ~1375) - Wrapper for dependency check

### Module Template

```javascript
/**
 * Command Execution Helpers
 */
function createCommandExecutionHelpers({ 
  spawn, 
  spawnSync, 
  path, 
  fs,
  viewPrsScriptsDir,
  requiredCommands,
}) {
  
  const terminateProcessTree = (pid, signal) => {
    // Extract from app.js line ~1048
  };
  
  const formatScriptFailureMessage = (failure, fallbackMessage) => {
    // Extract from app.js line ~1034
  };
  
  const runViewPrsCommand = (command, args, opts) => {
    // Extract from app.js line ~462
    // Returns Promise with { exitCode, stdout, stderr }
  };
  
  const runViewPrsBashCommand = (bashArgs, maxBufferBytes, ...opts) => {
    // Extract from app.js line ~1065
  };
  
  const runViewPrsScript = (scriptArgs, maxBufferBytes, ...opts) => {
    // Extract from app.js line ~1333
  };
  
  const runViewPrsShellScript = (scriptName, scriptArgs, ...opts) => {
    // Extract from app.js line ~1378
  };
  
  const isCommandAvailable = (cmd) => {
    // Extract from app.js line ~1557
  };
  
  const getDependencyStatus = () => {
    // Extract from app.js line ~1564
    // Returns object with command availability
  };
  
  return {
    runViewPrsCommand,
    runViewPrsBashCommand,
    runViewPrsScript,
    runViewPrsShellScript,
    terminateProcessTree,
    formatScriptFailureMessage,
    isCommandAvailable,
    getDependencyStatus,
  };
}

module.exports = { createCommandExecutionHelpers };
```

### Test Template

Create `command-execution-helpers.test.js` with tests for:
- ✅ terminateProcessTree
- ✅ formatScriptFailureMessage
- ✅ runViewPrsCommand
- ✅ runViewPrsBashCommand
- ✅ isCommandAvailable
- ✅ getDependencyStatus

**Estimated:** 20-25 tests

---

## Module 3: Data Processing Helpers

**File:** `src/server/helpers/data-processing-helpers.js`  
**Estimated:** ~350 lines, ~30 functions, 2.5 hours

### Functions to Extract

**Actor/User Data:**
- `resolveActorNameFromGitHub` (line ~822) - Resolve GitHub actor name
- `buildViewPrsActorsMap` (line ~833) - Build actors map

**Entry Hydration:**
- `resolveViewPrsDetailFilePath` (line ~728) - Resolve detail file path
- `readViewPrsDetailPayload` (line ~738) - Read detail payload
- `hydrateViewPrsEntryWithDetail` (line ~747) - Hydrate entry with detail
- `isPathInside` (line ~713) - Check if path is inside directory

**Data Transformation:**
- `inferFallbackRepoForNotesOnlyEntries` (line ~627) - Infer repo from notes
- `buildNotesOnlyMergedEntry` (line ~648) - Build notes-only entry
- `buildGitDiffOnlyMergedEntry` (line ~657) - Build diff-only entry
- `collectMissingPrsFromDiffCache` (line ~667) - Collect missing PRs

**State Reading:**
- `readViewPrsData` (line ~870) - Read main data file
- `callReadViewPrsData` (line ~868) - Wrapper for reading data

### Module Template

```javascript
function createDataProcessingHelpers({ 
  fileIoHelpers,
  dataHelpers, // from view-prs-data-helpers
  viewPrsDir,
  splitStorageDir,
}) {
  
  const isPathInside = (candidatePath, rootPath) => {
    // Extract from app.js
  };
  
  const resolveViewPrsDetailFilePath = (detailRef) => {
    // Extract from app.js
  };
  
  const readViewPrsDetailPayload = (detailRef) => {
    // Extract from app.js
  };
  
  const hydrateViewPrsEntryWithDetail = (entry) => {
    // Extract from app.js
  };
  
  const buildViewPrsActorsMap = (byPrNumberRaw) => {
    // Extract from app.js
  };
  
  // ... more functions
  
  return {
    isPathInside,
    resolveViewPrsDetailFilePath,
    readViewPrsDetailPayload,
    hydrateViewPrsEntryWithDetail,
    buildViewPrsActorsMap,
    // ... exports
  };
}

module.exports = { createDataProcessingHelpers };
```

---

## Module 4: Backfill Helpers

**File:** `src/server/helpers/backfill-helpers.js`  
**Estimated:** ~350 lines, ~15 functions, 2.5 hours

### Functions to Extract

**Backfill Operations:**
- `listMergedPrCandidates` (line ~1409) - List PR candidates for backfill
- `parseBackfillCommandOutput` (line ~1437) - Parse backfill output
- `getBackfillLogTail` (line ~1460) - Get log tail
- `getViewPrsBackfillPublicState` (line ~1477) - Get backfill state
- `runViewPrsBackfillAction` (line ~1542) - Run backfill action

### Module Template

```javascript
function createBackfillHelpers({
  commandHelpers,
  fileIoHelpers,
  viewPrsBackfillLogFile,
  viewPrsBackfillPidFile,
  viewPrsDir,
}) {
  
  const listMergedPrCandidates = async ({ repo, limit }) => {
    // Extract from app.js
  };
  
  const parseBackfillCommandOutput = (stdout, stderr) => {
    // Extract from app.js
  };
  
  const getBackfillLogTail = ({ maxLines = 80 } = {}) => {
    // Extract from app.js
  };
  
  const getViewPrsBackfillPublicState = async () => {
    // Extract from app.js
  };
  
  const runViewPrsBackfillAction = async (action) => {
    // Extract from app.js
  };
  
  return {
    listMergedPrCandidates,
    parseBackfillCommandOutput,
    getBackfillLogTail,
    getViewPrsBackfillPublicState,
    runViewPrsBackfillAction,
  };
}

module.exports = { createBackfillHelpers };
```

---

## Module 5: Scheduler Management Helpers

**File:** `src/server/helpers/scheduler-management-helpers.js`  
**Estimated:** ~400 lines (254 auto-refresh + 112 scheduler mgmt), 2.5 hours

### Sections to Extract

**Auto-Refresh Logic (lines 1774-2027):**
- Auto-refresh state management
- `startViewPrsAutoRefresh` - Start auto-refresh
- `stopViewPrsAutoRefresh` - Stop auto-refresh
- `resetViewPrsAutoRefreshFailureState` - Reset failure state
- Auto-refresh timer logic

**Scheduler Management (lines 2142-2253):**
- `persistViewPrsSchedulerState` - Persist scheduler state
- `setLastManualRunNow` - Set last run timestamp
- `resetViewPrsScheduler` - Reset scheduler
- Scheduler state exports

### Module Template

```javascript
function createSchedulerManagementHelpers({
  commandHelpers,
  dataProcessingHelpers,
  schedulerHelpers, // existing view-prs-scheduler-helpers
  viewPrsSchedulerStateFile,
}) {
  
  // Auto-refresh state (private)
  let autoRefreshState = {
    isRunning: false,
    intervalHandle: null,
    consecutiveFailures: 0,
    // ... more state
  };
  
  const startViewPrsAutoRefresh = () => {
    // Extract auto-refresh logic from app.js
  };
  
  const stopViewPrsAutoRefresh = () => {
    // Extract stop logic
  };
  
  const resetViewPrsAutoRefreshFailureState = () => {
    // Extract reset logic
  };
  
  const persistViewPrsSchedulerState = () => {
    // Extract persist logic
  };
  
  const setLastManualRunNow = () => {
    // Extract manual run logic
  };
  
  const resetViewPrsScheduler = () => {
    // Extract reset logic
  };
  
  return {
    startViewPrsAutoRefresh,
    stopViewPrsAutoRefresh,
    resetViewPrsAutoRefreshFailureState,
    persistViewPrsSchedulerState,
    setLastManualRunNow,
    resetViewPrsScheduler,
    getSchedulerState: () => ({ ...autoRefreshState }),
  };
}

module.exports = { createSchedulerManagementHelpers };
```

---

## Module 6: Configuration

**File:** `src/server/config/app-config.js`  
**Estimated:** ~50 lines, 1 hour

### Extract Configuration (lines 58-104)

**Configuration Constants:**
- `viewPrsDir` - View PRS directory
- `viewPrsDataFile` - Data file path
- `viewPrsSplitStorageDir` - Split storage directory
- `viewPrsSchedulerStateFile` - Scheduler state file
- `viewPrsUserDefaultsFile` - User defaults file
- `viewPrsAuthorCommentsFile` - Author comments file
- `viewPrsActorLoginAliasesFile` - Actor aliases file
- `viewPrsActorNameCacheFile` - Actor name cache file
- `viewPrsUserStateFile` - User state file
- `viewPrsBackfillLogFile` - Backfill log file
- `viewPrsBackfillPidFile` - Backfill PID file
- `viewPrsScriptsDir` - Scripts directory
- All other configuration constants

### Module Template

```javascript
const path = require("path");

function createAppConfig({ viewPrsDir, isTestEnv = false }) {
  // Enforce policy for tests
  if (isTestEnv) {
    if (!viewPrsDir || !viewPrsDir.includes("tmp")) {
      throw new Error("Tests must use temp directory");
    }
  }
  
  const config = {
    viewPrsDir,
    viewPrsDataFile: path.join(viewPrsDir, ".view-prs-data.json"),
    viewPrsSplitStorageDir: path.join(viewPrsDir, ".view-prs-split-storage"),
    viewPrsSchedulerStateFile: path.join(viewPrsDir, ".view-prs-scheduler-state.json"),
    viewPrsUserDefaultsFile: path.join(viewPrsDir, ".view-prs-user-defaults.json"),
    viewPrsAuthorCommentsFile: path.join(viewPrsDir, ".view-prs-author-comments.json"),
    viewPrsActorLoginAliasesFile: path.join(viewPrsDir, ".view-prs-actor-login-aliases.json"),
    viewPrsActorNameCacheFile: path.join(viewPrsDir, ".view-prs-actor-name-cache.json"),
    viewPrsUserStateFile: path.join(viewPrsDir, ".view-prs-user-state.json"),
    viewPrsBackfillLogFile: path.join(viewPrsDir, ".view-prs-backfill.log"),
    viewPrsBackfillPidFile: path.join(viewPrsDir, ".view-prs-backfill.pid"),
    viewPrsScriptsDir: path.join(__dirname, "../scripts"),
    // ... all other config
  };
  
  return config;
}

module.exports = { createAppConfig };
```

---

## Integration Guide

**File:** `src/server/app.js`  
**Estimated:** 2 hours

### Steps

**1. Create all module instances at top of app.js:**

```javascript
const { createAppConfig } = require("./config/app-config");
const { createFileIoHelpers } = require("./helpers/file-io-helpers");
const { createCommandExecutionHelpers } = require("./helpers/command-execution-helpers");
const { createDataProcessingHelpers } = require("./helpers/data-processing-helpers");
const { createBackfillHelpers } = require("./helpers/backfill-helpers");
const { createSchedulerManagementHelpers } = require("./helpers/scheduler-management-helpers");

// Create config
const appConfig = createAppConfig({
  viewPrsDir: process.env.VIEW_PRS_DIR || path.join(__dirname, "../.."),
  isTestEnv: process.env.NODE_ENV === "test",
});

// Create helpers with dependency injection
const fileIoHelpers = createFileIoHelpers({ fs, path, isObject });

const commandHelpers = createCommandExecutionHelpers({
  spawn,
  spawnSync,
  path,
  fs,
  viewPrsScriptsDir: appConfig.viewPrsScriptsDir,
  requiredCommands: ["gh", "git", "jq"],
});

const dataHelpers = createDataProcessingHelpers({
  fileIoHelpers,
  dataHelpers: { /* existing helpers */ },
  viewPrsDir: appConfig.viewPrsDir,
  splitStorageDir: appConfig.viewPrsSplitStorageDir,
});

const backfillHelpers = createBackfillHelpers({
  commandHelpers,
  fileIoHelpers,
  viewPrsBackfillLogFile: appConfig.viewPrsBackfillLogFile,
  viewPrsBackfillPidFile: appConfig.viewPrsBackfillPidFile,
  viewPrsDir: appConfig.viewPrsDir,
});

const schedulerHelpers = createSchedulerManagementHelpers({
  commandHelpers,
  dataProcessingHelpers: dataHelpers,
  schedulerHelpers: viewPrsSchedulerHelpers,
  viewPrsSchedulerStateFile: appConfig.viewPrsSchedulerStateFile,
});

const userFileHelpers = fileIoHelpers.createUserFileHelpers({
  viewPrsUserDefaultsFile: appConfig.viewPrsUserDefaultsFile,
  viewPrsAuthorCommentsFile: appConfig.viewPrsAuthorCommentsFile,
  viewPrsActorLoginAliasesFile: appConfig.viewPrsActorLoginAliasesFile,
  viewPrsActorNameCacheFile: appConfig.viewPrsActorNameCacheFile,
  viewPrsUserStateFile: appConfig.viewPrsUserStateFile,
});
```

**2. Replace all function uses:**

Replace:
```javascript
readJsonFileIfExists(path, fallback)
```
With:
```javascript
fileIoHelpers.readJsonFileIfExists(path, fallback)
```

Replace:
```javascript
runViewPrsScript(args)
```
With:
```javascript
commandHelpers.runViewPrsScript(args)
```

**3. Remove extracted code:**

Delete lines 398-1773 (helper functions section) after verifying all uses are replaced.

**4. Update exports:**

```javascript
module.exports = {
  app,
  // Export helper modules for testing
  helpers: {
    fileIo: fileIoHelpers,
    commands: commandHelpers,
    dataProcessing: dataHelpers,
    backfill: backfillHelpers,
    scheduler: schedulerHelpers,
  },
};
```

**5. Verify:**

- Run all tests: `npm test`
- Check app.js size: `wc -l src/server/app.js`
- Target: ~350 lines (85% reduction)

---

## Testing Strategy

For each module:

1. **Create module** with factory pattern
2. **Write tests** (15-25 tests per module)
3. **Run tests** to verify passing
4. **Commit** module independently
5. **Repeat** for next module

After all modules:

6. **Integrate** all into app.js
7. **Run full test suite**
8. **Verify** app.js size reduction
9. **Quality gates**: `npm run check:all`
10. **Final commit**

---

## Success Criteria

- ✅ All 6 modules created with factory pattern
- ✅ Each module has 15-25 tests, all passing
- ✅ app.js reduced from 2,253 → <500 lines (target ~350)
- ✅ All 1,200+ baseline tests still passing
- ✅ Zero regressions
- ✅ Quality gates passing

---

**Total Estimated Time:** ~13.5 hours

**Breakdown:**
- Module 2: 3h
- Module 3: 2.5h
- Module 4: 2.5h
- Module 5: 2.5h
- Module 6: 1h
- Integration: 2h

**Ready to execute when you have time!**
