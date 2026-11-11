import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Which rules Settings › Rules is editing: those for every repo (`scopeRepo`
 * ""), or one repo's own (repo-rules.helpers.ts). One choice for the three
 * Rules sections, so it stays as you move between them; not saved - the
 * drawer opens on every repo's rules after a reload.
 */
export interface RulesScopeValue {
  scopeRepo: string;
  setScopeRepo: (repo: string) => void;
}

export const RulesScopeContext = createContext<RulesScopeValue>({ scopeRepo: '', setScopeRepo: () => {} });

export function RulesScopeProvider({ children }: { children?: ReactNode }) {
  const [scopeRepo, setScopeRepo] = useState('');
  const value = useMemo(() => ({ scopeRepo, setScopeRepo }), [scopeRepo]);
  return <RulesScopeContext.Provider value={value}>{children}</RulesScopeContext.Provider>;
}

export function useRulesScope(): RulesScopeValue {
  return useContext(RulesScopeContext);
}
