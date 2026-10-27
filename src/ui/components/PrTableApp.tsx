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
import { useActorIdentity } from '../state/ActorIdentityContext';
import { usePrInsightsDisplay } from '../state/PrInsightsDisplayContext';
import { useVisiblePrNumbers } from '../state/useVisiblePrNumbers';
import { usePrActivityQueue } from '../state/PrActivityQueueContext';
import { useSinglePrUpdate } from '../state/useSinglePrUpdate';
import { useStableCallback } from '../state/useStableCallback';
import { useAckLabelActions } from '../state/useAckLabelActions';
import { usePrTableUiState, type SelectedPr } from '../state/PrTableUiStateContext';
import { NowProvider } from '../state/NowContext';
import { useNotesDirty } from '../state/NotesDirtyContext';
import { useMediaQuery } from '../state/useMediaQuery';
import { PrDetailPane } from './pane/PrDetailPane';
import { Button } from './ui/Button';
import { useRowCheckboxActions } from '../state/useRowCheckboxActions';
import { buildActivePrKey, buildExpandedInsightsKey } from './pr-row-keys';
import { normalizeRows, sortRowsByPrNumberDesc, sortRowsByDateFieldDesc } from '../helpers/pr-row-sorting.helpers.ts';
import * as prSectionConfigHelperFactory from '../helpers/pr-section-config.helpers.ts';
import * as prSmartGroupsHelperFactory from '../helpers/pr-smart-groups.helpers.ts';
import * as prSectionGroupingHelperFactory from '../helpers/pr-section-grouping.helpers.ts';
import type { PrData, PrDataPayload, PrEntry } from '../types/pr-data.ts';

type PrNumber = string | number | undefined;

// A scheduler-running PR, from 'pr-active-progress-update' events.
interface ActivePr {
  repo?: string;
  prNumber?: string | number;
}

// The PR a 'pr-navigate-to-insights' request selected, waiting for it to
// render so it can be scrolled to and focused.
interface PendingNavigation {
  sectionKey: string;
  prNumber: string;
  repo: string;
  focusUnsaved: boolean;
}

// Shared by every render without an actorsMap in the payload.
const NO_ACTORS: Record<string, string | undefined> = {};

export const NARROW_SCREEN_QUERY = '(max-width: 899px)';

const samePr = (a: SelectedPr | null, b: SelectedPr | null) =>
  a === b || Boolean(a && b && a.repo === b.repo && a.prNumber === b.prNumber);

// A row's PR link: in the given section if it's there, else the first copy
// not inside a collapsed section (the same PR's row can be in several, and
// a closed one's can't take focus), else the first one.
const findRowLink = (pr: SelectedPr, sectionKey = ''): HTMLElement | null => {
  const selector = `tr.pr-row[data-pr-number="${pr.prNumber}"][data-repo="${pr.repo}"] .pr-link`;
  const section = sectionKey ? document.querySelector(`[data-pr-section="${sectionKey}"]`) : null;
  const inSection = section?.querySelector<HTMLElement>(selector);
  if (inSection) return inSection;
  const links = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return links.find((link) => !link.closest('details:not([open])')) || links[0] || null;
};

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
  // For the viewer's own smart groups (their PRs, assigned, review requested).
  const { getEffectiveViewerLogin, normalizeActorLogin } = useActorIdentity();
  const { collectAssignedUsers, collectPendingReviewRequests } = usePrInsightsDisplay();

  // Section open/closed and expanded insights rows live in
  // PrTableUiStateProvider (above AppShell), not here, so Settings › Export can
  // read which sections are open from state instead of the DOM
  // (UI_REDESIGN_PLAN.md, phase 1). Sections are keyed by section key
  // ('flagged', 'open', etc.), rows by buildExpandedInsightsKey.
  const {
    isSectionOpen,
    setSectionOpen,
    expandedRows: expandedInsights,
    toggleRowExpanded,
    selectedPr,
    setSelectedPr,
    isPaneVisible,
    setPaneVisible,
    paneTab,
    setPaneTab,
    reportRenderedSections,
  } = usePrTableUiState();
  const { dirtyPrNumbers } = useNotesDirty();
  // Below 900px the detail pane is an overlay drawer instead of docked.
  const isNarrow = useMediaQuery(NARROW_SCREEN_QUERY);

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
  const [activePrNumbers, setActivePrNumbers] = useState<ActivePr[]>([]);

  useEffect(() => {
    const handleActiveProgressUpdate = (event: Event) => {
      const { detail } = event as CustomEvent<{ activePrNumbers?: ActivePr[] } | undefined>;
      setActivePrNumbers(detail?.activePrNumbers || []);
    };

    window.addEventListener('pr-active-progress-update', handleActiveProgressUpdate);
    return () => {
      window.removeEventListener('pr-active-progress-update', handleActiveProgressUpdate);
    };
  }, []);

  // busyPrNumbers/queuedPrNumbers (and their mark/clear functions and
  // window bridges) moved to PrActivityQueueProvider.tsx (activity popover
  // feature, see REACT_MIGRATION_PLAN.md) - the drawer's bulk-action queue
  // section is a sibling, not a descendant of this component, so it
  // needs this same state lifted to a shared Provider rather than kept
  // local here. Semantics are unchanged; this is just where it lives now.
  const { busyPrNumbers, markPrBusy, clearPrBusy, queuedPrNumbers } = usePrActivityQueue();

  // Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // onAckAction/onApplyLabel used to be props, built once by vanilla
  // createReactCallbacks() (index.page.js) at table-mount time. That
  // factory couldn't reach useAckLabelActions()'s own Context-backed
  // instance (it's vanilla code, not a hook), so it built a second,
  // window-bridge-fed instance of the same factory instead. This
  // component builds its own real handlers here, a second
  // useAckLabelActions() instance alongside RunCheckSection's (for the bulk
  // "Apply ack only"/"Apply clear only" buttons) - no shared mutable
  // state in the hook, so two independent instances is harmless.
  const { runAckOnlyWorkflow, runClearOnlyWorkflow, runApplyLabelWorkflow } = useAckLabelActions();

  // Phase H.6 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // onCheckboxChange used to be the one remaining vanilla-fed prop (same
  // createReactCallbacks() shape onAckAction/onApplyLabel came from) -
  // this component builds its own real handler now too, the same way.
  const { toggleInReviewForRow, toggleFlaggedForRow } = useRowCheckboxActions();

  // Puts a row action's result on screen. A result without a payload (the
  // stored data couldn't be re-read) keeps the table as it is, the
  // provider's rule for a missing payload; passing its null through used
  // to blank the table back to "Loading".
  const applyActionResult = (
    result: { payload?: PrDataPayload | null; selectedRepo?: string } | null,
    repo: string,
  ) => {
    if (result) {
      applyFreshTablePayload(result.payload ?? undefined, result.selectedRepo || repo);
    }
  };

  // Matches react-callbacks.helpers.js's old handleCheckboxChange, apart
  // from applyActionResult's handling of a missing payload -
  // toggleInReviewForRow/toggleFlaggedForRow's own applyLatestPrData DI
  // only syncs index.page.js's vanilla payload/repo mirror (confirmed by
  // reading its real definition), it doesn't touch React - this handler's
  // own applyFreshTablePayload call afterward is the actual push into
  // Context, same two-step shape handleAckAction/handleApplyLabel use.
  const handleCheckboxChange = useStableCallback(
    async (prNumber: PrNumber, type: 'inReview' | 'flagged', checked: boolean, repoOverride?: string) => {
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

        applyActionResult(result, repo);
      } catch (error) {
        console.error('[PrTableApp] Error handling checkbox change:', error);
      }
    },
  );

  // Matches react-callbacks.helpers.js's old handleAckAction/handleApplyLabel,
  // including the try/catch - a thrown/rejected workflow is caught and
  // logged here, not propagated to withPrBusy's caller. The one difference
  // is applyActionResult's handling of a missing payload.
  const handleAckAction = useStableCallback(
    async (prNumber: PrNumber, isAcked: boolean, repoOverride?: string) => {
      try {
        const prNumberStr = String(prNumber);
        const repo = repoOverride || selectedRepo;
        const result = isAcked
          ? await runClearOnlyWorkflow(prNumberStr, repo)
          : await runAckOnlyWorkflow(prNumberStr, repo);
        applyActionResult(result, repo);
      } catch (error) {
        console.error('[PrTableApp] Error handling Ack action:', error);
      }
    },
  );

  const handleApplyLabel = useStableCallback(
    async (prNumber: PrNumber, label: string, repoOverride?: string) => {
      try {
        const repo = repoOverride || selectedRepo;
        const result = await runApplyLabelWorkflow(String(prNumber), label, repo);
        applyActionResult(result, repo);
      } catch (error) {
        console.error('[PrTableApp] Error handling Apply Label action:', error);
      }
    },
  );

  // Wraps the Ack/Apply-Label/Update handlers so the acted-on row shows the
  // in-progress spinner for the duration of the request, regardless of
  // outcome (success, failure, or thrown error). withPrBusy itself is only
  // called from inside the stable wrappers below, so its identity doesn't
  // matter. useStableCallback keeps those wrappers (and the wrapped handlers
  // above) referentially stable across every render - PrRow is memoized, so
  // a fresh function identity on every PrTableApp render would defeat that
  // memoization for every row, not just the busy one. Not useCallback: these handlers are held by every
  // memoized row, and useCallbacks with differing deps chained older render
  // scopes together, each pinning that render's payload - one full payload
  // leaked per data change (see useStableCallback.tsx).
  const withPrBusy =
    <A extends unknown[], R>(prNumber: PrNumber, repo: string | undefined, action: (...args: A) => R) =>
    async (...args: A) => {
      markPrBusy(String(prNumber), repo);
      try {
        return await action(...args);
      } finally {
        clearPrBusy(String(prNumber), repo);
      }
    };

  const handleAckActionBusy = useStableCallback(
    (prNumber: PrNumber, isAcked: boolean, repoOverride: string) =>
      withPrBusy(prNumber, repoOverride, handleAckAction)(prNumber, isAcked, repoOverride),
  );

  const handleApplyLabelBusy = useStableCallback(
    (prNumber: PrNumber, label: string, repoOverride: string) =>
      withPrBusy(prNumber, repoOverride, handleApplyLabel)(prNumber, label, repoOverride),
  );

  // Phase 7 (see REACT_MIGRATION_PLAN.md, "useSinglePrUpdate"): the "↻
  // Update" button used to call window.runSinglePrUpdate directly - that
  // bridge is gone now, this hook is the real implementation (its only
  // real caller was already this component).
  const runSinglePrUpdate = useSinglePrUpdate();
  const handleUpdatePrBusy = useStableCallback(
    (prNumber: PrNumber, entry: Pick<PrEntry, 'prNumber' | 'repo'>, pr: PrData) =>
      withPrBusy(prNumber, entry?.repo, runSinglePrUpdate)(entry, pr),
  );

  const combinedActivePrNumbers = useMemo(
    () =>
      Array.from(
        new Set([
          ...(activePrNumbers || []).map((entry) =>
            buildActivePrKey(String(entry?.prNumber), entry?.repo),
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
  const [jsonModalTarget, setJsonModalTarget] = useState<{ entry: Pick<PrEntry, 'prNumber' | 'repo'>; pr: PrData } | null>(null);

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
  const getDefaultRepo = (currentPayload: PrDataPayload | null | undefined): string => {
    const lastRunRepo = String(currentPayload?.lastRun?.repo || '').trim();
    if (lastRunRepo) {
      return lastRunRepo;
    }

    const entries = Object.values(currentPayload?.byPrNumber || {});
    const countsByRepo: Record<string, number> = {};
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
    return (prNumber: PrNumber, repo: string = effectiveRepo) => {
      const key = String(prNumber);
      const flaggedSet = payload?.flaggedByRepo?.[repo] || {};
      const inReviewSet = payload?.inReviewByRepo?.[repo] || {};
      const ackSet = payload?.ackByRepo?.[repo] || {};

      return {
        isFlagged: Boolean(flaggedSet[key]),
        isInReview: Boolean(inReviewSet[key]),
        isAcknowledged: Boolean(ackSet[key]),
      };
    };
  }, [payload, effectiveRepo]);

  // Helper: Check if PR needs attention
  const checkNeedsAttention = useMemo(() => {
    return (entry: PrEntry) => {
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
    return (entry: PrEntry) => {
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
    return (entry: PrEntry) => {
      // Only show OPEN PRs that viewer has interacted with
      const isOpenPr = entry?.section === 'open' || entry?.section === 'draft';
      if (!isOpenPr) return false;

      const row = entry?.data || {};
      const viewerLogin = String(row?.viewerLogin || '').toLowerCase();
      if (!viewerLogin) return false;

      // Check if viewer authored the PR
      const authorLogin = String(row?.authorLogin || '').toLowerCase();
      if (authorLogin === viewerLogin) return true;

      // Check if viewer has commented. Comments and reviews carry
      // `authorLogin` (the data schema), not `author.login`.
      const comments = row?.comments || [];
      if (comments.some((c) => String(c?.authorLogin || '').toLowerCase() === viewerLogin)) {
        return true;
      }

      // Check if viewer has reviewed
      const reviews = row?.reviews || [];
      if (reviews.some((r) => String(r?.authorLogin || '').toLowerCase() === viewerLogin)) {
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
  // to hit - lazily-initialized state keeps exactly one instance for the
  // component's lifetime, mirroring how index.page.js's own module-level
  // instantiation works.
  // Phase 7 (see REACT_MIGRATION_PLAN.md): sortRowsByPrNumberDesc/
  // sortRowsByDateFieldDesc moved to helpers/pr-row-sorting.helpers.ts -
  // genuinely zero-dependency, so this is a direct import now instead
  // of a window.* bridge read.
  const [{ buildGroupedPrSections }] = useState(() =>
    prSectionGroupingHelperFactory.createPrSectionGroupingHelpers({
      sortRowsByPrNumberDesc,
      sortRowsByDateFieldDesc,
    }),
  );

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
        getViewerLogin: (entry) => String(getEffectiveViewerLogin(entry?.data || {}) || ''),
        normalizeLogin: (login) => normalizeActorLogin(login),
        getAssigneeLogins: (entry) => collectAssignedUsers(entry?.data || {}).map((person) => person.login),
        // Outstanding requests only, not the broad reviewers list.
        getRequestedReviewerLogins: (entry) => collectPendingReviewRequests(entry?.data || {}).map((person) => person.login),
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
      prs: config.rows || [],
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
  }, [
    payload,
    visiblePrNumbers,
    checkNeedsAttention,
    checkUserInteraction,
    buildGroupedPrSections,
    getEffectiveViewerLogin,
    normalizeActorLogin,
    collectAssignedUsers,
    collectPendingReviewRequests,
  ]);

  // Kept in sync every render so the 'pr-navigate-to-insights' listener
  // below (subscribed once) can always read the current sections instead
  // of a stale closure over whatever `sections` was when it first mounted.
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  // Tell PrTableUiStateProvider which sections are on screen and which PRs
  // each shows, so Settings › Export can export the open sections' rows. The
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

  // The selected PR's entry, looked up again in each payload; null when
  // nothing is selected or the PR is no longer in the data.
  const selectedEntry = useMemo(() => {
    if (!selectedPr) return null;
    return (
      Object.values(payload?.byPrNumber || {}).find(
        (entry) =>
          (entry?.repo || effectiveRepo) === selectedPr.repo &&
          String(entry?.data?.number ?? entry?.prNumber ?? '') === selectedPr.prNumber,
      ) || null
    );
  }, [payload, selectedPr, effectiveRepo]);
  const selectedPrKey = selectedPr ? buildActivePrKey(selectedPr.prNumber, selectedPr.repo) : '';

  // The PRs in the open sections, in display order, each once: what the
  // pane's previous/next step through.
  const navigationOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: SelectedPr[] = [];
    sections.forEach((section) => {
      if (!isSectionOpen(section.key, Boolean(section.defaultOpen))) return;
      section.prs.forEach((entry) => {
        const pr = { repo: entry.repo || effectiveRepo, prNumber: String(entry?.data?.number ?? entry?.prNumber ?? '') };
        const key = buildActivePrKey(pr.prNumber, pr.repo);
        if (!seen.has(key)) {
          seen.add(key);
          order.push(pr);
        }
      });
    });
    return order;
  }, [sections, isSectionOpen, effectiveRepo]);
  const selectedIndex = selectedPr ? navigationOrder.findIndex((pr) => samePr(pr, selectedPr)) : -1;
  const previousPr = selectedIndex > 0 ? navigationOrder[selectedIndex - 1] : undefined;
  const nextPr = selectedIndex >= 0 ? navigationOrder[selectedIndex + 1] : undefined;

  // Leaving the selected PR (another selection, previous/next, closing or
  // hiding the pane) unmounts its Notes: ask first when they're unsaved
  // (UI_REDESIGN_PLAN.md, decision 3).
  const confirmLeavingPr = (): boolean => {
    if (!selectedPr || !dirtyPrNumbers.includes(selectedPr.prNumber)) return true;
    return window.confirm(`PR #${selectedPr.prNumber} has unsaved notes. Discard them?`);
  };
  const selectPr = (next: SelectedPr | null): boolean => {
    if (samePr(next, selectedPr)) return true;
    if (!confirmLeavingPr()) return false;
    setSelectedPr(next);
    return true;
  };

  // Listen for "View in table" clicks (Author Insights, Review Stats) and
  // the "Auto update paused" chips (with `focusUnsaved`), which dispatch
  // this event (state/useNavigateToPrInTable.tsx) rather than reaching
  // into the table's DOM. The PR is selected for the detail pane, its row
  // scrolled to and focused - or, with `focusUnsaved`, the Notes tab
  // opened and its Save button focused. pendingNavigationRef holds the
  // target until it has rendered.
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  // Bumped on every navigation request, so the scroll/focus effect below
  // runs even when nothing else changed (the PR was already selected).
  const [navigationRequestCount, setNavigationRequestCount] = useState(0);
  // The listener is subscribed once; it calls the current render's code.
  const navigateToPr = useStableCallback((request: PendingNavigation) => {
    // Rows without a repo of their own belong to the table's repo.
    const target = { ...request, repo: request.repo || effectiveRepo };
    if (!selectPr({ repo: target.repo, prNumber: target.prNumber })) return;
    pendingNavigationRef.current = target;
    setSectionOpen(target.sectionKey, true);
    if (target.focusUnsaved) setPaneTab('notes');
    setNavigationRequestCount((count) => count + 1);
  });
  // The listener below is subscribed once, so it reads open state through
  // this ref rather than a stale closure.
  const isSectionOpenRef = useRef(isSectionOpen);
  const selectedPrRef = useRef(selectedPr);
  const effectiveRepoRef = useRef(effectiveRepo);
  useEffect(() => {
    isSectionOpenRef.current = isSectionOpen;
    selectedPrRef.current = selectedPr;
    effectiveRepoRef.current = effectiveRepo;
  }, [isSectionOpen, selectedPr, effectiveRepo]);
  useEffect(() => {
    const handleNavigateToInsights = (event: Event) => {
      const { detail } = event as CustomEvent<
        { prNumber?: string | number; repo?: string; focusUnsaved?: boolean } | undefined
      >;
      const prNumber = String(detail?.prNumber ?? '').trim();
      if (!prNumber) {
        return;
      }
      // `repo` disambiguates a PR number that exists in more than one repo
      // (other repos' PRs render alongside the current one now - see
      // entriesForRepo) - optional since not every caller (e.g. Review
      // Stats' "View in table", whose source items don't carry a repo
      // field yet) has it, in which case this falls back to the first
      // number match, same as before this parameter existed.
      const focusUnsaved = Boolean(detail?.focusUnsaved);
      // Unsaved notes are only ever on the PR in the detail pane (leaving it
      // asks first), and NotesDirtyContext keeps just its number - so the
      // "Auto update paused" chips' focusUnsaved means the selected PR, not
      // another repo's PR with the same number.
      const selected = selectedPrRef.current;
      const repo = detail?.repo
        ? String(detail.repo)
        : focusUnsaved && selected?.prNumber === prNumber
          ? selected.repo
          : '';
      // A PR can be in several sections (smart groups plus its lifecycle
      // section). Prefer one that's already open; otherwise open the first
      // one it's in. Taking the first match regardless used to pick the
      // Flagged group (listed first, closed by default) for a flagged PR,
      // expanding a row nobody could see.
      const matches: { section: (typeof sections)[number]; entry: PrEntry }[] = [];
      sectionsRef.current.forEach((section) => {
        const entry = (section.prs || []).find(
          (candidate) =>
            String(candidate?.data?.number ?? '') === prNumber &&
            // Rows without a repo of their own belong to the table's repo.
            (!repo || (candidate?.repo || effectiveRepoRef.current) === repo),
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
      navigateToPr({
        sectionKey: matchingSection.key,
        prNumber,
        repo: matchingEntry?.repo || '',
        focusUnsaved,
      });
    };

    window.addEventListener('pr-navigate-to-insights', handleNavigateToInsights);
    return () => {
      window.removeEventListener('pr-navigate-to-insights', handleNavigateToInsights);
    };
  }, [navigateToPr]);

  // Runs once a navigation's PR is selected and rendered: scrolls to and
  // focuses its row's link in the section it was found in (the same PR's
  // row also appears in its other sections), or with focusUnsaved the
  // pane's Notes Save button.
  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (!pending) {
      return;
    }
    pendingNavigationRef.current = null;

    const notesSave = pending.focusUnsaved
      ? document.querySelector<HTMLElement>(`.pr-notes-section[data-pr-number="${pending.prNumber}"] .pr-notes-save:not([disabled])`)
      : null;
    const rowLink = findRowLink(pending, pending.sectionKey);
    rowLink?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    (notesSave || rowLink)?.focus?.();
  }, [navigationRequestCount]);

  // Handler: Open/close a section. PrSection passes the <details> element's
  // new state; without one, flip the section's current state. That has to
  // start from its default when the user hasn't toggled it yet: flipping
  // "no choice yet" (undefined) always gave "open", so closing a section
  // that's open by default (In Review, Needs Attention) used to record it
  // as open, while the <details> itself showed closed.
  //
  // These, like the handlers above, are useStableCallback: every
  // memoized PrRow receives them, and a new function each render re-rendered
  // every row on every table render.
  const handleToggleSection = useStableCallback((sectionKey: string, nextOpen?: boolean) => {
    const section = sections.find((candidate) => candidate.key === sectionKey);
    const currentlyOpen = isSectionOpen(sectionKey, Boolean(section?.defaultOpen));
    setSectionOpen(sectionKey, typeof nextOpen === 'boolean' ? nextOpen : !currentlyOpen);
  });

  // Handler: Open the PR JSON details modal for a row ((entry, pr)
  // signature, matching PrActionsCell's onViewJson call).
  const handleViewJson = useStableCallback((entry: Pick<PrEntry, 'prNumber' | 'repo'>, pr: PrData) => {
    setJsonModalTarget({ entry, pr });
  });

  // Handler: Toggle a PR's summary row (the chevron). `repo` disambiguates
  // PR numbers that collide across repos in the same section (see
  // entriesForRepo - other repos' PRs render alongside the current one now)
  // - see buildExpandedInsightsKey's own comment.
  const handleToggleInsights = useStableCallback((prNumber: PrNumber, sectionKey: string, repo: string) => {
    toggleRowExpanded(buildExpandedInsightsKey(sectionKey, repo, String(prNumber)));
  });

  // Detail pane selection (UI_REDESIGN_PLAN.md, phase 4). A row click
  // selects its PR and shows the pane if it was hidden, or deselects it
  // when it's the selected one; ↑/↓ in a table select without toggling
  // (PrTable); the summary's "Show details" selects and shows the pane too.
  const handleSelectRow = useStableCallback((prNumber: PrNumber, repo: string) => {
    const pr = { repo, prNumber: String(prNumber ?? '') };
    if (samePr(pr, selectedPr)) {
      selectPr(null);
      return;
    }
    if (selectPr(pr)) setPaneVisible(true);
  });
  const handleSelectPr = useStableCallback((prNumber: string, repo: string) => selectPr({ repo, prNumber }));
  const handleShowDetails = useStableCallback((prNumber: PrNumber, repo: string) => {
    if (selectPr({ repo, prNumber: String(prNumber ?? '') })) setPaneVisible(true);
  });
  const handleClearSelection = useStableCallback(() => {
    selectPr(null);
  });

  // The pane's own close, previous and next. Closing hides the pane (a row
  // click shows it again) and clears the selection, asking first with
  // unsaved notes; focus goes back to the PR's row, since the button that
  // had it goes away.
  const handleClosePane = useStableCallback(() => {
    const closing = selectedPr;
    if (closing && !selectPr(null)) return;
    setPaneVisible(false);
    if (closing) findRowLink(closing)?.focus();
  });
  // The whole row comes into view, below the stuck headers (pr-table.css).
  const handleStepPr = (target: SelectedPr | undefined) => {
    if (target && selectPr(target)) findRowLink(target)?.closest('tr')?.scrollIntoView?.({ block: 'nearest' });
  };

  // Hiding the pane unmounts its Notes too.
  const handleTogglePane = () => {
    if (isPaneVisible && !confirmLeavingPr()) return;
    setPaneVisible(!isPaneVisible);
  };

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
        <h3 style={{ margin: '0 0 10px 0', color: 'var(--color-text)' }}>Loading Pull Requests...</h3>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: '0' }}>
          {!hasPayload && 'Fetching data from server...'}
          {hasPayload && !hasPrs && 'Processing repository data...'}
          {hasPrs && 'Building PR sections...'}
        </p>
      </div>
    );
  }

  // Docked beside the table on wide screens (the table keeps every column,
  // its cells taking two lines where they need to); below 900px an overlay
  // drawer while a PR is selected.
  const paneMode = isNarrow ? 'drawer' : 'docked';
  const isPaneDocked = isPaneVisible && !isNarrow;
  const paneFlags = selectedPr ? getPrFlags(selectedPr.prNumber, selectedPr.repo) : null;
  // The Ack's time (the user state stores when), for "Since I last looked".
  const paneAckedAt = selectedPr ? String(payload?.ackByRepo?.[selectedPr.repo]?.[selectedPr.prNumber] || '') : '';

  // NowProvider: one clock for the rows' relative times (Activity ages).
  return (
    <NowProvider>
      <div className="pr-workspace-toolbar">
        <Button icon="panel" pressed={isPaneVisible} onClick={handleTogglePane}>
          Detail pane
        </Button>
      </div>
      <div className="pr-workspace" data-pane={isPaneDocked ? 'docked' : undefined}>
        <div className="pr-workspace-list">
          {sections.map((section) => (
            <PrSection
              key={section.key}
              section={section}
              repo={effectiveRepo}
              actorsMap={actorsMap}
              isOpen={isSectionOpen(section.key, Boolean(section.defaultOpen))}
              expandedInsights={expandedInsights}
              selectedPrKey={selectedPrKey}
              onToggleSection={handleToggleSection}
              onToggleInsights={handleToggleInsights}
              onSelectRow={handleSelectRow}
              onSelectPr={handleSelectPr}
              onShowDetails={handleShowDetails}
              onClearSelection={handleClearSelection}
              onCheckboxChange={handleCheckboxChange}
              onAckAction={handleAckActionBusy}
              onApplyLabel={handleApplyLabelBusy}
              onUpdatePr={handleUpdatePrBusy}
              onViewJson={handleViewJson}
              getPrFlags={getPrFlags}
              getAttentionReasons={getAttentionReasons}
              activePrNumbers={combinedActivePrNumbers}
              queuedPrNumbers={combinedQueuedPrNumbers}
            />
          ))}
        </div>
        {isPaneVisible && (
          <PrDetailPane
            entry={selectedEntry}
            repo={effectiveRepo}
            mode={paneMode}
            actorsMap={actorsMap}
            isFlagged={Boolean(paneFlags?.isFlagged)}
            isInReview={Boolean(paneFlags?.isInReview)}
            isAcknowledged={Boolean(paneFlags?.isAcknowledged)}
            ackedAt={paneAckedAt}
            tab={paneTab}
            onTabChange={setPaneTab}
            onPrevious={previousPr ? () => handleStepPr(previousPr) : undefined}
            onNext={nextPr ? () => handleStepPr(nextPr) : undefined}
            onClose={handleClosePane}
            onClearSelection={handleClearSelection}
            onCheckboxChange={handleCheckboxChange}
            onAckAction={handleAckActionBusy}
            onApplyLabel={handleApplyLabelBusy}
            onUpdatePr={handleUpdatePrBusy}
            onViewJson={handleViewJson}
            onDataRefresh={setPayload}
          />
        )}
      </div>
      <PrJsonModal target={jsonModalTarget} payload={payload} onClose={() => setJsonModalTarget(null)} />
    </NowProvider>
  );
}
