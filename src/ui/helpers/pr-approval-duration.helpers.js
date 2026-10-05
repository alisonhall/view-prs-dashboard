// Phase 7 (see REACT_MIGRATION_PLAN.md): pure extraction of index.page.js's
// former formatDurationMinutes body into a DI-factory module, so
// ApprovalRiskSection.jsx can import it directly instead of reading
// window.formatDurationMinutes. Byte-for-byte-logic-preserving move.
export const { createPrApprovalDurationHelpers } = (() => {
  const createPrApprovalDurationHelpers = ({ toCount } = {}) => {
    const toCountSafe =
      typeof toCount === "function"
        ? toCount
        : (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
          };

    const formatDurationMinutes = (value) => {
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

  return {
    createPrApprovalDurationHelpers,
  };
})();
