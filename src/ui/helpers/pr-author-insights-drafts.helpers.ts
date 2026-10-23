import type { NormalizeActorLogin } from "./pr-actor-identity.helpers.ts";
import type {
  AuthorInsightsState,
  AuthorManualComment,
  ManualCommentComposerDraft,
  ManualCommentEditDraft,
} from "./pr-author-insights-data.helpers.ts";

// Author Insights' unsaved comment drafts, kept in the shared mutable
// state object (AuthorInsightsDraftsProvider's ref): one new-comment
// composer draft per author, and one edit draft per saved comment being
// edited, plus whether each differs from what's saved.

const DEFAULT_AUTHOR_INSIGHTS_SENTIMENT = "neutral";

// The part of AuthorInsightsState these helpers read and fill in.
type DraftsState = Pick<
  AuthorInsightsState,
  "manualCommentDraftByAuthorLogin" | "manualCommentEditDraftByAuthorLogin" | "manualCommentsByAuthorLogin"
>;

export interface PrAuthorInsightsDraftsDeps {
  authorInsightsState?: Partial<DraftsState> | null;
  normalizeActorLogin?: NormalizeActorLogin;
}

type DraftValues = Record<string, unknown>;

const hasOwn = (values: DraftValues, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(values, key);

const createPrAuthorInsightsDraftsHelpers = ({
  authorInsightsState,
  normalizeActorLogin,
}: PrAuthorInsightsDraftsDeps = {}) => {
  // Fills in any missing maps on the caller's own object (it's shared, so
  // this mutates it on purpose).
  const state = (
    authorInsightsState && typeof authorInsightsState === "object" ? authorInsightsState : {}
  ) as Partial<DraftsState>;
  if (!state.manualCommentDraftByAuthorLogin) {
    state.manualCommentDraftByAuthorLogin = {};
  }
  if (!state.manualCommentEditDraftByAuthorLogin) {
    state.manualCommentEditDraftByAuthorLogin = {};
  }
  if (!state.manualCommentsByAuthorLogin) {
    state.manualCommentsByAuthorLogin = {};
  }
  // Read on every call, as before conversion, in case a map is replaced.
  const composerDrafts = () => state.manualCommentDraftByAuthorLogin ?? (state.manualCommentDraftByAuthorLogin = {});
  const editDrafts = () =>
    state.manualCommentEditDraftByAuthorLogin ?? (state.manualCommentEditDraftByAuthorLogin = {});

  const normalizeActorLoginSafe =
    typeof normalizeActorLogin === "function"
      ? normalizeActorLogin
      : (value: unknown) => String(value || "").trim().toLowerCase();

  const normalizeAuthorInsightsSentiment = (value: unknown): string => {
    const normalized = String(value || DEFAULT_AUTHOR_INSIGHTS_SENTIMENT)
      .trim()
      .toLowerCase();
    return ["positive", "negative", "neutral"].includes(normalized)
      ? normalized
      : DEFAULT_AUTHOR_INSIGHTS_SENTIMENT;
  };

  const createAuthorInsightsComposerDraft = (): ManualCommentComposerDraft => ({
    note: "",
    sentiment: DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
  });

  const getAuthorInsightsComposerDraft = (authorLogin: unknown): ManualCommentComposerDraft => {
    const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
    if (!normalizedAuthorLogin) {
      return createAuthorInsightsComposerDraft();
    }

    const existingDraft = composerDrafts()[normalizedAuthorLogin];
    if (existingDraft && typeof existingDraft === "object") {
      return existingDraft;
    }

    const nextDraft = createAuthorInsightsComposerDraft();
    composerDrafts()[normalizedAuthorLogin] = nextDraft;
    return nextDraft;
  };

  const updateAuthorInsightsComposerDraft = (
    authorLogin: unknown,
    nextValues: DraftValues = {},
  ): ManualCommentComposerDraft => {
    const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
    if (!normalizedAuthorLogin) {
      return createAuthorInsightsComposerDraft();
    }

    const currentDraft = getAuthorInsightsComposerDraft(normalizedAuthorLogin);
    const nextDraft = {
      note: hasOwn(nextValues, "note")
        ? String(nextValues.note || "")
        : String(currentDraft.note || ""),
      sentiment: hasOwn(nextValues, "sentiment")
        ? normalizeAuthorInsightsSentiment(nextValues.sentiment)
        : normalizeAuthorInsightsSentiment(currentDraft.sentiment),
    };
    composerDrafts()[normalizedAuthorLogin] = nextDraft;
    return nextDraft;
  };

  const resetAuthorInsightsComposerDraft = (authorLogin: unknown): void => {
    const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
    if (!normalizedAuthorLogin) {
      return;
    }
    composerDrafts()[normalizedAuthorLogin] = createAuthorInsightsComposerDraft();
  };

  const isAuthorInsightsComposerDraftDirty = (draft: ManualCommentComposerDraft = {}): boolean => {
    const note = String(draft.note || "");
    const sentiment = normalizeAuthorInsightsSentiment(draft.sentiment);
    return (
      Boolean(note.trim()) ||
      sentiment !== DEFAULT_AUTHOR_INSIGHTS_SENTIMENT
    );
  };

  const getAuthorInsightsEditDraftMap = (authorLogin: unknown): Record<string, ManualCommentEditDraft> => {
    const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
    if (!normalizedAuthorLogin) {
      return {};
    }
    const existingDraftMap = editDrafts()[normalizedAuthorLogin];
    if (existingDraftMap && typeof existingDraftMap === "object") {
      return existingDraftMap;
    }
    const nextDraftMap: Record<string, ManualCommentEditDraft> = {};
    editDrafts()[normalizedAuthorLogin] = nextDraftMap;
    return nextDraftMap;
  };

  const createAuthorInsightsEditDraft = (
    comment: AuthorManualComment = {},
    overrides: DraftValues = {},
  ): ManualCommentEditDraft => ({
    note: hasOwn(overrides, "note")
      ? String(overrides.note || "")
      : String(comment?.note || ""),
    sentiment: hasOwn(overrides, "sentiment")
      ? normalizeAuthorInsightsSentiment(overrides.sentiment)
      : normalizeAuthorInsightsSentiment(comment?.sentiment),
    isEditing: overrides.isEditing === true,
  });

  const getAuthorInsightsEditDraft = (
    authorLogin: unknown,
    comment: AuthorManualComment = {},
  ): ManualCommentEditDraft => {
    const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
    const commentId = String(comment?.id || "").trim();
    if (!normalizedAuthorLogin || !commentId) {
      return createAuthorInsightsEditDraft(comment);
    }

    const draftMap = getAuthorInsightsEditDraftMap(normalizedAuthorLogin);
    const existingDraft = draftMap[commentId];
    if (existingDraft && typeof existingDraft === "object") {
      return existingDraft;
    }

    const nextDraft = createAuthorInsightsEditDraft(comment);
    draftMap[commentId] = nextDraft;
    return nextDraft;
  };

  const updateAuthorInsightsEditDraft = (
    authorLogin: unknown,
    commentId: unknown,
    nextValues: DraftValues = {},
  ): ManualCommentEditDraft | null => {
    const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
    const normalizedCommentId = String(commentId || "").trim();
    if (!normalizedAuthorLogin || !normalizedCommentId) {
      return null;
    }

    const draftMap = getAuthorInsightsEditDraftMap(normalizedAuthorLogin);
    const currentDraft =
      draftMap[normalizedCommentId] || createAuthorInsightsEditDraft();
    const nextDraft = {
      note: hasOwn(nextValues, "note")
        ? String(nextValues.note || "")
        : String(currentDraft.note || ""),
      sentiment: hasOwn(nextValues, "sentiment")
        ? normalizeAuthorInsightsSentiment(nextValues.sentiment)
        : normalizeAuthorInsightsSentiment(currentDraft.sentiment),
      isEditing: hasOwn(nextValues, "isEditing")
        ? nextValues.isEditing === true
        : currentDraft.isEditing === true,
    };
    draftMap[normalizedCommentId] = nextDraft;
    return nextDraft;
  };

  const resetAuthorInsightsEditDraft = (authorLogin: unknown, commentId: unknown): void => {
    const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
    const normalizedCommentId = String(commentId || "").trim();
    if (!normalizedAuthorLogin || !normalizedCommentId) {
      return;
    }
    const draftMap = getAuthorInsightsEditDraftMap(normalizedAuthorLogin);
    delete draftMap[normalizedCommentId];
  };

  const isAuthorInsightsEditDraftDirty = (
    comment: AuthorManualComment = {},
    draft: ManualCommentEditDraft = {},
  ): boolean => {
    const commentNote = String(comment?.note || "");
    const commentSentiment = normalizeAuthorInsightsSentiment(comment?.sentiment);
    return (
      String(draft.note || "") !== commentNote ||
      normalizeAuthorInsightsSentiment(draft.sentiment) !== commentSentiment
    );
  };

  const getAuthorManualCommentsForLogin = (authorLogin: unknown): AuthorManualComment[] => {
    const normalizedAuthorLogin = normalizeActorLoginSafe(authorLogin);
    if (!normalizedAuthorLogin) {
      return [];
    }

    const comments = state.manualCommentsByAuthorLogin?.[normalizedAuthorLogin];
    return Array.isArray(comments) ? comments : [];
  };

  return {
    DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
    normalizeAuthorInsightsSentiment,
    getAuthorInsightsComposerDraft,
    updateAuthorInsightsComposerDraft,
    resetAuthorInsightsComposerDraft,
    isAuthorInsightsComposerDraftDirty,
    getAuthorInsightsEditDraftMap,
    getAuthorInsightsEditDraft,
    updateAuthorInsightsEditDraft,
    resetAuthorInsightsEditDraft,
    isAuthorInsightsEditDraftDirty,
    getAuthorManualCommentsForLogin,
  };
};

export { createPrAuthorInsightsDraftsHelpers, DEFAULT_AUTHOR_INSIGHTS_SENTIMENT };
