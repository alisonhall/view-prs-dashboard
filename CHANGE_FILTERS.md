# Change Detection Filters

## Overview

Change Detection Filters allow you to configure what activity should **NOT** trigger a `CHANGED` status on pull requests. This helps reduce noise from automated bots, optional reviewers, and non-critical commits.

## Feature Location

**UI:** Advanced visibility and attention rules → Change Detection Filters  
**Storage:** `view-prs/data/user-defaults.json` under `changeFilters` object  
**Backend:** `src/script/check-open-pr-updates.sh` (applies filters during status detection)

## Filter Types

### 1. Ignore Comments from Authors

**Purpose:** Filter out general discussion comments from specified GitHub logins.

**Use cases:**
- Ignore bot notifications (dependabot, github-actions, codecov)
- Ignore automated comments that don't require action
- Ignore comments from specific team members for certain workflows

**Example:**
```json
"ignoreCommentsFromAuthors": ["dependabot[bot]", "github-actions[bot]", "codecov[bot]"]
```

### 2. Ignore Reviews from Authors

**Purpose:** Filter out formal code review submissions from specified GitHub logins.

**Use cases:**
- Ignore reviews from optional reviewers whose approval isn't required
- Ignore automated approval bots
- Ignore reviews from specific team members who are FYI-only

**Example:**
```json
"ignoreReviewsFromAuthors": ["optional-reviewer", "junior-dev"]
```

### 3. Ignore Commits Matching Patterns

**Purpose:** Filter out commits whose message headline matches specified regex patterns.

**Use cases:**
- Ignore documentation-only commits (`^docs:`)
- Ignore test-only commits (`^test:`)
- Ignore dependency updates (`^chore\\(deps\\):`)
- Ignore WIP commits (`(?i)^wip:`)
- Ignore formatting changes (`^style:`)

**Example:**
```json
"ignoreCommitPatterns": [
  "^docs:",
  "^test:",
  "^style: formatting",
  "^chore: update dependencies",
  "(?i)^wip:"
]
```

**Pattern syntax:**
- Uses PCRE-compatible regex (via jq's `test()` function)
- Tested against commit message headline (first line only)
- Multiple patterns combined with OR logic
- Case-insensitive patterns: prefix with `(?i)`
- Special characters must be escaped with double backslashes: `\\(`

### 4. Built-in Merge Commit Filter (Configurable)

**Purpose:** Optionally filter out merge commits from main/origin/main.

**Default pattern:**
```regex
^(Merge (branch|remote-tracking branch).*(main|origin/main)|Merge main into )
```

**Configuration:**
- **Enabled by default** (checkbox checked)
- Can be disabled via "Use built-in merge commit filter" checkbox
- Saves to `changeFilters.useBuiltinMergePattern` (boolean)

**Use cases for disabling:**
- Repos with different merge workflows (develop → main, staging → main)
- Custom branch naming conventions
- Want to see ALL merge commits as changes
- Want to define your own merge patterns

**Example (disabled):**
```json
"changeFilters": {
  "useBuiltinMergePattern": false,
  "ignoreCommitPatterns": [
    "^Merge branch '(develop|staging)'",
    "^Merge pull request #"
  ]
}
```

## Built-in Filters (Always Active)

### Approved Reviews
- **Always ignored** (cannot be disabled)
- Rationale: Approved reviews don't require action from PR author
- Applied before custom filters

## Filter Behavior

### Application Order
1. Built-in approved review filter (always)
2. Built-in merge commit filter (if enabled)
3. Custom commit patterns (if defined)
4. Ignore comments from authors (if defined)
5. Ignore reviews from authors (if defined)

### Combination Logic
- **Commit patterns:** OR logic (any pattern match = filtered)
- **Comment authors:** Exact login match (case-sensitive)
- **Review authors:** Exact login match (case-sensitive)
- **Built-in + custom:** Combined with OR (if built-in enabled)

### Empty Pattern Handling
- If `useBuiltinMergePattern: false` AND no custom patterns → **no commit filtering**
- If `useBuiltinMergePattern: true` AND no custom patterns → **only built-in merge filter**
- If `useBuiltinMergePattern: false` AND custom patterns → **only custom patterns**
- If `useBuiltinMergePattern: true` AND custom patterns → **built-in + custom patterns**

## Configuration Examples

### Example 1: Default (Recommended)

```json
{
  "repo": "owner/repo",
  "changeFilters": {
    "ignoreCommentsFromAuthors": ["dependabot[bot]", "github-actions[bot]"],
    "ignoreReviewsFromAuthors": ["optional-reviewer"],
    "ignoreCommitPatterns": [
      "^docs:",
      "^test:",
      "^style:",
      "^chore: update dependencies"
    ]
  }
}
```

Note: `useBuiltinMergePattern` omitted = defaults to `true`

### Example 2: Disable Built-in Merge Filter

```json
{
  "repo": "owner/repo",
  "changeFilters": {
    "useBuiltinMergePattern": false,
    "ignoreCommitPatterns": [
      "^Merge branch '(develop|staging|main)'",
      "^Merge pull request #",
      "^Merge remote-tracking branch",
      "^docs:",
      "^test:"
    ]
  }
}
```

Use case: Repo uses develop → main workflow, want custom merge patterns.

### Example 3: No Commit Filtering

```json
{
  "repo": "owner/repo",
  "changeFilters": {
    "useBuiltinMergePattern": false,
    "ignoreCommentsFromAuthors": ["bot-user"],
    "ignoreReviewsFromAuthors": ["optional-reviewer"]
  }
}
```

Use case: Want to see ALL commits as changes, but still filter comments/reviews.

### Example 4: Conventional Commits Workflow

```json
{
  "repo": "owner/repo",
  "changeFilters": {
    "ignoreCommitPatterns": [
      "^docs(\\(.+\\))?:",
      "^test(\\(.+\\))?:",
      "^style(\\(.+\\))?:",
      "^chore(\\(.+\\))?:",
      "^ci(\\(.+\\))?:",
      "^build(\\(.+\\))?:"
    ]
  }
}
```

Use case: Team follows conventional commits, ignore non-code changes.

### Example 5: Monorepo with Scoped Commits

```json
{
  "repo": "owner/monorepo",
  "changeFilters": {
    "ignoreCommitPatterns": [
      "^chore\\(deps\\):",
      "^chore\\(release\\):",
      "^docs\\(readme\\):",
      "^test\\(unit\\):",
      "^test\\(e2e\\):"
    ]
  }
}
```

Use case: Monorepo with scope-based commits, filter specific scopes.

## UI Behavior

### Change Filter Inputs

1. **Ignore comments from authors** (multi-select dropdown)
   - Auto-populated from actor cache
   - Selection persisted to `user-defaults.json`
   - Changes trigger auto-save

2. **Ignore reviews from authors** (multi-select dropdown)
   - Auto-populated from actor cache
   - Selection persisted to `user-defaults.json`
   - Changes trigger auto-save

3. **Ignore commits matching patterns** (textarea)
   - One pattern per line
   - Changes trigger auto-save (on blur)
   - Placeholder shows example patterns

4. **Use built-in merge commit filter** (checkbox)
   - Checked by default
   - Shows exact pattern in help text
   - Changes trigger auto-save
   - Uncheck to define custom merge patterns

### Persistence

- **Auto-save:** All changes auto-save to `user-defaults.json`
- **Restore:** Saved values restored on page load
- **Validation:** Patterns validated on backend (jq regex syntax)
- **Errors:** Invalid patterns logged to debug output

### Visual Feedback

- Filter changes trigger immediate re-render
- "CHANGED" status recalculated with new filters
- No visual indicator when filters active (intentional - reduces noise)

## Backend Implementation

### Script: `check-open-pr-updates.sh`

#### Loading Filters

```bash
load_change_filter_config() {
  USER_DEFAULTS_FILE="$DATA_DIR/user-defaults.json"
  
  [[ -f "$USER_DEFAULTS_FILE" ]] || return 0
  
  CHANGE_FILTER_IGNORE_COMMENT_AUTHORS=$(jq -r '.changeFilters.ignoreCommentsFromAuthors // [] | join(",")' "$USER_DEFAULTS_FILE" 2>/dev/null || echo '')
  CHANGE_FILTER_IGNORE_REVIEW_AUTHORS=$(jq -r '.changeFilters.ignoreReviewsFromAuthors // [] | join(",")' "$USER_DEFAULTS_FILE" 2>/dev/null || echo '')
  CHANGE_FILTER_IGNORE_COMMIT_PATTERNS=$(jq -r '.changeFilters.ignoreCommitPatterns // [] | join("|")' "$USER_DEFAULTS_FILE" 2>/dev/null || echo '')
  CHANGE_FILTER_USE_BUILTIN_MERGE_PATTERN=$(jq -r '.changeFilters.useBuiltinMergePattern // true' "$USER_DEFAULTS_FILE" 2>/dev/null || echo 'true')
}
```

#### Applying Filters

**Comment filtering:**
```jq
($ignoreAuthors | split(",") | map(select(length > 0))) as $ignored
| [.comments[]? 
   | select((.author.login // "") != "" and .author.login != $me)
   | select(($ignored | length) == 0 or (.author.login as $author | $ignored | index($author) | not))]
| length
```

**Review filtering:**
```jq
($ignoreAuthors | split(",") | map(select(length > 0))) as $ignored
| [.reviews[]?
   | select((.author.login // "") != "" and .author.login != $me)
   | select((.state // "") != "APPROVED")  # Built-in filter
   | select(($ignored | length) == 0 or (.author.login as $author | $ignored | index($author) | not))]
| length
```

**Commit filtering:**
```jq
((if $useBuiltin then "^(Merge (branch|remote-tracking branch).*(main|origin/main)|Merge main into )" else "" end) + 
 (if ($ignorePatterns | length) > 0 then (if $useBuiltin then "|" else "") + $ignorePatterns else "" end)) as $combinedPattern
| [.commits[]?
   | select(any(.authors[]?; .login != null and .login != $me))
   | select(($combinedPattern | length) == 0 or (((.messageHeadline // "") | test($combinedPattern)) | not))]
| length
```

## Testing

### Unit Tests

**Backend tests:** `src/script/tests/check-open-pr-updates.change-filters.test.js`
- Tests jq filter logic for comments, reviews, commits
- Tests `load_change_filter_config` function
- Tests `useBuiltinMergePattern` behavior (enabled/disabled)
- Tests pattern combination logic

**Frontend tests:** `src/ui/tests/index.page.change-filters.test.js`
- Tests checkbox persistence
- Tests `changeFilters` object structure
- Tests default values
- Tests event handling
- Tests integration with existing filters

**Form parsing tests:** `src/ui/tests/form-parsing.helpers.test.js`
- Tests `parseCommitPatterns()` function
- Tests `formatCommitPatternsForTextarea()` function
- Tests pattern normalization

### Running Tests

```bash
# Backend tests
npm run test:script

# Frontend tests
npm run test:ui

# All tests
npm run test:all
```

## Troubleshooting

### Filters Not Working

1. **Check user-defaults.json:**
   ```bash
   cat view-prs/data/user-defaults.json | jq '.changeFilters'
   ```

2. **Check debug logs:**
   ```bash
   CHECK_OPEN_PR_DEBUG_LOG=/tmp/debug.log ./run-prs
   grep "change_filter_config loaded" /tmp/debug.log
   ```

3. **Test jq pattern:**
   ```bash
   echo '{"messageHeadline": "Merge main into feature"}' | \
     jq -r --argjson useBuiltin true --arg ignorePatterns "" '
       ((if $useBuiltin then "^(Merge (branch|remote-tracking branch).*(main|origin/main)|Merge main into )" else "" end) + 
        (if ($ignorePatterns | length) > 0 then (if $useBuiltin then "|" else "") + $ignorePatterns else "" end)) as $pattern
       | (.messageHeadline // "") | test($pattern)
     '
   ```

### Pattern Syntax Errors

**Error:** Invalid regex syntax
```bash
# Check pattern in isolation
echo '"test: add tests"' | jq -r 'test("^test:")'
# Should output: true
```

**Common mistakes:**
- Forgetting to escape special characters: `(` → `\\(`
- Using single backslash: `\\(` not `\(`
- Invalid regex syntax: Check with online regex tester

### Checkbox State Not Persisting

1. **Check localStorage:**
   ```javascript
   // Browser console
   localStorage.getItem('view-prs-overrides')
   ```

2. **Check user-defaults.json:**
   ```bash
   cat view-prs/data/user-defaults.json | jq '.changeFilters.useBuiltinMergePattern'
   ```

3. **Hard refresh browser:**
   - Chrome/Edge: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Firefox: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)

## Migration Guide

### From Hardcoded Merge Filter

If you previously relied on the hardcoded merge filter and want to disable it:

**Before:** Merge commits from main always filtered (no config)

**After:**
1. Uncheck "Use built-in merge commit filter"
2. Add custom patterns (if needed)
3. Save changes

### Adding Custom Merge Patterns

**Goal:** Filter merges from develop and staging branches

**Steps:**
1. Uncheck "Use built-in merge commit filter"
2. Add to commit patterns:
   ```
   ^Merge branch '(develop|staging)'
   ^Merge pull request #
   ```
3. Save changes

## Performance

- **Filter evaluation:** O(n) per filter type (comments, reviews, commits)
- **Pattern matching:** jq regex engine (optimized)
- **Memory:** Negligible (filters loaded once per run)
- **Impact:** < 1ms per PR for typical filter sets

## Security

- **Input validation:** Patterns validated by jq regex engine
- **Injection prevention:** Patterns passed as jq arguments (not eval'd)
- **File permissions:** `user-defaults.json` respects system file permissions
- **No remote execution:** All filtering happens locally

## Future Enhancements

- [ ] UI for testing patterns against sample commits
- [ ] Import/export filter presets
- [ ] Regex syntax highlighting in textarea
- [ ] Filter statistics (how many items filtered per run)
- [ ] Per-repo filter overrides
- [ ] Time-based filters (ignore activity older than X days)
