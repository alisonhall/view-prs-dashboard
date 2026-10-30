// Review statistics' date handling: parsing the date inputs, the list of
// days a timeline covers, and grouping a long timeline into at most 31
// buckets with their axis and heatmap labels. Dates are "YYYY-MM-DD" in UTC.

// The Review statistics date filter (ReviewStatsProvider builds it):
// start/end are ISO bounds, startDate/endDate the raw "YYYY-MM-DD" inputs;
// all "" when unset.
export interface StatsDateRange {
  start?: string;
  end?: string;
  startDate?: string;
  endDate?: string;
}

export interface TimelinePoint {
  date: string;
  value: number;
}

export interface TimelineSeries {
  login?: string;
  actor?: string;
  points?: TimelinePoint[];
}

export interface TimelineChartData {
  dates?: string[];
  series?: TimelineSeries[];
}

export interface TimelineBucket {
  key: string;
  startDate: string;
  endDate: string;
  dates: string[];
  dayCount: number;
  heatmapTopLabel: string;
  heatmapBottomLabel: string;
  title: string;
  axisLabel: string;
  axisLabelWithTextMonth: string;
}

export interface BucketedPoint {
  key: string;
  startDate: string;
  endDate: string;
  label: string;
  value: number;
}

export type BucketedSeries = Omit<TimelineSeries, "points"> & { points: BucketedPoint[] };

export interface PrReviewStatsDateBucketingDeps {
  formatDateInputValue?: (date: Date) => string;
  asArray?: (value: unknown) => unknown[];
  toCount?: (value: unknown) => number;
  getNormalizedStatsDateRange?: () => StatsDateRange;
}

const createPrReviewStatsDateBucketingHelpers = ({
  formatDateInputValue,
  asArray,
  toCount,
  getNormalizedStatsDateRange,
}: PrReviewStatsDateBucketingDeps = {}) => {
  const formatDateInputValueSafe =
    typeof formatDateInputValue === "function"
      ? formatDateInputValue
      : (date: Date) => {
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, "0");
          const day = String(date.getUTCDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        };
  // Callers pass typed lists; the injected asArray only coerces.
  const asArraySafe = <T>(value: T[] | null | undefined): T[] =>
    (typeof asArray === "function" ? asArray(value) : Array.isArray(value) ? value : []) as T[];
  const toCountSafe =
    typeof toCount === "function"
      ? toCount
      : (value: unknown) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        };
  const getNormalizedStatsDateRangeSafe =
    typeof getNormalizedStatsDateRange === "function"
      ? getNormalizedStatsDateRange
      : (): StatsDateRange => ({ start: "", end: "", startDate: "", endDate: "" });

  const parseDateInputValue = (value: unknown): Date | null => {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const [year = 0, month = 1, day = 1] = text.split("-").map((part) => Number(part));
    return new Date(Date.UTC(year, month - 1, day));
  };

  const buildDateRangeValues = (startDate: unknown, endDate: unknown): string[] => {
    const start = parseDateInputValue(startDate);
    const end = parseDateInputValue(endDate);
    if (!start || !end || start > end) return [];

    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(formatDateInputValueSafe(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  };

  // The days a timeline shows: the last fallbackVisibleDays days with data
  // when no range is set, otherwise every day in the range.
  const getTimelineDateKeys = (
    dates: unknown[] | null | undefined,
    range: StatsDateRange = getNormalizedStatsDateRangeSafe(),
    fallbackVisibleDays: number = 31,
  ): string[] => {
    const sortedDates = asArraySafe(dates)
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .sort();

    if (!range.start && !range.end) {
      return sortedDates.slice(-fallbackVisibleDays);
    }

    if (!sortedDates.length) {
      return buildDateRangeValues(range.startDate, range.endDate);
    }

    const startDate = range.startDate || sortedDates[0];
    const endDate = range.endDate || sortedDates[sortedDates.length - 1];
    const rangedDates = buildDateRangeValues(startDate, endDate);
    return rangedDates.length ? rangedDates : sortedDates;
  };

  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const getCompactMonthDay = (dateValue: unknown): string => {
    const date = parseDateInputValue(dateValue);
    if (!date) return "";
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  };

  const getCompactDay = (dateValue: unknown): string => {
    const date = parseDateInputValue(dateValue);
    if (!date) return "";
    return String(date.getUTCDate());
  };

  const getCompactMonth = (dateValue: unknown): string => {
    const date = parseDateInputValue(dateValue);
    if (!date) return "";
    return String(date.getUTCMonth() + 1);
  };

  const getMonthName = (dateValue: unknown): string => {
    const date = parseDateInputValue(dateValue);
    if (!date) return "";
    return MONTH_NAMES[date.getUTCMonth()] ?? "";
  };

  const getDay = (dateValue: unknown): string => {
    const date = parseDateInputValue(dateValue);
    if (!date) return "";
    return String(date.getUTCDate());
  };

  const getMonthZeroPadded = (dateValue: unknown): string => {
    const date = parseDateInputValue(dateValue);
    if (!date) return "";
    return String(date.getUTCMonth() + 1).padStart(2, "0");
  };

  const getDayZeroPadded = (dateValue: unknown): string => {
    const date = parseDateInputValue(dateValue);
    if (!date) return "";
    return String(date.getUTCDate()).padStart(2, "0");
  };

  const formatBucketAxisLabel = (startDate: string | undefined, endDate?: string): string => {
    if (!startDate) return "";
    if (!endDate || endDate === startDate) return getCompactMonthDay(startDate);
    if (String(startDate).slice(0, 7) === String(endDate).slice(0, 7)) {
      return `${getCompactMonth(startDate)}/${getCompactDay(startDate)}-${getCompactDay(endDate)}`;
    }
    return `${getCompactMonthDay(startDate)}-${getCompactMonthDay(endDate)}`;
  };

  const MAX_ACTIVITY_TIMELINE_BUCKETS = 31;

  // Groups consecutive days into at most maxBuckets buckets and sums each
  // series' values per bucket.
  const bucketTimelineChartData = (
    chartData: TimelineChartData | null | undefined,
    maxBuckets: number = MAX_ACTIVITY_TIMELINE_BUCKETS,
  ): { buckets: TimelineBucket[]; series: BucketedSeries[] } => {
    const sourceDates = asArraySafe(chartData?.dates);
    if (!sourceDates.length) {
      return { buckets: [], series: [] };
    }

    const chunkSize = Math.max(1, Math.ceil(sourceDates.length / maxBuckets));
    const buckets: TimelineBucket[] = [];
    for (let index = 0; index < sourceDates.length; index += chunkSize) {
      const bucketDates = sourceDates.slice(index, index + chunkSize);
      // Each chunk has at least one date (index < sourceDates.length).
      const startDate = bucketDates[0] as string;
      const endDate = bucketDates[bucketDates.length - 1] as string;
      const isRange = startDate !== endDate;
      buckets.push({
        key: isRange ? `${startDate}:${endDate}` : String(startDate),
        startDate,
        endDate,
        dates: bucketDates,
        dayCount: bucketDates.length,
        heatmapTopLabel: `${getMonthZeroPadded(startDate)} /`,
        heatmapBottomLabel: isRange
          ? `${getDayZeroPadded(startDate)}+`
          : getDayZeroPadded(startDate),
        title: isRange ? `${startDate} to ${endDate}` : String(startDate),
        axisLabel: formatBucketAxisLabel(startDate, endDate),
        axisLabelWithTextMonth: isRange
          ? `${getMonthName(startDate)} / ${getDay(startDate)}-${getDay(endDate)}`
          : `${getMonthName(startDate)} / ${getDay(startDate)}`,
      });
    }

    const series = asArraySafe(chartData?.series).map((item) => {
      const valueByDate = new Map(
        asArraySafe(item?.points).map((point) => [point.date, toCountSafe(point?.value)]),
      );
      return {
        ...item,
        points: buckets.map((bucket) => ({
          key: bucket.key,
          startDate: bucket.startDate,
          endDate: bucket.endDate,
          label: bucket.title,
          value: bucket.dates.reduce(
            (sum, date) => sum + (valueByDate.get(date) || 0),
            0,
          ),
        })),
      };
    });

    return { buckets, series };
  };

  return {
    parseDateInputValue,
    buildDateRangeValues,
    getTimelineDateKeys,
    bucketTimelineChartData,
    formatBucketAxisLabel,
  };
};

export { createPrReviewStatsDateBucketingHelpers };
