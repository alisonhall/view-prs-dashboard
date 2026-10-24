/**
 * ExportTab - React-owned content for the Management "Export" tab, mounted
 * into `#export-container`: the field catalog, field selection (saved to
 * user-defaults), and Preview / Copy / Download of the export JSON.
 *
 * It exports "only sections currently expanded": the PR numbers in the
 * table's open sections, from PrTableOpenSectionsContext. Until UI redesign
 * phase 1 that was read from the DOM (`<details open>` and the
 * `pr-group-section` / `pr-number-cell` classes), which would have broken
 * as soon as the table's markup changed.
 *
 * Field selection is real React state, not the vanilla version's
 * DOM-checkbox scraping - which existed only because the vanilla catalog
 * list was rebuilt via innerHTML on every payload update, discarding
 * whatever was checked. React state survives payload updates for free, so
 * newly-appeared fields simply aren't in the selection Set until a user
 * (or the saved-selection restore below) adds them - no previous-selection
 * reconciliation dance needed.
 *
 * @module components/ExportTab
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrData } from '../state/PrDataContext';
import { usePrTableOpenSections } from '../state/PrTableUiStateContext';
import { safeJsonStringify } from '../helpers/pr-ui-render-utils.helpers.ts';
import { createPrExportHelpers, type ExportPayload, type ExportPayloadSource } from '../helpers/pr-export.helpers.ts';
import { getPerPrUserStateFromPayload } from '../helpers/pr-per-pr-user-state.helpers.ts';

const { getFieldCatalog, buildExportPayload } = createPrExportHelpers({ getPerPrUserStateFromPayload });

const EXPORT_DATA_FIELDS_OVERRIDE_KEY = 'export-data-fields';
const EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY = 'export-user-state-fields';

type FieldSource = 'data' | 'user-state';
type Overrides = Record<string, unknown>;

const fieldId = (source: FieldSource, path: string) => `${source}:${path}`;

const readUserDefaults = async (): Promise<Overrides> => {
  try {
    const response = await fetch('/view-prs/user-defaults');
    if (!response.ok) return {};
    const result = await response.json();
    const overrides = result?.overrides;
    return overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
  } catch (_error) {
    return {};
  }
};

const writeUserDefaults = async (overrides: Overrides): Promise<void> => {
  try {
    await fetch('/view-prs/user-defaults', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrides || {}),
    });
  } catch (_error) {
    // Best effort only, same as every other UI-option-override write in this app.
  }
};

const formatExportDownloadFileName = (payload: ExportPayloadSource, selectedRepo: string) => {
  const repo = String(payload?.lastRun?.repo || selectedRepo || 'all-repos')
    .trim()
    .replace(/[^a-z0-9_.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `view-prs-export-${repo || 'all-repos'}-${stamp}.json`;
};

const toErrorMessage = (error: unknown, fallback: string) =>
  String((error as { message?: unknown } | null)?.message || error || fallback);

const describeCount = (verb: string, exportPayload: ExportPayload) =>
  `${verb} export JSON for ${exportPayload.prCount} visible PR${exportPayload.prCount === 1 ? '' : 's'}.`;

export function ExportTab() {
  const { payload, selectedRepo } = usePrData();
  const { prNumbersInOpenSections, openSectionCount } = usePrTableOpenSections();
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string> | null>(null); // null until initialized
  const [status, setStatus] = useState('Waiting for data...');
  const [preview, setPreview] = useState('Run Preview JSON to inspect the export payload.');
  const initializedRef = useRef(false);

  const catalog = useMemo(() => getFieldCatalog(payload), [payload]);

  // Initialize the selection exactly once, from saved user-defaults if
  // present, otherwise "everything selected" (the same default the vanilla
  // version used for a fresh catalog). Runs again if the catalog was empty
  // on the first pass (e.g. payload hadn't loaded yet) and later gains
  // fields, but never re-runs once a real selection exists.
  useEffect(() => {
    if (initializedRef.current) return undefined;
    const allFieldIds = [
      ...catalog.dataPaths.map((path) => fieldId('data', path)),
      ...catalog.userStatePaths.map((path) => fieldId('user-state', path)),
    ];
    if (allFieldIds.length === 0) return undefined;

    let cancelled = false;
    void (async () => {
      const overrides = await readUserDefaults();
      if (cancelled || initializedRef.current) return;
      const savedData = overrides[EXPORT_DATA_FIELDS_OVERRIDE_KEY];
      const savedUserState = overrides[EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY];
      const savedDataPaths = Array.isArray(savedData) ? savedData.map(String) : null;
      const savedUserStatePaths = Array.isArray(savedUserState) ? savedUserState.map(String) : null;

      const initial =
        savedDataPaths || savedUserStatePaths
          ? new Set([
              ...(savedDataPaths || []).map((path) => fieldId('data', path)),
              ...(savedUserStatePaths || []).map((path) => fieldId('user-state', path)),
            ])
          : new Set(allFieldIds);

      initializedRef.current = true;
      setSelectedFieldIds(initial);
    })();

    return () => {
      cancelled = true;
    };
  }, [catalog]);

  const isSelected = (source: FieldSource, path: string) => selectedFieldIds?.has(fieldId(source, path)) ?? false;

  // Marking the ref here (not just inside the mount effect) closes a real
  // race: a user who interacts before the saved-selection fetch resolves
  // must not have that manual choice silently clobbered once it does.
  const toggleField = (source: FieldSource, path: string) => {
    initializedRef.current = true;
    setSelectedFieldIds((previous) => {
      const next = new Set(previous || []);
      const id = fieldId(source, path);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const setSelectionByPredicate = (predicate: (source: FieldSource, path: string) => boolean) => {
    initializedRef.current = true;
    setSelectedFieldIds(
      new Set(
        [
          ...catalog.dataPaths.map((path) => ({ source: 'data' as const, path })),
          ...catalog.userStatePaths.map((path) => ({ source: 'user-state' as const, path })),
        ]
          .filter(({ source, path }) => predicate(source, path))
          .map(({ source, path }) => fieldId(source, path)),
      ),
    );
  };

  const getSelectedPaths = () => {
    const dataPaths: string[] = [];
    const userStatePaths: string[] = [];
    (selectedFieldIds || new Set<string>()).forEach((id) => {
      const [source, ...rest] = id.split(':');
      const path = rest.join(':');
      if (source === 'user-state') {
        userStatePaths.push(path);
      } else if (source === 'data') {
        dataPaths.push(path);
      }
    });
    return { dataPaths, userStatePaths };
  };

  const persistSelection = async () => {
    const selected = getSelectedPaths();
    const existingOverrides = await readUserDefaults();
    await writeUserDefaults({
      ...existingOverrides,
      [EXPORT_DATA_FIELDS_OVERRIDE_KEY]: selected.dataPaths,
      [EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY]: selected.userStatePaths,
    });
    return selected;
  };

  const buildVisibleExportJson = () => {
    const selected = getSelectedPaths();
    if (selected.dataPaths.length + selected.userStatePaths.length === 0) {
      throw new Error('Select at least one field before exporting.');
    }

    const exportPayload = buildExportPayload({
      payload,
      visiblePrNumbers: prNumbersInOpenSections,
      selectedDataPaths: selected.dataPaths,
      selectedUserStatePaths: selected.userStatePaths,
    });
    const jsonText = safeJsonStringify(exportPayload);

    return { jsonText, exportPayload };
  };

  const handlePreview = async () => {
    await persistSelection();
    try {
      const { jsonText, exportPayload } = buildVisibleExportJson();
      setPreview(jsonText);
      setStatus(describeCount('Prepared', exportPayload));
    } catch (error) {
      setStatus(toErrorMessage(error, 'Failed to build export JSON.'));
    }
  };

  const handleCopy = async () => {
    await persistSelection();
    try {
      const { jsonText, exportPayload } = buildVisibleExportJson();
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API not available in this browser.');
      }
      await navigator.clipboard.writeText(jsonText);
      setStatus(describeCount('Copied', exportPayload));
    } catch (error) {
      setStatus(toErrorMessage(error, 'Copy failed.'));
    }
  };

  const handleDownload = async () => {
    await persistSelection();
    let objectUrl = '';
    let anchor: HTMLAnchorElement | null = null;
    try {
      const { jsonText, exportPayload } = buildVisibleExportJson();
      if (typeof Blob === 'undefined' || !window.URL?.createObjectURL) {
        throw new Error('Download is not supported in this browser.');
      }
      const blob = new Blob([jsonText], { type: 'application/json' });
      objectUrl = window.URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = formatExportDownloadFileName(payload, selectedRepo);
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      setStatus(describeCount('Downloaded', exportPayload));
    } catch (error) {
      setStatus(toErrorMessage(error, 'Download failed.'));
    } finally {
      if (anchor) anchor.remove();
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    }
  };

  const selected = getSelectedPaths();
  const totalVisibleCount = Object.keys(payload?.byPrNumber || {}).length;
  const summaryText = [
    `Selected fields: ${selected.dataPaths.length} data + ${selected.userStatePaths.length} user state`,
    `Visible PR rows eligible for export: ${prNumbersInOpenSections.length}/${totalVisibleCount}`,
    `Expanded PR sections: ${openSectionCount}`,
  ].join('\n');

  const renderFieldOption = (source: FieldSource, path: string) => (
    <label className="export-field-option" key={fieldId(source, path)}>
      <input
        type="checkbox"
        checked={isSelected(source, path)}
        onChange={() => toggleField(source, path)}
        data-export-field-id={fieldId(source, path)}
        data-export-source={source}
        data-export-path={path}
      />
      <span>
        <span className="export-field-option-source">{source === 'user-state' ? 'USER' : 'DATA'}</span>
        {path}
      </span>
    </label>
  );

  return (
    <>
      <pre className="management-filter-summary">{summaryText}</pre>

      <div className="export-field-controls form-actions">
        <button type="button" onClick={() => setSelectionByPredicate(() => true)}>
          Select all
        </button>
        <button type="button" onClick={() => setSelectionByPredicate(() => false)}>
          Select none
        </button>
        <button type="button" onClick={() => setSelectionByPredicate((source) => source === 'data')}>
          Data only
        </button>
        <button type="button" onClick={() => setSelectionByPredicate((source) => source === 'user-state')}>
          User state only
        </button>
      </div>

      <div className="export-field-list" id="export-field-list" role="group" aria-label="Export fields">
        {catalog.dataPaths.length === 0 && catalog.userStatePaths.length === 0 ? (
          <p className="stats-empty">No exportable fields found in current payload.</p>
        ) : (
          <>
            {catalog.dataPaths.map((path) => renderFieldOption('data', path))}
            {catalog.userStatePaths.map((path) => renderFieldOption('user-state', path))}
          </>
        )}
      </div>

      <div className="form-actions export-actions">
        <button type="button" onClick={() => void handlePreview()}>
          Preview JSON
        </button>
        <button type="button" onClick={() => void handleCopy()}>
          Copy JSON
        </button>
        <button type="button" onClick={() => void handleDownload()}>
          Download JSON
        </button>
      </div>
      <pre className="scheduler-details" role="region" aria-label="Export status">{status}</pre>
      <details className="advanced-options section-card low-emphasis-card" open>
        <summary>Export preview</summary>
        <pre id="export-preview" role="region" aria-label="Export preview">{preview}</pre>
      </details>
    </>
  );
}
