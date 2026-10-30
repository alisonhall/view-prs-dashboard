// FilterStateProvider's persistence: the default value of every saved
// option (keyed by the form-field ids /view-prs/user-defaults stores
// overrides under), the field-id -> Context-key map, and reading/writing
// the saved overrides.
export type UiOptionValue = string | boolean | string[];
export type UiOptionOverrides = Record<string, unknown>;

export interface PrUiOptionPersistenceDeps {
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

const createPrUiOptionPersistenceHelpers = ({ fetch: fetchFn }: PrUiOptionPersistenceDeps = {}) => {
  const getUiOptionDefaults = (): Record<string, UiOptionValue> => ({
    repo: "",
    limit: "",
    "merged-limit": "",
    jobs: "",
    "pr-numbers": "",
    "open-mode": "none",
    "ack-changed": false,
    "show-reason": true,
    quiet: false,
    "scope-mode": "all",
    "filter-pr-numbers": "",
    label: "",
    "exclude-label": "",
    author: [],
    assigned: [],
    approver: [],
    "always-show-in-review": false,
    "attention-no-activity-mode": "all",
    "attention-include-pending-comments": true,
    "attention-ignore-merge-only-commits": false,
    "attention-include-closed-merged": true,
    "attention-include-draft-changed": true,
    "attention-include-draft-no-activity": false,
    "attention-author-thread-resolution-mode": "allow-all",
    "attention-author-thread-resolution-allow": [],
    "attention-author-thread-resolution-deny": [],
    "filter-custom-comments": "",
    "filter-other-notes": "",
    "filter-pr-difficulty": "",
    "filter-stories": "",
    "filter-analysis-of-pr": "",
  });

  // Single source of truth mapping a form-field id (the shape
  // /view-prs/user-defaults stores overrides under) to its
  // FilterStateProvider Context key - both the restore effect and the
  // persist callbacks (FilterStateProvider.tsx) need it.
  const FILTER_STATE_FIELD_MAP: Record<string, string> = {
    "scope-mode": "scopeMode",
    "always-show-in-review": "alwaysShowInReview",
    "attention-no-activity-mode": "attentionNoActivityMode",
    "attention-include-pending-comments": "attentionIncludePendingComments",
    "attention-ignore-merge-only-commits": "attentionIgnoreMergeOnlyCommits",
    "attention-include-closed-merged": "attentionIncludeClosedMerged",
    "attention-include-draft-changed": "attentionIncludeDraftChanged",
    "attention-include-draft-no-activity": "attentionIncludeDraftNoActivity",
    repo: "repo",
    limit: "limit",
    "merged-limit": "mergedLimit",
    jobs: "jobs",
    "pr-numbers": "prNumbersInput",
    "open-mode": "openMode",
    "ack-changed": "ackChanged",
    "show-reason": "showReason",
    quiet: "quiet",
    "filter-pr-numbers": "filterPrNumbers",
    "attention-author-thread-resolution-mode": "attentionAuthorThreadResolutionMode",
    "change-filter-ignore-commit-patterns": "changeFilterIgnoreCommitPatterns",
    "filter-custom-comments": "filterCustomComments",
    "filter-other-notes": "filterOtherNotes",
    "filter-pr-difficulty": "filterPrDifficulty",
    "filter-stories": "filterStories",
    "filter-analysis-of-pr": "filterAnalysisOfPr",
  };

  const readUiSessionOverrides = async (): Promise<UiOptionOverrides> => {
    try {
      const response = await (fetchFn as NonNullable<typeof fetchFn>)("/view-prs/user-defaults");
      if (!response.ok) return {};
      const result: { overrides?: unknown } = await response.json();
      const parsed = result?.overrides;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as UiOptionOverrides)
        : {};
    } catch (_error) {
      return {};
    }
  };

  // Empty arrays are dropped (so a cleared list falls back to its default)
  // unless their key is in preserveEmptyArrayKeys.
  const writeUiSessionOverrides = async (
    overrides: UiOptionOverrides | null | undefined,
    { preserveEmptyArrayKeys = [] }: { preserveEmptyArrayKeys?: string[] } = {},
  ): Promise<void> => {
    const preserveSet = new Set(
      Array.isArray(preserveEmptyArrayKeys) ? preserveEmptyArrayKeys : [],
    );
    const entries = Object.entries(overrides || {}).filter(([key, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0 || preserveSet.has(String(key));
      }
      return value !== undefined;
    });

    const data = Object.fromEntries(entries);

    try {
      await (fetchFn as NonNullable<typeof fetchFn>)("/view-prs/user-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch (_error) {
      // Best effort only.
    }
  };

  // Saves one setting, keeping the others: reads the saved overrides, sets
  // `key` (or removes it when `value` is undefined), and writes them back.
  // Settings › Appearance saves its choices this way.
  const updateUiSessionOverride = async (key: string, value: unknown): Promise<void> => {
    const overrides = { ...(await readUiSessionOverrides()) };
    if (value === undefined) {
      delete overrides[key];
    } else {
      overrides[key] = value;
    }
    await writeUiSessionOverrides(overrides);
  };

  return {
    getUiOptionDefaults,
    FILTER_STATE_FIELD_MAP,
    readUiSessionOverrides,
    writeUiSessionOverrides,
    updateUiSessionOverride,
  };
};

export { createPrUiOptionPersistenceHelpers };
