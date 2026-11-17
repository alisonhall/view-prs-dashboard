import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPrUiOptionPersistenceHelpers } from '../../helpers/pr-ui-option-persistence.helpers.ts';
import {
  boostedPriorities,
  formatMinutes,
  intervalKey,
  listSourceRepos,
  normalizeSchedulerRepoConfig,
  parseMinutes,
  parsePriorityBoost,
  SCHEDULER_REPO_CONFIG_KEY,
  TASK_TYPES,
  withoutRepo,
  withRepoSetting,
  type DispatcherSettingsDefaults,
  type ParsedField,
  type SchedulerRepoConfig,
} from '../../helpers/background-updates.helpers.ts';
import { Button } from '../ui/Button';
import { useOptionalPrData } from '../../state/PrDataContext';
import { useSettingsDrawer } from '../../state/SettingsDrawerContext';

const { readUiSessionOverridesOrNull, updateUiSessionOverride } = createPrUiOptionPersistenceHelpers({
  fetch: (input, init) => fetch(input, init),
});

type Status = { kind: 'loading' } | { kind: 'ready'; defaults: DispatcherSettingsDefaults } | { kind: 'error'; message: string };

const draftKey = (repo: string, key: string) => `${repo}::${key}`;

// How long typing pauses before a change is saved. Saving each keystroke
// would save "1" on the way to "15" - and as the server applies a new
// interval on its next tick, that could start a check nobody asked for.
export const SAVE_DELAY_MS = 800;

/**
 * The Settings drawer's "Background updates": per repo, how often each of
 * the server's background checks runs and how much its work is preferred
 * over other repos' (schedulerRepoConfig in user-defaults.json - only what
 * differs from the defaults, which the server reports). A valid change is
 * saved once typing pauses, or the field is left; the server picks it up
 * on its next tick (about 5 seconds), without a restart. Lazy-loaded the
 * first time it's opened.
 *
 * Lists every repo in Sources (listSourceRepos), saying how it's
 * followed, then any other repo the server checks, then any with saved
 * settings but no checks now. Which repos the server checks it asks again
 * whenever the sources change. Sources' "Timing…" opens it at a repo
 * (backgroundUpdatesFocus): that repo's first field is focused.
 */
export function BackgroundUpdatesSection() {
  // The saved settings (user-defaults.json), read once.
  const [saved, setSaved] = useState<{ kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }>({ kind: 'loading' });
  // The server's defaults and the repos it checks, as of the sources
  // `forKey` names (sourceReposKey when asked).
  const [server, setServer] = useState<
    { kind: 'loading' } | { kind: 'ready'; defaults: DispatcherSettingsDefaults; forKey: string } | { kind: 'error'; message: string }
  >({ kind: 'loading' });
  const [config, setConfig] = useState<SchedulerRepoConfig>({});
  // What's typed in each field, until it's left valid (then the saved value shows).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const idPrefix = useId();
  const sources = useOptionalPrData()?.payload?.dataMeta?.sources ?? null;
  const sourceRepos = useMemo(() => listSourceRepos(sources), [sources]);
  const sourceReposKey = sourceRepos.map(({ repo }) => repo).join(' ');
  const { backgroundUpdatesFocus } = useSettingsDrawer();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const overrides = await readUiSessionOverridesOrNull();
        // Not the defaults: the saved settings would show as cleared.
        if (!overrides) throw new Error("the saved settings couldn't be read");
        if (cancelled) return;
        setConfig(normalizeSchedulerRepoConfig(overrides[SCHEDULER_REPO_CONFIG_KEY]));
        setSaved({ kind: 'ready' });
      } catch (error) {
        if (!cancelled) setSaved({ kind: 'error', message: (error as Error).message || String(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Which repos the server checks follows the sources: asked when the
  // section mounts, and again whenever a source's repo is added or
  // removed. Only the latest question's answer is kept. After the first
  // answer, a failed one keeps the last (its sources are named, so notes
  // that depend on them wait).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/view-prs/dispatcher/settings');
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${response.status}`);
        if (cancelled) return;
        setServer({
          kind: 'ready',
          forKey: sourceReposKey,
          defaults: {
            repos: Array.isArray(payload.repos) ? payload.repos : [],
            taskTypes: Array.isArray(payload.taskTypes) ? payload.taskTypes : [],
          },
        });
      } catch (error) {
        if (cancelled) return;
        setServer((previous) => (previous.kind === 'ready' ? previous : { kind: 'error', message: (error as Error).message || String(error) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceReposKey]);

  let status: Status;
  if (saved.kind === 'error') status = saved;
  else if (server.kind === 'error') status = server;
  else if (saved.kind === 'ready' && server.kind === 'ready') status = { kind: 'ready', defaults: server.defaults };
  else status = { kind: 'loading' };
  // Whether the server's answer is about the sources shown: until it is,
  // nothing is said about which repos it checks.
  const isServerCurrent = server.kind === 'ready' && server.forKey === sourceReposKey;

  // Sources' "Timing…": once the repo is listed, scroll to it and focus
  // its first field - once per request. A repo just added to the sources
  // may be listed a moment later, when the data catches up.
  const repoRefs = useRef(new Map<string, HTMLFieldSetElement>());
  const handledFocusRef = useRef(0);
  const isReady = status.kind === 'ready';
  useEffect(() => {
    if (!backgroundUpdatesFocus || !isReady || handledFocusRef.current === backgroundUpdatesFocus.requestedAt) return;
    const fieldset = repoRefs.current.get(backgroundUpdatesFocus.repo);
    if (!fieldset) return;
    handledFocusRef.current = backgroundUpdatesFocus.requestedAt;
    fieldset.scrollIntoView?.({ block: 'start' });
    fieldset.querySelector('input')?.focus();
  }, [backgroundUpdatesFocus, isReady, sourceReposKey]);

  // Changes build on the latest config, and saves go one at a time in
  // order (each reads user-defaults.json and writes it back), so quick
  // typing can't save an older value last.
  const configRef = useRef(config);
  configRef.current = config;
  const savingRef = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback((next: SchedulerRepoConfig) => {
    configRef.current = next;
    setConfig(next);
    savingRef.current = savingRef.current.then(() =>
      updateUiSessionOverride(SCHEDULER_REPO_CONFIG_KEY, Object.keys(next).length > 0 ? next : undefined),
    );
  }, []);

  // Valid changes waiting for typing to pause, by field; saved together.
  const pendingRef = useRef(new Map<string, { repo: string; key: string; value: number | undefined }>());
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    if (pendingRef.current.size === 0) return;
    let next = configRef.current;
    for (const { repo, key, value } of pendingRef.current.values()) next = withRepoSetting(next, repo, key, value);
    pendingRef.current.clear();
    save(next);
  }, [save]);
  // Closing the drawer mid-typing still saves what was typed.
  useEffect(() => flush, [flush]);

  const handleChange = (repo: string, key: string, text: string, parsed: ParsedField) => {
    setDrafts((previous) => ({ ...previous, [draftKey(repo, key)]: text }));
    clearTimeout(timerRef.current);
    // What's showing is what gets saved: an invalid value cancels an
    // earlier valid one still waiting.
    if (parsed.kind === 'error') pendingRef.current.delete(draftKey(repo, key));
    else pendingRef.current.set(draftKey(repo, key), { repo, key, value: parsed.kind === 'value' ? parsed.value : undefined });
    if (pendingRef.current.size > 0) timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  };
  const handleBlur = (repo: string, key: string, parsed: ParsedField) => {
    flush();
    if (parsed.kind === 'error') return;
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[draftKey(repo, key)];
      return next;
    });
  };
  const handleRestore = (repo: string) => {
    setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${repo}::`))));
    for (const key of [...pendingRef.current.keys()]) if (key.startsWith(`${repo}::`)) pendingRef.current.delete(key);
    flush();
    save(withoutRepo(configRef.current, repo));
  };

  if (status.kind === 'loading') {
    return (
      <div className="settings-section">
        <p className="subtle-copy">Loading…</p>
      </div>
    );
  }
  if (status.kind === 'error') {
    return (
      <div className="settings-section">
        <p className="settings-error" role="alert">
          Couldn&apos;t load the background update settings: {status.message}
        </p>
      </div>
    );
  }

  const { defaults } = status;
  const scheduled = new Set(defaults.repos);
  const followedByRepo = new Map(sourceRepos.map(({ repo, followed }) => [repo, followed]));
  const listed = [...followedByRepo.keys(), ...defaults.repos.filter((repo) => !followedByRepo.has(repo))];
  const listedSet = new Set(listed);
  const repos = [...listed, ...Object.keys(config).filter((repo) => !listedSet.has(repo)).sort()];
  // What's said under a repo's name: how Sources follows it, and why it
  // isn't checked when it isn't.
  const describeRepo = (repo: string) => {
    const followed = followedByRepo.get(repo);
    if (!followed) {
      if (scheduled.has(repo)) return '';
      return sources ? 'Not in your sources, so not checked; its saved settings wait.' : 'Not checked now; its saved settings wait.';
    }
    const fromSources = `From your sources: ${followed}.`;
    return scheduled.has(repo) || !isServerCurrent
      ? fromSources
      : `${fromSources} Not checked now: the PRs it follows by number were all merged or closed over 30 days ago.`;
  };
  const defaultPriorities = defaults.taskTypes.map(({ taskType, priority }) => `${labelOf(taskType)} ${priority}`).join(', ');

  return (
    <div className="settings-section">
      <div className="settings-group">
        <p className="settings-hint">While the server runs, it checks each followed repo in the background, on three timers:</p>
        <ul className="settings-hint settings-hint-list">
          <li>
            <strong>Quick check</strong>: asks GitHub which of the repo&apos;s PRs changed, without fetching them, and fetches
            those that did straight after.
          </li>
          <li>
            <strong>Full refresh</strong>: a safety net - fetches the PRs that changed since their last fetch, and open ones
            not fetched in full for 4 hours.
          </li>
          <li>
            <strong>Merged/closed drain</strong>: fetches the merged and closed PRs a quick check found changed.
          </li>
        </ul>
        <p className="settings-hint">
          The priority boost puts a repo&apos;s checks ahead of other repos&apos; when several are due at once (or behind them,
          below 0). Leave a field empty for its default. A change applies within a few seconds.
        </p>
      </div>
      {repos.length === 0 && <p className="subtle-copy">No repos are checked in the background yet.</p>}
      {repos.map((repo, index) => {
        const settings = config[repo] || {};
        const fieldId = (key: string) => `${idPrefix}repo-${index}-${key}`;
        // What a field shows and how it reads: what's typed, else the saved
        // value. A saved value the form wouldn't take (a hand-edited file)
        // isn't flagged - the server still applies it - just noted.
        const fieldState = (key: string, saved: string, parse: (text: string) => ParsedField) => {
          const draft = drafts[draftKey(repo, key)];
          const text = draft ?? saved;
          const parsed = parse(text);
          if (draft === undefined && parsed.kind === 'error') {
            return { text, parsed: { kind: 'empty' } as ParsedField, note: "Saved outside this form's range; it still applies." };
          }
          return { text, parsed, note: undefined };
        };

        const boost = fieldState('priority', typeof settings.priority === 'number' ? String(settings.priority) : '', parsePriorityBoost);
        const effectiveBoost =
          boost.parsed.kind === 'value' ? boost.parsed.value : typeof settings.priority === 'number' ? settings.priority : 0;

        return (
          <fieldset
            key={repo}
            ref={(node) => {
              if (node) repoRefs.current.set(repo, node);
              else repoRefs.current.delete(repo);
            }}
            className="settings-group settings-fieldset settings-repo"
            aria-describedby={describeRepo(repo) ? fieldId('about') : undefined}
          >
            <legend className="settings-repo-name">{repo}</legend>
            {describeRepo(repo) && (
              <p className="settings-hint" id={fieldId('about')}>
                {describeRepo(repo)}
              </p>
            )}
            <div className="settings-repo-fields">
              <Field
                id={fieldId('priority')}
                label="Priority boost"
                text={boost.text}
                parsed={boost.parsed}
                note={boost.note}
                placeholder="0"
                inputMode="numeric"
                onChange={(text) => handleChange(repo, 'priority', text, parsePriorityBoost(text))}
                onBlur={() => handleBlur(repo, 'priority', boost.parsed)}
              />
              {TASK_TYPES.map(({ taskType, label }) => {
                const key = intervalKey(taskType);
                const saved = settings[key];
                const { text, parsed, note } = fieldState(key, typeof saved === 'number' ? formatMinutes(saved) : '', parseMinutes);
                const fallback = defaults.taskTypes.find((entry) => entry.taskType === taskType)?.intervalMs;
                return (
                  <Field
                    key={key}
                    id={fieldId(key)}
                    label={`${label} every`}
                    unit="min"
                    text={text}
                    parsed={parsed}
                    note={note}
                    placeholder={fallback ? formatMinutes(fallback) : ''}
                    inputMode="decimal"
                    onChange={(next) => handleChange(repo, key, next, parseMinutes(next))}
                    onBlur={() => handleBlur(repo, key, parsed)}
                  />
                );
              })}
            </div>
            <p className="settings-hint">
              {effectiveBoost === 0
                ? `Priorities: ${defaultPriorities}. When several checks are due, the highest goes first.`
                : `Priorities with the boost: ${boostedPriorities(defaults.taskTypes, effectiveBoost)
                    .map(({ taskType, priority }) => `${labelOf(taskType)} ${priority}`)
                    .join(', ')} (defaults ${defaultPriorities}).`}
            </p>
            <div className="settings-actions">
              <Button onClick={() => handleRestore(repo)} disabled={!config[repo] && !hasDrafts(drafts, repo)}>
                Restore defaults for {repo}
              </Button>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

const labelOf = (taskType: string) => TASK_TYPES.find((entry) => entry.taskType === taskType)?.label ?? taskType;
const hasDrafts = (drafts: Record<string, string>, repo: string) => Object.keys(drafts).some((key) => key.startsWith(`${repo}::`));

function Field({
  id,
  label,
  unit,
  text,
  parsed,
  note,
  placeholder,
  inputMode,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  unit?: string;
  text: string;
  parsed: ParsedField;
  note?: string;
  placeholder: string;
  inputMode: 'numeric' | 'decimal';
  onChange: (text: string) => void;
  onBlur: () => void;
}) {
  const error = parsed.kind === 'error' ? parsed.message : null;
  const description = error ?? note;
  return (
    <div className="settings-field settings-repo-field">
      <label htmlFor={id}>{label}</label>
      <span className="settings-input-unit">
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          value={text}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={description ? `${id}-description` : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        {unit && <span aria-hidden="true">{unit}</span>}
      </span>
      {description && (
        <span id={`${id}-description`} className={error ? 'settings-field-error' : 'settings-field-note'}>
          {description}
        </span>
      )}
    </div>
  );
}
