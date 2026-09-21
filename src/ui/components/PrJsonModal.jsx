/**
 * PrJsonModal - "View PR JSON details" dialog (data file entry, pr-detail
 * file entry, user-state entry, and the PR diff with wrap/copy controls).
 * The React version now used everywhere - the vanilla original
 * (components/pr-json-modal.component.js, plus its
 * helpers/pr-json-modal.helpers.js) was deleted once this fully replaced
 * it; its "Copy for AI"/diff-summary logic below is a standalone
 * reimplementation, not a shared helper.
 *
 * @module components/PrJsonModal
 */

import React, { useEffect, useRef, useState } from 'react';

function summarizeDiffText(diffText) {
  const lines = String(diffText || '').split(/\r?\n/);
  const summary = { filesChanged: 0, hunks: 0, additions: 0, deletions: 0, lines: lines.length };
  lines.forEach((line) => {
    if (line.startsWith('diff --git ')) summary.filesChanged += 1;
    if (line.startsWith('@@')) summary.hunks += 1;
    if (line.startsWith('+') && !line.startsWith('+++')) summary.additions += 1;
    if (line.startsWith('-') && !line.startsWith('---')) summary.deletions += 1;
  });
  return summary;
}

function buildPrJsonModalPayload({ entry, pr, payload, defaultRepo, getPerPrUserStateFromPayload }) {
  const prNumber = String(pr?.number || entry?.prNumber || '').trim();
  const byPrNumber = payload?.byPrNumber || {};
  const payloadEntry = byPrNumber?.[prNumber];
  const dataSourceEntry = payloadEntry || entry || {};
  const dataFileEntry =
    dataSourceEntry && typeof dataSourceEntry === 'object' ? { ...dataSourceEntry } : dataSourceEntry;

  if (dataFileEntry && typeof dataFileEntry === 'object' && !Array.isArray(dataFileEntry)) {
    delete dataFileEntry.notes;
  }

  const splitPrDetailFields = ['activityTimeline', 'activityEvents', 'reviewThreads', 'commentEvents'];
  const dataRow =
    dataFileEntry &&
    typeof dataFileEntry === 'object' &&
    !Array.isArray(dataFileEntry) &&
    dataFileEntry.data &&
    typeof dataFileEntry.data === 'object' &&
    !Array.isArray(dataFileEntry.data)
      ? dataFileEntry.data
      : null;
  const detailRef = dataRow && typeof dataRow.detailRef === 'object' ? dataRow.detailRef : null;
  const prDetailEntry = {};

  splitPrDetailFields.forEach((fieldName) => {
    if (!dataRow) return;
    if (!Object.prototype.hasOwnProperty.call(dataRow, fieldName)) return;
    prDetailEntry[fieldName] = Array.isArray(dataRow[fieldName]) ? [...dataRow[fieldName]] : [];
    delete dataRow[fieldName];
  });

  const repo = String(
    pr?.repo || entry?.repo || payloadEntry?.repo || payload?.lastRun?.repo || defaultRepo || '',
  ).trim();

  return {
    prNumber,
    repo,
    dataFile: { file: 'check-open-pr-updates.data.json', entry: dataFileEntry },
    prDetailFile: {
      file: String(detailRef?.file || '').trim() || 'data/pr-details/<repo>__pr-<number>.json',
      entry: prDetailEntry,
    },
    userStateFile: {
      file: 'check-open-pr-updates.user-state.json',
      entry: getPerPrUserStateFromPayload(payload, entry, prNumber, repo),
    },
  };
}

function formatDiffSummaryLine(diffData, safeJsonStringify) {
  if (!diffData || diffData.ok === false) {
    return String(diffData?.error || 'Diff data is unavailable');
  }
  const stats = summarizeDiffText(diffData.diffText);
  const source = String(diffData.source || '').trim() || 'unknown source';
  const freshness = diffData.stale ? 'stale cache' : 'current';
  const fetchedAt = diffData.fetchedAt ? ` fetched ${diffData.fetchedAt}` : '';
  return `${stats.filesChanged} files, +${stats.additions}/-${stats.deletions}, ${stats.hunks} hunks, ${stats.lines} lines, ${source}, ${freshness}${fetchedAt}`;
}

function buildPrJsonModalAiClipboardText(detailsPayload, diffData, safeJsonStringify) {
  const payload = detailsPayload || {};
  const diff = diffData || {};
  const repo = String(payload.repo || '').trim() || 'unknown';
  const prNumber = String(payload.prNumber || '').trim() || 'unknown';
  const dataFile = payload.dataFile || { file: 'check-open-pr-updates.data.json', entry: null };
  const prDetailFile = payload.prDetailFile || { file: 'data/pr-details/<repo>__pr-<number>.json', entry: null };
  const userStateFile = payload.userStateFile || { file: 'check-open-pr-updates.user-state.json', entry: null };

  const diffMetadata = {
    ok: Boolean(diff.ok),
    file: diff.file || 'data/pr-diffs/<repo>__pr-<number>.json',
    source: diff.source || '',
    stale: Boolean(diff.stale),
    warning: diff.warning || '',
    commitFingerprint: diff.commitFingerprint || '',
    fetchedAt: diff.fetchedAt || null,
    filePath: diff.filePath || '',
    error: diff.ok === false ? String(diff.error || 'Unknown diff error') : '',
  };

  return [
    'PR JSON Details for AI Review',
    `Repo: ${repo}`,
    `PR Number: ${prNumber}`,
    '',
    `Data File Entry (${String(dataFile.file || 'check-open-pr-updates.data.json')})`,
    '```json',
    safeJsonStringify(dataFile.entry),
    '```',
    '',
    `PR Detail File (${String(prDetailFile.file || 'data/pr-details/<repo>__pr-<number>.json')})`,
    '```json',
    safeJsonStringify(prDetailFile.entry),
    '```',
    '',
    `User State Entry (${String(userStateFile.file || 'check-open-pr-updates.user-state.json')})`,
    '```json',
    safeJsonStringify(userStateFile.entry),
    '```',
    '',
    `PR Diff Metadata (${String(diffMetadata.file || 'data/pr-diffs/<repo>__pr-<number>.json')})`,
    '```json',
    safeJsonStringify(diffMetadata),
    '```',
    '',
    'PR Diff Text',
    '```diff',
    String(diff.diffText || ''),
    '```',
  ].join('\n');
}

async function fetchPrDiffForModal({ repo, prNumber }) {
  const safeRepo = encodeURIComponent(String(repo || '').trim());
  const safePr = encodeURIComponent(String(prNumber || '').trim());
  if (!safeRepo || !safePr) {
    return { ok: false, error: 'Missing repo or PR number for diff lookup' };
  }
  try {
    const response = await fetch(`/view-prs/diff?repo=${safeRepo}&prNumber=${safePr}`);
    const result = await response.json();
    if (!response.ok || result?.ok === false) {
      return { ok: false, error: result?.error || `Failed to load diff (HTTP ${response.status})` };
    }
    return {
      ok: true,
      file: 'data/pr-diffs/<repo>__pr-<number>.json',
      source: result.source || '',
      stale: Boolean(result.stale),
      warning: String(result.warning || ''),
      commitFingerprint: String(result.commitFingerprint || ''),
      fetchedAt: result.fetchedAt || null,
      filePath: String(result.filePath || ''),
      diffText: String(result.diffText || ''),
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || 'Failed to load diff') };
  }
}

function getDiffLineType(line) {
  const text = String(line || '');
  if (text.startsWith('diff --git ')) return 'file';
  if (text.startsWith('index ') || text.startsWith('Binary files ')) return 'meta';
  if (text.startsWith('@@')) return 'hunk';
  if (text.startsWith('+') && !text.startsWith('+++')) return 'add';
  if (text.startsWith('-') && !text.startsWith('---')) return 'del';
  return 'context';
}

function parseFileHeader(line) {
  const header = String(line || '');
  const fileHeaderMatch = header.match(/^diff --git\s+a\/(.+?)\s+b\/(.+)$/);
  if (fileHeaderMatch) return `${fileHeaderMatch[1]} -> ${fileHeaderMatch[2]}`;
  return header.replace(/^diff --git\s*/, '');
}

// Groups raw diff lines into per-file <details> blocks, matching the shape
// the vanilla renderer this component replaced used to build in the DOM
// (that vanilla builder, renderDiffText in helpers/pr-diff-render.helpers.js,
// was deleted once nothing else called it - see REACT_MIGRATION_PLAN.md's
// 2026-09-20 entry).
function buildDiffBlocks(diffText) {
  const lines = String(diffText || '').split(/\r?\n/);
  const blocks = [];
  let current = null;
  lines.forEach((line, index) => {
    const lineType = getDiffLineType(line);
    if (lineType === 'file') {
      current = { filePath: parseFileHeader(line), lines: [] };
      blocks.push(current);
      return;
    }
    const row = { key: index, type: lineType, text: line.length ? line : ' ' };
    if (current) {
      current.lines.push(row);
    } else {
      if (!blocks.length || blocks[0].filePath !== undefined) blocks.unshift({ filePath: null, lines: [] });
      blocks[0].lines.push(row);
    }
  });
  return blocks;
}

function getModalFocusableElements(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  return Array.from(
    root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ).filter((node) => {
    if (!node || node.disabled) return false;
    return node.getAttribute?.('aria-hidden') !== 'true';
  });
}

export function PrJsonModal({ target, payload, onClose }) {
  const isOpen = Boolean(target);
  const rootRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastActiveElementRef = useRef(null);
  const bodyOverflowRef = useRef('');

  const [detailsPayload, setDetailsPayload] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [copyAllLabel, setCopyAllLabel] = useState('Copy all');
  const [copyDiffLabel, setCopyDiffLabel] = useState('Copy diff');

  const safeJsonStringify =
    window.safeJsonStringify || ((value) => JSON.stringify(value ?? null, null, 2));
  const getPerPrUserStateFromPayload =
    window.getPerPrUserStateFromPayload ||
    (() => ({ notesByPrNumber: null, ackByRepo: null, reverifyByRepo: null, inReviewByRepo: null }));
  const defaultRepo = window.DEFAULT_REPO || '';

  // Open/close lifecycle: build the JSON payload synchronously, fetch the
  // diff, manage focus + Escape/Tab handling + body scroll lock, matching
  // vanilla's openPrJsonModal/closePrJsonModal/handlePrJsonModalKeydown.
  useEffect(() => {
    if (!isOpen) return undefined;

    const builtPayload = buildPrJsonModalPayload({
      entry: target.entry,
      pr: target.pr,
      payload,
      defaultRepo,
      getPerPrUserStateFromPayload,
    });
    setDetailsPayload(builtPayload);
    setDiffData(null);
    setLoading(true);
    setWrapped(false);
    setCopyAllLabel('Copy all');
    setCopyDiffLabel('Copy diff');

    lastActiveElementRef.current = document.activeElement;
    if (document.body?.style) {
      bodyOverflowRef.current = String(document.body.style.overflow || '');
      document.body.style.overflow = 'hidden';
    }

    let cancelled = false;
    fetchPrDiffForModal({ repo: builtPayload.repo, prNumber: builtPayload.prNumber }).then((result) => {
      if (cancelled) return;
      setDiffData(result);
      setLoading(false);
    });

    const handleKeydown = (event) => {
      const key = String(event?.key || '');
      if (key === 'Escape') {
        event.preventDefault?.();
        onClose?.();
        return;
      }
      if (key !== 'Tab') return;

      const focusable = getModalFocusableElements(rootRef.current);
      if (!focusable.length) {
        event.preventDefault?.();
        rootRef.current?.focus?.();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!event.shiftKey && active === last) {
        event.preventDefault?.();
        first.focus?.();
      } else if (event.shiftKey && active === first) {
        event.preventDefault?.();
        last.focus?.();
      }
    };
    document.addEventListener('keydown', handleKeydown);

    return () => {
      cancelled = true;
      document.removeEventListener('keydown', handleKeydown);
      if (document.body?.style) {
        document.body.style.overflow = bodyOverflowRef.current;
      }
      lastActiveElementRef.current?.focus?.();
      lastActiveElementRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, target]);

  // Focus the close button once the modal actually opens (after the DOM commits).
  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus?.();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const diffBlocks = buildDiffBlocks(diffData?.ok === false ? '' : diffData?.diffText || '');
  const diffMeta = loading ? 'Loading diff details...' : formatDiffSummaryLine(diffData, safeJsonStringify);
  const diffErrorText =
    diffData?.ok === false ? `Unable to load diff\n${String(diffData.error || 'Unknown error')}` : '';
  const copyAllText = detailsPayload
    ? buildPrJsonModalAiClipboardText(detailsPayload, diffData, safeJsonStringify)
    : '';

  const handleCopyAll = async () => {
    if (!copyAllText) {
      setCopyAllLabel('Unavailable');
      setTimeout(() => setCopyAllLabel('Copy all'), 1200);
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyAllText);
        setCopyAllLabel('Copied');
      } else {
        setCopyAllLabel('Unavailable');
      }
    } catch (_error) {
      setCopyAllLabel('Copy failed');
    }
    setTimeout(() => setCopyAllLabel('Copy all'), 1200);
  };

  const handleCopyDiff = async () => {
    const value = String(diffData?.diffText || '');
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopyDiffLabel('Copied');
      } else {
        setCopyDiffLabel('Unavailable');
      }
    } catch (_error) {
      setCopyDiffLabel('Copy failed');
    }
    setTimeout(() => setCopyDiffLabel('Copy diff'), 1200);
  };

  return (
    <div
      ref={rootRef}
      id="pr-json-modal"
      className="pr-json-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pr-json-modal-title"
      aria-describedby="pr-json-modal-subtitle"
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === rootRef.current) onClose?.();
      }}
    >
      <div className="pr-json-modal-card">
        <div className="pr-json-modal-header">
          <h3 id="pr-json-modal-title">PR JSON Details</h3>
          <button
            type="button"
            className="pr-json-modal-copy-btn"
            aria-label="Copy all PR JSON details for AI chat"
            disabled={loading || !copyAllText}
            onClick={handleCopyAll}
          >
            {copyAllLabel}
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            className="pr-json-modal-close"
            aria-label="Close PR JSON details"
            onClick={() => onClose?.()}
          >
            x
          </button>
        </div>

        <p id="pr-json-modal-subtitle" className="pr-json-modal-subtitle">
          {`PR #${detailsPayload?.prNumber || '-'} (${detailsPayload?.repo || 'repo unknown'})`}
        </p>

        <div id="pr-json-modal-content" className="pr-json-modal-content">
          <details className="pr-json-section" open>
            <summary>Data File Entry</summary>
            <pre className="pr-json-block">
              {loading ? 'Loading data file entry...' : safeJsonStringify(detailsPayload?.dataFile)}
            </pre>
          </details>

          <details className="pr-json-section" open>
            <summary>PR Detail File</summary>
            <pre className="pr-json-block">
              {loading ? 'Loading pr-detail file entry...' : safeJsonStringify(detailsPayload?.prDetailFile)}
            </pre>
          </details>

          <details className="pr-json-section" open>
            <summary>User State Entry</summary>
            <pre className="pr-json-block">
              {loading ? 'Loading user-state entry...' : safeJsonStringify(detailsPayload?.userStateFile)}
            </pre>
          </details>

          <details className="pr-json-section pr-json-section-diff" open>
            <summary>PR Diff</summary>
            <div className="pr-json-diff-header">
              <div className="pr-json-diff-actions">
                <button type="button" className="pr-json-diff-btn" onClick={() => setWrapped((prev) => !prev)}>
                  {wrapped ? 'Unwrap lines' : 'Wrap lines'}
                </button>
                <button type="button" className="pr-json-diff-btn" onClick={handleCopyDiff}>
                  {copyDiffLabel}
                </button>
              </div>
            </div>
            <p className="pr-json-diff-meta">{diffMeta}</p>
            <div
              className={`pr-json-diff${wrapped ? ' is-wrapped' : ''}`}
              data-wrapped={wrapped ? 'true' : 'false'}
              data-raw-diff={String(diffData?.diffText || '')}
            >
              {loading ? (
                'Loading diff...'
              ) : diffErrorText ? (
                diffErrorText
              ) : (
                diffBlocks.map((block, blockIndex) =>
                  block.filePath !== null ? (
                    <details key={blockIndex} className="pr-json-diff-file-block" open>
                      <summary className="pr-json-diff-line pr-json-diff-line-file pr-json-diff-file-summary">
                        <span className="pr-json-diff-file-pill">FILE</span>
                        <span className="pr-json-diff-file-path">{block.filePath}</span>
                      </summary>
                      <div className="pr-json-diff-file-body">
                        {block.lines.map((line) => (
                          <div key={line.key} className={`pr-json-diff-line pr-json-diff-line-${line.type}`}>
                            {line.text}
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : (
                    block.lines.map((line) => (
                      <div key={line.key} className={`pr-json-diff-line pr-json-diff-line-${line.type}`}>
                        {line.text}
                      </div>
                    ))
                  ),
                )
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
