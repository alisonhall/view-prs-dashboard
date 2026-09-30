import { createContext, useContext } from 'react';
import { createPrNeedsAttentionHelpers } from '../helpers/pr-needs-attention.helpers.js';

/**
 * Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): "needs attention"
 * classification (shouldShowNeedsAttention/entryNeedsAttention) plus the
 * "Needs Attention rules" config (NO_ACTIVITY handling mode, pending
 * comments, merge-only commits, etc.) used to be 3 window.* bridges
 * (window.entryNeedsAttention, window.getNeedsAttentionConfig,
 * window.shouldShowNeedsAttention) assigned by index.page.js.
 * NeedsAttentionProvider (components/NeedsAttentionProvider.jsx) derives
 * both the config and the classification helpers instead (config fields
 * are all Context-native, Phase 6, FilterStateProvider - see that
 * component's own comment for why it reads them fresh each render rather
 * than subscribing to Context directly), and PrTableApp reads them through
 * this Context - `attentionConfig` is a real object, used directly as a
 * useMemo dependency (replacing the old attentionConfigVersion counter +
 * manual document.addEventListener("change", ...) listener that used to be
 * the only way to notice these vanilla-DOM-owned fields had changed).
 *
 * Default value (factory called with no arguments) matches every
 * consuming component's old permissive `window.x || fallback` behavior, so
 * a component rendered without a <NeedsAttentionProvider> ancestor still
 * gets sane, config-unaware behavior with no wrapping required.
 */
export const defaultNeedsAttention = {
  ...createPrNeedsAttentionHelpers(),
  attentionConfig: {},
};

export const NeedsAttentionContext = createContext(defaultNeedsAttention);

export function useNeedsAttention() {
  return useContext(NeedsAttentionContext);
}
