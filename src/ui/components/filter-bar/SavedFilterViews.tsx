import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { Chip, ChipGroup } from '../ui/Chip';
import { Tooltip } from '../ui/Tooltip';
import type { SavedFilterViewsValue } from '../../state/useSavedFilterViews';
import type { SavedFilterView } from '../../helpers/saved-filter-views.helpers.ts';
import { describeViewFilters, hasAnyFilter, isSameFilters, isViewNameFree } from '../../helpers/saved-filter-views.helpers.ts';

/**
 * A name box with Save and Cancel, for a new view's name or a rename. Esc
 * cancels; Save is off while the name is empty or another view has it
 * (which it says).
 */
function ViewNameForm({
  label,
  initialName = '',
  isFree,
  onSave,
  onCancel,
}: {
  label: string;
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
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };
  return (
    <form className="filter-view-form" onSubmit={submit} onKeyDown={handleKeyDown}>
      <input
        className="filter-view-name"
        aria-label={label}
        placeholder="View name"
        value={name}
        // Opened by a click on Save as view or Rename: typing is next.
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
        <span id={errorId} className="filter-view-error">
          Another view has that name
        </span>
      )}
    </form>
  );
}

/**
 * The saved views, under the filter bar's header: one chip each - pressed
 * while its filters are the ones applied, a click applies it (and on the
 * pressed one clears the filters), its filters on hover - and "(modified)"
 * on the view last applied once a filter has changed since, with Update to
 * save the change into it. "Save as view" names the applied filters while
 * no view has them. Says so when a change couldn't be saved. Nothing shows
 * until the views are read, nor while there are none, no filter to save
 * and nothing to say.
 */
export function SavedFilterViewsBar({ value }: { value: SavedFilterViewsValue }) {
  const { views, current, activeId, modifiedId, saveFailed, apply, clear, saveCurrent, update } = value;
  const [naming, setNaming] = useState(false);
  // Where focus goes once the name form closes: the new view's chip, or
  // back to Save as view (the form's buttons go away with it).
  const [focusTarget, setFocusTarget] = useState('');
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusTarget) return;
    const target = focusTarget === 'save' ? saveButtonRef.current : chipRefs.current[focusTarget];
    if (!target) return;
    target.focus();
    setFocusTarget('');
  }, [focusTarget, views]);
  if (!views) return null;
  const canSave = hasAnyFilter(current) && !activeId;
  if (views.length === 0 && !canSave && !saveFailed) return null;
  const modified = views.find((view) => view.id === modifiedId);

  return (
    <div className="filter-bar-views">
      {views.length > 0 && (
        <ChipGroup label="Saved views">
          {views.map((view) => {
            const pressed = view.id === activeId;
            const filters = describeViewFilters(view.filters);
            return (
              <Tooltip key={view.id} content={filters.length ? filters.join(' · ') : 'No filters'}>
                <Chip
                  ref={(element) => {
                    chipRefs.current[view.id] = element;
                  }}
                  pressed={pressed}
                  onClick={() => (pressed ? clear() : apply(view))}
                >
                  {view.name}
                  {view.id === modifiedId && <span className="filter-view-modified"> (modified)</span>}
                </Chip>
              </Tooltip>
            );
          })}
        </ChipGroup>
      )}
      {modified && hasAnyFilter(current) && (
        <button type="button" className="filter-bar-clear" onClick={() => update(modified.id)}>
          Update “{modified.name}”
        </button>
      )}
      {canSave &&
        (naming ? (
          <ViewNameForm
            label="Name for the new view"
            isFree={(name) => isViewNameFree(views, name)}
            onSave={(name) => {
              setFocusTarget(saveCurrent(name));
              setNaming(false);
            }}
            onCancel={() => {
              setNaming(false);
              setFocusTarget('save');
            }}
          />
        ) : (
          <button ref={saveButtonRef} type="button" className="filter-bar-clear" onClick={() => setNaming(true)}>
            Save as view
          </button>
        ))}
      {saveFailed && (
        <span role="alert" className="filter-view-error">
          Couldn’t save your views. They’re shown as last saved.
        </span>
      )}
    </div>
  );
}

/**
 * The open filter bar's "Manage saved views" group: each view with what it
 * filters on, and Rename, Update (to the applied filters) and Delete. A
 * deleted view can be put back (Undo) until the next is deleted; focus
 * goes to that Undo, and from it back to the view's Rename.
 */
export function SavedFilterViewsManager({ value, headingId }: { value: SavedFilterViewsValue; headingId: string }) {
  const { views, current, rename, update, remove, restore } = value;
  const [renamingId, setRenamingId] = useState('');
  // Back to a view's Rename once its name form closes.
  const [focusId, setFocusId] = useState('');
  const renameRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const undoRef = useRef<HTMLButtonElement>(null);
  const [deleted, setDeleted] = useState<{ view: SavedFilterView; index: number } | null>(null);
  useEffect(() => {
    if (!focusId) return;
    const target = focusId === 'undo' ? undoRef.current : renameRefs.current[focusId];
    if (!target) return;
    target.focus();
    setFocusId('');
  }, [focusId, views]);
  if (!views) return null;
  const canUpdate = hasAnyFilter(current);
  const undo = deleted && !views.some((view) => view.id === deleted.view.id) ? deleted : null;

  return (
    <div className="filter-bar-group filter-views-group" role="group" aria-labelledby={headingId}>
      <h3 id={headingId} className="filter-bar-heading">
        Manage saved views
      </h3>
      {views.length === 0 ? (
        <p className="filter-bar-hint">None yet. Apply some filters, then use Save as view above.</p>
      ) : (
        <ul className="filter-views-list">
          {views.map((view) => {
            const filters = describeViewFilters(view.filters);
            return (
              <li key={view.id} className="filter-views-item">
                {renamingId === view.id ? (
                  <ViewNameForm
                    label={`New name for ${view.name}`}
                    initialName={view.name}
                    isFree={(name) => isViewNameFree(views, name, view.id)}
                    onSave={(name) => {
                      rename(view.id, name);
                      setRenamingId('');
                      setFocusId(view.id);
                    }}
                    onCancel={() => {
                      setRenamingId('');
                      setFocusId(view.id);
                    }}
                  />
                ) : (
                  <span className="filter-views-name">{view.name}</span>
                )}
                <span className="filter-bar-hint">{filters.length ? filters.join(' · ') : 'No filters'}</span>
                <span className="filter-views-actions">
                  <button
                    ref={(element) => {
                      renameRefs.current[view.id] = element;
                    }}
                    type="button"
                    className="filter-bar-clear"
                    aria-label={`Rename ${view.name}`}
                    onClick={() => setRenamingId(view.id)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="filter-bar-clear"
                    aria-label={`Update ${view.name} to the applied filters`}
                    disabled={!canUpdate || isSameFilters(view.filters, current)}
                    onClick={() => update(view.id)}
                  >
                    Update to applied filters
                  </button>
                  <button
                    type="button"
                    className="filter-bar-clear"
                    aria-label={`Delete ${view.name}`}
                    onClick={() => {
                      remove(view.id);
                      setDeleted({ view, index: views.indexOf(view) });
                      setFocusId('undo');
                    }}
                  >
                    Delete
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {undo && (
        <p className="filter-bar-hint filter-views-deleted">
          Deleted “{undo.view.name}”.{' '}
          <button
            ref={undoRef}
            type="button"
            className="filter-bar-clear"
            aria-label={`Undo deleting ${undo.view.name}`}
            onClick={() => {
              restore(undo.view, undo.index);
              setDeleted(null);
              setFocusId(undo.view.id);
            }}
          >
            Undo
          </button>
        </p>
      )}
    </div>
  );
}
