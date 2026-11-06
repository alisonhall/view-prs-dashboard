import { SavedItemsBar, SavedItemsManager } from '../ui/SavedItems';
import type { SavedFilterViewsValue } from '../../state/useSavedFilterViews';
import { describeViewFilters, hasAnyFilter, isSameFilters, type SavedFilterView } from '../../helpers/saved-filter-views.helpers.ts';

const describeView = (view: SavedFilterView) => describeViewFilters(view.filters).join(' · ') || 'No filters';

/**
 * The saved views, under the filter bar's header (SavedItemsBar): one chip
 * each - pressed while its filters are the ones applied, a click applies it
 * (and on the pressed one clears the filters), its filters on hover - and
 * "(modified)" with Update once a filter has changed since one was applied.
 * "Save as view" names the applied filters while no view has them.
 */
export function SavedFilterViewsBar({ value }: { value: SavedFilterViewsValue }) {
  const { views, current, activeId, modifiedId, saveFailed, apply, clear, saveCurrent, update } = value;
  return (
    <SavedItemsBar
      className="filter-bar-views"
      items={views}
      activeId={activeId}
      modifiedId={modifiedId}
      saveFailed={saveFailed}
      label="Saved views"
      noun="view"
      describe={describeView}
      onApply={(view, pressed) => (pressed ? clear() : apply(view))}
      canSave={hasAnyFilter(current) && !activeId}
      onSave={saveCurrent}
      onUpdate={update}
    />
  );
}

/**
 * The open filter bar's "Manage saved views" group (SavedItemsManager):
 * each view with what it filters on, and Rename, Update (to the applied
 * filters) and Delete, with Undo.
 */
export function SavedFilterViewsManager({ value, headingId }: { value: SavedFilterViewsValue; headingId: string }) {
  const { views, current, rename, update, remove, restore } = value;
  if (!views) return null;
  const canUpdate = hasAnyFilter(current);

  return (
    <div className="filter-bar-group filter-views-group" role="group" aria-labelledby={headingId}>
      <h3 id={headingId} className="filter-bar-heading">
        Manage saved views
      </h3>
      <SavedItemsManager
        items={views}
        noun="view"
        describe={describeView}
        updateLabel="Update to applied filters"
        updateAriaLabel={(view) => `Update ${view.name} to the applied filters`}
        canUpdate={(view) => canUpdate && !isSameFilters(view.filters, current)}
        emptyHint="None yet. Apply some filters, then use Save as view above."
        onRename={rename}
        onUpdate={update}
        onDelete={remove}
        onRestore={restore}
      />
    </div>
  );
}
