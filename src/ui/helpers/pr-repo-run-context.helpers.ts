import type { LastRun } from "../types/pr-data.ts";

export interface RepoRunContextInput {
  selectedRepo?: string | null;
  inputRepo?: string | null;
  lastRun?: LastRun | null;
}

export interface RepoRunContext {
  repoFilter: string;
  runStamp: string;
  normalizedRunStamp: string;
}

const createPrRepoRunContextHelpers = () => {
  const deriveRepoRunContext = ({
    selectedRepo,
    inputRepo,
    lastRun,
  }: RepoRunContextInput = {}): RepoRunContext => {
    const repoFilter =
      String(selectedRepo || "").trim() ||
      String(inputRepo || "").trim() ||
      String(lastRun?.repo || "").trim() ||
      "";
    const runStamp = String(lastRun?.updatedAt || "");
    const normalizedRunStamp = runStamp.trim();

    return {
      repoFilter,
      runStamp,
      normalizedRunStamp,
    };
  };

  return {
    deriveRepoRunContext,
  };
};

export { createPrRepoRunContextHelpers };
