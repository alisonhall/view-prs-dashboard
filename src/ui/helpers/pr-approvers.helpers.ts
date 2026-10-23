import type { PrData } from "../types/pr-data.ts";

// A PR's approvers: collected (deduped) from the metrics approvals, the
// approvers list and APPROVED reviews for filtering, and formatted as
// "Name (login) at <date>" for the insights row.
type ActorsMap = Record<string, unknown>;

export interface PrApproversDeps {
  asArray?: (value: unknown) => unknown[];
  getPreferredActorKey?: (login: unknown, name: unknown) => string;
  resolveActorDisplayName?: (login: string, actorsMap: ActorsMap, fallbackName?: string) => string;
  formatIsoDatetime?: (value: unknown) => string;
}

export interface CollectedApprover {
  login: string;
  name: string;
}

const createPrApproversHelpers = ({
  asArray,
  getPreferredActorKey,
  resolveActorDisplayName,
  formatIsoDatetime,
}: PrApproversDeps = {}) => {
  // Callers pass typed lists; the injected asArray only coerces.
  const asArraySafe = <T>(value: T[] | null | undefined): T[] =>
    (typeof asArray === "function" ? asArray(value) : Array.isArray(value) ? value : []) as T[];
  const getPreferredActorKeySafe =
    typeof getPreferredActorKey === "function"
      ? getPreferredActorKey
      : (login: unknown, name: unknown) => String(login || name || "").trim();
  const resolveActorDisplayNameSafe =
    typeof resolveActorDisplayName === "function"
      ? resolveActorDisplayName
      : (login: string, _actorsMap: ActorsMap, fallbackName?: string) =>
          String(fallbackName || login || "").trim();
  const formatIsoDatetimeSafe =
    typeof formatIsoDatetime === "function"
      ? formatIsoDatetime
      : (value: unknown) => String(value || "-");

  const collectApproversFromRow = (row: PrData | null | undefined = {}): CollectedApprover[] => {
    const ordered: CollectedApprover[] = [];
    const seen = new Set<string>();

    const addApprover = (login: unknown, name: unknown = "") => {
      const preferredKey = getPreferredActorKeySafe(login, name);
      if (!preferredKey || seen.has(preferredKey)) return;
      seen.add(preferredKey);
      ordered.push({ login: preferredKey, name: String(name || "").trim() });
    };

    asArraySafe(row?.metrics?.approvals).forEach((approval) => {
      addApprover(approval?.login, approval?.name);
    });

    asArraySafe(row?.approvers).forEach((approver) => {
      addApprover(approver?.login, approver?.name);
    });

    asArraySafe(row?.reviews).forEach((review) => {
      if (String(review?.state || "").trim() !== "APPROVED") {
        return;
      }
      addApprover(review?.authorLogin, review?.authorName || review?.author?.name);
    });

    return ordered;
  };

  const formatApproversDisplay = (row: PrData | null | undefined = {}, actorsMap: ActorsMap = {}): string => {
    const approvers = asArraySafe(row?.approvers);
    if (!approvers.length) {
      return "-";
    }

    return approvers
      .map((approver) => {
        const login = String(approver?.login || "").trim();
        const name = resolveActorDisplayNameSafe(login, actorsMap, approver?.name);
        const approvedAt = formatIsoDatetimeSafe(approver?.approvedAt || "-");
        return `${name}${login && login !== name ? ` (${login})` : ""} at ${approvedAt}`;
      })
      .join("; ");
  };

  return {
    collectApproversFromRow,
    formatApproversDisplay,
  };
};

export { createPrApproversHelpers };
