/**
 * Shared key-building helpers for PR row state that must stay unique per
 * repo, not just per PR number - PR numbers are only unique *within* a
 * repo, and PrTableApp's entriesForRepo renders rows from every repo found
 * in the payload alongside the currently-configured one, so a
 * number-only key can collide across repos with the same PR number.
 *
 * Plain (non-UMD) ES module, imported directly by PrTableApp.jsx,
 * PrTable.jsx, and PrRow.jsx - pulling it out of PrTableApp.jsx itself
 * avoids a PrTableApp -> PrSection -> PrTable -> PrTableApp import cycle.
 *
 * @module components/pr-row-keys
 */

// Keys the scheduler's "in progress" / user-action "busy" spinner state
// (PrTableApp's combinedActivePrNumbers, PrTable's activePrNumberSet).
export const buildActivePrKey = (prNumber, repo) => `${repo || ''}::${prNumber}`;

// Keys the insights row's expand/collapse state (PrTableApp's
// expandedInsights, PrTable's read of it, PrRow/PrInsightsRow's own
// compositeKey prop).
export const buildExpandedInsightsKey = (sectionKey, repo, prNumber) =>
  `${sectionKey}:${repo || ''}:${prNumber}`;
