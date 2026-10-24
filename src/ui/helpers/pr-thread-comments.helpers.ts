import type { PrData } from "../types/pr-data.ts";
import { asArray } from "./pr-as-array.helpers.ts";

// How many of a PR's review-thread comments are still PENDING (drafted in
// a review that hasn't been submitted).
export const countPendingThreadComments = (row: PrData | null | undefined): number =>
  asArray(row?.reviewThreads).reduce(
    (total, thread) =>
      total +
      asArray(thread?.comments).filter(
        (comment) => String(comment?.state || "").toUpperCase() === "PENDING",
      ).length,
    0,
  );
