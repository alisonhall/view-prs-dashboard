import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

/**
 * A dropdown of checkboxes (`<details class="multi-select-dropdown">`):
 * the summary names it and says how many are picked; the list is a group
 * named the same, with "No options" when empty. Controlled: `checked` and
 * `onToggle` come from the list's selection Context. A click outside closes
 * it (useMultiSelectDropdownClosing, by its class).
 *
 * A list of more than SEARCH_FROM options starts with a search box, which
 * has the focus when it opens: typing narrows the list to options whose
 * label or value has the text, ignoring case (as ComboBox does); Escape
 * clears it, or closes the list when it's empty. Closing clears it.
 * Options can be in groups (`group`, given in order), each run under its
 * name when more than one is showing.
 *
 * Used by the filter bar's row filters and the Settings drawer's rule
 * lists. `listId` is the list's id; checkbox ids are
 * `${idPrefix}-<value>-<index>`, the index in `options` whatever's showing.
 */
export interface MultiSelectOption {
  value: string;
  label: string;
  group?: string;
}

export interface MultiSelectDropdownProps {
  listId: string;
  label: string;
  idPrefix: string;
  options: ReadonlyArray<MultiSelectOption>;
  checked: ReadonlySet<string>;
  onToggle: (value: string) => void;
  className?: string;
  // What picking options does, at the top of the open list, describing it.
  description?: string;
}

// Longer lists have a search box.
export const SEARCH_FROM = 8;

export const getCheckboxId = (idPrefix: string, value: string, index: number): string => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${idPrefix}-${normalized || 'item'}-${index}`;
};

const matches = (option: MultiSelectOption, query: string) => {
  const text = query.trim().toLowerCase();
  return !text || option.label.toLowerCase().includes(text) || option.value.toLowerCase().includes(text);
};

export function MultiSelectDropdown({ listId, label, idPrefix, options, checked, onToggle, className, description }: MultiSelectDropdownProps) {
  const [query, setQuery] = useState('');
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const descriptionId = description ? `${listId}-hint` : undefined;
  const searchable = options.length > SEARCH_FROM;

  // Each option with its index in `options`, for its id.
  const shown = options.map((option, index) => ({ option, index })).filter(({ option }) => matches(option, query));
  // Runs of the same group, named when there's more than one.
  const runs: Array<{ group: string | undefined; items: typeof shown }> = [];
  shown.forEach((item) => {
    const last = runs[runs.length - 1];
    if (last && last.group === item.option.group) last.items.push(item);
    else runs.push({ group: item.option.group, items: [item] });
  });
  const showGroups = runs.length > 1;

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (event.currentTarget.open) searchRef.current?.focus({ preventScroll: true });
    else setQuery('');
  };

  // On the box itself, not through React: the Settings drawer's Escape
  // (useFocusTrap) listens on its own element, which React's handlers,
  // at the root, would reach only after it had closed the drawer.
  useEffect(() => {
    const search = searchRef.current;
    if (!search) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (search.value) {
          setQuery('');
        } else if (detailsRef.current) {
          detailsRef.current.open = false;
          detailsRef.current.querySelector<HTMLElement>('summary')?.focus();
        }
      } else if (event.key === 'Enter') {
        // Not a form's submit.
        event.preventDefault();
      }
    };
    search.addEventListener('keydown', handleKeyDown);
    return () => search.removeEventListener('keydown', handleKeyDown);
  }, [searchable]);

  const renderItem = ({ option, index }: (typeof shown)[number]) => {
    const id = getCheckboxId(idPrefix, option.value, index);
    return (
      <div className="multi-select-item" key={option.value}>
        <input type="checkbox" id={id} value={option.value} checked={checked.has(option.value)} onChange={() => onToggle(option.value)} />
        <label htmlFor={id}>{option.label}</label>
      </div>
    );
  };

  return (
    <details ref={detailsRef} className={['multi-select-dropdown', className].filter(Boolean).join(' ')} onToggle={handleToggle}>
      <summary className="multi-select-summary">
        <span>{label}</span>
        {checked.size > 0 && <span className="multi-select-picked">{checked.size} selected</span>}
      </summary>
      <div
        id={listId}
        className={searchable ? 'multi-select-list multi-select-list-searchable' : 'multi-select-list'}
        role="group"
        aria-label={label}
        aria-describedby={descriptionId}
      >
        {searchable && (
          <div className="multi-select-search">
            <input
              ref={searchRef}
              type="search"
              aria-label={`Search ${label}`}
              aria-controls={listId}
              placeholder="Search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <span role="status" className="ui-visually-hidden">
              {query.trim() ? (shown.length ? `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}` : 'No matches') : ''}
            </span>
          </div>
        )}
        {description && (
          <p id={descriptionId} className="multi-select-hint">
            {description}
          </p>
        )}
        {options.length === 0 ? (
          <p className="multi-select-none">No options</p>
        ) : shown.length === 0 ? (
          <p className="multi-select-none">No matches</p>
        ) : showGroups ? (
          runs.map((run, runIndex) => {
            const groupId = `${listId}-group-${runIndex}`;
            return run.group ? (
              <div key={groupId} role="group" aria-labelledby={groupId}>
                <p id={groupId} className="multi-select-group-label">
                  {run.group}
                </p>
                {run.items.map(renderItem)}
              </div>
            ) : (
              run.items.map(renderItem)
            );
          })
        ) : (
          shown.map(renderItem)
        )}
      </div>
    </details>
  );
}
