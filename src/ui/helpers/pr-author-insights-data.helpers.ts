import type { PostJsonResult } from "./pr-http.helpers.ts";

// Author Insights' manual comments: the sentiment options, and loading,
// saving and updating an author's comments through
// /view-prs/author-comments.

export const AUTHOR_COMMENT_SENTIMENT_OPTIONS = [
  { value: "positive", label: "Positive" },
  { value: "negative", label: "Negative" },
  { value: "neutral", label: "Neutral" },
];

export interface AuthorManualComment {
  id?: string;
  note?: string;
  sentiment?: string;
  [field: string]: unknown;
}

// The mutable state object AuthorInsightsDraftsProvider keeps in a ref:
// loadAuthorManualComments writes into it, then calls onComplete so the
// provider re-renders.
export interface AuthorInsightsState {
  manualCommentsByAuthorLogin: Record<string, AuthorManualComment[] | undefined>;
  manualCommentsLoadingByAuthorLogin: Record<string, boolean | undefined>;
  manualCommentsErrorByAuthorLogin: Record<string, string | undefined>;
  manualCommentDraftByAuthorLogin?: Record<string, unknown>;
  manualCommentEditDraftByAuthorLogin?: Record<string, unknown>;
}

interface AuthorCommentsResult {
  ok?: boolean;
  error?: string;
  comments?: AuthorManualComment[];
}

// normalizeActorLogin is optional only because AuthorInsightsProvider and
// AuthorInsightsContext call the factory with no arguments just to read
// AUTHOR_COMMENT_SENTIMENT_OPTIONS; every function below needs it.
export interface PrAuthorInsightsDataDeps {
  normalizeActorLogin?: (value: unknown) => string;
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface AuthorCommentInput {
  authorLogin: string;
  note: string;
  sentiment: string;
}

const createPrAuthorInsightsDataHelpers = ({
  normalizeActorLogin: normalizeActorLoginDep,
  fetchFn = (input, init) => fetch(input, init),
}: PrAuthorInsightsDataDeps = {}) => {
  // Throws when missing, as before conversion (see PrAuthorInsightsDataDeps).
  const normalizeActorLogin = normalizeActorLoginDep as (value: unknown) => string;

  const getAuthorManualCommentsForLogin = (
    authorLogin: unknown,
    authorInsightsState: Pick<AuthorInsightsState, "manualCommentsByAuthorLogin">,
  ): AuthorManualComment[] => {
    const normalizedAuthorLogin = normalizeActorLogin(authorLogin);
    if (!normalizedAuthorLogin) {
      return [];
    }

    const comments =
      authorInsightsState.manualCommentsByAuthorLogin?.[normalizedAuthorLogin];
    return Array.isArray(comments) ? comments : [];
  };

  // Loads once per author: skipped while a load is running or once the
  // author's comments are present (a failed load stores [] plus an error).
  const loadAuthorManualComments = async (
    authorLogin: unknown,
    authorInsightsState: AuthorInsightsState,
    onComplete?: () => void,
  ): Promise<void> => {
    const normalizedAuthorLogin = normalizeActorLogin(authorLogin);
    if (!normalizedAuthorLogin) {
      return;
    }

    if (
      authorInsightsState.manualCommentsLoadingByAuthorLogin[normalizedAuthorLogin]
    ) {
      return;
    }
    if (
      Array.isArray(
        authorInsightsState.manualCommentsByAuthorLogin[normalizedAuthorLogin],
      )
    ) {
      return;
    }

    authorInsightsState.manualCommentsLoadingByAuthorLogin[normalizedAuthorLogin] =
      true;
    authorInsightsState.manualCommentsErrorByAuthorLogin[normalizedAuthorLogin] = "";

    try {
      const response = await fetchFn(
        `/view-prs/author-comments?authorLogin=${encodeURIComponent(normalizedAuthorLogin)}`,
      );
      const result: AuthorCommentsResult = await response.json();
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || "Failed to load author comments");
      }

      authorInsightsState.manualCommentsByAuthorLogin[normalizedAuthorLogin] =
        Array.isArray(result.comments) ? result.comments : [];
    } catch (error) {
      authorInsightsState.manualCommentsErrorByAuthorLogin[normalizedAuthorLogin] =
        (error as { message?: string })?.message || "Failed to load author comments";
      authorInsightsState.manualCommentsByAuthorLogin[normalizedAuthorLogin] = [];
    } finally {
      authorInsightsState.manualCommentsLoadingByAuthorLogin[normalizedAuthorLogin] =
        false;
      if (typeof onComplete === "function") {
        onComplete();
      }
    }
  };

  const saveAuthorManualComment = async <T = unknown>({
    authorLogin,
    note,
    sentiment,
    postJson,
  }: AuthorCommentInput & {
    postJson: (url: string, payload: unknown) => Promise<PostJsonResult<T>>;
  }): Promise<PostJsonResult<T>> => {
    const { response, result } = await postJson("/view-prs/author-comments", {
      authorLogin,
      note,
      sentiment,
    });
    return { response, result };
  };

  const updateAuthorManualComment = async <T = unknown>({
    authorLogin,
    id,
    note,
    sentiment,
  }: AuthorCommentInput & { id: unknown }): Promise<PostJsonResult<T>> => {
    const response = await fetchFn("/view-prs/author-comments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authorLogin,
        id: String(id || ""),
        note,
        sentiment,
      }),
    });
    const result: T = await response.json();
    return { response, result };
  };

  return {
    AUTHOR_COMMENT_SENTIMENT_OPTIONS,
    getAuthorManualCommentsForLogin,
    loadAuthorManualComments,
    saveAuthorManualComment,
    updateAuthorManualComment,
  };
};

export { createPrAuthorInsightsDataHelpers };
