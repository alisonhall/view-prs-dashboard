/**
 * PrTableApp - Main React container for PR table
 * 
 * Phase 1: Hybrid React Migration
 * This component replaces the vanilla JS table rendering while keeping
 * filters and controls in vanilla JS.
 * 
 * @module components/PrTableApp
 */

import React, { useState, useEffect, useMemo } from 'react';
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
 * @param {Function} props.onCheckboxChange - Callback for checkbox changes (flagged/inReview)
 * @param {Function} props.onAckAction - Callback for Ack button clicks
 * @returns {JSX.Element}
 */
export function PrTableApp({
  initialPayload,
  selectedRepo,
  onCheckboxChange,
  onAckAction,
}) {
  // State: PR data payload
  const [payload, setPayload] = useState(initialPayload);

  // The vanilla bridge's update path (react-mount-bridge.js -> react-app.jsx's
  // mountReactPrTable) re-renders this component with a new `initialPayload`
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
      // Access vanilla JS helper
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
    const entriesForRepo = allEntries.filter((entry) => entry?.repo === repo);

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
      prs: config.rows || [],
      isSmartGroup: config.isSmartGroup,
      lifecycleSection: config.sectionKey,
      dateHeader: config.dateHeader,
      defaultOpen: config.isOpen,
      // Section header counts use the narrower shouldShowNeedsAttention (not
      // entryNeedsAttention, which also ORs in isInReviewEnabled) to match
      // vanilla's pr-section-shell.helpers.js exactly.
      attentionCount: (config.rows || []).filter((entry) => {
        const row = entry?.data || {};
        const hasPendingComments = (window.countPendingThreadComments?.(row) || 0) > 0;
        const attentionConfig = window.getNeedsAttentionConfig ? window.getNeedsAttentionConfig() : {};
        return window.shouldShowNeedsAttention
          ? window.shouldShowNeedsAttention({ row, sectionKey: config.sectionKey, hasPendingComments, config: attentionConfig })
          : false;
      }).length,
    }));
  }, [payload, effectiveRepo, openSections, checkNeedsAttention, checkUserInteraction, attentionConfigVersion]);

  // Listen for delta updates from vanilla JS polling
  useEffect(() => {
    const handleDeltaUpdate = (event) => {
      console.log('[PrTableApp] Received delta update', event.detail);
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
      console.log('[PrTableApp] Manual update from vanilla JS', newPayload);
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

  // Handler: Open the PR JSON details modal for a row (mirrors vanilla's
  // window.openPrJsonModal(entry, pr) signature).
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
          onAckAction={onAckAction}
          onDataRefresh={handleDataRefresh}
          onViewJson={handleViewJson}
          getPrFlags={getPrFlags}
          checkNeedsAttention={checkNeedsAttention}
        />
      ))}
      <PrJsonModal target={jsonModalTarget} payload={payload} onClose={() => setJsonModalTarget(null)} />
    </>
  );
}
