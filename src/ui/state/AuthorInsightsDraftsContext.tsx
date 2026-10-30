import { createContext, useContext } from 'react';
import type {
  AuthorCommentInput,
  AuthorManualComment,
  ManualCommentComposerDraft,
  ManualCommentEditDraft,
} from '../helpers/pr-author-insights-data.helpers.ts';
import type { AuthorInsightsDraftsState } from '../helpers/pr-auto-render-blocking.helpers.ts';
import type { PostJsonResult } from '../helpers/pr-http.helpers.ts';

/**
 * The Author Insights tab's manual-comment composer/edit drafts and
 * comments cache, owned by AuthorInsightsDraftsProvider.tsx.
 * AuthorInsightsCommentsSection.tsx uses all of it;
 * AutoRenderBlockingSync.tsx reads getDraftsSnapshot/getManualComments to
 * compute the auto-render-blocking state.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this app - AuthorInsightsCommentsSection rendered without an
 * <AuthorInsightsDraftsProvider> ancestor still works, it just never
 * persists a draft across its own remount, and saving fails (reported as a
 * failed save).
 */

// What POST/PUT /view-prs/author-comments return.
export interface AuthorCommentsResponse {
  ok?: boolean;
  error?: string;
  comments?: AuthorManualComment[];
}

export interface AuthorInsightsDraftsValue {
  getComposerDraft: (login: unknown) => ManualCommentComposerDraft;
  updateComposerDraft: (login: unknown, nextValues?: Record<string, unknown>) => ManualCommentComposerDraft;
  resetComposerDraft: (login: unknown) => void;
  getEditDraft: (login: unknown, comment?: AuthorManualComment) => ManualCommentEditDraft;
  getEditDraftMap: (login: unknown) => Record<string, ManualCommentEditDraft>;
  updateEditDraft: (
    login: unknown,
    commentId: unknown,
    nextValues?: Record<string, unknown>,
  ) => ManualCommentEditDraft | null;
  resetEditDraft: (login: unknown, commentId: unknown) => void;
  getManualComments: (login: unknown) => AuthorManualComment[];
  setManualComments: (login: unknown, comments: unknown) => void;
  getManualCommentsLoadState: (login: unknown) => { loading: boolean; error: string };
  loadManualComments: (login: unknown, onComplete?: () => void) => void | Promise<void>;
  saveManualComment: (input: AuthorCommentInput) => Promise<PostJsonResult<AuthorCommentsResponse>>;
  updateManualComment: (
    input: AuthorCommentInput & { id: unknown },
  ) => Promise<PostJsonResult<AuthorCommentsResponse>>;
  getDraftsSnapshot: () => AuthorInsightsDraftsState;
}

const noopDraft = () => ({ note: '', sentiment: 'neutral' });
const noProvider = async (): Promise<never> => {
  throw new Error('No AuthorInsightsDraftsProvider');
};

export const AuthorInsightsDraftsContext = createContext<AuthorInsightsDraftsValue>({
  getComposerDraft: noopDraft,
  updateComposerDraft: noopDraft,
  resetComposerDraft: () => {},
  getEditDraft: (_login, comment) => ({
    note: String(comment?.note || ''),
    sentiment: comment?.sentiment || 'neutral',
    isEditing: false,
  }),
  getEditDraftMap: () => ({}),
  updateEditDraft: () => null,
  resetEditDraft: () => {},
  getManualComments: () => [],
  setManualComments: () => {},
  getManualCommentsLoadState: () => ({ loading: false, error: '' }),
  loadManualComments: () => {},
  saveManualComment: noProvider,
  updateManualComment: noProvider,
  getDraftsSnapshot: () => ({
    manualCommentDraftByAuthorLogin: {},
    manualCommentEditDraftByAuthorLogin: {},
  }),
});

export function useAuthorInsightsDrafts(): AuthorInsightsDraftsValue {
  return useContext(AuthorInsightsDraftsContext);
}

/**
 * The Provider's write counter, bumped on every draft/comment-cache change.
 * A separate Context so only the one component that needs to react to
 * every change (AutoRenderBlockingSync) re-renders on each keystroke - the
 * Context above stays stable.
 */
export const AuthorInsightsDraftsVersionContext = createContext(0);

export function useAuthorInsightsDraftsVersion(): number {
  return useContext(AuthorInsightsDraftsVersionContext);
}
