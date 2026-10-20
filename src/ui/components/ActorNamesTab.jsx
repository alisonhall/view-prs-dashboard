/**
 * ActorNamesTab - React-owned content for the Management "Actor Names"
 * tab, mounted into `#actor-names-root`.
 *
 * Post-Phase-6 follow-up (see REACT_MIGRATION_PLAN.md): real JSX now,
 * replacing pr-actor-name-cache.helpers.js in full (deleted) - unlike
 * Action Log's conversion, this tab's own buttons/status/rows are ALL now
 * React-owned (not a container-split leaving vanilla buttons calling a
 * bridge), matching how ReviewStatsControls/AuthorInsightsSelector fully
 * own their own controls.
 *
 * Behavior preserved exactly from the vanilla version, including one
 * quirk: both mapping editors' "Refresh" buttons trigger the SAME combined
 * reload (both endpoints), not just their own - the vanilla loadActorNameCache
 * always loaded both in sequence, and both editors' refresh buttons called
 * that same function.
 *
 * @module components/ActorNamesTab
 *
 * Deferred-items follow-up, item 5 (see REACT_MIGRATION_PLAN.md): this
 * component is now lazy-loaded (react-app.jsx), mounting only once the
 * Actor Names tab is first activated.
 *
 * Phase H.22 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 3): re-triggering the combined reload on every later
 * re-activation (switch away, then back) used to be
 * `pr-management-tabs.helpers.js`'s `activateTab("actor-name-cache")`
 * calling `loadActorNameCache()` directly, outside React entirely - that
 * function is deleted outright this phase. Now owned by this component's
 * own second effect below, watching
 * `useIsTabPanelVisible('tab-panel-actor-name-cache')` - same shape
 * `useBackfillTabAutoRefresh.jsx`/`ActionLogSection.jsx` already
 * established.
 */

import { useEffect, useRef, useState } from 'react';
import { MappingRowsEditor, entriesToRows } from './MappingRowsEditor';
import { useIsTabPanelVisible } from '../state/useIsTabPanelVisible';

export function ActorNamesTab() {
  const [nameCacheRows, setNameCacheRows] = useState([]);
  const [nameCacheStatus, setNameCacheStatus] = useState({ text: 'Loading cache...', tone: 'info' });
  const [aliasRows, setAliasRows] = useState([]);
  const [aliasStatus, setAliasStatus] = useState({ text: 'Loading aliases...', tone: 'info' });

  useEffect(() => {
    const load = async () => {
      setNameCacheStatus({ text: 'Loading cache...', tone: 'info' });
      try {
        const response = await fetch('/view-prs/actor-name-cache');
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.error || 'Failed to load actor name cache');
        }
        const entries = payload?.entries && typeof payload.entries === 'object' ? payload.entries : {};
        setNameCacheRows(entriesToRows(entries));
        const count = Object.keys(entries).length;
        setNameCacheStatus({ text: `Loaded ${count} mapping${count === 1 ? '' : 's'}.`, tone: 'success' });
      } catch (error) {
        setNameCacheStatus({ text: `Failed to load cache: ${error.message || String(error)}`, tone: 'error' });
      }

      setAliasStatus({ text: 'Loading aliases...', tone: 'info' });
      try {
        const response = await fetch('/view-prs/actor-login-aliases');
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.error || 'Failed to load actor login aliases');
        }
        const entries = payload?.entries && typeof payload.entries === 'object' ? payload.entries : {};
        setAliasRows(entriesToRows(entries));
        const count = Object.keys(entries).length;
        setAliasStatus({ text: `Loaded ${count} alias mapping${count === 1 ? '' : 's'}.`, tone: 'success' });
      } catch (error) {
        setAliasStatus({ text: `Failed to load aliases: ${error.message || String(error)}`, tone: 'error' });
      }
    };

    window.triggerActorNameCacheLoad = load;
    load();
    return () => {
      delete window.triggerActorNameCacheLoad;
    };
  }, []);

  // Phase H.22 (see this module's own header comment): re-trigger on
  // every later re-activation, matching activateTab("actor-name-cache")'s
  // old behavior exactly - skips this effect's own first run via a ref,
  // not the `isVisible` value itself, since on a first mount where the
  // tab is already active this effect's first run would otherwise
  // double-fire right alongside the mount effect's own load() call above
  // (same reasoning as ActionLogSection.jsx's own identical guard).
  const isVisible = useIsTabPanelVisible('tab-panel-actor-name-cache');
  const hasSkippedFirstRunRef = useRef(false);
  useEffect(() => {
    if (!hasSkippedFirstRunRef.current) {
      hasSkippedFirstRunRef.current = true;
      return;
    }
    if (isVisible) {
      window.triggerActorNameCacheLoad?.();
    }
  }, [isVisible]);

  const refreshBoth = () => window.triggerActorNameCacheLoad?.();

  return (
    <>
      <MappingRowsEditor
        heading="Display Name Mappings"
        rows={nameCacheRows}
        setRows={setNameCacheRows}
        status={nameCacheStatus}
        setStatus={setNameCacheStatus}
        onRefresh={refreshBoth}
        addRowLabel="Add display-name row"
        saveLabel="Save display names"
        keyPlaceholder="authorLogin or user ID"
        valuePlaceholder="Display name"
        keyAriaLabel="Author/user ID"
        valueAriaLabel="Display name"
        removeAriaLabel="Remove actor name mapping row"
        saveUrl="/view-prs/actor-name-cache"
        emptyError="At least one mapping is required. Clearing all entries is blocked."
        duplicatePrefix="Duplicate ID detected"
        incompleteError="Each non-empty row must include both an ID and a display name"
        savingText="Saving mappings..."
        savedNoun="mapping"
        saveFailurePrefix="Failed to save cache"
        rowClassName="actor-name-cache-row"
      />

      <MappingRowsEditor
        heading="Login Alias Mappings"
        description="Use alias login to canonical login mappings when the same person appears under multiple GitHub identities."
        rows={aliasRows}
        setRows={setAliasRows}
        status={aliasStatus}
        setStatus={setAliasStatus}
        onRefresh={refreshBoth}
        addRowLabel="Add alias row"
        saveLabel="Save login aliases"
        keyPlaceholder="Alias login"
        valuePlaceholder="Canonical login"
        keyAriaLabel="Alias login"
        valueAriaLabel="Canonical login"
        removeAriaLabel="Remove actor login alias row"
        saveUrl="/view-prs/actor-login-aliases"
        emptyError="At least one alias mapping is required. Clearing all entries is blocked."
        duplicatePrefix="Duplicate alias login detected"
        incompleteError="Each non-empty alias row must include both an alias login and a canonical login"
        disallowSameValue
        sameValueError="Alias login and canonical login must differ"
        savingText="Saving aliases..."
        savedNoun="alias mapping"
        saveFailurePrefix="Failed to save aliases"
        rowClassName="actor-login-alias-row"
      />
    </>
  );
}
