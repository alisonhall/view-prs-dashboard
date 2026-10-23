// Which repo RepoLabelsProvider should fetch labels for.
//
// Deliberately does NOT fall back to DEFAULT_REPO: that constant is only
// ever a placeholder/example value (see the "repo" field's `placeholder`
// in react-app.jsx) - it isn't guaranteed to be a repo this GitHub account
// can actually see, and eagerly querying `gh label list` against it on
// every page load produced a real 500 (repo not found) before the actual
// selected repo was even known yet.
export interface RepoForLabelsInput {
  repoOverride?: string | null;
  currentRepo?: string | null;
  repoInputValue?: string | null;
}

export const resolveRepoForLabelsFetch = ({
  repoOverride,
  currentRepo,
  repoInputValue,
}: RepoForLabelsInput = {}): string =>
  String(repoOverride || currentRepo || repoInputValue || "").trim();
