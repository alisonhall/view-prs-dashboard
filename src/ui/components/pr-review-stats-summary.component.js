(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsReviewStatsSummaryComponent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrReviewStatsSummaryComponent = ({
    asArray,
    activateDataTab,
    collectNodesByTag,
    createTextCell,
    formatIsoDatetime,
    getNormalizedStatsDateRange,
    renderActivityTrendNote,
    createStatsVisuals,
  } = {}) => {
    const createStatCard = (label, value, detail = "") => {
      const card = document.createElement("div");
      card.className = "stat-card";

      const labelEl = document.createElement("span");
      labelEl.className = "stat-card-label";
      labelEl.textContent = label;
      card.appendChild(labelEl);

      const valueEl = document.createElement("span");
      valueEl.className = "stat-card-value";
      valueEl.textContent = value;
      card.appendChild(valueEl);

      if (detail) {
        const detailEl = document.createElement("span");
        detailEl.className = "stat-card-detail";
        detailEl.textContent = detail;
        card.appendChild(detailEl);
      }

      return card;
    };

    const buildPrSourceText = (item) => {
      const prNumber = String(item?.prNumber || "").trim();
      const prTitle = String(item?.prTitle || "").trim();
      if (prNumber && prTitle) {
        return `PR #${prNumber}: ${prTitle}`;
      }
      if (prNumber) {
        return `PR #${prNumber}`;
      }
      return prTitle || "Unknown source";
    };

    const createPrSourceLabel = (item) => {
      const label = buildPrSourceText(item);
      const prUrl = String(item?.prUrl || "").trim();
      if (!prUrl) {
        const span = document.createElement("span");
        span.textContent = label;
        return span;
      }

      const link = document.createElement("a");
      link.href = prUrl;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.className = "pr-link";
      link.textContent = label;
      return link;
    };

    const createSourceItemRow = (item, detailText) => {
      const row = document.createElement("div");
      row.className = "stats-source-item";

      const labelContainer = document.createElement("div");
      labelContainer.style.display = "flex";
      labelContainer.style.gap = "8px";
      labelContainer.style.alignItems = "center";
      labelContainer.appendChild(createPrSourceLabel(item));

      const prNumber = String(item?.prNumber || "").trim();
      if (prNumber) {
        const viewTableBtn = document.createElement("button");
        viewTableBtn.textContent = "View in table";
        viewTableBtn.className = "author-insights-table-link";
        viewTableBtn.title = "Navigate to PR data tab and scroll to this PR";
        viewTableBtn.style.fontSize = "12px";
        viewTableBtn.style.padding = "3px 6px";
        viewTableBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          activateDataTab("pr-data");
          setTimeout(() => {
            const prLinks = collectNodesByTag(document.body, "a")
              .filter((link) => link.className === "pr-link")
              .filter((link) => link.textContent.trim() === `#${prNumber}`);

            if (prLinks.length > 0) {
              const prLink = prLinks[0];
              prLink.scrollIntoView({ behavior: "smooth", block: "center" });
              prLink.focus();

              const prRow = prLink.closest("tr");
              if (prRow) {
                const nextRow = prRow.nextElementSibling;
                if (nextRow && nextRow.querySelector(".insights-row-cell")) {
                  nextRow.hidden = false;
                  const toggleButton = prRow.querySelector(".row-insights-toggle");
                  if (toggleButton) {
                    toggleButton.textContent = "Hide insights";
                    toggleButton.setAttribute("aria-expanded", "true");
                  }
                }
              }
            }
          }, 30);
        };
        labelContainer.appendChild(viewTableBtn);
      }

      row.appendChild(labelContainer);

      const detailParts = [];
      const author = String(
        item?.prAuthor || item?.author || item?.authorLogin || "",
      ).trim();
      if (author) {
        detailParts.push(`PR author: ${author}`);
      }
      if (detailText) {
        detailParts.push(detailText);
      }

      if (detailParts.length > 0) {
        const detail = document.createElement("span");
        detail.className = "stats-source-detail";
        detail.textContent = ` | ${detailParts.join(" | ")}`;
        row.appendChild(detail);
      }

      return row;
    };

    const createSourcesDetails = (summaryText, items, formatter) => {
      const details = document.createElement("details");
      details.className = "stats-sources";

      const summary = document.createElement("summary");
      summary.textContent = summaryText;
      details.appendChild(summary);

      const list = document.createElement("div");
      list.className = "stats-sources-list";
      asArray(items).forEach((item) => {
        list.appendChild(createSourceItemRow(item, formatter(item)));
      });

      details.appendChild(list);
      return details;
    };

    const appendCardSources = (card, items, formatter) => {
      if (!Array.isArray(items) || items.length === 0) return;
      card.appendChild(
        createSourcesDetails(`Show sources (${items.length})`, items, formatter),
      );
    };

    const getReviewerSourceSections = (reviewer) =>
      [
        ["Comments", reviewer.sources.comments, (item) => `${item.count} comments`],
        [
          "Reviews",
          reviewer.sources.reviews,
          (item) => `${item.count} reviews (${item.approvals} approvals)`,
        ],
        [
          "Risky approvals",
          reviewer.sources.riskyApprovals,
          (item) => `approved ${formatIsoDatetime(item.approvedAt || "-")}`,
        ],
        [
          "Useful signals",
          reviewer.sources.usefulnessSignals,
          (item) => `${item.count} usefulness signals`,
        ],
      ].filter(([, items]) => Array.isArray(items) && items.length > 0);

    const createReviewerSourcesContent = (reviewer) => {
      const sections = [...getReviewerSourceSections(reviewer)];

      if (!sections.length) {
        return null;
      }

      const content = document.createElement("div");
      content.className = "stats-sources-group";
      sections.forEach(([label, items, formatter]) => {
        const groupTitle = document.createElement("div");
        groupTitle.className = "stats-sources-group-title";
        groupTitle.textContent = label;
        content.appendChild(groupTitle);

        const list = document.createElement("div");
        list.className = "stats-sources-list";
        items.forEach((item) => {
          list.appendChild(createSourceItemRow(item, formatter(item)));
        });
        content.appendChild(list);
      });
      return content;
    };

    const createReviewerSourcesToggleCell = (reviewer, detailsRow) => {
      const td = document.createElement("td");
      td.className = "stats-sources-cell";

      const content = createReviewerSourcesContent(reviewer);
      if (!content) {
        td.textContent = "-";
        return td;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "stats-sources-toggle";
      button.textContent = "Show sources";
      button.setAttribute("aria-expanded", "false");
      button.onclick = () => {
        detailsRow.hidden = !detailsRow.hidden;
        const isExpanded = detailsRow.hidden === false;
        button.textContent = isExpanded ? "Hide sources" : "Show sources";
        button.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      };
      td.appendChild(button);
      return td;
    };

    const createReviewerSourcesRow = (reviewer, columnCount) => {
      const row = document.createElement("tr");
      row.hidden = true;
      row.className = "stats-sources-row";

      const td = document.createElement("td");
      td.colSpan = columnCount;
      td.className = "stats-sources-row-cell";

      const content = createReviewerSourcesContent(reviewer);
      if (content) {
        td.appendChild(content);
      } else {
        td.textContent = "No sources";
      }

      row.appendChild(td);
      return row;
    };

    const renderStatsSummaryAndTable = (host, stats, rows, actorsMap = {}) => {
      const cards = document.createElement("div");
      cards.className = "stats-grid";
      const filteredRowsCard = createStatCard(
        "Filtered rows",
        String(stats.summary.rows),
        "Current local filter scope",
      );
      appendCardSources(filteredRowsCard, stats.summary.sources.rows, (item) => {
        const author = String(item?.prAuthor || "").trim();
        return author ? `PR author: ${author}` : "";
      });
      cards.appendChild(filteredRowsCard);

      const commentsCard = createStatCard(
        "Comments on others' PRs",
        String(stats.summary.commentsOnOthersPrs),
        "Top-level and thread comments combined",
      );
      appendCardSources(
        commentsCard,
        stats.summary.sources.commentsOnOthersPrs,
        (item) => `${item.reviewer} | ${item.count} comments`,
      );
      cards.appendChild(commentsCard);

      const approvalsCard = createStatCard(
        "Approvals",
        String(stats.summary.approvals),
        `${stats.summary.riskyApprovals} risky | ${stats.summary.highRiskApprovals} high-risk`,
      );
      appendCardSources(
        approvalsCard,
        stats.summary.sources.approvals,
        (item) => `${item.reviewer} | approved ${formatIsoDatetime(item.approvedAt || "-")}`,
      );
      cards.appendChild(approvalsCard);

      const usefulnessCard = createStatCard(
        "Comment usefulness",
        String(stats.summary.usefulnessSignals),
        `${stats.summary.commentsFollowedByAuthorCommit} comments were followed by author commits`,
      );
      appendCardSources(
        usefulnessCard,
        stats.summary.sources.usefulnessSignals,
        (item) => `${item.reviewer} | ${item.count} signals`,
      );
      cards.appendChild(usefulnessCard);
      host.appendChild(cards);

      const visuals = createStatsVisuals(stats, rows, actorsMap);
      if (visuals) {
        host.appendChild(visuals);
      }

      const table = document.createElement("table");
      table.className = "stats-table";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      [
        "Reviewer",
        "Comments",
        "Thread comments",
        "Reviews",
        "Approvals",
        "Risky approvals",
        "High-risk approvals",
        "Useful comment signals",
        "Comments → author commit",
        "Resolved thread comments",
        "PRs touched",
        "Sources",
      ].forEach((label) => {
        const th = document.createElement("th");
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      const statsColumnCount = 12;
      for (const reviewer of stats.reviewerRows) {
        const tr = document.createElement("tr");
        const detailsRow = createReviewerSourcesRow(reviewer, statsColumnCount);
        [
          reviewer.name,
          String(reviewer.comments),
          String(reviewer.threadComments),
          String(reviewer.reviews),
          String(reviewer.approvals),
          String(reviewer.riskyApprovals),
          String(reviewer.highRiskApprovals),
          String(reviewer.usefulnessSignals),
          String(reviewer.commentsFollowedByAuthorCommit),
          String(reviewer.resolvedThreadComments),
          String(reviewer.prCount),
        ].forEach((value) => {
          tr.appendChild(createTextCell(value));
        });
        tr.appendChild(createReviewerSourcesToggleCell(reviewer, detailsRow));
        tbody.appendChild(tr);
        tbody.appendChild(detailsRow);
      }
      table.appendChild(tbody);
      host.appendChild(table);

      const summaryNote = document.createElement("p");
      summaryNote.className = "stats-note";
      const dateRange = getNormalizedStatsDateRange();
      const dateText =
        dateRange.startDate || dateRange.endDate
          ? ` Date range: ${dateRange.startDate || "start"} to ${dateRange.endDate || "end"}.`
          : "";
      summaryNote.textContent = `Showing ${stats.reviewerRows.length} of ${stats.totalBeforeLimit} reviewers after stats filters. Stats are computed from all stored rows and use saved per-PR metrics.${dateText}`;
      host.appendChild(summaryNote);

      const trendNote = renderActivityTrendNote(rows, actorsMap);
      host.appendChild(trendNote);
    };

    return {
      renderStatsSummaryAndTable,
    };
  };

  return {
    createPrReviewStatsSummaryComponent,
  };
});
