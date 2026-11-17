import type { NormalizeActorLogin } from "./pr-actor-identity.helpers.ts";
import type {
  AuthorInsightsState,
  AuthorManualComment,
  ManualCommentComposerDraft,
  ManualCommentEditDraft,
} from "./pr-author-insights-data.helpers.ts";
import { comparePrEntryKeys, isPrEntryKey } from "./pr-entry-keys.helpers.ts";

// What's holding back automatic data refreshes, for the "Auto update
// paused" indicator: the "Blocking PRs: acme/api#1, acme/web#2 (+3 more)"
// label (PR keys), and which
// authors have unsaved Author Insights comment drafts (a dirty new-comment
// composer, or an edit in progress that differs from the saved comment).

// The drafts part of the Author Insights state (getDraftsSnapshot()).
export type AuthorInsightsDraftsState = Pick<
  AuthorInsightsState,
  "manualCommentDraftByAuthorLogin" | "manualCommentEditDraftByAuthorLogin"
>;

export interface PrAutoRenderBlockingDeps {
  normalizePrKey?: (value: unknown) => string;
  normalizeActorLogin?: NormalizeActorLogin;
  isAuthorInsightsComposerDraftDirty?: (draft: ManualCommentComposerDraft | undefined) => boolean;
  getAuthorManualCommentsForLogin?: (authorLogin: string) => AuthorManualComment[];
  isAuthorInsightsEditDraftDirty?: (savedComment: AuthorManualComment, draft: ManualCommentEditDraft) => boolean;
  getAuthorInsightsDisplayName?: (authorLogin: string) => string;
}

const createPrAutoRenderBlockingHelpers = ({
  normalizePrKey,
  normalizeActorLogin,
  isAuthorInsightsComposerDraftDirty,
  getAuthorManualCommentsForLogin,
  isAuthorInsightsEditDraftDirty,
  getAuthorInsightsDisplayName,
}: PrAutoRenderBlockingDeps = {}) => {
  const normalizePrKeySafe =
    typeof normalizePrKey === "function"
      ? normalizePrKey
      : (value: unknown) => {
          const normalized = String(value || "").trim();
          return isPrEntryKey(normalized) ? normalized : "";
        };
  const normalizeActorLoginSafe =
    typeof normalizeActorLogin === "function"
      ? normalizeActorLogin
      : (value: unknown) => String(value || "").trim().toLowerCase();
  const isAuthorInsightsComposerDraftDirtySafe =
    typeof isAuthorInsightsComposerDraftDirty === "function"
      ? isAuthorInsightsComposerDraftDirty
      : () => false;
  const getAuthorManualCommentsForLoginSafe =
    typeof getAuthorManualCommentsForLogin === "function"
      ? getAuthorManualCommentsForLogin
      : (): AuthorManualComment[] => [];
  const isAuthorInsightsEditDraftDirtySafe =
    typeof isAuthorInsightsEditDraftDirty === "function"
      ? isAuthorInsightsEditDraftDirty
      : () => false;
  const getAuthorInsightsDisplayNameSafe =
    typeof getAuthorInsightsDisplayName === "function"
      ? getAuthorInsightsDisplayName
      : (value: string) => String(value || "").trim();

  const formatBlockingPrKeysLabel = (prKeys: unknown, maxVisible: number = 6): string => {
    const normalized = Array.from(
      new Set(
        (Array.isArray(prKeys) ? prKeys : [])
          .map(normalizePrKeySafe)
          .filter(Boolean),
      ),
    ).sort(comparePrEntryKeys);

    if (!normalized.length) {
      return "";
    }

    const visible = normalized.slice(0, Math.max(1, Number(maxVisible) || 6));
    const suffix =
      normalized.length > visible.length
        ? ` (+${normalized.length - visible.length} more)`
        : "";
    return `Blocking PRs: ${visible.join(", ")}${suffix}`;
  };

  const getBlockingAuthorInsightsLogins = (authorInsightsState: AuthorInsightsDraftsState = {}): string[] => {
    const blockingLogins = new Set<string>();

    Object.entries(authorInsightsState.manualCommentDraftByAuthorLogin || {}).forEach(
      ([authorLogin, draft]) => {
        if (isAuthorInsightsComposerDraftDirtySafe(draft)) {
          blockingLogins.add(normalizeActorLoginSafe(authorLogin));
        }
      },
    );

    Object.entries(
      authorInsightsState.manualCommentEditDraftByAuthorLogin || {},
    ).forEach(([authorLogin, draftMap]) => {
      const savedComments = getAuthorManualCommentsForLoginSafe(authorLogin);
      const savedCommentById = new Map(
        savedComments.map((comment) => [String(comment?.id || "").trim(), comment]),
      );

      Object.entries(draftMap || {}).forEach(([commentId, draft]) => {
        const savedComment = savedCommentById.get(String(commentId || "").trim());
        if (
          draft?.isEditing === true &&
          savedComment &&
          isAuthorInsightsEditDraftDirtySafe(savedComment, draft)
        ) {
          blockingLogins.add(normalizeActorLoginSafe(authorLogin));
        }
      });
    });

    return Array.from(blockingLogins)
      .map((authorLogin) => normalizeActorLoginSafe(authorLogin))
      .filter(Boolean)
      .sort((a, b) =>
        getAuthorInsightsDisplayNameSafe(a).localeCompare(
          getAuthorInsightsDisplayNameSafe(b),
        ),
      );
  };

  return {
    formatBlockingPrKeysLabel,
    getBlockingAuthorInsightsLogins,
  };
};

export { createPrAutoRenderBlockingHelpers };
