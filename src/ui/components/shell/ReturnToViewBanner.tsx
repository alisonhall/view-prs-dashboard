import { Button, IconButton } from '../ui/Button';
import { DATA_TAB_LABELS, useTabState } from '../../state/TabStateContext';

/**
 * After "View in table" in another view (Authors, Review stats), a bar
 * stuck to the top of the window over the table: "PR #12, from Authors"
 * with `Back to Authors`, which shows that view again scrolled and focused
 * as it was left (TabStateProvider's returnToPreviousView). Gone once you
 * go back, dismiss it, or show another view.
 */
export function ReturnToViewBanner() {
  const { activeDataTab, returnTarget, returnToPreviousView, forgetReturnTarget } = useTabState();
  if (!returnTarget || activeDataTab !== 'pr-data') return null;
  const view = DATA_TAB_LABELS[returnTarget.tab];

  return (
    <div className="app-banner app-banner-return" role="region" aria-label={`Back to ${view}`}>
      <span className="app-banner-text">
        PR #{returnTarget.prNumber}, from {view}
      </span>
      <Button icon="chevronLeft" className="app-banner-return-back" onClick={returnToPreviousView}>
        Back to {view}
      </Button>
      {/* Forgets where you came from, staying on the table. */}
      <IconButton icon="close" label="Dismiss" onClick={forgetReturnTarget} />
    </div>
  );
}
