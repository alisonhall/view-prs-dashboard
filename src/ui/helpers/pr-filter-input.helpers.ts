// The filter bar's PRs field: comma- or space-separated tokens, each
// - a PR number ("912"): that PR, in any repo
// - a PR by repo ("acme/api#912"), or its URL (any page of it, GitHub
//   Enterprise too - rows aren't told apart by host): that PR
// - a repo ("acme/api"), or its URL: that repo's rows
// Anything else is ignored. Repos match whatever their case, as GitHub's
// names do (a URL has the repo's own; a subscription, as it was typed).
export interface PrFilterInput {
  prNumbers: string[];
  // "owner/repo#number", as rows are keyed.
  prKeys: string[];
  repos: string[];
}

const NAME = '[A-Za-z0-9_.-]+';
const KEY_PATTERN = new RegExp(`^(${NAME}/${NAME})#(\\d+)$`);
const REPO_PATTERN = new RegExp(`^${NAME}/${NAME}$`);
const URL_PATTERN = new RegExp(`^(?:https?://)?[^/\\s]+/(${NAME}/${NAME})/pull/(\\d+)(?:[/?#].*)?$`, 'i');
// A repo's own page: its host has a dot, so "owner/repo/x" isn't one.
const REPO_URL_PATTERN = new RegExp(`^(?:https?://)?[^/\\s]*\\.[^/\\s]+/(${NAME}/${NAME})/?(?:[?#].*)?$`, 'i');

export const parsePrFilterInput = (raw: unknown): PrFilterInput => {
  const result: PrFilterInput = { prNumbers: [], prKeys: [], repos: [] };
  const add = (list: string[], value: string) => {
    if (!list.includes(value)) list.push(value);
  };
  String(raw ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .forEach((token) => {
      if (/^#?\d+$/.test(token)) {
        add(result.prNumbers, token.replace(/^#/, ''));
        return;
      }
      const key = token.match(KEY_PATTERN) || token.match(URL_PATTERN);
      if (key) {
        add(result.prKeys, `${key[1]}#${key[2]}`);
        return;
      }
      if (REPO_PATTERN.test(token)) {
        add(result.repos, token);
        return;
      }
      const repoUrl = token.match(REPO_URL_PATTERN);
      if (repoUrl?.[1]) add(result.repos, repoUrl[1]);
    });
  return result;
};

// Whether a row passes the PRs field. Numbers and keys pick PRs (any one
// of them); repos limit the rows to theirs - so "acme/api 12" is
// acme/api's #12 - though a key names its own repo.
export const rowMatchesPrFilter = (repo: string, prNumber: string, filter: PrFilterInput): boolean => {
  const repoKey = repo.toLowerCase();
  if (filter.prKeys.some((key) => key.toLowerCase() === `${repoKey}#${prNumber}`)) return true;
  const picksPrs = filter.prNumbers.length > 0 || filter.prKeys.length > 0;
  if (picksPrs && !filter.prNumbers.includes(prNumber)) return false;
  return filter.repos.length === 0 || filter.repos.some((filterRepo) => filterRepo.toLowerCase() === repoKey);
};

// Whether it picks PRs (numbers or keys), which then show whatever the
// scope and the other filters - not only repos, which filter like the rest.
export const prFilterPicksPrs = (filter: PrFilterInput) => filter.prNumbers.length > 0 || filter.prKeys.length > 0;
