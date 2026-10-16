// Phase 7 (see REACT_MIGRATION_PLAN.md): extracted out of index.page.js
// (where these were plain inline functions, not in any helper module) so
// PrStatusCell.jsx can import buildPrLastCheckedIndicator directly instead
// of reading it off window.buildPrLastCheckedIndicator - genuinely
// zero-dependency (formatIsoDatetime is itself a zero-dependency import,
// not viewer/payload state), matching pr-row-sorting.helpers.js's own
// precedent (bare exports, no createXHelpers() wrapper).
import { createPrFormattingHelpers } from "./pr-formatting.helpers.js";

const { formatIsoDatetime } = createPrFormattingHelpers();

const OPEN_PR_LAST_CHECK_STALE_MS = 15 * 60 * 1000;

const parseIsoTimestampMs = (isoValue) => {
  const raw = String(isoValue ?? "").trim();
  if (!raw || raw === "-") {
    return Number.NaN;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const formatRelativeLastCheckedLabel = (updatedAt, nowMs = Date.now()) => {
  const updatedAtMs = parseIsoTimestampMs(updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return {
      label: "↻ unknown",
      elapsedMs: Number.NaN,
      title: "Last checked for updates timestamp is unavailable.",
    };
  }

  const elapsedMs = Math.max(0, Number(nowMs) - updatedAtMs);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  if (elapsedSeconds < 60) {
    return {
      label: "↻ just now",
      elapsedMs,
      title: `Last checked for updates at ${formatIsoDatetime(updatedAt)}.`,
    };
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return {
      label: `↻ ${elapsedMinutes}m ago`,
      elapsedMs,
      title: `Last checked for updates at ${formatIsoDatetime(updatedAt)}.`,
    };
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return {
      label: `↻ ${elapsedHours}h ago`,
      elapsedMs,
      title: `Last checked for updates at ${formatIsoDatetime(updatedAt)}.`,
    };
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return {
    label: `↻ ${elapsedDays}d ago`,
    elapsedMs,
    title: `Last checked for updates at ${formatIsoDatetime(updatedAt)}.`,
  };
};

export const buildPrLastCheckedIndicator = ({ updatedAt, sectionKey }) => {
  const relative = formatRelativeLastCheckedLabel(updatedAt);
  const isOpenSection = sectionKey === "open";
  const isStale =
    isOpenSection &&
    Number.isFinite(relative.elapsedMs) &&
    relative.elapsedMs > OPEN_PR_LAST_CHECK_STALE_MS;

  return {
    ...relative,
    isStale,
  };
};
