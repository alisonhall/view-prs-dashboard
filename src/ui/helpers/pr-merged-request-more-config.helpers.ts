export interface MergedRequestMoreActionInput {
  selectedScope?: string;
  repoFilter?: string;
  lastRunRepo?: string;
  latestSelectedRepo?: string;
}

export interface MergedRequestMoreActionOptions {
  isVisible: boolean;
  repo: string;
}

const createPrMergedRequestMoreConfigHelpers = () => {
  const buildMergedRequestMoreActionOptions = ({
    selectedScope,
    repoFilter,
    lastRunRepo,
    latestSelectedRepo,
  }: MergedRequestMoreActionInput = {}): MergedRequestMoreActionOptions => ({
    isVisible: selectedScope === "all",
    repo: repoFilter || lastRunRepo || latestSelectedRepo || "",
  });

  return {
    buildMergedRequestMoreActionOptions,
  };
};

export { createPrMergedRequestMoreConfigHelpers };
