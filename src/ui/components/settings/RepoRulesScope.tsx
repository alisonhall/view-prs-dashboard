import { useId, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { useFilterOptions } from '../../state/FilterOptionsContext';
import { useFilterState } from '../../state/FilterStateContext';
import { useRulesScope } from '../../state/RulesScopeContext';
import { useRuleGroup } from '../../state/useRuleField';
import { reposWithRules, repoRulesKey, type RuleGroupId } from '../../helpers/repo-rules.helpers.ts';

/**
 * Settings › Rules for every repo or one repo (repo-rules.helpers.ts): the
 * picker at the top of each Rules section, the groups a repo can have its
 * own rules for (RepoRuleGroup), and a note on those it can't.
 */

// "acme/api", "acme/api and acme/web", "acme/api, acme/web and acme/ui".
const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// One at the top of each Rules section - all three stay in the page (the
// drawer keeps hidden sections), so each has ids of its own.
export function RulesScopePicker() {
  const id = useId();
  const { scopeRepo, setScopeRepo } = useRulesScope();
  const { repoOptions } = useFilterOptions();
  const { values } = useFilterState();
  const withRules = reposWithRules(values.repoRules);
  const withRulesKeys = new Set(withRules.map((repo) => repo.toLowerCase()));
  // The repos with stored PRs, those with rules of their own, and the one
  // being edited - which may have neither once its rules are taken away (a
  // repo no longer followed), and would otherwise show as "All repos".
  const repos = Array.from(
    new Map(
      [...repoOptions.map((option) => option.value), ...withRules, ...(scopeRepo ? [scopeRepo] : [])].map((repo) => [repo.toLowerCase(), repo]),
    ).values(),
  ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const selected = scopeRepo ? repos.find((repo) => repo.toLowerCase() === scopeRepo.toLowerCase()) || scopeRepo : '';

  return (
    <div className="settings-group rules-scope">
      <div className="settings-field">
        <label htmlFor={`${id}-repo`}>Rules for</label>
        <select
          id={`${id}-repo`}
          className="rules-scope-repo"
          aria-describedby={`${id}-hint`}
          value={selected}
          onChange={(event) => setScopeRepo(event.target.value)}
        >
          <option value="">All repos</option>
          {repos.map((repo) => (
            <option key={repo} value={repo}>
              {withRulesKeys.has(repo.toLowerCase()) ? `${repo} (has its own rules)` : repo}
            </option>
          ))}
        </select>
        <p id={`${id}-hint`} className="settings-hint">
          {selected
            ? `The rules ${selected}'s PRs follow. Each group that can differ per repo says whether ${selected} follows every repo's rules or has its own; the rest are the same for every repo.`
            : `The rules for every repo. Pick a repo to give it its own for a group marked "Can differ per repo".${withRules.length > 0 ? ` With their own rules: ${joinNames(withRules)}.` : ''}`}
        </p>
      </div>
    </div>
  );
}

// A group a repo can have its own rules for. On every repo's rules, its
// controls edit those, and it says which repos have their own. On a repo's:
// whether it has its own (its controls editing them) or uses every repo's
// (shown, not editable), with the button to change that.
export function RepoRuleGroup({ group, children }: { group: RuleGroupId; children?: ReactNode }) {
  const { scopeRepo, isOwn, makeOwn, clearOwn, reposWithOwn } = useRuleGroup(group);
  const { values } = useFilterState();
  const repoName = repoRulesKey(values.repoRules, scopeRepo) || scopeRepo;

  if (!scopeRepo) {
    return (
      <>
        <p className="settings-hint repo-rules-tag">
          Can differ per repo
          {reposWithOwn.length > 0 && ` · ${joinNames(reposWithOwn)} ${reposWithOwn.length === 1 ? 'has its' : 'have their'} own`}
        </p>
        {children}
      </>
    );
  }
  return (
    <>
      <div className="repo-rules-status" data-own={isOwn ? 'true' : undefined}>
        <p className="settings-hint">
          {isOwn ? `${repoName}'s own rules, followed instead of the ones for every repo.` : `${repoName} follows the rules for every repo (shown).`}
        </p>
        {isOwn ? (
          <Button onClick={clearOwn}>Use the rules for every repo</Button>
        ) : (
          <Button onClick={makeOwn}>Give {repoName} its own</Button>
        )}
      </div>
      <fieldset className="repo-rules-fieldset" disabled={!isOwn}>
        <legend className="ui-visually-hidden">{isOwn ? `${repoName}'s own rules` : 'The rules for every repo'}</legend>
        {children}
      </fieldset>
    </>
  );
}

// On a repo's rules: a note on a group that's the same for every repo (its
// controls still edit those).
export function SameForEveryRepoNote() {
  const { scopeRepo } = useRulesScope();
  if (!scopeRepo) return null;
  return <p className="settings-hint repo-rules-tag">The same for every repo - changing it here changes it for all of them.</p>;
}
