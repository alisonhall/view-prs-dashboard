(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsReviewStatsDateBucketingHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrReviewStatsDateBucketingHelpers = ({
    formatDateInputValue,
    asArray,
    toCount,
    getNormalizedStatsDateRange,
  } = {}) => {
    const formatDateInputValueSafe =
      typeof formatDateInputValue === "function"
        ? formatDateInputValue
        : (date) => {
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, "0");
            const day = String(date.getUTCDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
          };
    const asArraySafe =
      typeof asArray === "function"
        ? asArray
        : (value) => (Array.isArray(value) ? value : []);
    const toCountSafe =
      typeof toCount === "function"
        ? toCount
        : (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
          };
    const getNormalizedStatsDateRangeSafe =
      typeof getNormalizedStatsDateRange === "function"
        ? getNormalizedStatsDateRange
        : () => ({ start: "", end: "", startDate: "", endDate: "" });

    const parseDateInputValue = (value) => {
      const text = String(value || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
      const [year, month, day] = text.split("-").map((part) => Number(part));
      return new Date(Date.UTC(year, month - 1, day));
    };

    const buildDateRangeValues = (startDate, endDate) => {
      const start = parseDateInputValue(startDate);
      const end = parseDateInputValue(endDate);
      if (!start || !end || start > end) return [];

      const dates = [];
      const cursor = new Date(start);
      while (cursor <= end) {
        dates.push(formatDateInputValueSafe(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return dates;
    };

    const getTimelineDateKeys = (
      dates,
      range = getNormalizedStatsDateRangeSafe(),
      fallbackVisibleDays = 31,
    ) => {
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

    const getCompactMonthDay = (dateValue) => {
      const date = parseDateInputValue(dateValue);
      if (!date) return "";
      return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
    };

    const getCompactDay = (dateValue) => {
      const date = parseDateInputValue(dateValue);
      if (!date) return "";
      return String(date.getUTCDate());
    };

    const getCompactMonth = (dateValue) => {
      const date = parseDateInputValue(dateValue);
      if (!date) return "";
      return String(date.getUTCMonth() + 1);
    };

    const getMonthName = (dateValue) => {
      const date = parseDateInputValue(dateValue);
      if (!date) return "";
      return MONTH_NAMES[date.getUTCMonth()];
    };

    const getDay = (dateValue) => {
      const date = parseDateInputValue(dateValue);
      if (!date) return "";
      return String(date.getUTCDate());
    };

    const getMonthZeroPadded = (dateValue) => {
      const date = parseDateInputValue(dateValue);
      if (!date) return "";
      return String(date.getUTCMonth() + 1).padStart(2, "0");
    };

    const getDayZeroPadded = (dateValue) => {
      const date = parseDateInputValue(dateValue);
      if (!date) return "";
      return String(date.getUTCDate()).padStart(2, "0");
    };

    const formatBucketAxisLabel = (startDate, endDate) => {
      if (!startDate) return "";
      if (!endDate || endDate === startDate) return getCompactMonthDay(startDate);
      if (String(startDate).slice(0, 7) === String(endDate).slice(0, 7)) {
        return `${getCompactMonth(startDate)}/${getCompactDay(startDate)}-${getCompactDay(endDate)}`;
      }
      return `${getCompactMonthDay(startDate)}-${getCompactMonthDay(endDate)}`;
    };

    const MAX_ACTIVITY_TIMELINE_BUCKETS = 31;

    const bucketTimelineChartData = (
      chartData,
      maxBuckets = MAX_ACTIVITY_TIMELINE_BUCKETS,
    ) => {
      const sourceDates = asArraySafe(chartData?.dates);
      if (!sourceDates.length) {
        return { buckets: [], series: [] };
      }

      const chunkSize = Math.max(1, Math.ceil(sourceDates.length / maxBuckets));
      const buckets = [];
      for (let index = 0; index < sourceDates.length; index += chunkSize) {
        const bucketDates = sourceDates.slice(index, index + chunkSize);
        const startDate = bucketDates[0];
        const endDate = bucketDates[bucketDates.length - 1];
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

  return {
    createPrReviewStatsDateBucketingHelpers,
  };
});
