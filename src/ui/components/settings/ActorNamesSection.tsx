import { useCallback, useEffect, useRef, useState } from 'react';
import { MappingRowsEditor, entriesToRows, type MappingRow, type MappingStatus } from './MappingRowsEditor';
import { useIsSettingsSectionVisible } from '../../state/SettingsDrawerContext';

/**
 * The Settings drawer's "Actor names" (UI_REDESIGN_PLAN.md, phase 9b): the
 * display-name mappings (actor-name-cache) and login aliases
 * (actor-login-aliases), each a MappingRowsEditor.
 *
 * Both editors' "Refresh" buttons reload both lists (one combined load, as
 * the vanilla version did). Lazy-loaded, mounting the first time the
 * section is opened; it loads on mount, then again each time the section
 * comes back into view (the first run of that effect is skipped: the mount
 * load covers it).
 */
export function ActorNamesSection() {
  const [nameCacheRows, setNameCacheRows] = useState<MappingRow[]>([]);
  const [nameCacheStatus, setNameCacheStatus] = useState<MappingStatus>({ text: 'Loading cache...', tone: 'info' });
  const [aliasRows, setAliasRows] = useState<MappingRow[]>([]);
  const [aliasStatus, setAliasStatus] = useState<MappingStatus>({ text: 'Loading aliases...', tone: 'info' });

  const load = useCallback(async () => {
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
      setNameCacheStatus({ text: `Failed to load cache: ${(error as Error).message || String(error)}`, tone: 'error' });
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
      setAliasStatus({ text: `Failed to load aliases: ${(error as Error).message || String(error)}`, tone: 'error' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isVisible = useIsSettingsSectionVisible('actor-names');
  const hasSkippedFirstRunRef = useRef(false);
  useEffect(() => {
    if (!hasSkippedFirstRunRef.current) {
      hasSkippedFirstRunRef.current = true;
      return;
    }
    if (isVisible) {
      load();
    }
  }, [isVisible, load]);

  const refreshBoth = load;

  return (
    <div className="settings-section">
      <p className="subtle-copy">Manage display names and canonical login aliases used in UI rendering, filtering, insights, and stats.</p>
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
    </div>
  );
}
