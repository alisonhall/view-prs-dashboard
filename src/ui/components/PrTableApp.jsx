/**
 * PrTableApp - Main React container for PR table
 * 
 * Phase 1: Hybrid React Migration
 * This component replaces the vanilla JS table rendering while keeping
 * filters and controls in vanilla JS.
 * 
 * @module components/PrTableApp
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { PrSection } from './PrSection';
import { PrJsonModal } from './PrJsonModal';
import { usePrData } from '../state/PrDataContext';
import { useNeedsAttention } from '../state/NeedsAttentionContext';
import { useVisiblePrNumbers } from '../state/useVisiblePrNumbers';
import { usePrActivityQueue } from '../state/PrActivityQueueContext';
import { useSinglePrUpdate } from '../state/useSinglePrUpdate';
import { useStableCallback } from '../state/useStableCallback';
import { useAckLabelActions } from '../state/useAckLabelActions';
import { usePrTableUiState } from '../state/PrTableUiStateContext';
import { NowProvider } from '../state/NowContext';
import { useRowCheckboxActions } from '../state/useRowCheckboxActions';
import { buildActivePrKey, buildExpandedInsightsKey } from './pr-row-keys';
import { normalizeRows, sortRowsByPrNumberDesc, sortRowsByDateFieldDesc } from '../helpers/pr-row-sorting.helpers.ts';
import * as prSectionConfigHelperFactory from '../helpers/pr-section-config.helpers.ts';
import * as prSmartGroupsHelperFactory from '../helpers/pr-smart-groups.helpers.ts';
import * as prSectionGroupingHelperFactory from '../helpers/pr-section-grouping.helpers.ts';

// Shared by every render without an actorsMap in the payload.
const NO_ACTORS = {};

/**
 * Main PR Table Application Component
 * 
 * Renders all PR sections (smart groups + lifecycle sections) with React.
 * Manages section open/closed state and expandable insights state.
 * 
 * @returns {JSX.Element}
 */
export function PrTableApp() {
  // PR data payload/selectedRepo - owned by <PrDataProvider />
  // (state/PrDataProvider.tsx).
  const { payload, selectedRepo, setPayload, applyFreshTablePayload } = usePrData();
  // Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): visiblePrNumbers
  // used to come from usePrData() itself (imperatively pushed by the
  // vanilla "Apply filters" pipeline) - now reactively derived live from
  // Context instead. See useVisiblePrNumbers.tsx's own comment.
  const visiblePrNumbers = useVisiblePrNumbers();
  const { entryNeedsAttention, entryNeedsAttentionReasons, attentionConfig } = useNeedsAttention();

  // Section open/closed and expanded insights rows live in
  // PrTableUiStateProvider (above AppRoot), not here, so the Export tab can
  // read which sections are open from state instead of the DOM
  // (UI_REDESIGN_PLAN.md, phase 1). Sections are keyed by section key
  // ('flagged', 'open', etc.), rows by buildExpandedInsightsKey.
  const {
    isSectionOpen,
    setSectionOpen,
    expandedRows: expandedInsights,
    setRowExpanded,
    toggleRowExpanded,
    reportRenderedSections,
  } = usePrTableUiState();

  // PR numbers are only unique within a repo, and rows from repos other
  // than the currently-configured one now render alongside it (see
  // entriesForRepo below) - every "is this PR currently active/busy" set
  // below is keyed via buildActivePrKey (pr-row-keys.ts), not by prNumber
  // alone, so a coincidentally-matching PR number in a different repo
  // doesn't show a spinner it has nothing to do with.

  // State: PR numbers currently being refreshed by the scheduler (shows the
  // small in-progress spinner in PrNumberCell). Kept separate from `payload`
  // since it's driven by its own poll loop (renderSchedulerStatus in
  // index.page.js), independent of data refresh - see the
  // 'pr-active-progress-update' listener below. Deliberately NOT a
  // dependency of the `sections` useMemo: it's threaded straight to
  // PrSection/PrTable/PrRow as its own prop so only the specific rows whose
  // active status actually changes re-render (PrRow is memoized). Holds the
  // raw { repo, prNumber } pairs from the event detail (see app.js's
  // buildActivePrKey/syncSchedulerActivePrNumbers) - composite-keyed in
  // combinedActivePrNumbers below, alongside busyPrNumbers.
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

  // busyPrNumbers/queuedPrNumbers (and their mark/clear functions and
  // window bridges) moved to PrActivityQueueProvider.tsx (activity drawer
  // feature, see REACT_MIGRATION_PLAN.md) - the drawer's bulk-action queue
  // section is a sibling portal, not a descendant of this component, so it
  // needs this same state lifted to a shared Provider rather than kept
  // local here. Semantics are unchanged; this is just where it lives now.
  const { busyPrNumbers, markPrBusy, clearPrBusy, queuedPrNumbers } = usePrActivityQueue();

  // Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // onAckAction/onApplyLabel used to be props, built once by vanilla
  // createReactCallbacks() (index.page.js) at table-mount time. That
  // factory couldn't reach useAckLabelActions()'s own Context-backed
  // instance (it's vanilla code, not a hook), so it built a second,
  // window-bridge-fed instance of the same factory instead. This
  // component already calls usePrData()/usePrActivityQueue() directly
  // (unlike <AppRoot />, which is PrDataProvider's ancestor, not its
  // descendant) - so it builds its own real handlers here, a second
  // useAckLabelActions() instance alongside AppRoot's own (for the bulk
  // "Apply ack only"/"Apply clear only" buttons) - no shared mutable
  // state in the hook, so two independent instances is harmless.
  const { runAckOnlyWorkflow, runClearOnlyWorkflow, runApplyLabelWorkflow } = useAckLabelActions();

  // Phase H.6 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // onCheckboxChange used to be the one remaining vanilla-fed prop (same
  // createReactCallbacks() shape onAckAction/onApplyLabel came from) -
  // this component builds its own real handler now too, the same way.
  const { toggleInReviewForRow, toggleFlaggedForRow } = useRowCheckboxActions();

  // Matches react-callbacks.helpers.js's old handleCheckboxChange exactly -
  // toggleInReviewForRow/toggleFlaggedForRow's own applyLatestPrData DI
  // only syncs index.page.js's vanilla payload/repo mirror (confirmed by
  // reading its real definition), it doesn't touch React - this handler's
  // own applyFreshTablePayload call afterward is the actual push into
  // Context, same two-step shape handleAckAction/handleApplyLabel use.
  const handleCheckboxChange = useStableCallback(
    async (prNumber, type, checked, repoOverride) => {
      try {
        const repo = repoOverride || selectedRepo;
        const entry = { prNumber: String(prNumber), repo };
        const row = { number: prNumber };
        const mockCheckbox = { checked };

        const result =
          type === 'flagged'
            ? await toggleFlaggedForRow(entry, row, checked, mockCheckbox)
            : type === 'inReview'
              ? await toggleInReviewForRow(entry, row, checked, mockCheckbox)
              : null;

        if (result) {
          applyFreshTablePayload(result.payload, result.selectedRepo || repo);
        }
      } catch (error) {
        console.error('[PrTableApp] Error handling checkbox change:', error);
      }
    },
  );

  // Matches react-callbacks.helpers.js's old handleAckAction/handleApplyLabel
  // exactly, including the try/catch - a thrown/rejected workflow is caught
  // and logged here, not propagated to withPrBusy's caller (byte-for-byte
  // behavior parity, not just the happy path).
  const handleAckAction = useStableCallback(
    async (prNumber, isAcked, repoOverride) => {
      try {
        const prNumberStr = String(prNumber);
        const repo = repoOverride || selectedRepo;
        const result = isAcked
          ? await runClearOnlyWorkflow(prNumberStr, repo)
          : await runAckOnlyWorkflow(prNumberStr, repo);
        if (result) {
          applyFreshTablePayload(result.payload, result.selectedRepo || repo);
        }
      } catch (error) {
        console.error('[PrTableApp] Error handling Ack action:', error);
      }
    },
  );

  const handleApplyLabel = useStableCallback(
    async (prNumber, label, repoOverride) => {
      try {
        const repo = repoOverride || selectedRepo;
        const result = await runApplyLabelWorkflow(String(prNumber), label, repo);
        if (result) {
          applyFreshTablePayload(result.payload, result.selectedRepo || repo);
        }
      } catch (error) {
        console.error('[PrTableApp] Error handling Apply Label action:', error);
      }
    },
  );

  // Wraps the Ack/Apply-Label/Update handlers so the acted-on row shows the
  // in-progress spinner for the duration of the request, regardless of
  // outcome (success, failure, or thrown error). useStableCallback keeps
  // these (and the wrapped handlers above) referentially stable across
  // every render - PrRow is memoized, so a fresh function identity on every
  // PrTableApp render would defeat that memoization for every row, not just
  // the busy one. Not useCallback: these handlers are held by every
  // memoized row, and useCallbacks with differing deps chained older render
  // scopes together, each pinning that render's payload - one full payload
  // leaked per data change (see useStableCallback.tsx).
  const withPrBusy = useStableCallback(
    (prNumber, repo, action) => async (...args) => {
      markPrBusy(prNumber, repo);
      try {
        return await action?.(...args);
      } finally {
        clearPrBusy(prNumber, repo);
      }
    },
  );

  const handleAckActionBusy = useStableCallback(
    (prNumber, isAcked, repoOverride) =>
      withPrBusy(prNumber, repoOverride, handleAckAction)(prNumber, isAcked, repoOverride),
  );

  const handleApplyLabelBusy = useStableCallback(
    (prNumber, label, repoOverride) =>
      withPrBusy(prNumber, repoOverride, handleApplyLabel)(prNumber, label, repoOverride),
  );

  // Phase 7 (see REACT_MIGRATION_PLAN.md, "useSinglePrUpdate"): the "↻
  // Update" button used to call window.runSinglePrUpdate directly - that
  // bridge is gone now, this hook is the real implementation (its only
  // real caller was already this component).
  const runSinglePrUpdate = useSinglePrUpdate();
  const handleUpdatePrBusy = useStableCallback(
    (prNumber, entry, pr) =>
      withPrBusy(prNumber, entry?.repo, runSinglePrUpdate)(entry, pr),
  );

  const combinedActivePrNumbers = useMemo(
    () =>
      Array.from(
        new Set([
          ...(activePrNumbers || []).map((entry) =>
            buildActivePrKey(entry?.prNumber, entry?.repo),
          ),
          ...busyPrNumbers,
        ]),
      ),
    [activePrNumbers, busyPrNumbers],
  );

  // Excludes anything already in combinedActivePrNumbers - "actively
  // running" always visually wins over "queued" for a given row, in the
  // (normally brief) moment a key could be in both sets.
  const combinedQueuedPrNumbers = useMemo(() => {
    const activeKeySet = new Set(combinedActivePrNumbers);
    return Array.from(queuedPrNumbers).filter((key) => !activeKeySet.has(key));
  }, [queuedPrNumbers, combinedActivePrNumbers]);

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

  // Helper: Get checkbox state for a PR. `repo` defaults to effectiveRepo
  // for backward compatibility, but callers rendering rows from other repos
  // (see entriesForRepo below, which no longer excludes them) must pass
  // that row's own `entry.repo` - flaggedByRepo/inReviewByRepo/ackByRepo
  // are keyed by repo, and PR numbers are only unique within a repo, so
  // always reading effectiveRepo's maps would show another repo's flags
  // (or none at all) for a foreign-repo row.
  const getPrFlags = useMemo(() => {
    return (prNumber, repo = effectiveRepo) => {
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
      // actually has unreviewed activity per the attention rules.
      try {
        return entryNeedsAttention(entry, attentionConfig);
      } catch (e) {
        console.warn('[PrTableApp] Error checking needs attention:', e);
        return false;
      }
    };
  }, [entryNeedsAttention, attentionConfig]);

  // Why each row needs attention, for its attention icon's tooltip (empty
  // when it doesn't) - the same rules as checkNeedsAttention.
  const getAttentionReasons = useMemo(() => {
    return (entry) => {
      try {
        return entryNeedsAttentionReasons(entry, attentionConfig);
      } catch (e) {
        console.warn('[PrTableApp] Error checking needs attention:', e);
        return [];
      }
    };
  }, [entryNeedsAttentionReasons, attentionConfig]);

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

  // Item 2 of the deferred-items follow-up (see REACT_MIGRATION_PLAN.md):
  // pr-section-grouping.helpers.ts's createPrSectionGroupingHelpers() must
  // be instantiated once, not on every render, or its internal
  // reference-equality cache (Phase 5 residual slice) never gets a chance
  // to hit - a lazily-initialized ref keeps exactly one instance for the
  // component's lifetime, mirroring how index.page.js's own module-level
  // instantiation works.
  const sectionGroupingHelpersRef = useRef(null);
  if (!sectionGroupingHelpersRef.current) {
    // Phase 7 (see REACT_MIGRATION_PLAN.md): sortRowsByPrNumberDesc/
    // sortRowsByDateFieldDesc moved to helpers/pr-row-sorting.helpers.ts -
    // genuinely zero-dependency, so this is a direct import now instead
    // of a window.* bridge read.
    sectionGroupingHelpersRef.current = prSectionGroupingHelperFactory.createPrSectionGroupingHelpers({
      sortRowsByPrNumberDesc,
      sortRowsByDateFieldDesc,
    });
  }

  // Build sections from payload using existing vanilla JS helpers
  const sections = useMemo(() => {
    if (!payload || !payload.byPrNumber) {
      return [];
    }

    // ES module cleanup (see REACT_MIGRATION_PLAN.md): pr-section-config.helpers.ts
    // is a real ES module now, imported directly above instead of read off
    // window - the `if (!helpers)` guard below is effectively dead now
    // (a real import always resolves before this component's own code
    // runs), kept as-is rather than removed to minimize the diff.
    const helpers = prSectionConfigHelperFactory;
    if (!helpers) {
      console.warn('[PrTableApp] Section config helpers not available');
      return [];
    }

    // Section open/closed state lives in PrTableUiStateProvider (see
    // PrSection's `isOpen={isSectionOpen(section.key, section.defaultOpen)}`),
    // not in a captured DOM snapshot like vanilla's resolvePrSectionOpenState
    // does — so each section's `defaultOpen` is its own configured default
    // (lifecycle sections default closed; "In Review"/"Needs Attention"
    // smart groups default open — see pr-smart-groups.helpers.ts): no open
    // state is passed in below, which also means toggling a section doesn't
    // rebuild every section.
    const { buildPrSectionConfigs } = helpers.createPrSectionConfigHelpers();

    // Get PR entries from payload.byPrNumber (the real stored-data shape),
    // each entry already has the { prNumber, repo, section, data } shape
    // the vanilla renderer expects.
    const allEntries = Object.values(payload.byPrNumber);
    // null/undefined visiblePrNumbers means no local filter is active (show
    // every stored PR); an array (even empty) means the vanilla filter
    // pipeline has run and this is exactly what passed it - without this,
    // "Apply filters (local)" would have no visible effect on the
    // React-rendered table at all (see index.page.js's React rendering
    // path, which computes visiblePrNumbers from that same pipeline).
    //
    // Deliberately NOT also gated on `entry?.repo === effectiveRepo`: PR
    // data for a repo other than the currently-configured one should still
    // render as its own row rather than being silently dropped (the
    // underlying pipeline - pr-row-sources.helpers.js's rowsForRepo -
    // stopped repo-filtering for the same reason). Repo-scoped concerns
    // below (flag lookups, smart-group config, etc.) use each entry's own
    // `entry.repo` instead, not a single local alias for effectiveRepo -
    // found via eslint-plugin-react-hooks/`no-unused-vars` (see
    // REACT_MIGRATION_PLAN.md's full eslint-jsx-coverage note) that a
    // `const repo = effectiveRepo;` alias here had become dead after an
    // earlier refactor moved every real use over to `entry.repo` directly;
    // removed along with this now-stale comment describing it as in use.
    const visiblePrNumberSet = Array.isArray(visiblePrNumbers)
      ? new Set(visiblePrNumbers.map(String))
      : null;
    const entriesForRepo = allEntries.filter(
      (entry) =>
        !visiblePrNumberSet || visiblePrNumberSet.has(String(entry?.data?.number ?? entry?.prNumber ?? "")),
    );

    // Group by lifecycle status and sort - now the *actual* shared
    // pr-section-grouping.helpers.ts helper (see REACT_MIGRATION_PLAN.md,
    // deferred item 2) instead of a hand-duplicated inline copy of its
    // logic, so this also benefits from that helper's reference-equality
    // cache (skips re-filtering/re-sorting when `entriesForRepo` is
    // unchanged position-by-position from the last call).
    const { buildGroupedPrSections } = sectionGroupingHelpersRef.current;
    const grouped = buildGroupedPrSections(entriesForRepo);

    // Build smart groups (pr-smart-groups.helpers.ts is a real ES module
    // now, imported directly above instead of read off window - see
    // pr-section-config.helpers.ts's own note above on the now-dead guard
    // kept as-is to minimize the diff).
    let smartGroups = null;
    if (prSmartGroupsHelperFactory) {
      // Smart groups mix rows from every lifecycle section, so they use
      // vanilla's own cross-section ordering (normalizeRows: rowOrder
      // ascending, tie-broken by PR number descending) rather than any
      // single lifecycle section's sort — matching how vanilla builds
      // "allStoredRows" for its smart groups. Phase 7 (see
      // REACT_MIGRATION_PLAN.md): direct import now, not a window.*
      // bridge read - genuinely zero-dependency.
      const allEntriesForSmartGroups = normalizeRows([...grouped.open, ...grouped.draft, ...grouped.merged, ...grouped.closed]);

      const smartGroupHelpers = prSmartGroupsHelperFactory.createPrSmartGroupsHelpers({
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

      // Deliberately not passing `repo` here: isFlagged/isInReview
      // (pr-smart-groups.helpers.ts) fall back to each entry's own
      // `entry.repo` only when `repo` is falsy - passing effectiveRepo
      // would make every entry look up effectiveRepo's flagged/in-review
      // set regardless of which repo it actually belongs to, wrongly
      // showing/hiding foreign-repo rows in these smart groups (PR numbers
      // are only unique within a repo).
      const configs = smartGroupHelpers.buildSmartGroupConfigs({
        flaggedByRepo: payload.flaggedByRepo || {},
        inReviewByRepo: payload.inReviewByRepo || {},
      });

      smartGroups = smartGroupHelpers.applySmartGroups(allEntriesForSmartGroups, configs);
    }

    // Build section configs
    const sectionConfigs = buildPrSectionConfigs({
      grouped,
      smartGroups,
      prSectionOpenState: {},
      lastCheckedAt: payload.lastCheckedAt || '',
      actorsMapFromPayload: payload.actorsMap || {},
    });

    return sectionConfigs.map(config => ({
      key: config.sectionKey,
      title: config.title,
      // Per the documented "non-exclusive membership" design, a PR shown in
      // a smart group above is ALSO rendered here in its lifecycle section
      // (pr-section-config.helpers.ts no longer deduplicates them) - `prs`
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
      // The same check as each row's attention icon (checkNeedsAttention,
      // judged by the PR's own lifecycle section), so the header count
      // matches the icons. It used to judge by this section's key, which
      // never counts for a smart group (Flagged, In Review...), so those
      // headers showed no attention even when their rows did.
      attentionCount: (config.rows || []).filter((entry) => checkNeedsAttention(entry)).length,
    }));
  }, [payload, visiblePrNumbers, checkNeedsAttention, checkUserInteraction]);

  // Kept in sync every render so the 'pr-navigate-to-insights' listener
  // below (subscribed once) can always read the current sections instead
  // of a stale closure over whatever `sections` was when it first mounted.
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  // Tell PrTableUiStateProvider which sections are on screen and which PRs
  // each shows, so the Export tab can export the open sections' rows. The
  // numbers are each row's `data.number`, which PrNumberCell renders.
  useEffect(() => {
    reportRenderedSections(
      sections.map((section) => ({
        key: section.key,
        defaultOpen: Boolean(section.defaultOpen),
        prNumbers: (section.prs || []).map((entry) => String(entry?.data?.number || '')),
      })),
    );
  }, [sections, reportRenderedSections]);

  // Listen for "View in table" clicks from the Author Insights tab. Vanilla
  // handles this by finding the PR's row and directly flipping
  // `.hidden`/textContent on the insights <tr> and toggle button - which
  // only works when vanilla itself owns that DOM. Under React, that direct
  // mutation left the toggle button claiming "expanded" while the insights
  // content never actually rendered, since React's own expandedInsights
  // state never changed. state/useNavigateToPrInTable.tsx (used by Author
  // Insights'/Review Stats' "View in table" buttons) dispatches this event
  // instead of mutating the DOM directly (it replaced the vanilla
  // navigateToPrInTable in pr-author-insights-pr-link.helpers.js, deleted).
  //
  // Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // state/useNavigateToPrInTable.tsx (AutoRenderBlockedLinks.jsx's "jump to
  // unsaved PR" chips) dispatches this same event too, now with an extra
  // `focusUnsaved` detail flag - pendingNavigationRef tracks which
  // composite key to scroll/focus once its insights row actually renders
  // (setExpandedInsights is async), since the scroll/focus target doesn't
  // exist in the DOM yet at the moment this listener runs.
  const pendingNavigationRef = useRef(null);
  // Bumped on every navigation request, so the scroll/focus effect below
  // runs even when the row was already expanded (setRowExpanded then
  // leaves the expanded rows unchanged, so they alone don't re-run it).
  const [navigationRequestCount, setNavigationRequestCount] = useState(0);
  // The listener below is subscribed once, so it reads open state through
  // this ref rather than a stale closure.
  const isSectionOpenRef = useRef(isSectionOpen);
  useEffect(() => {
    isSectionOpenRef.current = isSectionOpen;
  }, [isSectionOpen]);
  useEffect(() => {
    const handleNavigateToInsights = (event) => {
      const prNumber = String(event.detail?.prNumber ?? '').trim();
      if (!prNumber) {
        return;
      }
      // `repo` disambiguates a PR number that exists in more than one repo
      // (other repos' PRs render alongside the current one now - see
      // entriesForRepo) - optional since not every caller (e.g. Review
      // Stats' "View in table", whose source items don't carry a repo
      // field yet) has it, in which case this falls back to the first
      // number match, same as before this parameter existed.
      const repo = event.detail?.repo ? String(event.detail.repo) : '';
      const focusUnsaved = Boolean(event.detail?.focusUnsaved);
      // A PR can be in several sections (smart groups plus its lifecycle
      // section). Prefer one that's already open; otherwise open the first
      // one it's in. Taking the first match regardless used to pick the
      // Flagged group (listed first, closed by default) for a flagged PR,
      // expanding a row nobody could see.
      const matches = [];
      sectionsRef.current.forEach((section) => {
        const entry = (section.prs || []).find(
          (candidate) =>
            String(candidate?.data?.number ?? '') === prNumber &&
            (!repo || candidate?.repo === repo),
        );
        if (entry) matches.push({ section, entry });
      });
      const target =
        matches.find(({ section }) => isSectionOpenRef.current(section.key, Boolean(section.defaultOpen))) ||
        matches[0];
      if (!target) {
        return;
      }
      const { section: matchingSection, entry: matchingEntry } = target;
      const compositeKey = buildExpandedInsightsKey(matchingSection.key, matchingEntry?.repo, prNumber);
      pendingNavigationRef.current = {
        compositeKey,
        sectionKey: matchingSection.key,
        prNumber,
        repo: matchingEntry?.repo || '',
        focusUnsaved,
      };
      setSectionOpen(matchingSection.key, true);
      setRowExpanded(compositeKey, true);
      setNavigationRequestCount((count) => count + 1);
    };

    window.addEventListener('pr-navigate-to-insights', handleNavigateToInsights);
    return () => {
      window.removeEventListener('pr-navigate-to-insights', handleNavigateToInsights);
    };
  }, [setRowExpanded, setSectionOpen]);

  // Runs after the insights row for a pending navigation target has
  // actually committed to the DOM (expandedInsights flips synchronously in
  // React terms, but the row's own markup - including the Notes section's
  // save button - only exists once this effect's render has happened).
  // Mirrors vanilla's own scrollIntoView/focus behavior
  // (navigateToPrInTable/navigateToAuthorInsights,
  // pr-auto-render-navigation.helpers.js, now retired) - same selectors,
  // just run from inside the component that owns this markup instead of a
  // cross-cutting DOM scan.
  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (!pending || !expandedInsights[pending.compositeKey]) {
      return;
    }
    pendingNavigationRef.current = null;

    const rowSelector = pending.repo
      ? `[data-pr-number="${pending.prNumber}"][data-repo="${pending.repo}"]`
      : `[data-pr-number="${pending.prNumber}"]`;
    // The same PR's row also appears in its other sections; look in the
    // section it was expanded in first, so focus lands on the visible copy.
    const sectionHost = document.querySelector(`[data-pr-section="${pending.sectionKey}"]`);
    const findTarget = (selector) => sectionHost?.querySelector(selector) || document.querySelector(selector);

    let focusTarget = null;
    if (pending.focusUnsaved) {
      focusTarget = findTarget(`.pr-notes-section[data-pr-number="${pending.prNumber}"] .pr-notes-save:not([disabled])`);
    }
    if (!focusTarget) {
      focusTarget = findTarget(`${rowSelector} .pr-link`);
    }
    if (!focusTarget) {
      return;
    }
    if (typeof focusTarget.scrollIntoView === 'function') {
      focusTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  }, [expandedInsights, navigationRequestCount]);

  // Handler: Open/close a section. PrSection passes the <details> element's
  // new state; without one, flip the section's current state. That has to
  // start from its default when the user hasn't toggled it yet: flipping
  // "no choice yet" (undefined) always gave "open", so closing a section
  // that's open by default (In Review, Needs Attention) used to record it
  // as open, while the <details> itself showed closed.
  //
  // These three, like the handlers above, are useStableCallback: every
  // memoized PrRow receives them, and a new function each render re-rendered
  // every row on every table render.
  const handleToggleSection = useStableCallback((sectionKey, nextOpen) => {
    const section = sections.find((candidate) => candidate.key === sectionKey);
    const currentlyOpen = isSectionOpen(sectionKey, Boolean(section?.defaultOpen));
    setSectionOpen(sectionKey, typeof nextOpen === 'boolean' ? nextOpen : !currentlyOpen);
  });

  // Handler: Open the PR JSON details modal for a row ((entry, pr)
  // signature, matching PrActionsCell's onViewJson call).
  const handleViewJson = useStableCallback((entry, pr) => {
    setJsonModalTarget({ entry, pr });
  });

  // Handler: Toggle insights row for a PR. `repo` disambiguates PR numbers
  // that collide across repos in the same section (see entriesForRepo -
  // other repos' PRs render alongside the current one now) - see
  // buildExpandedInsightsKey's own comment.
  const handleToggleInsights = useStableCallback((prNumber, sectionKey, repo) => {
    toggleRowExpanded(buildExpandedInsightsKey(sectionKey, repo, prNumber));
  });

  // The same object until the payload's own map changes (a fresh `{}` each
  // render defeated row memoization when the payload has none).
  const actorsMap = useMemo(() => payload?.actorsMap || NO_ACTORS, [payload?.actorsMap]);

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

  // NowProvider: one clock for the rows' relative times (Activity ages).
  return (
    <NowProvider>
      {sections.map((section) => (
        <PrSection
          key={section.key}
          section={section}
          repo={effectiveRepo}
          actorsMap={actorsMap}
          isOpen={isSectionOpen(section.key, Boolean(section.defaultOpen))}
          expandedInsights={expandedInsights}
          onToggleSection={handleToggleSection}
          onToggleInsights={handleToggleInsights}
          onCheckboxChange={handleCheckboxChange}
          onAckAction={handleAckActionBusy}
          onApplyLabel={handleApplyLabelBusy}
          onUpdatePr={handleUpdatePrBusy}
          onDataRefresh={setPayload}
          onViewJson={handleViewJson}
          getPrFlags={getPrFlags}
          getAttentionReasons={getAttentionReasons}
          activePrNumbers={combinedActivePrNumbers}
          queuedPrNumbers={combinedQueuedPrNumbers}
        />
      ))}
      <PrJsonModal target={jsonModalTarget} payload={payload} onClose={() => setJsonModalTarget(null)} />
    </NowProvider>
  );
}
