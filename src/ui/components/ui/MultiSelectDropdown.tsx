/**
 * A dropdown of checkboxes (`<details class="multi-select-dropdown">`):
 * the summary names it and says how many are picked; the list is a group
 * named the same, with "No options" when empty. Controlled: `checked` and
 * `onToggle` come from the list's selection Context. A click outside closes
 * it (useMultiSelectDropdownClosing, by its class).
 *
 * Used by the filter bar's row filters and the Settings drawer's rule
 * lists. `listId` is the list's id; checkbox ids are
 * `${idPrefix}-<value>-<index>`.
 */
export interface MultiSelectDropdownProps {
  listId: string;
  label: string;
  idPrefix: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  checked: ReadonlySet<string>;
  onToggle: (value: string) => void;
  className?: string;
}

export const getCheckboxId = (idPrefix: string, value: string, index: number): string => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${idPrefix}-${normalized || 'item'}-${index}`;
};

export function MultiSelectDropdown({ listId, label, idPrefix, options, checked, onToggle, className }: MultiSelectDropdownProps) {
  return (
    <details className={['multi-select-dropdown', className].filter(Boolean).join(' ')}>
      <summary className="multi-select-summary">
        <span>{label}</span>
        {checked.size > 0 && <span className="multi-select-picked">{checked.size} selected</span>}
      </summary>
      <div id={listId} className="multi-select-list" role="group" aria-label={label}>
        {options.length === 0 ? (
          <p className="multi-select-none">No options</p>
        ) : (
          options.map((option, index) => {
            const id = getCheckboxId(idPrefix, option.value, index);
            return (
              <div className="multi-select-item" key={option.value}>
                <input type="checkbox" id={id} value={option.value} checked={checked.has(option.value)} onChange={() => onToggle(option.value)} />
                <label htmlFor={id}>{option.label}</label>
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}
