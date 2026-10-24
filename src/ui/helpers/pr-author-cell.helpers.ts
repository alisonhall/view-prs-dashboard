import type { PrData } from "../types/pr-data.ts";
import type { GetPreferredActorKey } from "./pr-actor-identity.helpers.ts";
import { getMergeCommitMatcher, type MergeCommitRules } from "./pr-merge-commit-rules.helpers.ts";

export interface PrAuthorCellDeps {
  getPreferredActorKey?: GetPreferredActorKey;
  // What counts as a merge commit (pr-merge-commit-rules.helpers.ts);
  // defaults to DEFAULT_MERGE_COMMIT_RULES.
  mergeCommitRules?: MergeCommitRules;
}

export interface PrAuthor {
  key: string;
  name: string;
  isPrimary: boolean;
}

const createPrAuthorCellHelpers = ({
  getPreferredActorKey,
  mergeCommitRules,
}: PrAuthorCellDeps = {}) => {
  const isMergeCommit = getMergeCommitMatcher(mergeCommitRules);
  const getPreferredActorKeySafe =
    typeof getPreferredActorKey === "function"
      ? getPreferredActorKey
      : (login: unknown, name: unknown) => String(login || name || "").trim();

  // Returns the official PR author (always first, marked isPrimary) plus
  // every distinct person with a non-merge commit on the branch, in the
  // order their commits appear, deduped by the same login/name key
  // ActorIdentity rendering uses everywhere else - so a commit author who
  // is also the PR author (the common case) only appears once.
  const collectPrAuthors = (row: PrData | null | undefined = {}): PrAuthor[] => {
    const authors: PrAuthor[] = [];
    const seenKeys = new Set<string>();

    const addAuthor = (loginValue: unknown, nameValue: unknown, isPrimary: boolean) => {
      const key = getPreferredActorKeySafe(loginValue, nameValue);
      if (!key || seenKeys.has(key)) {
        return;
      }
      seenKeys.add(key);
      authors.push({ key, name: String(nameValue || "").trim(), isPrimary });
    };

    addAuthor(row?.authorLogin, row?.author, true);

    (Array.isArray(row?.commits) ? row.commits : []).forEach((commit) => {
      if (isMergeCommit(commit)) {
        return;
      }
      (Array.isArray(commit?.authors) ? commit.authors : []).forEach((author) => {
        addAuthor(author?.login, author?.name, false);
      });
    });

    return authors;
  };

  return {
    collectPrAuthors,
  };
};

export { createPrAuthorCellHelpers };
