import type { LocalBranchInfo } from '../state/LocalBranchesContext';

// On this computer's "Behind locally": a local branch tracking the PR's,
// behind it on GitHub - by an exact count or the estimate from the PR's
// commits - and not differing (which can't say). Not one found by its name
// alone, which may not be the PR's at all.
export const isBehindLocally = (info: LocalBranchInfo | null | undefined): boolean =>
  Boolean(info && !info.nameOnly && !info.diverged && (info.behind || 0) > 0);
