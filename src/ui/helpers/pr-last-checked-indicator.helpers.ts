import { createPrFormattingHelpers } from "./pr-formatting.helpers.ts";

// PrStatusCell's "last checked" marker: a relative label ("↻ 5m ago"), a
// tooltip with the exact time, and whether an open PR's check is stale
// (older than 15 minutes).
const { formatIsoDatetime } = createPrFormattingHelpers();

const OPEN_PR_LAST_CHECK_STALE_MS = 15 * 60 * 1000;

export interface LastCheckedLabel {
  label: string;
  elapsedMs: number;
  title: string;
}

export interface LastCheckedIndicator extends LastCheckedLabel {
  isStale: boolean;
}

const parseIsoTimestampMs = (isoValue: unknown): number => {
  const raw = String(isoValue ?? "").trim();
  if (!raw || raw === "-") {
    return Number.NaN;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export const formatRelativeLastCheckedLabel = (updatedAt: unknown, nowMs: number = Date.now()): LastCheckedLabel => {
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

export const buildPrLastCheckedIndicator = ({
  updatedAt,
  sectionKey,
}: {
  updatedAt: unknown;
  sectionKey?: string;
}): LastCheckedIndicator => {
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
