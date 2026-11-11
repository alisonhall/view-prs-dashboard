import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * A text box that picks one option from a list, the list narrowed to what's
 * typed (the ARIA combobox pattern with a list popup). The box shows the
 * picked option's label; clicking it or pressing Down opens the list, typing
 * narrows it, Up and Down move through it, Enter picks, and Escape, Tab or
 * leaving the box closes it without a change. The list opens in place,
 * pushing what's below down: the views' box clips anything that overhangs
 * it (`.data-tabs`).
 *
 * Options can be in groups, each with a label shown above it when there's
 * more than one. A typed text matches an option's label or value, ignoring
 * case. Controlled: `value` and `onChange`.
 */
export interface ComboBoxOption {
  value: string;
  label: string;
  // After the label, smaller (a login, a count).
  detail?: string;
  // Before the label (an avatar); decorative.
  leading?: ReactNode;
}

export interface ComboBoxGroup {
  label: string;
  options: ReadonlyArray<ComboBoxOption>;
}

export interface ComboBoxProps {
  // The text box's id; the list is `${id}-list`.
  id: string;
  label: string;
  groups: ReadonlyArray<ComboBoxGroup>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  // In the list when nothing matches what's typed.
  noMatchesText?: string;
}

const matches = (option: ComboBoxOption, query: string) => {
  const text = query.trim().toLowerCase();
  return !text || option.label.toLowerCase().includes(text) || option.value.toLowerCase().includes(text);
};

export function ComboBox({ id, label, groups, value, onChange, className, noMatchesText = 'No matches' }: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  // What's typed since the list opened; null shows every option.
  const [query, setQuery] = useState<string | null>(null);
  const [activeValue, setActiveValue] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const allOptions = groups.flatMap((group) => group.options);
  const picked = allOptions.find((option) => option.value === value);
  const shownGroups = groups
    .map((group) => ({ ...group, options: group.options.filter((option) => matches(option, query ?? '')) }))
    .filter((group) => group.options.length > 0);
  const shownOptions = shownGroups.flatMap((group) => group.options);
  const activeIndex = shownOptions.findIndex((option) => option.value === activeValue);
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const option = listRef.current?.ownerDocument.getElementById(optionId(activeIndex));
    if (typeof option?.scrollIntoView === 'function') option.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const openList = (startValue: string) => {
    setOpen(true);
    setActiveValue(startValue);
  };
  const close = () => {
    setOpen(false);
    setQuery(null);
  };
  const pick = (nextValue: string) => {
    close();
    if (nextValue !== value) onChange(nextValue);
  };
  const move = (step: number) => {
    if (!shownOptions.length) return;
    const from = activeIndex < 0 ? (step > 0 ? -1 : 0) : activeIndex;
    const next = (from + step + shownOptions.length) % shownOptions.length;
    setActiveValue((shownOptions[next] as ComboBoxOption).value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList(value || (allOptions[0]?.value ?? ''));
      } else {
        move(event.key === 'ArrowDown' ? 1 : -1);
      }
    } else if (event.key === 'Enter') {
      if (open && activeIndex >= 0) {
        event.preventDefault();
        pick((shownOptions[activeIndex] as ComboBoxOption).value);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    } else if (event.key === 'Tab') {
      close();
    }
  };

  const status = query === null ? '' : shownOptions.length ? `${shownOptions.length} ${shownOptions.length === 1 ? 'match' : 'matches'}` : noMatchesText;
  let index = -1;
  const renderOption = (option: ComboBoxOption) => {
    index += 1;
    const isActive = index === activeIndex;
    return (
      <div
        key={option.value}
        id={optionId(index)}
        role="option"
        aria-selected={isActive}
        className="ui-combobox-option"
        data-active={isActive ? 'true' : undefined}
        data-picked={option.value === value ? 'true' : undefined}
        onClick={() => pick(option.value)}
      >
        {option.leading}
        <span className="ui-combobox-option-label">{option.label}</span>
        {/* A space between, so its name reads "Hubot hubot". */}
        {option.detail && <> <span className="ui-combobox-option-detail">{option.detail}</span></>}
      </div>
    );
  };

  return (
    <div className={['ui-field', 'ui-combobox', className].filter(Boolean).join(' ')}>
      <label htmlFor={id}>{label}</label>
      <div className="ui-combobox-control">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query ?? picked?.label ?? value}
          onClick={() => {
            if (!open) openList(value);
          }}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            setActiveValue(allOptions.find((option) => matches(option, nextQuery))?.value ?? '');
          }}
          onKeyDown={handleKeyDown}
          onBlur={close}
        />
      </div>
      {/* Pressing on it keeps the focus in the box, so the click picks. */}
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={label}
        className="ui-combobox-list"
        hidden={!open}
        onMouseDown={(event) => event.preventDefault()}
      >
        {shownOptions.length === 0 ? (
          <p className="ui-combobox-none">{noMatchesText}</p>
        ) : shownGroups.length > 1 ? (
          shownGroups.map((group, groupIndex) => (
            <div key={group.label} role="group" aria-labelledby={`${id}-group-${groupIndex}`}>
              <div id={`${id}-group-${groupIndex}`} role="presentation" className="ui-combobox-group-label">
                {group.label}
              </div>
              {group.options.map(renderOption)}
            </div>
          ))
        ) : (
          shownOptions.map(renderOption)
        )}
      </div>
      <span role="status" className="ui-visually-hidden">
        {open ? status : ''}
      </span>
    </div>
  );
}
