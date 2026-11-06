import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from './Button';
import { Chip, ChipGroup } from './Chip';
import { Tooltip } from './Tooltip';
import { isNameFree, type SavedItem } from '../../helpers/saved-items.helpers.ts';

// What a kind of saved item is called ("view", "profile"), for the labels
// below: "Save as view", "View name", "Another view has that name".
const capitalized = (noun: string) => noun.charAt(0).toUpperCase() + noun.slice(1);

/**
 * A name box with Save and Cancel, for a new item's name or a rename. Esc
 * cancels, and goes no further: in the Settings drawer it would close the
 * drawer, whose own listener (useFocusTrap) is native, so a React handler
 * here would run only after it - this one is native too. Save is off while the name is empty or another item has it
 * (which it says).
 */
export function NameForm({
  label,
  noun,
  initialName = '',
  isFree,
  onSave,
  onCancel,
}: {
  label: string;
  noun: string;
  initialName?: string;
  isFree: (name: string) => boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const errorId = useId();
  const taken = Boolean(name.trim()) && !isFree(name);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isFree(name)) onSave(name);
  };
  const formRef = useRef<HTMLFormElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    const form = formRef.current;
    if (!form) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCancelRef.current();
    };
    form.addEventListener('keydown', handleKeyDown);
    return () => form.removeEventListener('keydown', handleKeyDown);
  }, []);
  return (
    <form ref={formRef} className="ui-name-form" onSubmit={submit}>
      <input
        className="ui-name-form-input"
        aria-label={label}
        placeholder={`${capitalized(noun)} name`}
        value={name}
        // Opened by a click on Save as… or Rename: typing is next.
        autoFocus
        aria-invalid={taken || undefined}
        aria-describedby={taken ? errorId : undefined}
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" variant="primary" disabled={!isFree(name)}>
        Save
      </Button>
      <Button onClick={onCancel}>Cancel</Button>
      {taken && (
        <span id={errorId} className="ui-saved-error">
          Another {noun} has that name
        </span>
      )}
    </form>
  );
}

export interface SavedItemsBarProps<T extends SavedItem> {
  // Null until read (nothing shows).
  items: T[] | null;
  // The item whose content is what's chosen now, and the one last applied
  // while something else is (getActiveAndModifiedIds).
  activeId: string;
  modifiedId: string;
  saveFailed: boolean;
  // The chips' group name, e.g. "Saved views".
  label: string;
  // What one is called, e.g. "view".
  noun: string;
  // What an item holds, shown on hover.
  describe: (item: T) => string;
  onApply: (item: T, pressed: boolean) => void;
  // Whether what's chosen now can be saved as a new item.
  canSave: boolean;
  // Saves what's chosen as a new item with this name; its id.
  onSave: (name: string) => string;
  // Saves what's chosen into this item.
  onUpdate: (id: string) => void;
  className?: string;
}

/**
 * Saved items as a row of chips: pressed while its content is what's
 * chosen, a click applies it, its content on hover - and "(modified)" on
 * the item last applied once the choice has changed since, with Update to
 * save the change into it. "Save as <noun>" names what's chosen while it
 * can be saved. Says so when a change couldn't be saved.
 * Nothing shows until the items are read, nor while there are none,
 * nothing to save and nothing to say.
 */
export function SavedItemsBar<T extends SavedItem>({
  items,
  activeId,
  modifiedId,
  saveFailed,
  label,
  noun,
  describe,
  onApply,
  canSave,
  onSave,
  onUpdate,
  className,
}: SavedItemsBarProps<T>) {
  const [naming, setNaming] = useState(false);
  // Where focus goes once the name form closes: the new item's chip, or
  // back to the save button (the form's buttons go away with it).
  const [focusTarget, setFocusTarget] = useState('');
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusTarget) return;
    const target = focusTarget === 'save' ? saveButtonRef.current : chipRefs.current[focusTarget];
    if (!target) return;
    target.focus();
    setFocusTarget('');
  }, [focusTarget, items]);
  if (!items) return null;
  if (items.length === 0 && !canSave && !saveFailed) return null;
  const modified = items.find((item) => item.id === modifiedId);

  return (
    <div className={['ui-saved-bar', className].filter(Boolean).join(' ')}>
      {items.length > 0 && (
        <ChipGroup label={label}>
          {items.map((item) => {
            const pressed = item.id === activeId;
            return (
              <Tooltip key={item.id} content={describe(item)}>
                <Chip
                  ref={(element) => {
                    chipRefs.current[item.id] = element;
                  }}
                  pressed={pressed}
                  onClick={() => onApply(item, pressed)}
                >
                  {item.name}
                  {item.id === modifiedId && <span className="ui-saved-modified"> (modified)</span>}
                </Chip>
              </Tooltip>
            );
          })}
        </ChipGroup>
      )}
      {modified && (
        <button type="button" className="ui-link-button" onClick={() => onUpdate(modified.id)}>
          Update “{modified.name}”
        </button>
      )}
      {canSave &&
        (naming ? (
          <NameForm
            label={`Name for the new ${noun}`}
            noun={noun}
            isFree={(name) => isNameFree(items, name)}
            onSave={(name) => {
              setFocusTarget(onSave(name));
              setNaming(false);
            }}
            onCancel={() => {
              setNaming(false);
              setFocusTarget('save');
            }}
          />
        ) : (
          <button ref={saveButtonRef} type="button" className="ui-link-button" onClick={() => setNaming(true)}>
            Save as {noun}
          </button>
        ))}
      {saveFailed && (
        <span role="alert" className="ui-saved-error">
          Couldn’t save your {noun}s. They’re shown as last saved.
        </span>
      )}
    </div>
  );
}

export interface SavedItemsManagerProps<T extends SavedItem> {
  items: T[];
  // What an item holds.
  describe: (item: T) => string;
  // The update button's text ("Update to applied filters"), and its name
  // for an item.
  updateLabel: string;
  updateAriaLabel: (item: T) => string;
  canUpdate: (item: T) => boolean;
  // Shown while there are none.
  emptyHint: ReactNode;
  // What one is called, e.g. "view".
  noun: string;
  onRename: (id: string, name: string) => void;
  onUpdate: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore: (item: T, index: number) => void;
}

/**
 * Saved items as a list: each with what it holds, and Rename, Update and
 * Delete. A deleted item can be put back (Undo) until the next is deleted;
 * focus goes to that Undo, and from it back to the item's Rename.
 */
export function SavedItemsManager<T extends SavedItem>({
  items,
  describe,
  updateLabel,
  updateAriaLabel,
  canUpdate,
  emptyHint,
  noun,
  onRename,
  onUpdate,
  onDelete,
  onRestore,
}: SavedItemsManagerProps<T>) {
  const [renamingId, setRenamingId] = useState('');
  // Back to an item's Rename once its name form closes, or to Undo once
  // one is deleted.
  const [focusId, setFocusId] = useState('');
  const renameRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const undoRef = useRef<HTMLButtonElement>(null);
  const [deleted, setDeleted] = useState<{ item: T; index: number } | null>(null);
  useEffect(() => {
    if (!focusId) return;
    const target = focusId === 'undo' ? undoRef.current : renameRefs.current[focusId];
    if (!target) return;
    target.focus();
    setFocusId('');
  }, [focusId, items]);
  const undo = deleted && !items.some((item) => item.id === deleted.item.id) ? deleted : null;

  return (
    <>
      {items.length === 0 ? (
        <p className="ui-saved-hint">{emptyHint}</p>
      ) : (
        <ul className="ui-saved-list">
          {items.map((item, index) => (
            <li key={item.id} className="ui-saved-item">
              {renamingId === item.id ? (
                <NameForm
                  label={`New name for ${item.name}`}
                  noun={noun}
                  initialName={item.name}
                  isFree={(name) => isNameFree(items, name, item.id)}
                  onSave={(name) => {
                    onRename(item.id, name);
                    setRenamingId('');
                    setFocusId(item.id);
                  }}
                  onCancel={() => {
                    setRenamingId('');
                    setFocusId(item.id);
                  }}
                />
              ) : (
                <span className="ui-saved-name">{item.name}</span>
              )}
              <span className="ui-saved-hint">{describe(item)}</span>
              <span className="ui-saved-actions">
                <button
                  ref={(element) => {
                    renameRefs.current[item.id] = element;
                  }}
                  type="button"
                  className="ui-link-button"
                  aria-label={`Rename ${item.name}`}
                  onClick={() => setRenamingId(item.id)}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="ui-link-button"
                  aria-label={updateAriaLabel(item)}
                  disabled={!canUpdate(item)}
                  onClick={() => onUpdate(item.id)}
                >
                  {updateLabel}
                </button>
                <button
                  type="button"
                  className="ui-link-button"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => {
                    onDelete(item.id);
                    setDeleted({ item, index });
                    setFocusId('undo');
                  }}
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {undo && (
        <p className="ui-saved-hint">
          Deleted “{undo.item.name}”.{' '}
          <button
            ref={undoRef}
            type="button"
            className="ui-link-button"
            aria-label={`Undo deleting ${undo.item.name}`}
            onClick={() => {
              onRestore(undo.item, undo.index);
              setDeleted(null);
              setFocusId(undo.item.id);
            }}
          >
            Undo
          </button>
        </p>
      )}
    </>
  );
}
