/**
 * ExportTab - React-owned content for the Management "Export" tab, mounted
 * into `#export-container`.
 *
 * Post-Phase-6 follow-up (see REACT_MIGRATION_PLAN.md), second slice of the
 * second not-yet-converted-tabs survey category (Action Log, then this).
 * Replaces the vanilla field-catalog/selection/preview/copy/download
 * machinery in index.page.js (getExportFieldCheckboxes/
 * getSelectedExportFieldPaths/persistExportFieldSelections/
 * renderExportFieldCatalog/renderExportSelectionSummary/
 * setExportCheckboxSelection, all deleted) and the three helper files that
 * only existed to wrap DOM reads/writes around it
 * (pr-export-actions.helpers.js, pr-export-preview-summary.helpers.js,
 * pr-export-json-build.helpers.js, all deleted). Like ActorNamesTab (and
 * unlike Action Log's container-split), this tab's buttons/status/preview
 * are ALL React-owned now - there's no vanilla chrome left to bridge to.
 *
 * The field catalog and export payload building stay pure vanilla
 * functions (getExportFieldCatalog/buildExportPayload, from
 * pr-export.helpers.js, exposed on window by index.page.js) - genuine
 * data-shaping logic with no DOM dependency, the same "leaf components read
 * window.* for pure helpers" pattern established throughout this
 * migration. getVisiblePrNumbersFromSectionsHost (same file) is a real,
 * necessary DOM read, not a fallback: the tab's own description says it
 * exports "only sections currently expanded", which is `<details open>`
 * UI state PrDataContext doesn't (and shouldn't) track.
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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePrData } from '../state/PrDataContext';

const EXPORT_DATA_FIELDS_OVERRIDE_KEY = 'export-data-fields';
const EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY = 'export-user-state-fields';

const fieldId = (source, path) => `${source}:${path}`;

const readUserDefaults = async () => {
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

const writeUserDefaults = async (overrides) => {
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

const collectOpenSectionCount = () => {
  const sectionsHost = document.getElementById('pr-sections');
  if (!sectionsHost) return 0;
  return Array.from(sectionsHost.getElementsByClassName('pr-group-section')).filter(
    (section) => section.open === true,
  ).length;
};

const formatExportDownloadFileName = (payload, selectedRepo) => {
  const repo = String(payload?.lastRun?.repo || selectedRepo || 'all-repos')
    .trim()
    .replace(/[^a-z0-9_.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `view-prs-export-${repo || 'all-repos'}-${stamp}.json`;
};

export function ExportTab() {
  const { payload, selectedRepo } = usePrData();
  const [selectedFieldIds, setSelectedFieldIds] = useState(null); // null until initialized
  const [status, setStatus] = useState('Waiting for data...');
  const [preview, setPreview] = useState('Run Preview JSON to inspect the export payload.');
  const initializedRef = useRef(false);

  const catalog = useMemo(
    () => (window.getExportFieldCatalog ? window.getExportFieldCatalog(payload) : { dataPaths: [], userStatePaths: [] }),
    [payload],
  );

  // Initialize the selection exactly once, from saved user-defaults if
  // present, otherwise "everything selected" (the same default the vanilla
  // version used for a fresh catalog). Runs again if the catalog was empty
  // on the first pass (e.g. payload hadn't loaded yet) and later gains
  // fields, but never re-runs once a real selection exists.
  useEffect(() => {
    if (initializedRef.current) return;
    const allFieldIds = [
      ...catalog.dataPaths.map((path) => fieldId('data', path)),
      ...catalog.userStatePaths.map((path) => fieldId('user-state', path)),
    ];
    if (allFieldIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const overrides = await readUserDefaults();
      if (cancelled || initializedRef.current) return;
      const savedData = Array.isArray(overrides[EXPORT_DATA_FIELDS_OVERRIDE_KEY])
        ? overrides[EXPORT_DATA_FIELDS_OVERRIDE_KEY]
        : null;
      const savedUserState = Array.isArray(overrides[EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY])
        ? overrides[EXPORT_USER_STATE_FIELDS_OVERRIDE_KEY]
        : null;

      const initial =
        savedData || savedUserState
          ? new Set([
              ...(savedData || []).map((path) => fieldId('data', path)),
              ...(savedUserState || []).map((path) => fieldId('user-state', path)),
            ])
          : new Set(allFieldIds);

      initializedRef.current = true;
      setSelectedFieldIds(initial);
    })();

    return () => {
      cancelled = true;
    };
  }, [catalog]);

  const isSelected = (source, path) => selectedFieldIds?.has(fieldId(source, path)) ?? false;

  // Marking the ref here (not just inside the mount effect) closes a real
  // race: a user who interacts before the saved-selection fetch resolves
  // must not have that manual choice silently clobbered once it does.
  const toggleField = (source, path) => {
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

  const setSelectionByPredicate = (predicate) => {
    initializedRef.current = true;
    setSelectedFieldIds(
      new Set(
        [
          ...catalog.dataPaths.map((path) => ({ source: 'data', path })),
          ...catalog.userStatePaths.map((path) => ({ source: 'user-state', path })),
        ]
          .filter(({ source, path }) => predicate(source, path))
          .map(({ source, path }) => fieldId(source, path)),
      ),
    );
  };

  const getSelectedPaths = () => {
    const dataPaths = [];
    const userStatePaths = [];
    (selectedFieldIds || new Set()).forEach((id) => {
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

    const visiblePrNumbers = window.getVisiblePrNumbersFromSectionsHost
      ? window.getVisiblePrNumbersFromSectionsHost(document.getElementById('pr-sections'))
      : [];
    const exportPayload = window.buildExportPayload
      ? window.buildExportPayload({
          payload,
          visiblePrNumbers,
          selectedDataPaths: selected.dataPaths,
          selectedUserStatePaths: selected.userStatePaths,
        })
      : { prCount: 0, prs: [] };
    const jsonText = window.safeJsonStringify
      ? window.safeJsonStringify(exportPayload)
      : JSON.stringify(exportPayload, null, 2);

    return { jsonText, exportPayload };
  };

  const toErrorMessage = (error, fallback) => String(error?.message || error || fallback);

  const handlePreview = async () => {
    await persistSelection();
    try {
      const { jsonText, exportPayload } = buildVisibleExportJson();
      setPreview(jsonText);
      setStatus(`Prepared export JSON for ${exportPayload.prCount} visible PR${exportPayload.prCount === 1 ? '' : 's'}.`);
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
      setStatus(`Copied export JSON for ${exportPayload.prCount} visible PR${exportPayload.prCount === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(toErrorMessage(error, 'Copy failed.'));
    }
  };

  const handleDownload = async () => {
    await persistSelection();
    let objectUrl = '';
    let anchor = null;
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
      setStatus(`Downloaded export JSON for ${exportPayload.prCount} visible PR${exportPayload.prCount === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(toErrorMessage(error, 'Download failed.'));
    } finally {
      if (anchor) anchor.remove();
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    }
  };

  const selected = getSelectedPaths();
  const visibleCount = window.getVisiblePrNumbersFromSectionsHost
    ? window.getVisiblePrNumbersFromSectionsHost(document.getElementById('pr-sections')).length
    : 0;
  const totalVisibleCount = Object.keys(payload?.byPrNumber || {}).length;
  const summaryText = [
    `Selected fields: ${selected.dataPaths.length} data + ${selected.userStatePaths.length} user state`,
    `Visible PR rows eligible for export: ${visibleCount}/${totalVisibleCount}`,
    `Expanded PR sections: ${collectOpenSectionCount()}`,
  ].join('\n');

  const renderFieldOption = (source, path) => (
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

      <div className="export-field-list" id="export-field-list">
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
      <pre className="scheduler-details">{status}</pre>
      <details className="advanced-options section-card low-emphasis-card" open>
        <summary>Export preview</summary>
        <pre id="export-preview">{preview}</pre>
      </details>
    </>
  );
}
