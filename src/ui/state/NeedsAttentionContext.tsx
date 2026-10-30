import { createContext, useContext } from 'react';
import { createPrNeedsAttentionHelpers, type AttentionConfig } from '../helpers/pr-needs-attention.helpers.ts';

/**
 * "Needs attention" classification (shouldShowNeedsAttention/
 * entryNeedsAttention) plus the attention rules' config they apply.
 * NeedsAttentionProvider derives both from the Settings drawer's rule
 * fields (FilterStateContext), and PrTableApp reads them here
 * - `attentionConfig` is a real object, used directly as a useMemo
 * dependency, so the table updates as soon as a rule changes.
 *
 * Default value (factory called with no arguments) is permissive and
 * config-unaware, so a component rendered without a
 * <NeedsAttentionProvider> ancestor still gets sane behavior with no
 * wrapping required.
 */
export type NeedsAttentionValue = ReturnType<typeof createPrNeedsAttentionHelpers> & {
  attentionConfig: AttentionConfig;
};

export const defaultNeedsAttention: NeedsAttentionValue = {
  ...createPrNeedsAttentionHelpers(),
  attentionConfig: {},
};

export const NeedsAttentionContext = createContext<NeedsAttentionValue>(defaultNeedsAttention);

export function useNeedsAttention(): NeedsAttentionValue {
  return useContext(NeedsAttentionContext);
}
