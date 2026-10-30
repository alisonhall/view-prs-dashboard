import type { PrData, PrEntry } from "../types/pr-data.ts";

// A PR entry the factories built: always with its row data.
export type PrRowEntryFixture = PrEntry & { data: PrData };

export interface FixtureShapeCheck {
  valid: boolean;
  issues: string[];
}

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const createPrRowData = (overrides: PrData = {}): PrData => ({
  number: "123",
  title: "Default PR title",
  titleDisplay: "Default PR title",
  authorLogin: "author-login",
  author: "Author Name",
  status: "NO_CHANGE",
  approved: "NO",
  approvalCount: 0,
  labels: [],
  comments: [],
  reviews: [],
  reviewThreads: [],
  ...overrides,
});

export const createPrRowEntry = (overrides: PrEntry = {}): PrRowEntryFixture => {
  const dataOverrides = overrides.data || {};
  const base = {
    prNumber: "123",
    repo: "owner/repo",
    section: "open" as const,
    updatedAt: "2026-07-14T10:00:00Z",
    notes: {
      comments: [],
    },
    ...overrides,
    data: createPrRowData(dataOverrides),
  };
  return base;
};

export const validatePrRowEntryShape = (entry: unknown = {}): FixtureShapeCheck => {
  const issues: string[] = [];

  if (!isRecord(entry)) {
    issues.push("entry must be an object");
    return { valid: false, issues };
  }

  if (!String(entry.prNumber || "").trim()) {
    issues.push("prNumber is required");
  }
  if (!String(entry.repo || "").trim()) {
    issues.push("repo is required");
  }
  if (!isRecord(entry.data)) {
    issues.push("data object is required");
  }

  const data = isRecord(entry.data) ? entry.data : {};
  if (!String(data.number || "").trim()) {
    issues.push("data.number is required");
  }
  if (!String(data.title || data.titleDisplay || "").trim()) {
    issues.push("data.title or data.titleDisplay is required");
  }
  if (!String(data.status || "").trim()) {
    issues.push("data.status is required");
  }
  if (!Array.isArray(data.labels)) {
    issues.push("data.labels must be an array");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};
