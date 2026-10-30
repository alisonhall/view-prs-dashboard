import type { PrDataPayload, PrEntry } from "../types/pr-data.ts";
import type { PerPrUserState, UserStatePayload } from "./pr-per-pr-user-state.helpers.ts";
import { asArray } from "./pr-as-array.helpers.ts";

// Settings › Export's "Export Visible PR JSON": the field catalog (every
// dotted leaf path in the PR data and user state), which PRs are visible,
// and the export payload holding only the selected fields of each.

export type ExportPayloadSource = PrDataPayload & UserStatePayload;

export interface PrExportDeps {
  getPerPrUserStateFromPayload: (
    payload: ExportPayloadSource,
    entry: PrEntry,
    prNumber: string,
    repo: string,
  ) => PerPrUserState;
}

export interface ExportFieldCatalog {
  dataPaths: string[];
  userStatePaths: string[];
}

export interface ExportedPr {
  prNumber: string;
  repo: string;
  data: Record<string, unknown>;
  userState: Record<string, unknown>;
}

export interface ExportPayload {
  generatedAt: string;
  lastRunUpdatedAt: string | null;
  selectedFields: { data: string[]; userState: string[] };
  prCount: number;
  prs: ExportedPr[];
}

type PlainObject = Record<string, unknown>;

const createPrExportHelpers = ({ getPerPrUserStateFromPayload }: PrExportDeps) => {
  const isPlainObject = (value: unknown): value is PlainObject =>
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]";

  const toSortedUnique = (values: unknown[] | null | undefined): string[] =>
    Array.from(new Set(asArray(values).filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b)),
    ) as string[];

  const collectLeafPaths = (value: unknown, prefix: string = "", collector: Set<string> = new Set()): Set<string> => {
    if (Array.isArray(value)) {
      if (prefix) collector.add(prefix);
      return collector;
    }

    if (!isPlainObject(value)) {
      if (prefix) collector.add(prefix);
      return collector;
    }

    const keys = Object.keys(value);
    if (keys.length === 0 && prefix) {
      collector.add(prefix);
    }

    keys.forEach((key) => {
      const path = prefix ? `${prefix}.${key}` : String(key);
      const next = value[key];
      if (isPlainObject(next)) {
        collectLeafPaths(next, path, collector);
        return;
      }
      collector.add(path);
    });

    return collector;
  };

  const setByPath = (target: PlainObject, path: string, value: unknown): void => {
    const parts = String(path || "")
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) return;

    let cursor = target;
    for (let index = 0; index < parts.length; index += 1) {
      const key = parts[index] as string;
      const isLast = index === parts.length - 1;
      if (isLast) {
        cursor[key] = value;
        return;
      }
      if (!isPlainObject(cursor[key])) {
        cursor[key] = {};
      }
      cursor = cursor[key] as PlainObject;
    }
  };

  const readByPath = (source: unknown, path: string): unknown => {
    const parts = String(path || "")
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) return undefined;

    let cursor: unknown = source;
    for (let index = 0; index < parts.length; index += 1) {
      const key = parts[index] as string;
      if (!cursor || typeof cursor !== "object") return undefined;
      if (!Object.prototype.hasOwnProperty.call(cursor, key)) return undefined;
      cursor = (cursor as PlainObject)[key];
    }

    return cursor;
  };

  const pickByPaths = (source: unknown, selectedPaths: unknown[] = []): PlainObject => {
    const output: PlainObject = {};
    toSortedUnique(selectedPaths).forEach((path) => {
      const value = readByPath(source, path);
      if (value === undefined) return;
      setByPath(output, path, value);
    });
    return output;
  };

  // The entry without its notes (those export as user state instead).
  const buildDataSourceEntry = (entry: unknown): PlainObject => {
    if (!isPlainObject(entry)) {
      return {};
    }

    const copy = { ...entry };
    delete copy.notes;
    return copy;
  };

  const getFieldCatalog = (payload: ExportPayloadSource = {}): ExportFieldCatalog => {
    const byPrNumber = payload?.byPrNumber || {};
    const dataPaths = new Set<string>();
    const userStatePaths = new Set<string>();

    Object.values(byPrNumber).forEach((entryRaw) => {
      const entry: PrEntry = isPlainObject(entryRaw) ? entryRaw : {};
      collectLeafPaths(buildDataSourceEntry(entry), "", dataPaths);

      const prNumber = String(entry?.prNumber || entry?.data?.number || "").trim();
      if (!prNumber) return;
      const repo = String(entry?.repo || payload?.lastRun?.repo || "").trim();
      const userState = getPerPrUserStateFromPayload(payload, entry, prNumber, repo);
      collectLeafPaths(userState, "", userStatePaths);
    });

    return {
      dataPaths: toSortedUnique(Array.from(dataPaths)),
      userStatePaths: toSortedUnique(Array.from(userStatePaths)),
    };
  };

  const buildExportPayload = ({
    payload = {},
    visiblePrNumbers = [],
    selectedDataPaths = [],
    selectedUserStatePaths = [],
  }: {
    payload?: ExportPayloadSource;
    visiblePrNumbers?: unknown[];
    selectedDataPaths?: unknown[];
    selectedUserStatePaths?: unknown[];
  }): ExportPayload => {
    const byPrNumber = payload?.byPrNumber || {};
    const selectedPrNumbers = toSortedUnique(visiblePrNumbers);

    const items = selectedPrNumbers
      .map((prNumber) => {
        const entryRaw = byPrNumber?.[prNumber] || byPrNumber?.[String(prNumber)] || {};
        const entry: PrEntry = isPlainObject(entryRaw) ? entryRaw : {};
        const repo = String(entry?.repo || payload?.lastRun?.repo || "").trim();
        const data = pickByPaths(buildDataSourceEntry(entry), selectedDataPaths);
        const userState = pickByPaths(
          getPerPrUserStateFromPayload(payload, entry, String(prNumber), repo),
          selectedUserStatePaths,
        );

        return {
          prNumber: String(prNumber),
          repo,
          data,
          userState,
        };
      })
      .filter((item) => item.prNumber);

    return {
      generatedAt: new Date().toISOString(),
      lastRunUpdatedAt: payload?.lastRun?.updatedAt || null,
      selectedFields: {
        data: toSortedUnique(selectedDataPaths),
        userState: toSortedUnique(selectedUserStatePaths),
      },
      prCount: items.length,
      prs: items,
    };
  };

  return {
    getFieldCatalog,
    buildExportPayload,
  };
};

// One rendered table section, as Export needs it: whether it's
// open and the PR numbers of its rows, in display order.
export interface ExportSection {
  open: boolean;
  prNumbers: string[];
}

// PR numbers in the open (expanded) sections of the table, in display
// order, each once - the "visible" PRs Export exports. A PR shown
// in a smart group and again in its lifecycle section counts once.
const getPrNumbersInOpenSections = (sections: ExportSection[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  sections.forEach((section) => {
    if (!section.open) return;
    section.prNumbers.forEach((value) => {
      const prNumber = String(value || "").trim();
      if (!prNumber || seen.has(prNumber)) return;
      seen.add(prNumber);
      result.push(prNumber);
    });
  });
  return result;
};

export { createPrExportHelpers, getPrNumbersInOpenSections };
