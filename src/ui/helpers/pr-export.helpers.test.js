const { createPrExportHelpers, getPrKeysInOpenSections } = require("./pr-export.helpers.ts");

const getPerPrUserStateFromPayload = (payload, entry, prNumber, repo) => ({
  notesByPrNumber: entry?.notes || null,
  ackByRepo: payload?.ackByRepo?.[repo]?.[prNumber] || null,
  reverifyByRepo: payload?.reverifyByRepo?.[repo]?.[prNumber] || null,
  inReviewByRepo: payload?.inReviewByRepo?.[repo]?.[prNumber] || null,
});

describe("pr export helpers", () => {
  test("buildExportPayload exports the visible rows by key, not another repo's PR with the same number", () => {
    const helpers = createPrExportHelpers({ getPerPrUserStateFromPayload });
    const exported = helpers.buildExportPayload({
      payload: {
        byPrNumber: {
          "acme/api#12": { repo: "acme/api", prNumber: "12", data: { title: "API" } },
          "acme/web#12": { repo: "acme/web", prNumber: "12", data: { title: "Web" } },
          "acme/api#13": { repo: "acme/api", prNumber: "13", data: { title: "Not visible" } },
        },
      },
      visiblePrKeys: ["acme/api#12"],
      selectedDataPaths: ["data.title"],
    });
    expect(exported.prs.map((item) => [item.repo, item.prNumber, item.data.data.title])).toEqual([
      ["acme/api", "12", "API"],
    ]);
  });

  test("getFieldCatalog tracks nested object fields and treats arrays as leaf fields", () => {
    const helpers = createPrExportHelpers({ getPerPrUserStateFromPayload });
    const payload = {
      byPrNumber: {
        "123": {
          prNumber: "123",
          data: {
            title: "Feature",
            labels: ["bug"],
            metrics: {
              approvals: 2,
            },
          },
        },
      },
    };

    const catalog = helpers.getFieldCatalog(payload);

    expect(catalog.dataPaths).toEqual([
      "data.labels",
      "data.metrics.approvals",
      "data.title",
      "prNumber",
    ]);
  });

  test("getPrKeysInOpenSections returns only rows from expanded sections", () => {
    expect(
      getPrKeysInOpenSections([
        { open: true, prKeys: ["owner/repo#101"] },
        { open: false, prKeys: ["owner/repo#202"] },
      ]),
    ).toEqual(["owner/repo#101"]);
  });

  test("getPrKeysInOpenSections keeps display order and lists a PR shown in two open sections once", () => {
    expect(
      getPrKeysInOpenSections([
        { open: true, prKeys: ["owner/repo#7", "owner/repo#3"] },
        { open: true, prKeys: ["owner/repo#3", "other/repo#3", ""] },
      ]),
    ).toEqual(["owner/repo#7", "owner/repo#3", "other/repo#3"]);
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
      visiblePrKeys: ["owner/repo#101"],
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
