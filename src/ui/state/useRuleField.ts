import { useCallback, useMemo } from 'react';
import { useFilterState } from './FilterStateContext';
import { useRulesScope } from './RulesScopeContext';
import { useAuthorThreadResolutionSelection, type AuthorThreadResolutionListId } from './AuthorThreadResolutionSelectionContext';
import type { CheckedByListIdValue } from './useCheckedByListIdState';
import { useActorIdentity } from './ActorIdentityContext';
import {
  groupOfRuleKey,
  repoRulesFor,
  repoRulesKey,
  ruleFieldFromGroup,
  ruleGroupFromValues,
  withRepoRuleGroup,
  withRuleField,
  type RepoRules,
  type RuleGroupId,
} from '../helpers/repo-rules.helpers.ts';

/**
 * A rule control's value and setter (its FilterStateContext key): the one
 * for every repo, or - when Settings › Rules is on a repo that has its own
 * rules for the key's group - that repo's (repo-rules.helpers.ts). Any
 * other key is the plain FilterStateContext value, so the shared controls
 * (checkboxes, textareas) can use this whatever they edit.
 */
export function useRuleField(key: string): { value: unknown; setValue: (value: unknown) => void } {
  const { values, setValue } = useFilterState();
  const { scopeRepo } = useRulesScope();
  const group = groupOfRuleKey(key);
  const own = group && scopeRepo ? repoRulesFor(values.repoRules, scopeRepo) : null;
  const isOwn = Boolean(group && own && own[group] !== undefined);
  const setOwn = useCallback(
    (value: unknown) => {
      const rules = values.repoRules || {};
      const storedKey = repoRulesKey(rules, scopeRepo) || scopeRepo;
      setValue('repoRules', { ...rules, [storedKey]: withRuleField(repoRulesFor(rules, scopeRepo), key, value) });
    },
    [values.repoRules, scopeRepo, key, setValue],
  );
  const setGlobal = useCallback((value: unknown) => setValue(key, value), [key, setValue]);
  return isOwn && own ? { value: ruleFieldFromGroup(own, key), setValue: setOwn } : { value: values[key], setValue: setGlobal };
}

const THREAD_LISTS: Record<AuthorThreadResolutionListId, 'allow' | 'deny'> = {
  'attention-author-thread-resolution-allow-list': 'allow',
  'attention-author-thread-resolution-deny-list': 'deny',
};

/**
 * Settings › Rules' state for one group on the repo it's on: whether the
 * repo has its own rules for it, and giving it them (starting from every
 * repo's) or taking them away. Nothing on every repo's rules.
 */
export function useRuleGroup(group: RuleGroupId): {
  scopeRepo: string;
  isOwn: boolean;
  makeOwn: () => void;
  clearOwn: () => void;
  // The repos with their own rules for it (shown on every repo's rules).
  reposWithOwn: string[];
} {
  const { values, setValue } = useFilterState();
  const { scopeRepo } = useRulesScope();
  const selection = useAuthorThreadResolutionSelection();
  const rules = values.repoRules || {};
  const isOwn = Boolean(scopeRepo) && repoRulesFor(rules, scopeRepo)[group] !== undefined;
  const reposWithOwn = Object.keys(rules)
    .filter((repo) => rules[repo]?.[group] !== undefined)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const makeOwn = () => {
    if (!scopeRepo) return;
    const start = ruleGroupFromValues(group, values, {
      allow: selection.checkedByListId['attention-author-thread-resolution-allow-list'] ?? [],
      deny: selection.checkedByListId['attention-author-thread-resolution-deny-list'] ?? [],
    });
    setValue('repoRules', withRepoRuleGroup(rules, scopeRepo, group, start as RepoRules[typeof group]));
  };
  const clearOwn = () => {
    if (!scopeRepo) return;
    setValue('repoRules', withRepoRuleGroup(rules, scopeRepo, group, undefined));
  };
  return { scopeRepo, isOwn, makeOwn, clearOwn, reposWithOwn };
}

/**
 * The thread starters' allow/deny lists' picks to edit: every repo's
 * (AuthorThreadResolutionSelectionContext), or the repo's own when it has
 * its own thread resolution rules.
 */
export function useThreadResolutionSelection(): CheckedByListIdValue<AuthorThreadResolutionListId> {
  const global = useAuthorThreadResolutionSelection();
  const { values, setValue } = useFilterState();
  const { scopeRepo } = useRulesScope();
  // Each pick as its person's id now: one merged into another person
  // (Settings › People) is them - as every repo's picks are, by the lists'
  // seeding, which doesn't reach a repo's own.
  const { normalizeActorLogin } = useActorIdentity();
  const rules = values.repoRules;
  const own = scopeRepo ? repoRulesFor(rules, scopeRepo).threadResolution : undefined;
  return useMemo(() => {
    if (!own) return global;
    const current = (listId: AuthorThreadResolutionListId) =>
      Array.from(new Set(own[THREAD_LISTS[listId]].map((pick) => normalizeActorLogin(pick) || pick)));
    const write = (listId: AuthorThreadResolutionListId, next: string[]) => {
      const field = THREAD_LISTS[listId];
      setValue('repoRules', withRepoRuleGroup(rules, scopeRepo, 'threadResolution', { ...own, [field]: next }));
    };
    return {
      checkedByListId: {
        'attention-author-thread-resolution-allow-list': new Set(current('attention-author-thread-resolution-allow-list')),
        'attention-author-thread-resolution-deny-list': new Set(current('attention-author-thread-resolution-deny-list')),
      },
      toggle: (listId, value) => {
        const picks = current(listId);
        write(listId, picks.includes(value) ? picks.filter((item) => item !== value) : [...picks, value]);
      },
      setChecked: (listId, next) => write(listId, Array.isArray(next) ? next.map(String) : []),
    };
  }, [own, global, rules, scopeRepo, setValue, normalizeActorLogin]);
}
