/**
 * MappingRowsEditor - a generic editable key/value-pair list ("mapping")
 * with add-row/remove-row/save/refresh, used twice by the Settings
 * drawer's Actor names section (ActorNamesSection.tsx): the display-name
 * mappings and the login-alias mappings - the two were near-identical
 * hand-duplicated builders in pr-actor-name-cache.helpers.js
 * (createActorNameCacheRow/createActorLoginAliasRow,
 * getActorNameCachePayloadFromRows/getActorLoginAliasesPayloadFromRows),
 * collapsed into one parameterized component the same way the vanilla
 * version's own createMappingRow/getMappingPayloadFromRows already
 * factored out the shared shape.
 *
 * @module components/settings/MappingRowsEditor
 */

import { useRef, useState, type Dispatch, type SetStateAction } from 'react';

export interface MappingRow {
  id: string;
  key: string;
  value: string;
}

export interface MappingStatus {
  text: string;
  tone: 'info' | 'success' | 'error';
}

let rowIdCounter = 0;
const nextRowId = () => `mapping-row-${++rowIdCounter}`;

export const entriesToRows = (entries: Record<string, unknown> | null | undefined): MappingRow[] => {
  const sorted = Object.entries(entries || {})
    .map(([key, value]): [string, string] => [String(key || '').trim(), String(value || '').trim()])
    .filter(([key, value]) => key && value)
    .sort(([a], [b]) => a.localeCompare(b));

  if (sorted.length === 0) {
    return [{ id: nextRowId(), key: '', value: '' }];
  }
  return sorted.map(([key, value]) => ({ id: nextRowId(), key, value }));
};

export interface MappingRowsEditorProps {
  heading?: string;
  description?: string;
  rows: MappingRow[];
  setRows: Dispatch<SetStateAction<MappingRow[]>>;
  status: MappingStatus;
  setStatus: Dispatch<SetStateAction<MappingStatus>>;
  onRefresh?: () => void;
  addRowLabel: string;
  saveLabel: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  keyAriaLabel: string;
  valueAriaLabel: string;
  removeAriaLabel: string;
  saveUrl: string;
  emptyError: string;
  duplicatePrefix: string;
  incompleteError: string;
  disallowSameValue?: boolean;
  sameValueError?: string;
  savingText: string;
  savedNoun: string;
  saveFailurePrefix: string;
  rowClassName: string;
}

type BuiltPayload = { ok: true; entries: Record<string, string> } | { ok: false; error: string };

export function MappingRowsEditor({
  heading,
  description,
  rows,
  setRows,
  status,
  setStatus,
  onRefresh,
  addRowLabel,
  saveLabel,
  keyPlaceholder,
  valuePlaceholder,
  keyAriaLabel,
  valueAriaLabel,
  removeAriaLabel,
  saveUrl,
  emptyError,
  duplicatePrefix,
  incompleteError,
  disallowSameValue = false,
  sameValueError,
  savingText,
  savedNoun,
  saveFailurePrefix,
  rowClassName,
}: MappingRowsEditorProps) {
  const [saving, setSaving] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const updateRow = (id: string, patch: Partial<MappingRow>) => {
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    setRows((previous) => previous.filter((row) => row.id !== id));
  };

  const addRow = () => {
    setRows((previous) => [...previous, { id: nextRowId(), key: '', value: '' }]);
  };

  const buildPayload = (): BuiltPayload => {
    const entries: Record<string, string> = {};
    for (const row of rowsRef.current) {
      const id = String(row.key || '').trim();
      const value = String(row.value || '').trim();
      if (!id && !value) {
        continue;
      }
      if (!id || !value) {
        return { ok: false, error: incompleteError };
      }
      if (Object.prototype.hasOwnProperty.call(entries, id)) {
        return { ok: false, error: `${duplicatePrefix}: ${id}` };
      }
      if (disallowSameValue && id === value) {
        return { ok: false, error: `${sameValueError}: ${id}` };
      }
      entries[id] = value;
    }
    if (Object.keys(entries).length === 0) {
      return { ok: false, error: emptyError };
    }
    return { ok: true, entries };
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload.ok) {
      setStatus({ text: payload.error, tone: 'error' });
      return;
    }

    setSaving(true);
    setStatus({ text: savingText, tone: 'info' });
    try {
      const response = await fetch(saveUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.entries),
      });
      const result = await response.json();
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || `Failed to save ${savedNoun}`);
      }

      const savedEntries: Record<string, unknown> = result.entries || payload.entries;
      setRows(entriesToRows(savedEntries));
      const count = Object.keys(savedEntries).length;
      setStatus({ text: `Saved ${count} ${savedNoun}${count === 1 ? '' : 's'}.`, tone: 'success' });
    } catch (error) {
      setStatus({ text: `${saveFailurePrefix}: ${(error as Error).message || String(error)}`, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-group">
      {heading && <h3 className="settings-heading">{heading}</h3>}
      {description && <p className="subtle-copy">{description}</p>}
      <div className="actor-name-cache-controls form-actions">
        <button type="button" onClick={() => onRefresh?.()}>
          Refresh
        </button>
        <button type="button" onClick={addRow}>
          {addRowLabel}
        </button>
        <button type="button" disabled={saving} onClick={handleSave}>
          {saveLabel}
        </button>
      </div>
      <p className={`actor-name-cache-status actor-name-cache-status-${status.tone}`}>{status.text}</p>
      <div className="actor-name-cache-rows">
        {rows.map((row) => (
          <div key={row.id} className={rowClassName}>
            <input
              type="text"
              placeholder={keyPlaceholder}
              aria-label={keyAriaLabel}
              value={row.key}
              onChange={(event) => updateRow(row.id, { key: event.target.value })}
            />
            <input
              type="text"
              placeholder={valuePlaceholder}
              aria-label={valueAriaLabel}
              value={row.value}
              onChange={(event) => updateRow(row.id, { value: event.target.value })}
            />
            <button type="button" className="actor-name-cache-remove" aria-label={removeAriaLabel} onClick={() => removeRow(row.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
