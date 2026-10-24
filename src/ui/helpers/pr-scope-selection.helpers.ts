import type { PrEntry } from "../types/pr-data.ts";
import type { AttentionConfig } from "./pr-needs-attention.helpers.ts";

// The "View scope" filter: normalizes the selected scope and narrows the
// repo's rows to it (last run, needs attention, or needs attention or
// interacted with), with a label for the applied-filters summary.
export type SelectedScope =
  | "all"
  | "last-run"
  | "needs-attention"
  | "needs-attention-or-interacted";

const SELECTED_SCOPES: readonly string[] = [
  "all",
  "last-run",
  "needs-attention",
  "needs-attention-or-interacted",
];

export interface PrScopeSelectionDeps {
  entryNeedsAttention?: (entry: PrEntry, attentionConfig: AttentionConfig | undefined) => boolean;
  entryHasYourLastActivity?: (entry: PrEntry) => boolean;
}

export interface ResolveScopedRowsInput<E extends PrEntry> {
  rowsForRepo?: E[] | null;
  ignoreScopeForPrNumberFilter?: boolean;
  runStamp?: string;
  useLastRunScope?: boolean;
  selectedScope?: string;
  attentionConfig?: AttentionConfig;
}

const createPrScopeSelectionHelpers = ({
  entryNeedsAttention,
  entryHasYourLastActivity,
}: PrScopeSelectionDeps = {}) => {
  const entryNeedsAttentionSafe =
    typeof entryNeedsAttention === "function"
      ? entryNeedsAttention
      : () => false;
  const entryHasYourLastActivitySafe =
    typeof entryHasYourLastActivity === "function"
      ? entryHasYourLastActivity
      : () => false;

  const normalizeSelectedScope = (scopeModeValue: unknown): SelectedScope => {
    const normalizedValue = String(scopeModeValue || "all")
      .trim()
      .toLowerCase();
    return SELECTED_SCOPES.includes(normalizedValue)
      ? (normalizedValue as SelectedScope)
      : "all";
  };

  const resolveScopedRows = <E extends PrEntry>({
    rowsForRepo,
    ignoreScopeForPrNumberFilter,
    runStamp,
    useLastRunScope,
    selectedScope,
    attentionConfig,
  }: ResolveScopedRowsInput<E> = {}): { rows: E[]; scopeLabel: string } => {
    let rows = Array.isArray(rowsForRepo) ? rowsForRepo : [];
    let scopeLabel = "all stored rows";

    if (!ignoreScopeForPrNumberFilter) {
      if (runStamp && useLastRunScope) {
        const lastRunRows = rows.filter((entry) => entry?.updatedAt === runStamp);
        if (lastRunRows.length > 0) {
          rows = lastRunRows;
          scopeLabel = "last run rows";
        }
      } else if (selectedScope === "needs-attention") {
        rows = rows.filter((entry) =>
          entryNeedsAttentionSafe(entry, attentionConfig),
        );
        scopeLabel = "needs attention rows";
      } else if (selectedScope === "needs-attention-or-interacted") {
        rows = rows.filter(
          (entry) =>
            entryNeedsAttentionSafe(entry, attentionConfig) ||
            entryHasYourLastActivitySafe(entry),
        );
        scopeLabel = "needs attention or interacted rows";
      }
    }

    return {
      rows,
      scopeLabel,
    };
  };

  return {
    normalizeSelectedScope,
    resolveScopedRows,
  };
};

export { createPrScopeSelectionHelpers };
