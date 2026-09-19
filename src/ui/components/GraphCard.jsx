/**
 * GraphCard - React port of index.page.js's createStatsGraphCard(), a
 * horizontal-bar "graph card" used by StatsVisuals for the Review Stats
 * tab's metric-totals / top-reviewers cards. See REACT_MIGRATION_PLAN.md
 * Track A for context: this replaces document.createElement-based DOM
 * building with real JSX, one to one with the original markup/classNames
 * so stats.css needs no changes.
 *
 * @module components/GraphCard
 */

import React from 'react';

const toCount = (value) => (window.toCount ? window.toCount(value) : Number.parseInt(value, 10) || 0);

export function GraphCard({ title, subtitle, items, onHeaderClick }) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const maxValue = Math.max(
    1,
    ...items.map((item) => {
      if (Array.isArray(item?.segments)) {
        return item.segments.reduce((sum, seg) => sum + Math.max(0, toCount(seg?.value)), 0);
      }
      return Math.max(0, toCount(item?.value));
    }),
  );

  return (
    <section className="stats-graph-card">
      <h3
        className={onHeaderClick ? 'stats-graph-title stats-graph-title-clickable' : 'stats-graph-title'}
        style={onHeaderClick ? { cursor: 'pointer' } : undefined}
        title={onHeaderClick ? 'Click to sort table by this metric' : undefined}
        onClick={onHeaderClick || undefined}
      >
        {title}
      </h3>
      {subtitle && <p className="stats-graph-subtitle">{subtitle}</p>}
      <div className="stats-graph-list">
        {items.map((item, index) => {
          const isStacked = Array.isArray(item?.segments);
          const segmentValues = isStacked
            ? item.segments.map((seg) => Math.max(0, toCount(seg?.value)))
            : [Math.max(0, toCount(item?.value))];
          const totalValue = segmentValues.reduce((a, b) => a + b, 0);
          const totalPercent = isStacked ? Math.max(8, Math.round((totalValue / maxValue) * 100)) : 0;

          return (
            <div className="stats-graph-row" key={`${item?.label || 'row'}-${index}`}>
              <div className="stats-graph-row-header">
                <span className="stats-graph-label">{String(item?.label || '-')}</span>
                <span className="stats-graph-value">{String(totalValue)}</span>
              </div>
              <div className="stats-graph-track">
                {isStacked
                  ? item.segments.map((segment, segIndex) => {
                      const segValue = segmentValues[segIndex];
                      const segPercent = (segValue / Math.max(1, totalValue)) * totalPercent;
                      return (
                        <div
                          key={`${segment?.label || 'segment'}-${segIndex}`}
                          className={['stats-graph-fill', segment?.tone ? `stats-graph-fill-${segment.tone}` : '', 'stats-graph-fill-segment']
                            .filter(Boolean)
                            .join(' ')}
                          style={{ width: `${Math.max(2, segPercent)}%` }}
                          title={`${segment?.label}: ${segValue}`}
                          aria-hidden="true"
                        />
                      );
                    })
                  : (
                      <div
                        className={['stats-graph-fill', item?.tone ? `stats-graph-fill-${item.tone}` : ''].filter(Boolean).join(' ')}
                        style={{ width: `${Math.max(8, Math.round((totalValue / maxValue) * 100))}%` }}
                        aria-hidden="true"
                      />
                    )}
              </div>
              {item?.detail && <div className="stats-graph-detail">{String(item.detail)}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
