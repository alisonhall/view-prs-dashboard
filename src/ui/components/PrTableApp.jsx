/**
 * PrTableApp - Main React container for PR table
 * 
 * Phase 1: Hybrid React Migration
 * This component replaces the vanilla JS table rendering while keeping
 * filters and controls in vanilla JS.
 * 
 * @module components/PrTableApp
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PrSection } from './PrSection';
import { PrJsonModal } from './PrJsonModal';

/**
 * Main PR Table Application Component
 * 
 * Renders all PR sections (smart groups + lifecycle sections) with React.
 * Manages section open/closed state and expandable insights state.
 * 
 * @param {Object} props
 * @param {Object} props.initialPayload - Initial PR data payload
 * @param {string} props.selectedRepo - Currently selected repository
 * @param {string[]} [props.visiblePrNumbers] - PR numbers that pass the
 *   active local filters (scope/PR-number/label/author/assigned/approver);
 *   null/undefined means no filter is active (show everything for the repo)
 * @param {Function} props.onCheckboxChange - Callback for checkbox changes (flagged/inReview)
 * @param {Function} props.onAckAction - Callback for Ack button clicks
 * @returns {JSX.Element}
 */
export function PrTableApp({
  initialPayload,
  selectedRepo,
  visiblePrNumbers,
  onCheckboxChange,
  onAckAction,
  onApplyLabel,
}) {
  // State: PR data payload
  const [payload, setPayload] = useState(initialPayload);

  // index.page.js's update path (updateReactTable -> react-app.jsx's
  // mountReactPrTable/updateReactPrTable, see REACT_MIGRATION_PLAN.md
  // Track C slice C2b) re-renders this component with a new `initialPayload`
  // prop via root.render() rather than calling setPayload directly. useState's
  // initial value is only read on the very first render, so without this sync
  // any update delivered that way (e.g. after toggling a Flagged/In Review
  // checkbox) would silently never reach `payload`.
  useEffect(() => {
    if (initialPayload && initialPayload !== payload) {
      setPayload(initialPayload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPayload]);

  // State: Section open/closed (keyed by section key: 'flagged', 'open', etc.)
  const [openSections, setOpenSections] = useState({});

  // State: Expanded insights rows (keyed by composite: 'section:prNumber')
  const [expandedInsights, setExpandedInsights] = useState({});

  // State: PR numbers currently being refreshed by the scheduler (shows the
  // small in-progress spinner in PrNumberCell). Kept separate from `payload`
  // since it's driven by its own poll loop (renderSchedulerStatus in
  // index.page.js), independent of data refresh - see the
  // 'pr-active-progress-update' listener below. Deliberately NOT a
  // dependency of the `sections` useMemo: it's threaded straight to
  // PrSection/PrTable/PrRow as its own prop so only the specific rows whose
  // active status actually changes re-render (PrRow is memoized).
  const [activePrNumbers, setActivePrNumbers] = useState([]);

  useEffect(() => {
    const handleActiveProgressUpdate = (event) => {
      setActivePrNumbers(event.detail?.activePrNumbers || []);
    };

    window.addEventListener('pr-active-progress-update', handleActiveProgressUpdate);
    return () => {
      window.removeEventListener('pr-active-progress-update', handleActiveProgressUpdate);
    };
  }, []);

  // State: PR numbers with a user-initiated Ack/Clear, Update, or Add-Label
  // request currently in flight - shares the same PrNumberCell spinner as
  // activePrNumbers (the scheduler's own in-progress set) above, merged
  // together below, so a row shows "busy" whichever reason applies. A Set
  // so concurrent actions on different rows (or, briefly, the same row)
  // don't clobber each other's add/remove.
  const [busyPrNumbers, setBusyPrNumbers] = useState(() => new Set());

  const markPrBusy = useCallback((prNumber) => {
    const key = String(prNumber);
    setBusyPrNumbers((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const clearPrBusy = useCallback((prNumber) => {
    const key = String(prNumber);
    setBusyPrNumbers((prev) => {
      if (!prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Wraps the Ack/Apply-Label/Update handlers so the acted-on row shows the
  // in-progress spinner for the duration of the request, regardless of
  // outcome (success, failure, or thrown error). useCallback keeps these
  // (and the wrapped handlers below) referentially stable across renders
  // that don't touch onAckAction/onApplyLabel/busy state - PrRow is
  // memoized, so a fresh function identity on every PrTableApp render would
  // defeat that memoization for every row, not just the busy one.
  const withPrBusy = useCallback(
    (prNumber, action) => async (...args) => {
      markPrBusy(prNumber);
      try {
        return await action?.(...args);
      } finally {
        clearPrBusy(prNumber);
      }
    },
    [markPrBusy, clearPrBusy],
  );

  const handleAckActionBusy = useCallback(
    (prNumber, isAcked, repoOverride) =>
      withPrBusy(prNumber, onAckAction)(prNumber, isAcked, repoOverride),
    [withPrBusy, onAckAction],
  );

  const handleApplyLabelBusy = useCallback(
    (prNumber, label, repoOverride) =>
      withPrBusy(prNumber, onApplyLabel)(prNumber, label, repoOverride),
    [withPrBusy, onApplyLabel],
  );

  // Unlike onAckAction/onApplyLabel, the "↻ Update" button has no callback
  // prop wired from index.page.js today - PrActionsCell calls
  // window.runSinglePrUpdate directly. Reusing that same global here (like
  // other PrTableApp/PrActionsCell code already reads window.* helpers set
  // up by index.page.js, e.g. getAvailableRepoLabels) avoids adding a new
  // prop all the way through the mount/callbacks wiring in index.page.js
  // just for this one busy-tracking wrapper.
  const handleUpdatePrBusy = useCallback(
    (prNumber, entry, pr) => withPrBusy(prNumber, window.runSinglePrUpdate)(entry, pr),
    [withPrBusy],
  );

  const combinedActivePrNumbers = useMemo(
    () => Array.from(new Set([...(activePrNumbers || []).map(String), ...busyPrNumbers])),
    [activePrNumbers, busyPrNumbers],
  );

  // The "Needs Attention rules" controls (NO_ACTIVITY handling mode, pending
  // comments, merge-only commits, etc.) live in vanilla DOM elements, not
  // React state/props. `checkNeedsAttention` reads window.getNeedsAttentionConfig()
  // fresh on every call, so per-row cells (which call it directly during
  // render) already reflect a changed dropdown immediately — but the
  // `sections` useMemo below has no dependency that changes when these
  // controls change, so smart-group membership (which is only recomputed
  // when the memo re-runs) stays stale until something else invalidates it
  // (e.g. toggling a section, which changes `openSections`). Bumping this
  // counter on every relevant control's change event gives the memo a
  // dependency to react to.
  const [attentionConfigVersion, setAttentionConfigVersion] = useState(0);
  useEffect(() => {
    const attentionControlIds = new Set([
      'attention-no-activity-mode',
      'attention-include-pending-comments',
      'attention-ignore-merge-only-commits',
      'attention-include-closed-merged',
      'attention-include-draft-changed',
      'attention-include-draft-no-activity',
    ]);
    const handleChange = (event) => {
      if (attentionControlIds.has(event.target?.id)) {
        setAttentionConfigVersion((version) => version + 1);
      }
    };
    document.addEventListener('change', handleChange);
    return () => document.removeEventListener('change', handleChange);
  }, []);

  // State: PR JSON details modal target ({ entry, pr } | null)
  const [jsonModalTarget, setJsonModalTarget] = useState(null);

  // Helper: Find the default repo present in the stored data. Prefers
  // `lastRun.repo` (the repo the scanner script most recently scanned,
  // recorded by check-open-pr-updates.sh) since that's the strongest signal
  // for "what the user is currently tracking" — e.g. if someone starts
  // tracking a brand-new repo, its handful of entries would otherwise lose
  // to an older, larger repo's accumulated history. Falls back to the repo
  // with the most entries (rather than just the first one found) so that a
  // single synthetic/fixture entry (e.g. a seeded row with a placeholder
  // repo like "owner/repo") sorted first by PR number can't hijack the
  // entire table into showing just that one row.
  const getDefaultRepo = (currentPayload) => {
    const lastRunRepo = String(currentPayload?.lastRun?.repo || '').trim();
    if (lastRunRepo) {
      return lastRunRepo;
    }

    const entries = Object.values(currentPayload?.byPrNumber || {});
    const countsByRepo = {};
    entries.forEach((entry) => {
      const repo = entry?.repo;
      if (!repo) return;
      countsByRepo[repo] = (countsByRepo[repo] || 0) + 1;
    });

    let bestRepo = '';
    let bestCount = 0;
    Object.entries(countsByRepo).forEach(([repo, count]) => {
      if (count > bestCount) {
        bestRepo = repo;
        bestCount = count;
      }
    });
    return bestRepo;
  };

  // The single repo this table is currently showing. The vanilla app's
  // `latestSelectedRepo` global is frequently empty (nothing here ever
  // requires the "repo" input to be filled in), so actions that need to know
  // which repo a PR belongs to must use this resolved value instead of
  // trusting that global.
  const effectiveRepo = useMemo(
    () => selectedRepo || getDefaultRepo(payload),
    [payload, selectedRepo],
  );

  // Helper: Get checkbox state for a PR
  const getPrFlags = useMemo(() => {
    return (prNumber) => {
      const repo = effectiveRepo;
      const flaggedSet = payload?.flaggedByRepo?.[repo] || {};
      const inReviewSet = payload?.inReviewByRepo?.[repo] || {};
      const ackSet = payload?.ackByRepo?.[repo] || {};

      return {
        isFlagged: Boolean(flaggedSet[prNumber]),
        isInReview: Boolean(inReviewSet[prNumber]),
        isAcknowledged: Boolean(ackSet[prNumber]),
      };
    };
  }, [payload, effectiveRepo]);

  // Helper: Check if PR needs attention
  const checkNeedsAttention = useMemo(() => {
    return (entry) => {
      // The "In Review" checkbox is a manual, user-set flag (see
      // isInReviewEnabled/AlwaysShowInReviewCheckbox) and deliberately does
      // NOT feed into needs-attention - it's independent of whether the PR
      // actually has unreviewed activity per shouldShowNeedsAttention below.
      if (typeof window.entryNeedsAttention !== 'function') {
        return false;
      }

      // Get attention config from vanilla JS
      const attentionConfig = typeof window.getNeedsAttentionConfig === 'function'
        ? window.getNeedsAttentionConfig()
        : {};

      try {
        return window.entryNeedsAttention(entry, attentionConfig);
      } catch (e) {
        console.warn('[PrTableApp] Error checking needs attention:', e);
        return false;
      }
    };
  }, []);

  // Helper: Check if viewer has interacted with PR
  const checkUserInteraction = useMemo(() => {
    return (entry) => {
      // Only show OPEN PRs that viewer has interacted with
      const isOpenPr = entry?.section === 'open' || entry?.section === 'draft';
      if (!isOpenPr) return false;

      const row = entry?.data || {};
      const viewerLogin = String(row?.viewerLogin || '').toLowerCase();
      if (!viewerLogin) return false;

      // Check if viewer authored the PR
      const authorLogin = String(row?.authorLogin || '').toLowerCase();
      if (authorLogin === viewerLogin) return true;

      // Check if viewer has commented
      const comments = row?.comments || [];
      if (comments.some((c) => String(c?.author?.login || '').toLowerCase() === viewerLogin)) {
        return true;
      }

      // Check if viewer has reviewed
      const reviews = row?.reviews || [];
      if (reviews.some((r) => String(r?.author?.login || '').toLowerCase() === viewerLogin)) {
        return true;
      }

      // Check if viewer is a requested reviewer
      const requestedReviewers = row?.requestedReviewers || [];
      if (requestedReviewers.some((r) => String(r?.login || '').toLowerCase() === viewerLogin)) {
        return true;
      }

      // Check if viewer is assigned
      const assignees = row?.assignees || [];
      if (assignees.some((a) => String(a?.login || '').toLowerCase() === viewerLogin)) {
        return true;
      }

      return false;
    };
  }, []);

  // Build sections from payload using existing vanilla JS helpers
  const sections = useMemo(() => {
    if (!payload || !payload.byPrNumber) {
      return [];
    }

    // Access existing helpers from global scope (vanilla JS)
    const helpers = window.ViewPrsSectionConfigHelpers;
    if (!helpers) {
      console.warn('[PrTableApp] Section config helpers not available');
      return [];
    }

    // Section open/closed state lives in the `openSections` React state
    // (see PrSection's `isOpen={openSections[section.key] ?? section.defaultOpen}`),
    // not in a captured DOM snapshot like vanilla's resolvePrSectionOpenState
    // does — so just fall through to each section's own configured default
    // (lifecycle sections default closed; "In Review"/"Needs Attention"
    // smart groups default open — see pr-smart-groups.helpers.js) by not
    // overriding it at all.
    const { buildPrSectionConfigs } = helpers.createPrSectionConfigHelpers();

    // Get PR entries from payload.byPrNumber (the real stored-data shape),
    // each entry already has the { prNumber, repo, section, data } shape
    // the vanilla renderer expects.
    const repo = effectiveRepo;
    const allEntries = Object.values(payload.byPrNumber);
    // null/undefined visiblePrNumbers means no local filter is active (show
    // every stored PR for the repo); an array (even empty) means the
    // vanilla filter pipeline has run and this is exactly what passed it -
    // without this, "Apply filters (local)" would have no visible effect on
    // the React-rendered table at all (see index.page.js's React rendering
    // path, which computes visiblePrNumbers from that same pipeline).
    const visiblePrNumberSet = Array.isArray(visiblePrNumbers)
      ? new Set(visiblePrNumbers.map(String))
      : null;
    const entriesForRepo = allEntries.filter(
      (entry) =>
        entry?.repo === repo &&
        (!visiblePrNumberSet || visiblePrNumberSet.has(String(entry?.data?.number ?? entry?.prNumber ?? ""))),
    );

    // Group by lifecycle status using the section already computed
    // server-side, then sort exactly as vanilla's buildGroupedPrSections
    // does: open/draft newest-PR-number-first, closed/merged
    // newest-closed/merged-date-first.
    const sortRowsByPrNumberDesc = window.sortRowsByPrNumberDesc || ((rows) => rows);
    const sortRowsByDateFieldDesc = window.sortRowsByDateFieldDesc || ((rows) => rows);
    const grouped = {
      open: sortRowsByPrNumberDesc(entriesForRepo.filter((entry) => entry.section === 'open')),
      draft: sortRowsByPrNumberDesc(entriesForRepo.filter((entry) => entry.section === 'draft')),
      merged: sortRowsByDateFieldDesc(entriesForRepo.filter((entry) => entry.section === 'merged'), 'mergedAt'),
      closed: sortRowsByDateFieldDesc(entriesForRepo.filter((entry) => entry.section === 'closed'), 'closedAt'),
    };

    // Build smart groups (if helpers available)
    let smartGroups = null;
    if (window.ViewPrsSmartGroupsHelpers) {
      // Smart groups mix rows from every lifecycle section, so they use
      // vanilla's own cross-section ordering (normalizeRows: rowOrder
      // ascending, tie-broken by PR number descending) rather than any
      // single lifecycle section's sort — matching how vanilla builds
      // "allStoredRows" for its smart groups.
      const normalizeRows = window.normalizeRows || ((rows) => rows);
      const allEntriesForSmartGroups = normalizeRows([...grouped.open, ...grouped.draft, ...grouped.merged, ...grouped.closed]);

      const smartGroupHelpers = window.ViewPrsSmartGroupsHelpers.createPrSmartGroupsHelpers({
        hasNeedsAttentionFlag: (entry) => {
          // Use actual needs attention logic
          // Exclude closed PRs from "Needs Attention" smart group
          const section = String(entry?.section || '').toLowerCase();
          if (section === 'closed') {
            return false;
          }
          return checkNeedsAttention(entry);
        },
        hasUserInteraction: (entry) => {
          // Use actual interaction detection
          return checkUserInteraction(entry);
        },
      });

      const configs = smartGroupHelpers.buildSmartGroupConfigs({
        flaggedByRepo: payload.flaggedByRepo || {},
        inReviewByRepo: payload.inReviewByRepo || {},
        repo,
      });

      smartGroups = smartGroupHelpers.applySmartGroups(allEntriesForSmartGroups, configs);
    }

    // Build section configs
    const sectionConfigs = buildPrSectionConfigs({
      grouped,
      smartGroups,
      prSectionOpenState: openSections,
      lastCheckedAt: payload.lastCheckedAt || '',
      actorsMapFromPayload: payload.actorsMap || {},
    });

    return sectionConfigs.map(config => ({
      key: config.sectionKey,
      title: config.title,
      // Per the documented "non-exclusive membership" design, a PR shown in
      // a smart group above is ALSO rendered here in its lifecycle section
      // (pr-section-config.helpers.js no longer deduplicates them) - `prs`
      // and `totalCount` are therefore always the same underlying set,
      // kept as separate fields so PrSection's "Total PRs" badge has a
      // stable name to read regardless of how rendering/counting evolve
      // independently in the future.
      prs: config.renderRows || config.rows || [],
      totalCount: (config.rows || []).length,
      isSmartGroup: config.isSmartGroup,
      lifecycleSection: config.sectionKey,
      dateHeader: config.dateHeader,
      defaultOpen: config.isOpen,
      // Section header counts use shouldShowNeedsAttention directly (same
      // status/pending-comments logic checkNeedsAttention above delegates
      // to via entryNeedsAttention), so the header count always matches
      // however many rows in this section actually show the attention icon.
      attentionCount: (config.rows || []).filter((entry) => {
        const row = entry?.data || {};
        const hasPendingComments = (window.countPendingThreadComments?.(row) || 0) > 0;
        const attentionConfig = window.getNeedsAttentionConfig ? window.getNeedsAttentionConfig() : {};
        return window.shouldShowNeedsAttention
          ? window.shouldShowNeedsAttention({ row, sectionKey: config.sectionKey, hasPendingComments, config: attentionConfig })
          : false;
      }).length,
    }));
  }, [payload, effectiveRepo, visiblePrNumbers, openSections, checkNeedsAttention, checkUserInteraction, attentionConfigVersion]);

  // Kept in sync every render so the 'pr-navigate-to-insights' listener
  // below (subscribed once) can always read the current sections instead
  // of a stale closure over whatever `sections` was when it first mounted.
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  // Listen for "View in table" clicks from the Author Insights tab. Vanilla
  // handles this by finding the PR's row and directly flipping
  // `.hidden`/textContent on the insights <tr> and toggle button - which
  // only works when vanilla itself owns that DOM. Under React, that direct
  // mutation left the toggle button claiming "expanded" while the insights
  // content never actually rendered, since React's own expandedInsights
  // state never changed. See navigateToPrInTable in
  // pr-author-insights-pr-link.helpers.js, which dispatches this event
  // instead of mutating the DOM directly when React owns the table.
  useEffect(() => {
    const handleNavigateToInsights = (event) => {
      const prNumber = String(event.detail?.prNumber ?? '').trim();
      if (!prNumber) {
        return;
      }
      const matchingSection = sectionsRef.current.find((section) =>
        (section.prs || []).some((entry) => String(entry?.data?.number ?? '') === prNumber),
      );
      if (!matchingSection) {
        return;
      }
      const compositeKey = `${matchingSection.key}:${prNumber}`;
      setExpandedInsights((prev) => ({ ...prev, [compositeKey]: true }));
    };

    window.addEventListener('pr-navigate-to-insights', handleNavigateToInsights);
    return () => {
      window.removeEventListener('pr-navigate-to-insights', handleNavigateToInsights);
    };
  }, []);

  // Listen for delta updates from vanilla JS polling
  useEffect(() => {
    const handleDeltaUpdate = (event) => {
      setPayload(event.detail.payload);
    };

    window.addEventListener('pr-delta-update', handleDeltaUpdate);
    return () => {
      window.removeEventListener('pr-delta-update', handleDeltaUpdate);
    };
  }, []);

  // Expose update function globally for vanilla JS bridge
  useEffect(() => {
    window.updateReactPrTable = (newPayload) => {
      setPayload(newPayload);
    };
    
    return () => {
      delete window.updateReactPrTable;
    };
  }, []);

  // Handler: apply a fresh payload returned by a save (e.g. Notes) directly
  // into React state, without going through the vanilla bridge.
  const handleDataRefresh = (newPayload) => {
    setPayload(newPayload);
  };

  // Handler: Toggle section open/closed
  const handleToggleSection = (sectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  // Handler: Open the PR JSON details modal for a row ((entry, pr)
  // signature, matching PrActionsCell's onViewJson call).
  const handleViewJson = (entry, pr) => {
    setJsonModalTarget({ entry, pr });
  };

  // Handler: Toggle insights row for a PR
  const handleToggleInsights = (prNumber, sectionKey) => {
    const compositeKey = `${sectionKey}:${prNumber}`;
    setExpandedInsights((prev) => ({
      ...prev,
      [compositeKey]: !prev[compositeKey],
    }));
  };

  // Loading state: Show message while data loads
  if (sections.length === 0) {
    const hasPayload = payload && Object.keys(payload).length > 0;
    const hasPrs = payload?.byPrNumber && Object.keys(payload.byPrNumber).length > 0;
    
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        margin: '20px 0',
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '20px',
        }}>
          ⏳
        </div>
        <h3 style={{ margin: '0 0 10px 0', color: '#1f2328' }}>Loading Pull Requests...</h3>
        <p style={{ fontSize: '14px', color: '#656d76', margin: '0' }}>
          {!hasPayload && 'Fetching data from server...'}
          {hasPayload && !hasPrs && 'Processing repository data...'}
          {hasPrs && 'Building PR sections...'}
        </p>
      </div>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <PrSection
          key={section.key}
          section={section}
          repo={effectiveRepo}
          actorsMap={payload?.actorsMap || {}}
          isOpen={openSections[section.key] ?? section.defaultOpen}
          expandedInsights={expandedInsights}
          onToggleSection={handleToggleSection}
          onToggleInsights={handleToggleInsights}
          onCheckboxChange={onCheckboxChange}
          onAckAction={handleAckActionBusy}
          onApplyLabel={handleApplyLabelBusy}
          onUpdatePr={handleUpdatePrBusy}
          onDataRefresh={handleDataRefresh}
          onViewJson={handleViewJson}
          getPrFlags={getPrFlags}
          checkNeedsAttention={checkNeedsAttention}
          activePrNumbers={combinedActivePrNumbers}
        />
      ))}
      <PrJsonModal target={jsonModalTarget} payload={payload} onClose={() => setJsonModalTarget(null)} />
    </>
  );
}
