(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrActionLogHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrActionLogHelpers = ({
    fetch,
    getOptionalElementById,
    escapeHtml,
    formatIsoDatetime,
  }) => {
    const renderActionLog = (entries) => {
      const container = getOptionalElementById("action-log-container");
      if (!container) return;

      if (!Array.isArray(entries) || entries.length === 0) {
        container.innerHTML =
          '<p class="action-log-empty">No actions logged yet.</p>';
        return;
      }

      const rows = entries.map((entry) => {
        const ts = entry.triggeredAt
          ? formatIsoDatetime(entry.triggeredAt)
          : "(unknown)";
        const action = String(entry.action || "");
        const ok = entry.ok !== false;
        const statusBadge = ok
          ? '<span class="action-log-status-ok">OK</span>'
          : '<span class="action-log-status-fail">Failed</span>';
        const ms = typeof entry.durationMs === "number" ? entry.durationMs : null;
        const duration =
          ms === null ? "-" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

        const detailParts = [];
        if (entry.detail && typeof entry.detail === "object") {
          Object.entries(entry.detail).forEach(([key, value]) => {
            if (value != null && value !== "") {
              detailParts.push(`${key}: ${value}`);
            }
          });
        }
        if (!ok && entry.error) {
          detailParts.push(`error: ${entry.error}`);
        }
        const detail = detailParts.join(" · ");

        return `<tr>
      <td>${ts}</td>
      <td><code>${escapeHtml(action)}</code></td>
      <td>${statusBadge}</td>
      <td>${duration}</td>
      <td class="action-log-detail">${escapeHtml(detail)}</td>
    </tr>`;
      });

      container.innerHTML = `<table class="action-log-table">
    <thead>
      <tr>
        <th>Time</th>
        <th>Action</th>
        <th>Status</th>
        <th>Duration</th>
        <th>Detail</th>
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
    };

    const loadActionLog = async () => {
      const container = getOptionalElementById("action-log-container");
      if (container) {
        container.innerHTML = '<p class="action-log-empty">Loading...</p>';
      }

      try {
        const response = await fetch("/view-prs/action-log");
        const result = await response.json();
        if (!response.ok || result.ok === false) {
          throw new Error(result.error || "Failed to load action log");
        }
        renderActionLog(result.entries || []);
      } catch (error) {
        if (container) {
          container.innerHTML = `<p class="action-log-empty">Failed to load action log: ${escapeHtml(error.message || String(error))}</p>`;
        }
      }
    };

    return {
      renderActionLog,
      loadActionLog,
    };
  };

  return {
    createPrActionLogHelpers,
  };
});
