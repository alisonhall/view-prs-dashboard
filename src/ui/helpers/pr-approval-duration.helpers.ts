// Formats a minute count as "45m", "2h" or "2h 5m" (ApprovalRiskSection).
export interface PrApprovalDurationDeps {
  toCount?: (value: unknown) => number;
}

const createPrApprovalDurationHelpers = ({ toCount }: PrApprovalDurationDeps = {}) => {
  const toCountSafe =
    typeof toCount === "function"
      ? toCount
      : (value: unknown) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : 0;
        };

  const formatDurationMinutes = (value: unknown): string => {
    const totalMinutes = toCountSafe(value);
    if (totalMinutes <= 0) return "0m";
    if (totalMinutes < 60) return `${totalMinutes}m`;

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  };

  return {
    formatDurationMinutes,
  };
};

export { createPrApprovalDurationHelpers };
