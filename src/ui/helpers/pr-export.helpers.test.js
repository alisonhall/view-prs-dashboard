const { createPrExportHelpers } = require("./pr-export.helpers.js");

const makeNode = (overrides = {}) => {
  const attrs = { ...(overrides.attributes || {}) };
  const node = {
    className: "",
    children: [],
    open: false,
    attributes: attrs,
    appendChild(child) {
      this.children.push(child);
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name];
    },
  };

  Object.assign(node, overrides);
  return node;
};

const getPerPrUserStateFromPayload = (payload, entry, prNumber, repo) => ({
  notesByPrNumber: entry?.notes || null,
  ackByRepo: payload?.ackByRepo?.[repo]?.[prNumber] || null,
  reverifyByRepo: payload?.reverifyByRepo?.[repo]?.[prNumber] || null,
  inReviewByRepo: payload?.inReviewByRepo?.[repo]?.[prNumber] || null,
});

describe("pr export helpers", () => {
  test("collectLeafPaths tracks nested object fields and treats arrays as leaf fields", () => {
    const helpers = createPrExportHelpers({ getPerPrUserStateFromPayload });
    const paths = Array.from(
      helpers.collectLeafPaths({
        prNumber: "123",
        data: {
          title: "Feature",
          labels: ["bug"],
          metrics: {
            approvals: 2,
          },
        },
      }),
    ).sort();

    expect(paths).toEqual([
      "data.labels",
      "data.metrics.approvals",
      "data.title",
      "prNumber",
    ]);
  });

  test("getVisiblePrNumbersFromSectionsHost returns only rows from expanded sections", () => {
    const helpers = createPrExportHelpers({ getPerPrUserStateFromPayload });
    const sectionsHost = makeNode({ className: "host" });

    const openSection = makeNode({ className: "pr-group-section", open: true });
    const openCell = makeNode({ className: "pr-number-cell" });
    openCell.setAttribute("data-pr-number", "101");
    openSection.appendChild(openCell);

    const closedSection = makeNode({ className: "pr-group-section", open: false });
    const closedCell = makeNode({ className: "pr-number-cell" });
    closedCell.setAttribute("data-pr-number", "202");
    closedSection.appendChild(closedCell);

    sectionsHost.appendChild(openSection);
    sectionsHost.appendChild(closedSection);

    expect(helpers.getVisiblePrNumbersFromSectionsHost(sectionsHost)).toEqual([
      "101",
    ]);
  });

  test("buildExportPayload applies selected data/user-state field paths per visible PR", () => {
    const helpers = createPrExportHelpers({ getPerPrUserStateFromPayload });
    const payload = {
      lastRun: {
        repo: "owner/repo",
        updatedAt: "2026-06-08T09:00:00Z",
      },
      byPrNumber: {
        "101": {
          prNumber: "101",
          repo: "owner/repo",
          section: "open",
          updatedAt: "2026-06-08T09:00:00Z",
          notes: {
            otherNotes: "follow up",
          },
          data: {
            number: "101",
            title: "Open row",
            status: "CHANGED",
          },
        },
      },
      ackByRepo: {
        "owner/repo": {
          "101": "2026-06-08T08:58:00Z",
        },
      },
    };

    const exported = helpers.buildExportPayload({
      payload,
      visiblePrNumbers: ["101"],
      selectedDataPaths: ["prNumber", "data.title"],
      selectedUserStatePaths: ["notesByPrNumber.otherNotes", "ackByRepo"],
    });

    expect(exported.prCount).toBe(1);
    expect(exported.selectedFields.data).toEqual(["data.title", "prNumber"]);
    expect(exported.selectedFields.userState).toEqual([
      "ackByRepo",
      "notesByPrNumber.otherNotes",
    ]);
    expect(exported.prs[0]).toEqual({
      prNumber: "101",
      repo: "owner/repo",
      data: {
        prNumber: "101",
        data: {
          title: "Open row",
        },
      },
      userState: {
        ackByRepo: "2026-06-08T08:58:00Z",
        notesByPrNumber: {
          otherNotes: "follow up",
        },
      },
    });
  });
});
