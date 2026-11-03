import type { PrEntry } from "../types/pr-data.ts";

// The payload's byPrNumber is keyed by repo and number - "owner/repo#123" -
// since two repos can each have a PR #123 (before 2026-11-02 by the bare
// number; see the server's view-prs-pr-keys.js). Look rows up with these
// rather than byPrNumber[prNumber].

export const buildPrEntryKey = (repo: unknown, prNumber: unknown): string =>
  `${String(repo ?? "").trim()}#${String(prNumber ?? "").trim()}`;

const entryNumber = (key: string, entry: PrEntry | undefined): string =>
  String(entry?.prNumber ?? entry?.data?.number ?? key.split("#").pop() ?? "").trim();

// A row by repo and number: its repo key, else its bare-number key when that
// row is the repo's (or has none), else any row of that repo and number.
export const findPrEntry = (
  byPrNumber: Record<string, PrEntry | undefined> | null | undefined,
  repo: unknown,
  prNumber: unknown,
): PrEntry | undefined => {
  const rows = byPrNumber || {};
  const safeRepo = String(repo ?? "").trim();
  const safeNumber = String(prNumber ?? "").trim();
  const byKey = rows[buildPrEntryKey(safeRepo, safeNumber)];
  if (byKey) return byKey;
  const legacy = rows[safeNumber];
  if (legacy && (!legacy.repo || legacy.repo === safeRepo)) return legacy;
  return Object.entries(rows).find(
    ([key, entry]) => entryNumber(key, entry) === safeNumber && (!safeRepo || !entry?.repo || entry.repo === safeRepo),
  )?.[1];
};

// Every row with this number, whatever its repo.
export const findPrEntriesByNumber = (
  byPrNumber: Record<string, PrEntry | undefined> | null | undefined,
  prNumber: unknown,
): PrEntry[] => {
  const safeNumber = String(prNumber ?? "").trim();
  return Object.entries(byPrNumber || {})
    .filter(([key, entry]) => entry && entryNumber(key, entry) === safeNumber)
    .map(([, entry]) => entry as PrEntry);
};

// "owner/repo#123" (or "#123" for a row without a repo).
export const isPrEntryKey = (value: unknown): boolean => /^[^\s#]*#\d+$/.test(String(value ?? "").trim());

export const parsePrEntryKey = (key: unknown): { repo: string; prNumber: string } => {
  const text = String(key ?? "").trim();
  const hashIndex = text.lastIndexOf("#");
  return hashIndex < 0 ? { repo: "", prNumber: text } : { repo: text.slice(0, hashIndex), prNumber: text.slice(hashIndex + 1) };
};

// By repo, then numerically by PR number.
export const comparePrEntryKeys = (a: string, b: string): number => {
  const left = parsePrEntryKey(a);
  const right = parsePrEntryKey(b);
  return left.repo.localeCompare(right.repo) || Number(left.prNumber) - Number(right.prNumber);
};
