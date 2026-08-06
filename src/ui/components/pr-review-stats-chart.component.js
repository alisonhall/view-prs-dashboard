(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsReviewStatsChartComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const REVIEWER_COLORS = [
    "#1f77b4",
    "#d62728",
    "#2ca02c",
    "#9467bd",
    "#ff7f0e",
    "#17becf",
    "#e377c2",
    "#8c564b",
    "#bcbd22",
    "#7f7f7f",
    "#003f5c",
    "#ef5675",
    "#ffa600",
    "#2f4b7c",
    "#00a676",
    "#c51b8a",
  ];

  const createPrReviewStatsChartComponent = ({ bucketTimelineChartData } = {}) => {
    const bucketTimelineChartDataSafe =
      typeof bucketTimelineChartData === "function"
        ? bucketTimelineChartData
        : (chartData) => ({
            buckets: Array.isArray(chartData?.dates)
              ? chartData.dates.map((date) => ({
                  key: String(date || ""),
                  startDate: String(date || ""),
                  endDate: String(date || ""),
                  dates: [String(date || "")],
                  dayCount: 1,
                  heatmapTopLabel: "",
                  heatmapBottomLabel: "",
                  title: String(date || ""),
                  axisLabel: String(date || ""),
                  axisLabelWithTextMonth: String(date || ""),
                }))
              : [],
            series: Array.isArray(chartData?.series) ? chartData.series : [],
          });

    const createReviewerActivityChart = (
      chartData,
      titleOverride = "",
      subtitleOverride = "",
    ) => {
      if (!chartData?.series || chartData.series.length === 0) return null;

      const card = document.createElement("section");
      card.className = "stats-graph-card stats-graph-card-fullwidth";

      const heading = document.createElement("h3");
      heading.className = "stats-graph-title";
      heading.textContent = titleOverride || "Activity over time per author";
      card.appendChild(heading);

      const subtitle = document.createElement("p");
      subtitle.className = "stats-graph-subtitle";
      subtitle.textContent =
        subtitleOverride ||
        `Heatmap + line trends for top ${chartData.series.length} authors over time.`;
      card.appendChild(subtitle);

      const dateFilterNote = document.createElement("p");
      dateFilterNote.className = "stats-graph-detail";
      dateFilterNote.style.margin = "4px 0 0";
      dateFilterNote.textContent =
        "Timeline honors Review Statistics Start date and End date filters.";
      card.appendChild(dateFilterNote);

      const activityDefinition = document.createElement("p");
      activityDefinition.className = "stats-graph-detail";
      activityDefinition.style.margin = "6px 0 0";
      activityDefinition.textContent =
        "Activity counted: comments (thread + top-level) and submitted reviews (including approvals) on PRs authored by someone else. Copilot actors are excluded.";
      card.appendChild(activityDefinition);

      const heatmapContainer = document.createElement("div");
      heatmapContainer.style.marginTop = "12px";
      heatmapContainer.style.overflowX = "auto";

      const table = document.createElement("div");
      table.style.display = "grid";
      table.style.gap = "4px";
      table.style.width = "100%";
      table.style.minWidth = "fit-content";
      table.style.boxSizing = "border-box";
      table.style.padding = "8px";
      table.style.border = "1px solid #d0d7de";
      table.style.borderRadius = "8px";
      table.style.backgroundColor = "#ffffff";

      const displayTimeline = bucketTimelineChartDataSafe(chartData);
      const displayBuckets = displayTimeline.buckets;
      const displaySeries = displayTimeline.series;
      const maxValue = Math.max(
        1,
        ...displaySeries.flatMap((series) =>
          series.points.map((point) => point.value),
        ),
      );
      const lastDates = displayBuckets;
      const viewportWidth =
        typeof window !== "undefined" ? Math.max(360, window.innerWidth) : 1200;
      const targetGraphWidth = Math.max(620, Math.min(1200, viewportWidth - 140));
      const heatmapGaps = (lastDates.length + 1) * 2;
      const heatmapFixedCols = 120 + 52;
      const heatmapInnerPadding = 16;
      const heatmapDateColWidth = Math.max(
        12,
        Math.min(
          18,
          Math.floor(
            (targetGraphWidth -
              heatmapFixedCols -
              heatmapGaps -
              heatmapInnerPadding) /
              Math.max(1, lastDates.length),
          ),
        ),
      );
      const columnTemplate = `120px repeat(${lastDates.length}, ${heatmapDateColWidth}px) 52px`;

      const headerRow = document.createElement("div");
      headerRow.style.display = "grid";
      headerRow.style.gridTemplateColumns = columnTemplate;
      headerRow.style.gap = "8px";
      headerRow.style.alignItems = "end";
      headerRow.style.position = "sticky";
      headerRow.style.top = "0";
      headerRow.style.backgroundColor = "#ffffff";

      const authorHeader = document.createElement("div");
      authorHeader.style.fontWeight = "600";
      authorHeader.style.fontSize = "11px";
      authorHeader.style.color = "#57606a";
      authorHeader.textContent = "Author";
      headerRow.appendChild(authorHeader);

      lastDates.forEach((bucket) => {
        const topLabel = bucket.heatmapTopLabel;
        const bottomLabel = bucket.heatmapBottomLabel;

        const dateCell = document.createElement("div");
        dateCell.style.textAlign = "center";
        dateCell.style.fontWeight = "500";
        dateCell.style.color = "#57606a";
        dateCell.style.width = `${heatmapDateColWidth}px`;
        dateCell.style.height = "36px";
        dateCell.style.display = "flex";
        dateCell.style.flexDirection = "column";
        dateCell.style.alignItems = "center";
        dateCell.style.justifyContent = "center";
        dateCell.style.lineHeight = "1";
        dateCell.style.whiteSpace = "nowrap";

        const topText = document.createElement("span");
        topText.style.fontSize = "10px";
        topText.style.fontWeight = "500";
        topText.textContent = topLabel;

        const bottomText = document.createElement("span");
        bottomText.style.fontSize = "10px";
        bottomText.style.fontWeight = "500";
        bottomText.style.marginTop = "2px";
        bottomText.textContent = bottomLabel;

        dateCell.appendChild(topText);
        dateCell.appendChild(bottomText);
        dateCell.title = bucket.title;
        headerRow.appendChild(dateCell);
      });

      const totalHeader = document.createElement("div");
      totalHeader.style.fontWeight = "600";
      totalHeader.style.fontSize = "11px";
      totalHeader.style.color = "#57606a";
      totalHeader.style.textAlign = "right";
      totalHeader.textContent = "Total";
      headerRow.appendChild(totalHeader);

      table.appendChild(headerRow);

      const heatmapRowsByLogin = new Map();

      displaySeries.forEach((series) => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = columnTemplate;
        row.style.gap = "8px";
        row.style.alignItems = "center";

        const seriesKey = String(series.login || series.actor || "");
        heatmapRowsByLogin.set(seriesKey, row);

        const totalCount = series.points.reduce(
          (sum, point) => sum + point.value,
          0,
        );

        const labelCell = document.createElement("div");
        labelCell.style.minWidth = "120px";
        labelCell.style.fontWeight = "500";
        labelCell.style.fontSize = "11px";
        labelCell.style.color = "#24292f";
        labelCell.style.overflow = "hidden";
        labelCell.style.textOverflow = "ellipsis";
        labelCell.style.whiteSpace = "nowrap";
        labelCell.textContent = String(series.actor || "unknown");
        labelCell.title = `${series.actor}: ${totalCount} total events`;
        row.appendChild(labelCell);

        series.points.forEach((point) => {
          const cell = document.createElement("div");
          cell.style.width = `${heatmapDateColWidth}px`;
          cell.style.height = "16px";
          cell.style.borderRadius = "3px";
          cell.style.border = "1px solid #d0d7de";

          if (point.value === 0) {
            cell.style.backgroundColor = "#f6f8fa";
          } else {
            const intensity = point.value / maxValue;
            const alpha = 0.18 + intensity * 0.72;
            cell.style.backgroundColor = `rgba(9, 105, 218, ${alpha.toFixed(3)})`;
          }

          cell.title = `${series.actor} on ${point.label}: ${point.value} event${point.value === 1 ? "" : "s"}`;
          row.appendChild(cell);
        });

        const totalCell = document.createElement("div");
        totalCell.style.fontSize = "11px";
        totalCell.style.fontWeight = "600";
        totalCell.style.color = "#57606a";
        totalCell.style.textAlign = "right";
        totalCell.textContent = String(totalCount);
        row.appendChild(totalCell);

        table.appendChild(row);
      });

      heatmapContainer.appendChild(table);

      const disclaimer = document.createElement("div");
      disclaimer.style.fontSize = "10px";
      disclaimer.style.color = "#57606a";
      disclaimer.style.marginTop = "6px";
      disclaimer.style.fontStyle = "italic";
      const multiDayBuckets = displayBuckets.filter((bucket) => bucket.dayCount > 1);
      if (multiDayBuckets.length > 0) {
        const maxDays = Math.max(...multiDayBuckets.map((bucket) => bucket.dayCount));
        disclaimer.textContent = `Note: Cells represent multiple days: ${maxDays} days`;
      } else {
        disclaimer.textContent = "Note: Each cell represents a single day.";
      }
      heatmapContainer.appendChild(disclaimer);

      card.appendChild(heatmapContainer);

      const lineTitle = document.createElement("p");
      lineTitle.className = "stats-graph-subtitle";
      lineTitle.style.marginTop = "12px";
      lineTitle.textContent =
        "Line graph comparison (same non-self activity definition and date range)";
      card.appendChild(lineTitle);

      const focusSummary = document.createElement("p");
      focusSummary.className = "stats-graph-detail";
      focusSummary.style.margin = "4px 0 0";
      focusSummary.textContent =
        "Click an author in the legend to highlight that line and row data.";
      card.appendChild(focusSummary);

      const lineContainer = document.createElement("div");
      lineContainer.style.marginTop = "8px";
      lineContainer.style.overflowX = "auto";
      lineContainer.style.width = "100%";

      const lineHeight = 236;
      const padLeft = 46;
      const padRight = 8;
      const padTop = 10;
      const padBottom = 34;
      let selectedSeriesKey = "";
      let resizeObserver = null;
      let lastRenderedWidth = 0;

      const getMeasuredLineWidth = (suggestedWidth = 0) => {
        const measured = Math.round(
          suggestedWidth || lineContainer.clientWidth || card.clientWidth || 0,
        );
        const usable = Math.max(560, measured > 0 ? measured - 10 : targetGraphWidth);
        return Math.max(usable, lastDates.length * 18);
      };

      const renderResponsiveLineGraph = (suggestedWidth = 0) => {
        const lineWidth = getMeasuredLineWidth(suggestedWidth);
        const plotWidth = lineWidth - padLeft - padRight;
        const plotHeight = lineHeight - padTop - padBottom;

        const linePlot = document.createElement("div");
        linePlot.style.position = "relative";
        linePlot.style.width = `${lineWidth}px`;
        linePlot.style.height = `${lineHeight}px`;
        linePlot.style.border = "1px solid #d0d7de";
        linePlot.style.borderRadius = "8px";
        linePlot.style.background =
          "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)";
        linePlot.style.overflow = "hidden";

        const yTicks = 8;
        for (let tick = 0; tick <= yTicks; tick += 1) {
          const ratio = tick / yTicks;
          const y = padTop + plotHeight * ratio;
          const gridLine = document.createElement("div");
          gridLine.style.position = "absolute";
          gridLine.style.left = `${padLeft}px`;
          gridLine.style.top = `${y}px`;
          gridLine.style.width = `${plotWidth}px`;
          gridLine.style.height = "1px";
          gridLine.style.backgroundColor = tick % 2 === 0 ? "#d8dee4" : "#eaeef2";
          linePlot.appendChild(gridLine);
          const yLabel = document.createElement("div");
          yLabel.style.position = "absolute";
          yLabel.style.right = `${lineWidth - padLeft - 34}px`;
          yLabel.style.top = `${y - 7}px`;
          yLabel.style.fontSize = "10px";
          yLabel.style.color = "#57606a";
          yLabel.style.width = "30px";
          yLabel.style.textAlign = "right";
          yLabel.textContent = String(Math.round((1 - ratio) * maxValue));
          linePlot.appendChild(yLabel);
        }

        const xAxis = document.createElement("div");
        xAxis.style.position = "absolute";
        xAxis.style.left = `${padLeft}px`;
        xAxis.style.top = `${padTop + plotHeight}px`;
        xAxis.style.width = `${plotWidth}px`;
        xAxis.style.height = "1px";
        xAxis.style.backgroundColor = "#9da7b3";
        linePlot.appendChild(xAxis);

        const yAxis = document.createElement("div");
        yAxis.style.position = "absolute";
        yAxis.style.left = `${padLeft}px`;
        yAxis.style.top = `${padTop}px`;
        yAxis.style.width = "1px";
        yAxis.style.height = `${plotHeight}px`;
        yAxis.style.backgroundColor = "#9da7b3";
        linePlot.appendChild(yAxis);

        const yAxisTitle = document.createElement("div");
        yAxisTitle.style.position = "absolute";
        yAxisTitle.style.left = "4px";
        yAxisTitle.style.top = `${padTop + plotHeight / 2}px`;
        yAxisTitle.style.transform = "translateY(-50%) rotate(-90deg)";
        yAxisTitle.style.transformOrigin = "left top";
        yAxisTitle.style.fontSize = "10px";
        yAxisTitle.style.fontWeight = "600";
        yAxisTitle.style.color = "#57606a";
        yAxisTitle.style.whiteSpace = "nowrap";
        yAxisTitle.textContent = "Events";
        linePlot.appendChild(yAxisTitle);

        const xTickCount = Math.min(8, Math.max(2, lastDates.length - 1));
        for (let tick = 0; tick <= xTickCount; tick += 1) {
          const idx = Math.round((tick / xTickCount) * (lastDates.length - 1));
          const x =
            padLeft +
            (lastDates.length <= 1 ? 0 : (idx / (lastDates.length - 1)) * plotWidth);
          const tickLine = document.createElement("div");
          tickLine.style.position = "absolute";
          tickLine.style.left = `${x}px`;
          tickLine.style.top = `${padTop}px`;
          tickLine.style.width = "1px";
          tickLine.style.height = `${plotHeight}px`;
          tickLine.style.backgroundColor = "rgba(157, 167, 179, 0.25)";
          linePlot.appendChild(tickLine);

          const xLabel = document.createElement("div");
          xLabel.style.position = "absolute";
          xLabel.style.left = `${x - 32}px`;
          xLabel.style.top = `${padTop + plotHeight + 4}px`;
          xLabel.style.width = "64px";
          xLabel.style.textAlign = "center";
          xLabel.style.fontSize = "10px";
          xLabel.style.color = "#57606a";
          xLabel.textContent = String(
            lastDates[idx]?.axisLabelWithTextMonth ||
              lastDates[idx]?.axisLabel ||
              "",
          );
          xLabel.title = String(lastDates[idx]?.title || "");
          linePlot.appendChild(xLabel);
        }

        const xAxisTitle = document.createElement("div");
        xAxisTitle.style.position = "absolute";
        xAxisTitle.style.left = `${padLeft}px`;
        xAxisTitle.style.top = `${lineHeight - 14}px`;
        xAxisTitle.style.width = `${plotWidth}px`;
        xAxisTitle.style.textAlign = "center";
        xAxisTitle.style.fontSize = "10px";
        xAxisTitle.style.fontWeight = "600";
        xAxisTitle.style.color = "#57606a";
        xAxisTitle.textContent = "Date";
        linePlot.appendChild(xAxisTitle);

        const tooltip = document.createElement("div");
        tooltip.style.position = "absolute";
        tooltip.style.pointerEvents = "none";
        tooltip.style.display = "none";
        tooltip.style.padding = "6px 8px";
        tooltip.style.borderRadius = "6px";
        tooltip.style.border = "1px solid #d0d7de";
        tooltip.style.backgroundColor = "#ffffff";
        tooltip.style.color = "#24292f";
        tooltip.style.fontSize = "11px";
        tooltip.style.boxShadow = "0 2px 8px rgba(31, 35, 40, 0.16)";
        tooltip.style.zIndex = "2";
        linePlot.appendChild(tooltip);

        const seriesVisuals = new Map();

        displaySeries.forEach((series, seriesIndex) => {
          const color = REVIEWER_COLORS[seriesIndex % REVIEWER_COLORS.length];
          const seriesKey = String(series.login || series.actor || "");
          const points = series.points;
          const coords = points.map((point, index) => {
            const x =
              padLeft +
              (points.length <= 1 ? 0 : (index / (points.length - 1)) * plotWidth);
            const y = padTop + (1 - point.value / Math.max(1, maxValue)) * plotHeight;
            return { x, y, point };
          });

          const visuals = {
            lineSegments: [],
            dots: [],
            legendItem: null,
            heatmapRow: heatmapRowsByLogin.get(seriesKey) || null,
            total: points.reduce((sum, point) => sum + point.value, 0),
            peak: points.reduce((max, point) => Math.max(max, point.value), 0),
            label: String(series.actor || seriesKey || "unknown"),
          };

          coords.forEach((coord, index) => {
            if (index === 0) return;
            const prev = coords[index - 1];
            const dx = coord.x - prev.x;
            const dy = coord.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

            const segment = document.createElement("div");
            segment.style.position = "absolute";
            segment.style.left = `${prev.x}px`;
            segment.style.top = `${prev.y}px`;
            segment.style.width = `${len}px`;
            segment.style.height = "2px";
            segment.style.backgroundColor = color;
            segment.style.transformOrigin = "0 0";
            segment.style.transform = `rotate(${angle}deg)`;
            segment.style.opacity = "0.85";
            linePlot.appendChild(segment);
            visuals.lineSegments.push(segment);
          });

          coords.forEach((coord) => {
            const dot = document.createElement("div");
            dot.style.position = "absolute";
            dot.style.left = `${coord.x - 2.5}px`;
            dot.style.top = `${coord.y - 2.5}px`;
            dot.style.width = "5px";
            dot.style.height = "5px";
            dot.style.borderRadius = "50%";
            dot.style.backgroundColor = color;
            dot.title = `${series.actor} on ${coord.point.label}: ${coord.point.value} event${coord.point.value === 1 ? "" : "s"}`;
            dot._tooltipEnabled = true;
            dot.onmouseenter = () => {
              if (!dot._tooltipEnabled) return;
              tooltip.textContent = `${series.actor} | ${coord.point.label} | ${coord.point.value}`;
              tooltip.style.display = "block";
            };
            dot.onmousemove = () => {
              if (!dot._tooltipEnabled) return;
              const left = Math.min(lineWidth - 180, Math.max(8, coord.x + 10));
              const top = Math.max(8, coord.y - 30);
              tooltip.style.left = `${left}px`;
              tooltip.style.top = `${top}px`;
            };
            dot.onmouseleave = () => {
              tooltip.style.display = "none";
            };
            linePlot.appendChild(dot);
            visuals.dots.push(dot);
          });

          seriesVisuals.set(seriesKey, visuals);
        });

        const legend = document.createElement("div");
        legend.style.display = "grid";
        legend.style.gridTemplateColumns = "repeat(auto-fit, minmax(140px, 1fr))";
        legend.style.gap = "6px 10px";
        legend.style.marginTop = "8px";

        const applySeriesFocus = () => {
          const hasFocus = Boolean(selectedSeriesKey);
          displaySeries.forEach((series) => {
            const seriesKey = String(series.login || series.actor || "");
            const visuals = seriesVisuals.get(seriesKey);
            if (!visuals) return;
            const active = !hasFocus || selectedSeriesKey === seriesKey;

            visuals.lineSegments.forEach((segment) => {
              segment.style.opacity = active ? "0.95" : "0.12";
              segment.style.height = active ? "3px" : "2px";
            });
            visuals.dots.forEach((dot) => {
              dot.style.opacity = active ? "1" : "0.2";
              dot.style.transform = active ? "scale(1.4)" : "scale(1)";
              dot.style.zIndex = active ? "2" : "1";
            });
            if (visuals.legendItem) {
              visuals.legendItem.style.opacity = active ? "1" : "0.35";
              visuals.legendItem.style.backgroundColor = active
                ? "#eef4ff"
                : "transparent";
              visuals.legendItem.style.borderColor = active
                ? "#9ec1ff"
                : "transparent";
              visuals.legendItem.style.fontWeight = active ? "600" : "400";
            }
            if (visuals.heatmapRow) {
              visuals.heatmapRow.style.opacity = active ? "1" : "0.35";
              visuals.heatmapRow.style.backgroundColor = active
                ? "#f6f8ff"
                : "transparent";
            }
          });

          if (!hasFocus) {
            focusSummary.textContent =
              "Click an author in the legend to highlight that line and row data.";
            displaySeries.forEach((series) => {
              const seriesKey = String(series.login || series.actor || "");
              const visuals = seriesVisuals.get(seriesKey);
              if (visuals) {
                visuals.dots.forEach((dot) => {
                  dot._tooltipEnabled = true;
                });
              }
            });
            return;
          }

          const selected = seriesVisuals.get(selectedSeriesKey);
          if (selected) {
            focusSummary.textContent = `${selected.label}: ${selected.total} total events, peak ${selected.peak} in a displayed bucket.`;
            displaySeries.forEach((series) => {
              const seriesKey = String(series.login || series.actor || "");
              const visuals = seriesVisuals.get(seriesKey);
              if (visuals) {
                const isSelected = seriesKey === selectedSeriesKey;
                visuals.dots.forEach((dot) => {
                  dot._tooltipEnabled = isSelected;
                });
              }
            });
          }
        };

        displaySeries.forEach((series, seriesIndex) => {
          const seriesKey = String(series.login || series.actor || "");
          const color = REVIEWER_COLORS[seriesIndex % REVIEWER_COLORS.length];
          const item = document.createElement("button");
          item.type = "button";
          item.style.display = "flex";
          item.style.alignItems = "center";
          item.style.gap = "6px";
          item.style.padding = "2px 6px";
          item.style.border = "1px solid transparent";
          item.style.borderRadius = "6px";
          item.style.background = "transparent";
          item.style.cursor = "pointer";
          item.title = `Highlight ${series.actor}`;

          const swatch = document.createElement("span");
          swatch.style.display = "inline-block";
          swatch.style.width = "10px";
          swatch.style.height = "10px";
          swatch.style.borderRadius = "50%";
          swatch.style.backgroundColor = color;
          item.appendChild(swatch);

          const total = series.points.reduce((sum, point) => sum + point.value, 0);
          const text = document.createElement("span");
          text.style.fontSize = "11px";
          text.style.color = "#57606a";
          text.style.whiteSpace = "nowrap";
          text.style.overflow = "hidden";
          text.style.textOverflow = "ellipsis";
          text.textContent = `${series.actor} (${total})`;
          item.appendChild(text);

          item.onclick = () => {
            selectedSeriesKey = selectedSeriesKey === seriesKey ? "" : seriesKey;
            applySeriesFocus();
          };

          legend.appendChild(item);

          const visuals = seriesVisuals.get(seriesKey);
          if (visuals) {
            visuals.legendItem = item;
          }
        });

        while (lineContainer.firstChild) {
          lineContainer.removeChild(lineContainer.firstChild);
        }
        lineContainer.appendChild(linePlot);
        lineContainer.appendChild(legend);
        applySeriesFocus();
        lastRenderedWidth = lineWidth;
      };

      const attachLineResizeObserver = () => {
        if (typeof window === "undefined" || typeof ResizeObserver !== "function") {
          return;
        }
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        resizeObserver = new ResizeObserver((entries) => {
          const width = Math.round(entries?.[0]?.contentRect?.width || 0);
          if (!width) return;
          const nextWidth = getMeasuredLineWidth(width);
          if (Math.abs(nextWidth - lastRenderedWidth) < 2) return;
          renderResponsiveLineGraph(width);
        });
        resizeObserver.observe(lineContainer);
      };

      renderResponsiveLineGraph();

      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        window.requestAnimationFrame(() => {
          renderResponsiveLineGraph();
          attachLineResizeObserver();
        });
      }

      card.appendChild(lineContainer);

      const lineDisclaimer = document.createElement("div");
      lineDisclaimer.style.fontSize = "10px";
      lineDisclaimer.style.color = "#57606a";
      lineDisclaimer.style.marginTop = "8px";
      lineDisclaimer.style.fontStyle = "italic";
      const maxMultiDayCount = Math.max(
        ...displayBuckets.map((bucket) => bucket.dayCount),
        1,
      );
      if (maxMultiDayCount > 1) {
        lineDisclaimer.textContent = `Note: Points represent multiple days: ${maxMultiDayCount} days`;
      } else {
        lineDisclaimer.textContent = "Note: Each point represents a single day.";
      }
      card.appendChild(lineDisclaimer);

      return card;
    };

    return {
      createReviewerActivityChart,
    };
  };

  return {
    createPrReviewStatsChartComponent,
  };
});
