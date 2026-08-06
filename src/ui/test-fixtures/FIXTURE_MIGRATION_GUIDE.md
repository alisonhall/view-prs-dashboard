# Fixture Migration Guide

## Overview

This guide documents the migration of `index.html.test.js` from manual test data construction to using the new fixture factories. This reduces duplication, improves maintainability, and makes tests more readable.

## Migration Strategy

### Approach

**Incremental Migration** - Migrate one test `describe` block at a time rather than the entire file at once:

1. Identify a test block with manual PR data construction
2. Replace manual construction with fixture factory calls
3. Run tests to verify behavior preserved
4. Commit the change
5. Move to next test block

### Benefits

- **Reduced risk**: Small changes are easier to review and debug
- **Continuous validation**: Tests remain passing throughout migration
- **Easy rollback**: Can revert individual blocks if needed
- **Learning opportunity**: Pattern becomes clear for remaining tests

## Before/After Examples

### Example 1: Basic PR Data Payload

**Before (Manual Construction):**

```javascript
test("author insights View in table switches to PR data tab", async () => {
  initTestPage({
    dataPayload: {
      byPrNumber: {
        42: {
          repo: "owner/repo",
          prNumber: "42",
          section: "open",
          data: {
            number: "42",
            title: "View Table Nav",
            titleDisplay: "View Table Nav [CHK:PASS][MRG:YES]",
            url: "https://example.com/42",
            labels: [],
            author: "Alison Hall",
            authorLogin: "ahall236_uhg",
            status: "CHANGED",
            approved: "NO",
            approvalCount: "0",
            // ... 15 more fields
          },
        },
      },
      actorsMap: { ahall236_uhg: "Alison Hall" },
      lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
      scheduler: {
        intervalMinutes: 15,
        manualCooldownMinutes: 15,
        isAutoRunInProgress: false,
      },
    },
  });
  // ... test code
});
```

**After (Using Fixtures):**

```javascript
const { createMultiPrPayload } = require("../test-fixtures/pr-data.fixtures.js");

test("author insights View in table switches to PR data tab", async () => {
  initTestPage({
    dataPayload: createMultiPrPayload({
      prs: [
        {
          scenario: "open-changed",
          prNumber: 42,
          overrides: {
            data: {
              title: "View Table Nav",
              titleDisplay: "View Table Nav [CHK:PASS][MRG:YES]",
              author: "Alison Hall",
              authorLogin: "ahall236_uhg",
            },
          },
        },
      ],
    }),
  });
  // ... test code
});
```

**Improvements:**
- ✅ Reduced from ~30 lines to ~15 lines
- ✅ Uses pre-configured "open-changed" scenario
- ✅ Only specifies test-specific overrides
- ✅ Automatically includes actorsMap, lastRun, scheduler

### Example 2: Multiple PRs

**Before:**

```javascript
initTestPage({
  dataPayload: {
    byPrNumber: {
      100: { /* full PR object */ },
      101: { /* full PR object */ },
      102: { /* full PR object */ },
    },
    actorsMap: { /* manual actors */ },
    lastRun: { /* manual run data */ },
  },
});
```

**After:**

```javascript
const { createMultiPrPayload } = require("../test-fixtures/pr-data.fixtures.js");

initTestPage({
  dataPayload: createMultiPrPayload({
    prs: [
      { scenario: "open-no-change", prNumber: 100 },
      { scenario: "open-approved", prNumber: 101 },
      { scenario: "merged", prNumber: 102 },
    ],
  }),
});
```

**Improvements:**
- ✅ Reduced from ~90 lines to ~10 lines
- ✅ Clear scenario names show intent
- ✅ No duplication of default values

### Example 3: Custom PR Data

**Before:**

```javascript
initTestPage({
  dataPayload: {
    byPrNumber: {
      42: {
        repo: "owner/custom-repo",
        prNumber: "42",
        section: "closed",
        data: {
          number: "42",
          title: "Custom PR",
          // ... 25 fields with custom values
        },
      },
    },
    // ...
  },
});
```

**After:**

```javascript
const { createPrEntry } = require("../test-fixtures/pr-data.fixtures.js");

initTestPage({
  dataPayload: createMultiPrPayload({
    prs: [
      createPrEntry({
        repo: "owner/custom-repo",
        prNumber: 42,
        section: "closed",
        data: {
          title: "Custom PR",
          // Only specify fields that differ from defaults
        },
      }),
    ],
  }),
});
```

## Available Fixture Factories

### From `pr-data.fixtures.js`

1. **`createMultiPrPayload(config)`**
   - Creates complete data payload with multiple PRs
   - Includes `byPrNumber`, `actorsMap`, `lastRun`, `scheduler`
   - Best for: Most integration tests

2. **`createPrScenario(scenarioName, overrides)`**
   - Pre-configured scenarios: `"open-no-change"`, `"open-changed"`, `"open-approved"`, `"merged"`, `"draft"`
   - Best for: Common test cases

3. **`createPrEntry(config)`**
   - Creates individual PR entry
   - Best for: Custom PR data needs

### From `api-response.fixtures.js`

1. **`createDataResponse(data)`** - `/view-prs/data` endpoint
2. **`createBackfillStatusResponse(config)`** - `/view-prs/backfill` endpoint
3. **`createActionLogResponse(entries)`** - `/view-prs/action-log` endpoint
4. **`createActorCacheResponse(entries)`** - `/view-prs/actor-name-cache` endpoint
5. **Many more** - See [README.md](README.md)

## Migration Checklist

For each test block being migrated:

- \[ \] Identify manual data construction patterns
- \[ \] Determine which fixture factory to use
- \[ \] Replace manual construction with fixture call
- \[ \] Run the specific test to verify it passes
- \[ \] Review the test for readability improvements
- \[ \] Run full test suite to ensure no regressions
- \[ \] Document any lessons learned

## Common Patterns

### Pattern 1: Simple Single PR Test

```javascript
const { createMultiPrPayload } = require("../test-fixtures/pr-data.fixtures.js");

initTestPage({
  dataPayload: createMultiPrPayload({
    prs: [{ scenario: "open-changed", prNumber: 42 }],
  }),
});
```

### Pattern 2: Multiple PRs with Different States

```javascript
initTestPage({
  dataPayload: createMultiPrPayload({
    prs: [
      { scenario: "open-no-change", prNumber: 100 },
      { scenario: "open-approved", prNumber: 101 },
      { scenario: "merged", prNumber: 102 },
    ],
  }),
});
```

### Pattern 3: Custom Data with Overrides

```javascript
initTestPage({
  dataPayload: createMultiPrPayload({
    prs: [
      {
        scenario: "open-changed",
        prNumber: 42,
        overrides: {
          data: {
            title: "Specific Test Title",
            labels: ["bug", "priority"],
          },
        },
      },
    ],
  }),
});
```

### Pattern 4: Custom Actors Map

```javascript
initTestPage({
  dataPayload: createMultiPrPayload({
    prs: [{ scenario: "open-changed", prNumber: 42 }],
    actorsMap: {
      "custom-login": "Custom Name",
      "another-login": "Another Name",
    },
  }),
});
```

## Testing Best Practices

### Use Scenario Names for Intent

Scenario names communicate test intent:

```javascript
// ❌ Unclear what's being tested
initTestPage({ dataPayload: createMultiPrPayload({ prs: [{ prNumber: 42 }] }) });

// ✅ Clear that we're testing changed PR behavior  
initTestPage({ dataPayload: createMultiPrPayload({ prs: [{ scenario: "open-changed" }] }) });
```

### Override Only What Matters

```javascript
// ❌ Overriding everything obscures test intent
{
  scenario: "open-changed",
  overrides: {
    data: {
      number: "42",
      title: "Test",
      author: "Test Author",
      status: "CHANGED",
      // ... 20 more fields
    },
  },
}

// ✅ Override only test-specific data
{
  scenario: "open-changed",
  prNumber: 42,
  overrides: {
    data: { title: "Test Specific Title" },
  },
}
```

### Use Descriptive PR Numbers

```javascript
// ✅ PR numbers can document test intent
const DRAFT_PR = 100;
const APPROVED_PR = 200;
const MERGED_PR = 300;

initTestPage({
  dataPayload: createMultiPrPayload({
    prs: [
      { scenario: "draft", prNumber: DRAFT_PR },
      { scenario: "open-approved", prNumber: APPROVED_PR },
      { scenario: "merged", prNumber: MERGED_PR },
    ],
  }),
});
```

## Migration Progress

### Status

- **Total tests in file**: ~150 tests
- **Tests migrated**: 0
- **Tests remaining**: ~150
- **Estimated effort**: 2-4 hours (incremental)

### Migrated Sections

- \[ \] "index page rendering with Testing Library" block
- \[ \] Author insights tests
- \[ \] Review statistics tests
- \[ \] Export functionality tests
- \[ \] Filter tests
- \[ \] Backfill tests
- \[ \] Action log tests

## Validation

After each migration batch:

1. **Run specific tests**: `npm run test:app -- src/ui/tests/index.html.test.js`
2. **Check for failures**: All tests should still pass
3. **Review readability**: Tests should be clearer with fixtures
4. **Check line count**: Should see reduction in test file size

## Next Steps

1. Start with simplest test block (e.g., single PR tests)
2. Migrate 3-5 tests as proof of concept
3. Review with team/validate approach
4. Continue incremental migration
5. Document patterns and learnings

## Resources

- [Fixture README](README.md) - Complete fixture factory documentation
- [pr-data.fixtures.js](pr-data.fixtures.js) - PR data fixture factories
- [api-response.fixtures.js](api-response.fixtures.js) - API response fixtures
- [Fixture tests](pr-data.fixtures.test.js) - Examples of fixture usage

---

**Migration Status**: 🟡 In Progress  
**Next Action**: Begin migrating first test block  
**Expected Outcome**: Reduced duplication, improved readability
