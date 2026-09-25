/**
 * ReviewerActivityChart - React port of index.page.js's
 * createReviewerActivityChart (pr-review-stats-chart.component.js), the
 * heatmap + hand-rolled div-based line chart used by StatsVisuals on the
 * Review Stats tab. See REACT_MIGRATION_PLAN.md Track A.
 *
 * Ported behavior 1:1 rather than rewritten against <svg> or a charting
 * library - same heatmap grid, same absolutely-positioned-div line/dot/
 * legend/tooltip approach, same ResizeObserver-driven responsive width -
 * only the imperative DOM mutation (closure variables, .style/.textContent
 * writes, manual event handlers) is replaced with React state.
 *
 * @module components/ReviewerActivityChart
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

const REVIEWER_COLORS = [
  '#1f77b4',
  '#d62728',
  '#2ca02c',
  '#9467bd',
  '#ff7f0e',
  '#17becf',
  '#e377c2',
  '#8c564b',
  '#bcbd22',
  '#7f7f7f',
  '#003f5c',
  '#ef5675',
  '#ffa600',
  '#2f4b7c',
  '#00a676',
  '#c51b8a',
];

const LINE_HEIGHT = 236;
const PAD_LEFT = 46;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 34;

const defaultBucketTimelineChartData = (chartData) => ({
  buckets: Array.isArray(chartData?.dates)
    ? chartData.dates.map((date) => ({
        key: String(date || ''),
        startDate: String(date || ''),
        endDate: String(date || ''),
        dates: [String(date || '')],
        dayCount: 1,
        heatmapTopLabel: '',
        heatmapBottomLabel: '',
        title: String(date || ''),
        axisLabel: String(date || ''),
        axisLabelWithTextMonth: String(date || ''),
      }))
    : [],
  series: Array.isArray(chartData?.series) ? chartData.series : [],
});

const bucketTimelineChartDataSafe = (chartData) => {
  const fn = typeof window !== 'undefined' && typeof window.bucketTimelineChartData === 'function'
    ? window.bucketTimelineChartData
    : defaultBucketTimelineChartData;
  return fn(chartData);
};

export function ReviewerActivityChart({ chartData, titleOverride = '', subtitleOverride = '' }) {
  const hasData = Boolean(chartData?.series && chartData.series.length > 0);

  const [selectedSeriesKey, setSelectedSeriesKey] = useState('');
  const [tooltip, setTooltip] = useState({ visible: false, left: 0, top: 0, text: '' });
  const lineContainerRef = useRef(null);
  const [lineWidth, setLineWidth] = useState(0);

  const displayTimeline = useMemo(
    () => (hasData ? bucketTimelineChartDataSafe(chartData) : { buckets: [], series: [] }),
    [chartData, hasData],
  );
  const displayBuckets = displayTimeline.buckets;
  const displaySeries = displayTimeline.series;
  const maxValue = Math.max(1, ...displaySeries.flatMap((series) => series.points.map((point) => point.value)));

  const targetGraphWidth = useMemo(() => {
    const viewportWidth = typeof window !== 'undefined' ? Math.max(360, window.innerWidth) : 1200;
    return Math.max(620, Math.min(1200, viewportWidth - 140));
  }, []);

  const heatmapDateColWidth = useMemo(() => {
    const heatmapGaps = (displayBuckets.length + 1) * 2;
    const heatmapFixedCols = 120 + 52;
    const heatmapInnerPadding = 16;
    return Math.max(
      12,
      Math.min(18, Math.floor((targetGraphWidth - heatmapFixedCols - heatmapGaps - heatmapInnerPadding) / Math.max(1, displayBuckets.length))),
    );
  }, [displayBuckets.length, targetGraphWidth]);
  const columnTemplate = `120px repeat(${displayBuckets.length}, ${heatmapDateColWidth}px) 52px`;

  useEffect(() => {
    const container = lineContainerRef.current;
    if (!container) return undefined;

    const measure = (suggestedWidth) => {
      const measured = Math.round(suggestedWidth || container.clientWidth || 0);
      const usable = Math.max(560, measured > 0 ? measured - 10 : targetGraphWidth);
      return Math.max(usable, displayBuckets.length * 18);
    };

    setLineWidth((previous) => {
      const next = measure(0);
      return Math.abs(next - previous) < 2 ? previous : next;
    });

    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries?.[0]?.contentRect?.width || 0);
      if (!width) return;
      const next = measure(width);
      setLineWidth((previous) => (Math.abs(next - previous) < 2 ? previous : next));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [displayBuckets.length, targetGraphWidth]);

  if (!hasData) {
    return null;
  }

  const lineWidthEffective = lineWidth || targetGraphWidth;
  const plotWidth = lineWidthEffective - PAD_LEFT - PAD_RIGHT;
  const plotHeight = LINE_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const seriesCoords = displaySeries.map((series) => {
    const points = series.points;
    return points.map((point, index) => ({
      x: PAD_LEFT + (points.length <= 1 ? 0 : (index / (points.length - 1)) * plotWidth),
      y: PAD_TOP + (1 - point.value / Math.max(1, maxValue)) * plotHeight,
      point,
    }));
  });

  const tooltipEnabledForSeries = (seriesKey) => !selectedSeriesKey || selectedSeriesKey === seriesKey;

  const showTooltip = (seriesKey, coord, actor) => {
    if (!tooltipEnabledForSeries(seriesKey)) return;
    setTooltip({ visible: true, left: tooltip.left, top: tooltip.top, text: `${actor} | ${coord.point.label} | ${coord.point.value}` });
  };
  const moveTooltip = (seriesKey, coord) => {
    if (!tooltipEnabledForSeries(seriesKey)) return;
    const left = Math.min(lineWidthEffective - 180, Math.max(8, coord.x + 10));
    const top = Math.max(8, coord.y - 30);
    setTooltip((previous) => ({ ...previous, left, top }));
  };
  const hideTooltip = () => setTooltip((previous) => ({ ...previous, visible: false }));

  const multiDayBuckets = displayBuckets.filter((bucket) => bucket.dayCount > 1);
  const heatmapDisclaimer =
    multiDayBuckets.length > 0
      ? `Note: Cells represent multiple days: ${Math.max(...multiDayBuckets.map((bucket) => bucket.dayCount))} days`
      : 'Note: Each cell represents a single day.';
  const maxMultiDayCount = Math.max(...displayBuckets.map((bucket) => bucket.dayCount), 1);
  const lineDisclaimer =
    maxMultiDayCount > 1
      ? `Note: Points represent multiple days: ${maxMultiDayCount} days`
      : 'Note: Each point represents a single day.';

  let focusSummaryText = 'Click an author in the legend to highlight that line and row data.';
  if (selectedSeriesKey) {
    const selectedIndex = displaySeries.findIndex((series) => String(series.login || series.actor || '') === selectedSeriesKey);
    if (selectedIndex >= 0) {
      const series = displaySeries[selectedIndex];
      const total = series.points.reduce((sum, point) => sum + point.value, 0);
      const peak = series.points.reduce((max, point) => Math.max(max, point.value), 0);
      focusSummaryText = `${String(series.actor || selectedSeriesKey)}: ${total} total events, peak ${peak} in a displayed bucket.`;
    }
  }

  const xTickCount = Math.min(8, Math.max(2, displayBuckets.length - 1));

  return (
    <section className="stats-graph-card stats-graph-card-fullwidth">
      <h3 className="stats-graph-title">{titleOverride || 'Activity over time per author'}</h3>
      <p className="stats-graph-subtitle">
        {subtitleOverride || `Heatmap + line trends for top ${chartData.series.length} authors over time.`}
      </p>
      <p className="stats-graph-detail" style={{ margin: '4px 0 0' }}>
        Timeline honors Review Statistics Start date and End date filters.
      </p>
      <p className="stats-graph-detail" style={{ margin: '6px 0 0' }}>
        Activity counted: comments (thread + top-level) and submitted reviews (including approvals) on PRs authored by someone else. Copilot
        actors are excluded.
      </p>

      <div style={{ marginTop: '12px', overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gap: '4px',
            width: '100%',
            minWidth: 'fit-content',
            boxSizing: 'border-box',
            padding: '8px',
            border: '1px solid #d0d7de',
            borderRadius: '8px',
            backgroundColor: '#ffffff',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: columnTemplate, gap: '8px', alignItems: 'end', position: 'sticky', top: 0, backgroundColor: '#ffffff' }}>
            <div style={{ fontWeight: 600, fontSize: '11px', color: '#57606a' }}>Author</div>
            {displayBuckets.map((bucket) => (
              <div
                key={bucket.key}
                title={bucket.title}
                style={{
                  textAlign: 'center',
                  fontWeight: 500,
                  color: '#57606a',
                  width: `${heatmapDateColWidth}px`,
                  height: '36px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: '10px', fontWeight: 500 }}>{bucket.heatmapTopLabel}</span>
                <span style={{ fontSize: '10px', fontWeight: 500, marginTop: '2px' }}>{bucket.heatmapBottomLabel}</span>
              </div>
            ))}
            <div style={{ fontWeight: 600, fontSize: '11px', color: '#57606a', textAlign: 'right' }}>Total</div>
          </div>

          {displaySeries.map((series) => {
            const seriesKey = String(series.login || series.actor || '');
            const active = !selectedSeriesKey || selectedSeriesKey === seriesKey;
            const totalCount = series.points.reduce((sum, point) => sum + point.value, 0);
            return (
              <div
                key={seriesKey}
                style={{
                  display: 'grid',
                  gridTemplateColumns: columnTemplate,
                  gap: '8px',
                  alignItems: 'center',
                  opacity: active ? 1 : 0.35,
                  backgroundColor: active ? '#f6f8ff' : 'transparent',
                }}
              >
                <div
                  title={`${series.actor}: ${totalCount} total events`}
                  style={{ minWidth: '120px', fontWeight: 500, fontSize: '11px', color: '#24292f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {String(series.actor || 'unknown')}
                </div>
                {series.points.map((point, pointIndex) => {
                  const cellStyle = { width: `${heatmapDateColWidth}px`, height: '16px', borderRadius: '3px', border: '1px solid #d0d7de' };
                  if (point.value === 0) {
                    cellStyle.backgroundColor = '#f6f8fa';
                  } else {
                    const intensity = point.value / maxValue;
                    const alpha = 0.18 + intensity * 0.72;
                    cellStyle.backgroundColor = `rgba(9, 105, 218, ${alpha.toFixed(3)})`;
                  }
                  return (
                    <div
                      key={pointIndex}
                      style={cellStyle}
                      title={`${series.actor} on ${point.label}: ${point.value} event${point.value === 1 ? '' : 's'}`}
                    />
                  );
                })}
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#57606a', textAlign: 'right' }}>{totalCount}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: '10px', color: '#57606a', marginTop: '6px', fontStyle: 'italic' }}>{heatmapDisclaimer}</div>
      </div>

      <p className="stats-graph-subtitle" style={{ marginTop: '12px' }}>
        Line graph comparison (same non-self activity definition and date range)
      </p>
      <p className="stats-graph-detail" style={{ margin: '4px 0 0' }}>
        {focusSummaryText}
      </p>

      <div ref={lineContainerRef} style={{ marginTop: '8px', overflowX: 'auto', width: '100%' }}>
        <div
          style={{
            position: 'relative',
            width: `${lineWidthEffective}px`,
            height: `${LINE_HEIGHT}px`,
            border: '1px solid #d0d7de',
            borderRadius: '8px',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
            overflow: 'hidden',
          }}
        >
          {Array.from({ length: 9 }, (_, tick) => {
            const ratio = tick / 8;
            const y = PAD_TOP + plotHeight * ratio;
            return (
              <React.Fragment key={`ytick-${tick}`}>
                <div
                  style={{
                    position: 'absolute',
                    left: `${PAD_LEFT}px`,
                    top: `${y}px`,
                    width: `${plotWidth}px`,
                    height: '1px',
                    backgroundColor: tick % 2 === 0 ? '#d8dee4' : '#eaeef2',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    right: `${lineWidthEffective - PAD_LEFT - 34}px`,
                    top: `${y - 7}px`,
                    fontSize: '10px',
                    color: '#57606a',
                    width: '30px',
                    textAlign: 'right',
                  }}
                >
                  {Math.round((1 - ratio) * maxValue)}
                </div>
              </React.Fragment>
            );
          })}

          <div style={{ position: 'absolute', left: `${PAD_LEFT}px`, top: `${PAD_TOP + plotHeight}px`, width: `${plotWidth}px`, height: '1px', backgroundColor: '#9da7b3' }} />
          <div style={{ position: 'absolute', left: `${PAD_LEFT}px`, top: `${PAD_TOP}px`, width: '1px', height: `${plotHeight}px`, backgroundColor: '#9da7b3' }} />
          <div
            style={{
              position: 'absolute',
              left: '4px',
              top: `${PAD_TOP + plotHeight / 2}px`,
              transform: 'translateY(-50%) rotate(-90deg)',
              transformOrigin: 'left top',
              fontSize: '10px',
              fontWeight: 600,
              color: '#57606a',
              whiteSpace: 'nowrap',
            }}
          >
            Events
          </div>

          {Array.from({ length: xTickCount + 1 }, (_, tick) => {
            const idx = Math.round((tick / xTickCount) * (displayBuckets.length - 1));
            const x = PAD_LEFT + (displayBuckets.length <= 1 ? 0 : (idx / (displayBuckets.length - 1)) * plotWidth);
            const bucket = displayBuckets[idx];
            return (
              <React.Fragment key={`xtick-${tick}`}>
                <div style={{ position: 'absolute', left: `${x}px`, top: `${PAD_TOP}px`, width: '1px', height: `${plotHeight}px`, backgroundColor: 'rgba(157, 167, 179, 0.25)' }} />
                <div
                  title={String(bucket?.title || '')}
                  style={{ position: 'absolute', left: `${x - 32}px`, top: `${PAD_TOP + plotHeight + 4}px`, width: '64px', textAlign: 'center', fontSize: '10px', color: '#57606a' }}
                >
                  {String(bucket?.axisLabelWithTextMonth || bucket?.axisLabel || '')}
                </div>
              </React.Fragment>
            );
          })}

          <div
            style={{
              position: 'absolute',
              left: `${PAD_LEFT}px`,
              top: `${LINE_HEIGHT - 14}px`,
              width: `${plotWidth}px`,
              textAlign: 'center',
              fontSize: '10px',
              fontWeight: 600,
              color: '#57606a',
            }}
          >
            Date
          </div>

          {displaySeries.map((series, seriesIndex) => {
            const color = REVIEWER_COLORS[seriesIndex % REVIEWER_COLORS.length];
            const seriesKey = String(series.login || series.actor || '');
            const coords = seriesCoords[seriesIndex];
            const active = !selectedSeriesKey || selectedSeriesKey === seriesKey;

            return (
              <React.Fragment key={seriesKey}>
                {coords.map((coord, index) => {
                  if (index === 0) return null;
                  const prev = coords[index - 1];
                  const dx = coord.x - prev.x;
                  const dy = coord.y - prev.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                  return (
                    <div
                      key={`segment-${index}`}
                      style={{
                        position: 'absolute',
                        left: `${prev.x}px`,
                        top: `${prev.y}px`,
                        width: `${len}px`,
                        height: active ? '3px' : '2px',
                        backgroundColor: color,
                        transformOrigin: '0 0',
                        transform: `rotate(${angle}deg)`,
                        opacity: active ? 0.95 : 0.12,
                      }}
                    />
                  );
                })}
                {coords.map((coord, index) => (
                  <div
                    key={`dot-${index}`}
                    title={`${series.actor} on ${coord.point.label}: ${coord.point.value} event${coord.point.value === 1 ? '' : 's'}`}
                    onMouseEnter={() => showTooltip(seriesKey, coord, series.actor)}
                    onMouseMove={() => moveTooltip(seriesKey, coord)}
                    onMouseLeave={hideTooltip}
                    style={{
                      position: 'absolute',
                      left: `${coord.x - 2.5}px`,
                      top: `${coord.y - 2.5}px`,
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      backgroundColor: color,
                      opacity: active ? 1 : 0.2,
                      transform: active ? 'scale(1.4)' : 'scale(1)',
                      zIndex: active ? 2 : 1,
                    }}
                  />
                ))}
              </React.Fragment>
            );
          })}

          <div
            style={{
              position: 'absolute',
              display: tooltip.visible ? 'block' : 'none',
              left: `${tooltip.left}px`,
              top: `${tooltip.top}px`,
              pointerEvents: 'none',
              padding: '6px 8px',
              borderRadius: '6px',
              border: '1px solid #d0d7de',
              backgroundColor: '#ffffff',
              color: '#24292f',
              fontSize: '11px',
              boxShadow: '0 2px 8px rgba(31, 35, 40, 0.16)',
              zIndex: 2,
            }}
          >
            {tooltip.text}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '6px 10px', marginTop: '8px' }}>
          {displaySeries.map((series, seriesIndex) => {
            const seriesKey = String(series.login || series.actor || '');
            const color = REVIEWER_COLORS[seriesIndex % REVIEWER_COLORS.length];
            const active = !selectedSeriesKey || selectedSeriesKey === seriesKey;
            const total = series.points.reduce((sum, point) => sum + point.value, 0);
            return (
              <button
                key={seriesKey}
                type="button"
                title={`Highlight ${series.actor}`}
                onClick={() => setSelectedSeriesKey((previous) => (previous === seriesKey ? '' : seriesKey))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '2px 6px',
                  border: '1px solid',
                  borderColor: active ? '#9ec1ff' : 'transparent',
                  borderRadius: '6px',
                  background: active ? '#eef4ff' : 'transparent',
                  cursor: 'pointer',
                  opacity: active ? 1 : 0.35,
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color }} />
                <span style={{ fontSize: '11px', color: '#57606a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {series.actor} ({total})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: '10px', color: '#57606a', marginTop: '8px', fontStyle: 'italic' }}>{lineDisclaimer}</div>
    </section>
  );
}
