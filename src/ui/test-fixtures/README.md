# UI Test Fixtures

Shared fixture factories for view-prs UI integration tests. These fixtures reduce duplication, provide validated test data structures, and ensure consistent test patterns across the test suite.

## Available Fixtures

### PR Row Fixtures (`pr-row.fixtures.js`)

Basic PR row data structures for table rendering tests.

```javascript
const { createPrRowData, createPrRowEntry, validatePrRowEntryShape } = require('./pr-row.fixtures.js');

// Create a basic PR row
const row = createPrRowEntry();

// Create with overrides
const customRow = createPrRowEntry({
  prNumber: "42",
  repo: "owner/repo",
  data: {
    title: "Custom PR",
    status: "CHANGED",
  },
});

// Validate fixture shape
const validation = validatePrRowEntryShape(row);
if (!validation.valid) {
  console.error(validation.issues);
}
```

### API Response Fixtures (`api-response.fixtures.js`)

Mock API response structures for fetch mocking in integration tests.

```javascript
const {
  createOkJsonResponse,
  createErrorJsonResponse,
  createBackfillStatusResponse,
  createActorNameCacheResponse,
  createDiffResponse,
} = require('./api-response.fixtures.js');

// Create success response
const response = createOkJsonResponse({ ok: true, data: [] });

// Create error response
const errorResponse = createErrorJsonResponse(404, { ok: false, error: "Not found" });

// Create backfill status
const backfillStatus = createBackfillStatusResponse({ running: true });

// Create diff response
const diffResponse = createDiffResponse({
  diffText: "diff --git a/file.js b/file.js\n+added line",
});
```

### PR Data Fixtures (`pr-data.fixtures.js`)

Complete PR data payloads matching server response shapes for full integration tests.

```javascript
const {
  createPrDataPayload,
  createPrEntryByScenario,
  createMultiPrPayload,
  createSchedulerPayload,
  createReviewThread,
} = require('./pr-data.fixtures.js');

// Create empty payload
const payload = createPrDataPayload();

// Create payload with specific scenario PRs
const openChangedPr = createPrEntryByScenario("open-changed");
const mergedPr = createPrEntryByScenario("merged");

// Create multi-PR payload
const multiPrPayload = createMultiPrPayload(5, (index, pr) => ({
  ...pr,
  data: { ...pr.data, custom: `value-${index}` },
}));

// Create complete test payload
const testPayload = createPrDataPayload({
  byPrNumber: {
    "123": createPrEntryByScenario("open-approved"),
    "124": createPrEntryByScenario("open-changed"),
  },
  actorsMap: {
    reviewer1: "Reviewer One",
    author1: "Author One",
  },
  lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
  scheduler: { intervalMinutes: 15 },
});
```

## Pre-Configured Scenarios

Use `createPrEntryByScenario()` with these scenario names:

| Scenario | Description |
|----------|-------------|
| `"open-no-change"` | Open PR with NO_CHANGE status, not approved |
| `"open-changed"` | Open PR with CHANGED status |
| `"open-approved"` | Open PR with approvals (2 approvers) |
| `"open-in-review"` | Open PR marked as in-review |
| `"merged"` | Merged PR with merge timestamp |
| `"draft"` | Draft PR |

## Validation Helpers

All fixture modules include validation functions to verify fixture shapes:

```javascript
// Validate PR row entry
const { validatePrRowEntryShape } = require('./pr-row.fixtures.js');
const rowValidation = validatePrRowEntryShape(entry);

// Validate API response
const { validateApiResponseShape } = require('./api-response.fixtures.js');
const apiValidation = validateApiResponseShape(response);

// Validate PR data payload
const { validatePrDataPayloadShape } = require('./pr-data.fixtures.js');
const payloadValidation = validatePrDataPayloadShape(payload);

// All validators return: { valid: boolean, issues: string[] }
if (!validation.valid) {
  console.error('Fixture validation failed:', validation.issues);
}
```

## Usage in Tests

### Integration Test Example

```javascript
/** @jest-environment jsdom */

const { createPrDataPayload, createPrEntryByScenario } = require('../test-fixtures/pr-data.fixtures.js');
const { createOkJsonResponse } = require('../test-fixtures/api-response.fixtures.js');

describe('PR table rendering', () => {
  test('given multiple PRs, when rendering, then all PRs shown', async () => {
    // Arrange
    const dataPayload = createPrDataPayload({
      byPrNumber: {
        "101": createPrEntryByScenario("open-changed", {
          data: { title: "First PR" },
        }),
        "102": createPrEntryByScenario("open-approved", {
          data: { title: "Second PR" },
        }),
      },
      actorsMap: { author1: "Author One" },
      lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
    });

    const fetchMock = jest.fn(async (url) => {
      if (url === "/view-prs/data") {
        return createOkJsonResponse(dataPayload);
      }
      return createOkJsonResponse({ ok: true });
    });

    global.fetch = fetchMock;

    // Act
    initTestPage({ dataPayload });
    await waitFor(() => {
      expect(screen.getByText("#101")).toBeInTheDocument();
    });

    // Assert
    expect(screen.getByText("First PR")).toBeInTheDocument();
    expect(screen.getByText("Second PR")).toBeInTheDocument();
  });
});
```

### Helper Test Example

```javascript
const { createPrRowEntry } = require('../test-fixtures/pr-row.fixtures.js');
const { buildPrTitleCell } = require('../helpers/pr-title-cell.helpers.js');

describe('pr-title-cell helpers', () => {
  test('given PR with title, when building cell, then title rendered', () => {
    // Arrange
    const pr = createPrRowEntry({
      data: {
        title: "Test PR Title",
        titleDisplay: "Test PR Title [CHK:PASS]",
      },
    });

    // Act
    const cell = buildPrTitleCell(pr);

    // Assert
    expect(cell).toContain("Test PR Title");
  });
});
```

## Benefits

### 1. **Reduced Duplication**

Before:
```javascript
// Repeated in every test
const payload = {
  ok: true,
  byPrNumber: {
    "123": {
      prNumber: "123",
      repo: "owner/repo",
      section: "open",
      data: {
        number: "123",
        title: "Test",
        status: "NO_CHANGE",
        approved: "NO",
        // ... 20+ more fields
      },
    },
  },
  actorsMap: {},
  lastRun: null,
};
```

After:
```javascript
// One line with overrides only for what matters
const payload = createPrDataPayload({
  byPrNumber: {
    "123": createPrEntryByScenario("open-no-change", {
      data: { title: "Test" },
    }),
  },
});
```

### 2. **Type Safety via Validation**

Fixtures include validators that catch shape mismatches:

```javascript
const entry = createPrRowEntry({ repo: "" }); // Invalid: empty repo
const validation = validatePrRowEntryShape(entry);
// validation.valid === false
// validation.issues === ["repo is required"]
```

### 3. **Scenario-Based Testing**

Test common scenarios without repeating field setup:

```javascript
// All these are one-liners
const changedPr = createPrEntryByScenario("open-changed");
const approvedPr = createPrEntryByScenario("open-approved");
const mergedPr = createPrEntryByScenario("merged");
```

### 4. **Consistent Server Contracts**

Fixtures match actual server response shapes, reducing integration bugs:

```javascript
// Guaranteed to match server contract
const serverResponse = createPrDataPayload({ /* ... */ });
```

## Maintenance

### Adding New Fixtures

1. Add factory function to appropriate module
2. Add validation if needed
3. Add contract test in corresponding `.test.js` file
4. Update this README with example

### Updating Fixtures for Schema Changes

When server response shapes change:

1. Update factory in fixture module
2. Update validator if structure changed
3. Run fixture tests: `npm run test:app -- src/ui/test-fixtures/`
4. Update dependent integration tests if needed

## Testing the Fixtures

Run fixture contract tests:

```bash
# Run all fixture tests
npm run test:app -- src/ui/test-fixtures/

# Run specific fixture tests
npm run test:app -- src/ui/test-fixtures/pr-row.fixtures.test.js
npm run test:app -- src/ui/test-fixtures/api-response.fixtures.test.js
npm run test:app -- src/ui/test-fixtures/pr-data.fixtures.test.js
```

## Contract Tests

Each fixture module has a corresponding `.test.js` file that validates:

- ✅ Fixture factories produce valid shapes
- ✅ Default values are sensible
- ✅ Overrides work correctly
- ✅ Validators catch invalid data
- ✅ Edge cases are handled (null, empty arrays, etc.)

These contract tests ensure fixtures remain reliable as the codebase evolves.

## Related Documentation

- [AI Modernization Plan](../../AI_MODERNIZATION_PLAN.md) - Phase 5 fixture implementation
- [Data Schema](../schema/DATA_SCHEMA.md) - Server response shapes
- [Test Architecture](../../README.md#testing) - Overall testing strategy

---

**Last Updated:** 2026-08-05  
**Phase:** Phase 5 - Test Architecture and Fixtures
