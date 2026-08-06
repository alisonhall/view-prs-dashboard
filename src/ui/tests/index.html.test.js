/** @jest-environment jsdom */

const fs = require("fs");
const path = require("path");
const { screen, waitFor } = require("@testing-library/dom");
const userEvent = require("@testing-library/user-event").default;
const { createMultiPrPayload } = require("../test-fixtures/pr-data.fixtures.js");

const htmlPath = path.join(__dirname, "..", "index.html");
const indexHtml = fs.readFileSync(htmlPath, "utf8");
const cssPath = path.join(__dirname, "..", "index.css");
const indexCss = fs.readFileSync(cssPath, "utf8");

const extractBodyHtml = (fullHtml) => {
  const bodyMatch = String(fullHtml || "").match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return bodyMatch && bodyMatch[1] ? bodyMatch[1] : "";
};

const createOkJsonResponse = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

let latestDataPayload = { ok: true, byPrNumber: {}, lastRun: null };
let actionLogEntries = [];
let actorNameCacheEntries = {};
let actorLoginAliasEntries = {};
let fetchMock;

const createFetchMock = ({
  userDefaultsOverrides = {},
  backfillStatusResponse = null,
  authorCommentsGetHandler = null,
} = {}) =>
  jest.fn(async (url, init = {}) => {
    const normalizedUrl = String(url || "");
    const method = String(init?.method || "GET").toUpperCase();

    if (normalizedUrl === "/view-prs/user-defaults" && method === "GET") {
      return createOkJsonResponse({ ok: true, overrides: userDefaultsOverrides });
    }

    if (normalizedUrl === "/view-prs/user-defaults" && method === "PUT") {
      return createOkJsonResponse({ ok: true });
    }

    if (normalizedUrl === "/view-prs/backfill" && method === "GET") {
      if (backfillStatusResponse) {
        return createOkJsonResponse(backfillStatusResponse);
      }
      return createOkJsonResponse({
        ok: true,
        running: false,
        summary: "Backfill status: not running",
        output: "Backfill status: not running",
      });
    }

    if (normalizedUrl === "/view-prs/backfill/start" && method === "POST") {
      return createOkJsonResponse({
        ok: true,
        running: true,
        summary: "Started background backfill (PID: 321).",
        output: "Started background backfill (PID: 321).",
      });
    }

    if (normalizedUrl === "/view-prs/backfill/stop" && method === "POST") {
      return createOkJsonResponse({
        ok: true,
        running: false,
        summary: "Stopped background backfill (PID: 321).",
        output: "Stopped background backfill (PID: 321).",
      });
    }

    if (normalizedUrl.startsWith("/view-prs/backfill/log") && method === "GET") {
      return createOkJsonResponse({
        ok: true,
        summary: "Showing 2 log line(s)",
        tail: "line-1\nline-2",
      });
    }

    if (normalizedUrl === "/view-prs/action-log" && method === "GET") {
      return createOkJsonResponse({ ok: true, entries: actionLogEntries });
    }

    if (normalizedUrl === "/view-prs/actor-name-cache" && method === "GET") {
      return createOkJsonResponse({
        ok: true,
        entries: actorNameCacheEntries,
        count: Object.keys(actorNameCacheEntries).length,
      });
    }

    if (normalizedUrl === "/view-prs/actor-name-cache" && method === "PUT") {
      actorNameCacheEntries = JSON.parse(String(init?.body || "{}"));
      return createOkJsonResponse({
        ok: true,
        entries: actorNameCacheEntries,
        count: Object.keys(actorNameCacheEntries).length,
      });
    }

    if (normalizedUrl === "/view-prs/actor-login-aliases" && method === "GET") {
      return createOkJsonResponse({
        ok: true,
        entries: actorLoginAliasEntries,
        count: Object.keys(actorLoginAliasEntries).length,
      });
    }

    if (normalizedUrl === "/view-prs/actor-login-aliases" && method === "PUT") {
      actorLoginAliasEntries = JSON.parse(String(init?.body || "{}"));
      return createOkJsonResponse({
        ok: true,
        entries: actorLoginAliasEntries,
        count: Object.keys(actorLoginAliasEntries).length,
      });
    }

    if (normalizedUrl === "/view-prs/ack" && method === "POST") {
      return createOkJsonResponse({ ok: true, prData: latestDataPayload });
    }

    if (normalizedUrl === "/view-prs/data" && method === "GET") {
      return createOkJsonResponse(latestDataPayload);
    }

    if (
      normalizedUrl.startsWith("/view-prs/author-comments?") &&
      method === "GET"
    ) {
      if (typeof authorCommentsGetHandler === "function") {
        return authorCommentsGetHandler(normalizedUrl, init);
      }
      return createOkJsonResponse({ ok: true, comments: [] });
    }

    if (normalizedUrl.startsWith("/view-prs/diff?") && method === "GET") {
      return createOkJsonResponse({
        ok: true,
        source: "cache",
        stale: false,
        warning: "",
        commitFingerprint: "abc123",
        fetchedAt: "2026-06-16T10:00:00Z",
        filePath: "data/pr-diffs/owner__repo__pr-101.json",
        diffText: "diff --git a/file.js b/file.js\n+console.log('hello');",
      });
    }

    if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
      return {
        ok: false,
        status: 404,
        json: async () => ({ ok: false }),
      };
    }

    return createOkJsonResponse({ ok: true });
  });

const initTestPage = ({
  dataPayload,
  actionEntries,
  actorNameEntries,
  actorLoginAliasEntries: aliasEntries,
  userDefaultsOverrides,
  backfillStatusResponse,
  authorCommentsGetHandler,
} = {}) => {
  jest.resetModules();
  latestDataPayload = dataPayload || { ok: true, byPrNumber: {}, lastRun: null };
  actionLogEntries = Array.isArray(actionEntries) ? actionEntries : [];
  actorNameCacheEntries = actorNameEntries && typeof actorNameEntries === "object"
    ? actorNameEntries
    : {};
  actorLoginAliasEntries = aliasEntries && typeof aliasEntries === "object"
    ? aliasEntries
    : {};
  document.body.innerHTML = extractBodyHtml(indexHtml);

  fetchMock = createFetchMock({
    userDefaultsOverrides,
    backfillStatusResponse,
    authorCommentsGetHandler,
  });
  global.fetch = fetchMock;
  window.fetch = global.fetch;
  window.marked = {
    parse: (markdownText) => `<p>${String(markdownText || "")}</p>`,
  };

  require("../index.page.js");
};

// Helper functions for multi-select checkbox lists (label, exclude-label, author, assigned, approver filters)
const getMultiSelectList = (listId) => document.getElementById(listId);

const getSelectedMultiSelectValues = (listId) => {
  const list = getMultiSelectList(listId);
  if (!list) return [];
  const checkboxes = Array.from(list.querySelectorAll("input[type='checkbox']:checked"));
  return checkboxes.map((cb) => cb.value);
};

const isMultiSelectEmpty = (listId) => {
  const list = getMultiSelectList(listId);
  return !list || list.classList.contains("empty");
};

const clickMultiSelectCheckbox = async (listId, value, user) => {
  const list = getMultiSelectList(listId);
  if (!list) throw new Error(`Multi-select list not found: ${listId}`);
  const checkbox = list.querySelector(`input[type="checkbox"][value="${value}"]`);
  if (!checkbox) throw new Error(`Checkbox not found for value: ${value} in list: ${listId}`);
  await user.click(checkbox);
};

describe("index page rendering with Testing Library", () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView; polyfill to prevent unhandled exceptions
    // in page code that calls it as a UX enhancement (no-op is correct in tests)
    if (typeof window.HTMLElement.prototype.scrollIntoView !== "function") {
      window.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });

  beforeEach(() => {
    initTestPage();
  });

  test("shows key management and data tabs from static HTML", () => {
    expect(screen.getByRole("heading", { name: "View PR Updates" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Activity" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Run & Filter" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "PR data" })).toBeInTheDocument();
  });

  test("blocked auto-update indicator is hidden by default and exposes apply action", () => {
    const indicator = document.getElementById("auto-render-blocked-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute("hidden");
    expect(document.getElementById("auto-render-blocked-pr-links")).toBeInTheDocument();
    expect(document.getElementById("auto-render-blocked-apply-btn")).toBeInTheDocument();
  });

  test("switches the active data tab when a user clicks Review statistics", async () => {
    const user = userEvent.setup();
    const reviewStatsTab = screen.getByRole("tab", { name: "Review statistics" });
    const prDataTab = screen.getByRole("tab", { name: "PR data" });

    await user.click(reviewStatsTab);

    expect(reviewStatsTab).toHaveAttribute("aria-selected", "true");
    expect(prDataTab).toHaveAttribute("aria-selected", "false");
    expect(document.getElementById("tab-panel-review-stats").hidden).toBe(false);
    expect(document.getElementById("tab-panel-pr-data").hidden).toBe(true);
  });

  test("author insights View in table switches to PR data tab and expands the insights row", async () => {
    // Using new fixture API - reduced from ~40 lines to ~15 lines
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 42,
            overrides: {
              data: {
                title: "View Table Nav",
                titleDisplay: "View Table Nav [CHK:PASS][MRG:YES]",
                author: "Alison Hall",
                authorLogin: "ahall236_uhg",
                url: "https://example.com/42",
              },
            },
          },
        ],
      }),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("#42")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Review statistics" }));
    expect(document.getElementById("tab-panel-review-stats").hidden).toBe(false);

    await waitFor(() => {
      expect(document.querySelectorAll(".author-insights-table-link").length).toBeGreaterThan(0);
    });

    await user.click(document.querySelector(".author-insights-table-link"));

    expect(document.getElementById("tab-panel-pr-data").hidden).toBe(false);
    expect(document.getElementById("tab-panel-review-stats").hidden).toBe(true);

    await waitFor(() => {
      const prLink = Array.from(document.querySelectorAll("a.pr-link")).find(
        (a) => a.textContent.trim() === "#42",
      );
      expect(prLink).toBeTruthy();
      const insightsRow = prLink.closest("tr")?.nextElementSibling;
      expect(insightsRow?.hidden).toBe(false);
    });

    const toggleButton = document.querySelector(".row-insights-toggle");
    expect(toggleButton?.textContent).toBe("Hide insights");
  });

  test("open row controls and insights render expected details", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 11,
            overrides: {
              notes: {
                comments: [
                  {
                    id: "c1",
                    author: "reviewer1",
                    tone: "Positive",
                    note: "Looks good overall",
                  },
                ],
                otherNotes: "Follow up on rollout",
              },
              data: {
                title: "Open row controls parity",
                titleDisplay: "Open row controls parity [CHK:PASS][MRG:YES]",
                author: "Alison Hall",
                authorLogin: "ahall236_uhg",
                url: "https://example.com/11",
                labels: ["bug"],
                openConversationCount: "1",
                viewedFilesCount: "3",
                changedFilesCount: "5",
                viewedFilesSummary: "3/5 viewed",
                reviewThreads: [
                  {
                    id: "thread-open-1",
                    isResolved: false,
                    resolvedByLogin: "",
                    participants: ["reviewer1", "ahall236_uhg"],
                    comments: [
                      {
                        id: "thread-open-comment-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: "Please add one more test case",
                        state: "PENDING",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          ahall236_uhg: "Alison Hall",
          reviewer1: "Reviewer One",
        },
      }),
    });
    const user = userEvent.setup();

    const prLink = await screen.findByText("#11");
    const row = prLink.closest("tr");
    expect(row).toBeTruthy();

    expect(row?.querySelector("input[type='checkbox']")).toBeTruthy();
    expect(screen.getByLabelText("In Review for PR #11")).toBeInTheDocument();
    expect(screen.getByLabelText("Flagged for PR #11")).toBeInTheDocument();
    expect(row?.querySelector(".row-action-btn.update")).toBeTruthy();
    expect(row?.querySelector(".row-action-btn.ack")).toBeTruthy();
    expect(row?.querySelector(".row-action-btn.clear")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "View PR JSON details for #11" }),
    ).toBeInTheDocument();

    const insightsToggle = row?.querySelector(".row-insights-toggle");
    expect(insightsToggle?.textContent).toBe("More insights");
    expect(String(row?.querySelector(".row-pending-comments-chip")?.textContent || "")).toBe(
      "Pending comments: 1",
    );

    const insightsRow = row?.nextElementSibling;
    expect(insightsRow?.hidden).toBe(true);
    await user.click(insightsToggle);
    expect(insightsRow?.hidden).toBe(false);
    expect(insightsToggle?.textContent).toBe("Hide insights");
    expect(insightsRow?.querySelector(".insights-row-cell")?.getAttribute("colspan")).toBe(
      "11",
    );

    const insightsContent = insightsRow?.querySelector(".row-insights-content");
    expect(insightsContent).toBeTruthy();
    expect(indexCss).toMatch(/\.row-insights-content\s*\{[^}]*max-height:\s*80vh;[^}]*overflow-y:\s*auto;/s);
    expect(insightsContent?.querySelector(".pr-notes-section")).toBeTruthy();
  });

  test("given review comment markdown with github user attachments when insights render then blocked image tags are replaced with unavailable placeholders", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 12,
            overrides: {
              data: {
                title: "Attachment markdown rendering",
                titleDisplay: "Attachment markdown rendering [CHK:PASS][MRG:YES]",
                author: "Alison Hall",
                authorLogin: "ahall236_uhg",
                url: "https://example.com/12",
                openConversationCount: "1",
                viewedFilesCount: "0",
                changedFilesCount: "1",
                viewedFilesSummary: "0/1 viewed",
                reviewThreads: [
                  {
                    id: "thread-attachments-1",
                    isResolved: false,
                    resolvedByLogin: "",
                    participants: ["reviewer1", "ahall236_uhg"],
                    comments: [
                      {
                        id: "thread-attachments-comment-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: '<img alt="image" src="https://github.com/user-attachments/assets/6505dfd5-67b9-43b3-8411-92e5e051bfee" />',
                        state: "PENDING",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          ahall236_uhg: "Alison Hall",
          reviewer1: "Reviewer One",
        },
      }),
    });
    const user = userEvent.setup();

    const prLink = await screen.findByText("#12");
    const row = prLink.closest("tr");
    expect(row).toBeTruthy();

    const insightsToggle = row?.querySelector(".row-insights-toggle");
    expect(insightsToggle).toBeTruthy();
    await user.click(insightsToggle);

    const insightsRow = row?.nextElementSibling;
    expect(insightsRow?.hidden).toBe(false);

    const insightsContent = insightsRow?.querySelector(".row-insights-content");
    const placeholder = insightsContent?.querySelector(".md-image-expired");
    expect(placeholder).toBeTruthy();
    expect(String(placeholder?.textContent || "")).toContain("image unavailable");

    const retainedAttachmentImage = insightsContent?.querySelector(
      'img[src*="github.com/user-attachments"]',
    );
    expect(retainedAttachmentImage).toBeNull();
  });

  test("given additions and deletions are available, when More insights is expanded, then Lines changed renders GitHub-style totals", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 13,
            overrides: {
              data: {
                title: "Lines changed insight",
                titleDisplay: "Lines changed insight [CHK:PASS][MRG:YES]",
                author: "Alison Hall",
                authorLogin: "ahall236_uhg",
                url: "https://example.com/13",
                openConversationCount: "0",
                viewedFilesCount: "1",
                changedFilesCount: "4",
                additions: "37",
                deletions: "12",
                viewedFilesSummary: "1/4 viewed",
              },
            },
          },
        ],
      }),
    });
    const user = userEvent.setup();

    const prLink = await screen.findByText("#13");
    const row = prLink.closest("tr");
    expect(row).toBeTruthy();

    const insightsToggle = row?.querySelector(".row-insights-toggle");
    expect(insightsToggle).toBeTruthy();
    await user.click(insightsToggle);

    const insightsContent = row?.nextElementSibling?.querySelector(".row-insights-content");
    expect(insightsContent).toBeTruthy();
    const insightsText = String(insightsContent?.textContent || "");
    expect(insightsText).toContain("Lines changed");
    expect(insightsText).toContain(
      "4 files changed, +37 additions, -12 deletions (49 lines changed)",
    );
    expect(
      insightsContent?.querySelector(".insight-line-changes-files")?.textContent,
    ).toBe("4 files changed");
    expect(
      insightsContent?.querySelector(".insight-line-changes-additions")?.textContent,
    ).toBe("+37 additions");
    expect(
      insightsContent?.querySelector(".insight-line-changes-deletions")?.textContent,
    ).toBe("-12 deletions");
    expect(
      insightsContent?.querySelector(".insight-line-changes-total")?.textContent,
    ).toBe("49 lines changed");
  });

  test("given open and merged rows when rendering PR cells then relative last-checked indicators use each row's updated timestamp", async () => {
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-06-16T10:30:00Z").getTime());

    try {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 11,
              overrides: {
                data: {
                  title: "Open PR",
                  titleDisplay: "Open PR [CHK:PASS][MRG:YES]",
                  author: "Author One",
                  authorLogin: "author-one",
                  url: "https://example.com/11",
                  updatedAt: "2026-06-16T10:10:00Z",
                },
                updatedAt: "2026-06-16T10:10:00Z",
              },
            },
            {
              scenario: "merged",
              prNumber: 99,
              overrides: {
                data: {
                  title: "Merged PR",
                  titleDisplay: "Merged PR [CHK:PASS][MRG:YES]",
                  author: "Author Two",
                  authorLogin: "author-two",
                  url: "https://example.com/99",
                  mergedAt: "2026-06-16T10:00:00Z",
                  updatedAt: "2026-06-16T10:00:00Z",
                },
                updatedAt: "2026-06-16T10:20:00Z",
              },
            },
          ],
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:10:00Z" },
        }),
      });

      await waitFor(() => {
        expect(screen.getByText("#11")).toBeInTheDocument();
      });

      const openRow = screen.getByText("#11").closest("tr");
      const mergedRow = screen.getByText("#99").closest("tr");
      const openIndicator = openRow?.querySelector(
        ".status-cell .pr-last-checked-indicator",
      );
      const mergedIndicator = mergedRow?.querySelector(
        ".status-cell .pr-last-checked-indicator",
      );

      expect(openIndicator).toBeTruthy();
      expect(mergedIndicator).toBeTruthy();
      expect(String(openIndicator?.textContent || "")).toBe("↻ 20m ago");
      expect(String(mergedIndicator?.textContent || "")).toBe("↻ 10m ago");
      expect(String(openIndicator?.className || "")).toContain(
        "pr-last-checked-indicator-stale",
      );
      expect(String(mergedIndicator?.className || "")).not.toContain(
        "pr-last-checked-indicator-stale",
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

  test("given an open PR row, when rendering PR and status cells, then progress stays in the PR cell and relative last-checked text appears in the status cell", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 12,
            overrides: {
              data: {
                title: "Progress placement",
                titleDisplay: "Progress placement [CHK:PASS]",
                author: "Author One",
                authorLogin: "author-one",
                url: "https://example.com/12",
                updatedAt: "2026-06-16T10:10:00Z",
              },
              updatedAt: "2026-06-16T10:10:00Z",
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:30:00Z" },
      }),
    });

    await waitFor(() => {
      expect(screen.getByText("#12")).toBeInTheDocument();
    });

    const prCellContent = document.querySelector(
      '.pr-number-cell[data-pr-number="12"] .pr-number-cell-content',
    );
    expect(prCellContent).toBeTruthy();

    const firstChild = prCellContent?.children?.[0];
    const secondChild = prCellContent?.children?.[1];
    const thirdChild = prCellContent?.children?.[2];

    expect(String(firstChild?.className || "")).toContain("pr-number-cell-top");
    expect(String(secondChild?.className || "")).toContain("pr-number-cell-progress");
    expect(thirdChild).toBeUndefined();

    expect(firstChild?.querySelector(".pr-link")).toBeTruthy();
    expect(firstChild?.querySelector(".pr-progress-indicator")).toBeNull();
    expect(secondChild?.querySelector(".pr-progress-indicator")).toBeTruthy();
    const statusLastChecked = document.querySelector(
      '.status-cell .pr-last-checked-indicator',
    );
    expect(statusLastChecked).toBeTruthy();
  });

  test("given author thread-resolution policy modes, when PR author resolves a review thread, then warning behavior follows the selected rule", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 77,
            overrides: {
              data: {
                title: "Review conversation policy",
                titleDisplay: "Review conversation policy [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                url: "https://example.com/77",
                updatedAt: "2026-03-10T12:00:00Z",
                reviewThreads: [
                  {
                    id: "thread-author-resolved",
                    isResolved: true,
                    resolvedByLogin: "pr-author",
                    participants: ["reviewer1", "pr-author"],
                    comments: [
                      {
                        id: "author-resolved-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: "Please rename this helper.",
                      },
                      {
                        id: "author-resolved-2",
                        authorLogin: "pr-author",
                        authorName: "PR Author",
                        createdAt: "2026-03-10T11:15:00Z",
                        body: "Updated helper name.",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          "pr-author": "PR Author",
          reviewer1: "Reviewer One",
          reviewer2: "Reviewer Two",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    const user = userEvent.setup();

    const openReviewSection = async () => {
      const row = (await screen.findByText("#77")).closest("tr");
      const toggle = row?.querySelector(".row-insights-toggle");
      if (toggle && toggle.getAttribute("aria-expanded") !== "true") {
        await user.click(toggle);
      }
      const insightsRow = row?.nextElementSibling;
      const insightsContent = insightsRow?.querySelector(".row-insights-content");
      return Array.from(
        insightsContent?.querySelectorAll("details.insight-section") || [],
      ).find((node) => {
        const summary = node.querySelector("summary");
        return String(summary?.textContent || "").startsWith("Review conversations");
      });
    };

    const expectWarningState = async (expectedWarning) => {
      const reviewSection = await openReviewSection();
      const summaryText = String(
        reviewSection?.querySelector("summary")?.textContent || "",
      );
      if (expectedWarning) {
        expect(summaryText).toContain(
          "Warning: 1 thread incorrectly resolved by PR author",
        );
        expect(String(reviewSection?.className || "")).toContain(
          "insight-section-warning",
        );
      } else {
        expect(summaryText).toBe("Review conversations (1/1)");
        expect(String(reviewSection?.className || "")).not.toContain(
          "insight-section-warning",
        );
      }
    };

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await waitFor(() => {
      expect(screen.getByText("#77")).toBeInTheDocument();
    });

    await expectWarningState(false);

    const modeField = document.getElementById(
      "attention-author-thread-resolution-mode",
    );

    await user.selectOptions(modeField, "allow-only");
    await waitFor(() => {
      expect(
        getSelectedMultiSelectValues("attention-author-thread-resolution-allow-list"),
      ).toEqual([]);
    });
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-allow-list",
      "reviewer2",
      user,
    );
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await expectWarningState(true);

    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-allow-list",
      "reviewer2",
      user,
    );
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-allow-list",
      "reviewer1",
      user,
    );
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await expectWarningState(false);

    await user.selectOptions(modeField, "deny-only");
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-deny-list",
      "reviewer1",
      user,
    );
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await expectWarningState(true);
  });

  test("given both allow and deny starter lists include the same actor, when policy mode switches, then only the active mode list is enforced", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 177,
            overrides: {
              data: {
                title: "Thread policy mode precedence",
                titleDisplay: "Thread policy mode precedence [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                url: "https://example.com/177",
                updatedAt: "2026-03-10T12:00:00Z",
                reviewThreads: [
                  {
                    id: "thread-mode-precedence",
                    isResolved: true,
                    resolvedByLogin: "pr-author",
                    participants: ["reviewer1", "pr-author"],
                    comments: [
                      {
                        id: "mode-precedence-comment-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: "Please adjust this logic.",
                      },
                      {
                        id: "mode-precedence-comment-2",
                        authorLogin: "pr-author",
                        authorName: "PR Author",
                        createdAt: "2026-03-10T11:15:00Z",
                        body: "Applied the update.",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          "pr-author": "PR Author",
          reviewer1: "Reviewer One",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    const user = userEvent.setup();

    const openReviewSection = async () => {
      const row = (await screen.findByText("#177")).closest("tr");
      const toggle = row?.querySelector(".row-insights-toggle");
      if (toggle && toggle.getAttribute("aria-expanded") !== "true") {
        await user.click(toggle);
      }
      const insightsRow = row?.nextElementSibling;
      const insightsContent = insightsRow?.querySelector(".row-insights-content");
      return Array.from(
        insightsContent?.querySelectorAll("details.insight-section") || [],
      ).find((node) => {
        const summary = node.querySelector("summary");
        return String(summary?.textContent || "").startsWith("Review conversations");
      });
    };

    const expectWarningState = async (expectedWarning) => {
      const reviewSection = await openReviewSection();
      const summaryText = String(
        reviewSection?.querySelector("summary")?.textContent || "",
      );
      if (expectedWarning) {
        expect(summaryText).toContain(
          "Warning: 1 thread incorrectly resolved by PR author",
        );
      } else {
        expect(summaryText).toBe("Review conversations (1/1)");
      }
    };

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await waitFor(() => {
      expect(screen.getByText("#177")).toBeInTheDocument();
    });

    const modeField = document.getElementById(
      "attention-author-thread-resolution-mode",
    );

    await user.selectOptions(modeField, "allow-only");
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-allow-list",
      "reviewer1",
      user,
    );

    await user.selectOptions(modeField, "deny-only");
    await clickMultiSelectCheckbox(
      "attention-author-thread-resolution-deny-list",
      "reviewer1",
      user,
    );

    await user.selectOptions(modeField, "allow-only");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await expectWarningState(false);

    await user.selectOptions(modeField, "deny-only");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await expectWarningState(true);
  });

  test("given mixed resolved and unresolved conversations, when opening Review conversations, then the heading shows resolved over total counts", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 79,
            overrides: {
              data: {
                title: "Review conversation mixed counts",
                titleDisplay: "Review conversation mixed counts [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                url: "https://example.com/79",
                updatedAt: "2026-03-10T12:00:00Z",
                reviewThreads: [
                  {
                    id: "thread-resolved",
                    isResolved: true,
                    resolvedByLogin: "reviewer1",
                    participants: ["reviewer1", "pr-author"],
                    comments: [
                      {
                        id: "resolved-comment-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: "Looks good.",
                      },
                    ],
                  },
                  {
                    id: "thread-unresolved",
                    isResolved: false,
                    participants: ["reviewer1", "pr-author"],
                    comments: [
                      {
                        id: "unresolved-comment-1",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T11:15:00Z",
                        body: "Please address this.",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          "pr-author": "PR Author",
          reviewer1: "Reviewer One",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    const row = (await screen.findByText("#79")).closest("tr");
    await user.click(row?.querySelector(".row-insights-toggle"));

    const reviewSection = row?.nextElementSibling?.querySelector(
      'details.insight-section[data-insight-key="review-conversations"]',
    );
    expect(reviewSection).toBeTruthy();
    expect(String(reviewSection?.querySelector("summary")?.textContent || "")).toBe(
      "Review conversations (1/2)",
    );
  });

  test("given the current user and PR author appear in PR details, when insights render, then each actor gets its matching identity styling", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 80,
            overrides: {
              data: {
                url: "https://example.com/80",
                title: "Identity styling coverage",
                titleDisplay: "Identity styling coverage [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                updatedAt: "2026-03-10T12:00:00Z",
                baseline: "2026-03-01T10:00:00Z",
              activityTimeline: [
                {
                  date: "2026-03-10",
                  actor: "pr-author",
                  type: "comment",
                  count: 1,
                  latestAt: "2026-03-10T11:15:00Z",
                },
                {
                  date: "2026-03-10",
                  actor: "ahall236_uhg",
                  type: "review",
                  count: 1,
                  latestAt: "2026-03-10T11:30:00Z",
                },
              ],
              activityEvents: [
                {
                  occurredAt: "2026-03-10T11:30:00Z",
                  actor: "ahall236_uhg",
                  type: "review",
                  channel: "review",
                  state: "COMMENTED",
                  body: "Looks good after the latest update.",
                  url: "https://example.com/80#review-1",
                },
                {
                  occurredAt: "2026-03-10T11:15:00Z",
                  actor: "pr-author",
                  type: "comment",
                  channel: "thread",
                  body: "I addressed the feedback.",
                  url: "https://example.com/80#thread-1",
                },
              ],
              reviewThreads: [
                {
                  id: "thread-identity-1",
                  isResolved: false,
                  resolvedByLogin: "",
                  participants: ["ahall236_uhg", "pr-author"],
                  comments: [
                    {
                      id: "thread-identity-comment-1",
                      authorLogin: "ahall236_uhg",
                      authorName: "Alison Hall",
                      createdAt: "2026-03-10T10:45:00Z",
                      body: "Please rename this helper.",
                    },
                    {
                      id: "thread-identity-comment-2",
                      authorLogin: "pr-author",
                      authorName: "PR Author",
                      createdAt: "2026-03-10T11:15:00Z",
                      body: "Updated helper name.",
                    },
                  ],
                },
              ],
            },
          },
        },
        ],
        actorsMap: {
          ahall236_uhg: "Alison Hall",
          "pr-author": "PR Author",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    document.getElementById("status").textContent = "Viewer : ahall236_uhg";

    const user = userEvent.setup();
    const row = (await screen.findByText("#80")).closest("tr");
    expect(row).toBeTruthy();

    const authorCellIdentity = row?.querySelector(".author-cell-name.actor-identity-pr-author");
    expect(authorCellIdentity).toBeTruthy();
    expect(authorCellIdentity?.className).not.toContain("actor-identity-viewer");

    await user.click(row?.querySelector(".row-insights-toggle"));

    const insightsContent = row?.nextElementSibling?.querySelector(".row-insights-content");
    expect(insightsContent).toBeTruthy();

    const reviewSection = insightsContent?.querySelector(
      'details.insight-section[data-insight-key="review-conversations"]',
    );
    expect(reviewSection?.querySelector(".actor-identity-pr-author")?.textContent).toContain(
      "PR Author",
    );
    expect(reviewSection?.querySelector(".actor-identity-viewer")?.textContent).toContain(
      "Alison Hall",
    );

    const activitySequenceSection = Array.from(
      insightsContent?.querySelectorAll('details.insight-section[data-insight-key="activity sequence"] .actor-identity') || [],
    );
    expect(
      activitySequenceSection.some(
        (node) =>
          String(node.textContent || "") === "Alison Hall" &&
          node.classList.contains("actor-identity-viewer"),
      ),
    ).toBe(true);
    expect(
      activitySequenceSection.some(
        (node) =>
          String(node.textContent || "") === "PR Author" &&
          node.classList.contains("actor-identity-pr-author"),
      ),
    ).toBe(true);

    const activityTimelineActors = Array.from(
      insightsContent?.querySelectorAll("table .actor-identity") || [],
    );
    expect(
      activityTimelineActors.some(
        (node) =>
          String(node.textContent || "") === "Alison Hall" &&
          node.classList.contains("actor-identity-viewer"),
      ),
    ).toBe(true);
    expect(
      activityTimelineActors.some(
        (node) =>
          String(node.textContent || "") === "PR Author" &&
          node.classList.contains("actor-identity-pr-author"),
      ),
    ).toBe(true);

    expect(indexCss).toMatch(/\.actor-identity-viewer\s*\{/);
    expect(indexCss).toMatch(/\.actor-identity-pr-author\s*\{/);
  });

  test("given a review thread with multiple comments, when opening Review conversations, then the View link targets the full thread starter URL", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 78,
            overrides: {
              data: {
                title: "Review thread link target",
                titleDisplay: "Review thread link target [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                url: "https://example.com/78",
                updatedAt: "2026-03-10T12:00:00Z",
                reviewThreads: [
                  {
                    id: "thread-link-target",
                    isResolved: false,
                    participants: ["reviewer1", "pr-author"],
                    comments: [
                      {
                        id: "thread-root-comment",
                        authorLogin: "reviewer1",
                        authorName: "Reviewer One",
                        createdAt: "2026-03-10T10:45:00Z",
                        body: "Please update this line.",
                        url: "https://github.com/owner/repo/pull/78#discussion_r_root",
                      },
                      {
                        id: "thread-latest-comment",
                        authorLogin: "pr-author",
                        authorName: "PR Author",
                        createdAt: "2026-03-10T11:15:00Z",
                        body: "Applied the requested update.",
                        url: "https://github.com/owner/repo/pull/78#discussion_r_latest",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        actorsMap: {
          "pr-author": "PR Author",
          reviewer1: "Reviewer One",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    const row = (await screen.findByText("#78")).closest("tr");
    await user.click(row?.querySelector(".row-insights-toggle"));

    const reviewSection = row?.nextElementSibling?.querySelector(
      'details.insight-section[data-insight-key="review-conversations"]',
    );
    expect(reviewSection).toBeTruthy();

    const viewLink = reviewSection?.querySelector(
      ".insight-thread .insight-thread-title .insight-event-link",
    );
    expect(viewLink).toBeTruthy();
    expect(viewLink?.getAttribute("href")).toBe(
      "https://github.com/owner/repo/pull/78#discussion_r_root",
    );
  });

  test("given requested reviewers are absent but review actors exist, when insights render, then the Reviewers field falls back to review actors", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 801,
            overrides: {
              data: {
                title: "Requested reviewers fallback",
                titleDisplay: "Requested reviewers fallback [CHK:PASS]",
                author: "PR Author",
                authorLogin: "pr-author",
                url: "https://example.com/801",
                updatedAt: "2026-03-10T12:00:00Z",
                requestedReviewers: [],
                reviewRequests: [],
                reviewers: [],
                reviews: [
                  {
                    authorLogin: "reviewer1",
                    authorName: "Reviewer One",
                  },
                ],
                metrics: {
                  reviewsByActor: [
                    {
                      login: "reviewer2",
                      name: "Reviewer Two",
                    },
                  ],
                },
              },
            },
          },
        ],
        actorsMap: {
          reviewer1: "Reviewer One",
          reviewer2: "Reviewer Two",
          "pr-author": "PR Author",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T12:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    const row = (await screen.findByText("#801")).closest("tr");
    await user.click(row?.querySelector(".row-insights-toggle"));

    const insightsContent = row?.nextElementSibling?.querySelector(".row-insights-content");
    const reviewersKey = Array.from(
      insightsContent?.querySelectorAll(".insight-key") || [],
    ).find((node) => String(node.textContent || "").trim() === "Reviewers");

    expect(reviewersKey).toBeTruthy();
    const reviewersValue = reviewersKey?.nextElementSibling;
    expect(String(reviewersValue?.textContent || "")).toContain(
      "Reviewer One (reviewer1)",
    );
    expect(String(reviewersValue?.textContent || "")).toContain("Reviewer Two");
  });

  test("switches management tab panels when a user opens Run & Filter", async () => {
    const user = userEvent.setup();
    const activityTab = screen.getByRole("tab", { name: "Activity" });
    const runFilterTab = screen.getByRole("tab", { name: "Run & Filter" });

    await user.click(runFilterTab);

    expect(runFilterTab).toHaveAttribute("aria-selected", "true");
    expect(activityTab).toHaveAttribute("aria-selected", "false");
    expect(document.getElementById("tab-panel-script").hidden).toBe(false);
    expect(document.getElementById("tab-panel-status").hidden).toBe(true);
  });

  test("filters, scheduler, backfill, and visibility toggles update rendered output", async () => {
    initTestPage({
      backfillStatusResponse: {
        ok: true,
        running: true,
        pid: "456",
        logFile: "/tmp/backfill.log",
        pidFile: "/tmp/backfill.pid",
        summary: "Backfill status: running (PID: 456)",
      },
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 2,
            overrides: {
              data: {
                title: "Filtered Entry",
                titleDisplay: "Filtered Entry [CHK:PASS][MRG:YES]",
                url: "https://example.com/2",
                labels: ["platform-team"],
                author: "Some Author",
                authorLogin: "someone",
                baseline: "2026-03-01T10:00:00Z",
                mergedAt: "2026-03-01T10:00:00Z",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
          lastAutoError:
            "optum-rx-clinicalproducts/orx-cpp-mp-uis: Auto refresh timed out after 900s",
        },
      }),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      const dataMeta = document.getElementById("data-meta")?.textContent || "";
      expect(dataMeta).toContain("Rows: 1");
    });

    const schedulerBadgesText =
      document.getElementById("scheduler-badges")?.textContent || "";
    expect(schedulerBadgesText).toContain("Every");
    expect(schedulerBadgesText).toContain("Auto run: timed out");
    const schedulerBadgesClass =
      document.getElementById("scheduler-badges")?.innerHTML || "";
    expect(schedulerBadgesClass).toContain("scheduler-badge-error");
    expect(document.getElementById("scheduler-details")?.textContent || "").toContain(
      "Last auto error:",
    );

    await user.click(screen.getByRole("tab", { name: "Backfill" }));
    expect(document.getElementById("tab-panel-backfill").hidden).toBe(false);
    expect(document.getElementById("tab-panel-status").hidden).toBe(true);

    await waitFor(() => {
      const backfillBadgesText =
        document.getElementById("backfill-badges")?.textContent || "";
      expect(backfillBadgesText.toLowerCase()).toContain("running");
    });
    expect(screen.getByRole("button", { name: "Start backfill" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop backfill" })).toBeEnabled();
    expect(document.getElementById("backfill-details")?.textContent || "").toContain(
      "PID: 456",
    );

    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });

    await waitFor(() => {
      expect(isMultiSelectEmpty("author-list")).toBe(true);
    });
  });

  test("renders request-activity badges and details from JavaScript init logic", async () => {
    await waitFor(() => {
      expect(screen.getByText("No request in progress")).toBeInTheDocument();
    });
    expect(screen.getByText(/Current status: Not run/i)).toBeInTheDocument();
    expect(screen.getByText(/Active requests: none/i)).toBeInTheDocument();
  });

  test("applies non-credential autofill hints without changing existing form field names", () => {
    const repoField = document.getElementById("repo");
    const prNumbersField = document.getElementById("pr-numbers");
    const targetFieldIds = [
      "repo",
      "pr-numbers",
      "limit",
      "merged-limit",
      "jobs",
      "filter-pr-numbers",
    ];

    expect(repoField).toHaveAttribute("name", "repo");
    expect(prNumbersField).toHaveAttribute("name", "prNumbers");

    targetFieldIds.forEach((id) => {
      const field = document.getElementById(id);
      expect(field).toHaveAttribute("autocomplete", "off");
      expect(field).toHaveAttribute("autocapitalize", "off");
      expect(field).toHaveAttribute("autocorrect", "off");
      expect(field).toHaveAttribute("spellcheck", "false");
      expect(field).toHaveAttribute("data-lpignore", "true");
      expect(field).toHaveAttribute("data-1p-ignore", "true");
      expect(field).toHaveAttribute("data-bwignore", "true");
      expect(field).toHaveAttribute("data-form-type", "other");
    });

    expect(repoField).toHaveAttribute("name", "repo");
    expect(prNumbersField).toHaveAttribute("name", "prNumbers");
  });

  test("given run and filter tab when Apply filters (local) is clicked then view-filter defaults are persisted", async () => {
    const user = userEvent.setup();
    fetchMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    await user.click(
      screen.getByRole("button", { name: "Apply filters (local)" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const putCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/user-defaults" &&
        String(init?.method || "GET").toUpperCase() === "PUT"
      );
    });

    expect(putCall).toBeDefined();
  });

  test("given local filters and mixed PR delimiters when actions run then local apply stays local and run script posts numeric IDs", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "PUT"
        );
      });
      expect(putCall).toBeDefined();
    });

    const runCallsAfterLocalApply = fetchMock.mock.calls.filter((call) => {
      const [url] = call;
      return String(url || "") === "/view-prs/run";
    });
    expect(runCallsAfterLocalApply.length).toBe(0);

    const prNumbersInput = document.getElementById("pr-numbers");
    await user.clear(prNumbersInput);
    await user.type(prNumbersInput, "912  921,  300");

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Run script" }));

    await waitFor(() => {
      const runCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/run" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(runCalls.length).toBe(3);
    });

    const runCalls = fetchMock.mock.calls.filter((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/run" &&
        String(init?.method || "GET").toUpperCase() === "POST"
      );
    });
    const bodies = runCalls.map((call) => String(call[1]?.body || ""));
    expect(bodies.some((b) => b.includes('"912"') || b.includes('"prNumber":"912"'))).toBe(true);
    expect(bodies.some((b) => b.includes('"921"') || b.includes('"prNumber":"921"'))).toBe(true);
    expect(bodies.some((b) => b.includes('"300"') || b.includes('"prNumber":"300"'))).toBe(true);
  });

  test("given no selected author and toggled checkboxes when Run script posts payload then author fallback and boolean flags are mapped", async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    // Note: With checkbox-based filters, authors are populated dynamically from PR data.
    // This test verifies that when no author checkboxes are selected, the author field
    // defaults to an empty string in the payload.

    const prNumbersInput = document.getElementById("pr-numbers");
    await user.clear(prNumbersInput);
    await user.type(prNumbersInput, "101  xyz, 202");

    const ackChangedCheckbox = document.getElementById("ack-changed");
    const showReasonCheckbox = document.getElementById("show-reason");
    const quietCheckbox = document.getElementById("quiet");

    await user.click(ackChangedCheckbox);
    await user.click(showReasonCheckbox);
    await user.click(quietCheckbox);

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Run script" }));

    await waitFor(() => {
      const runCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/run" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(runCalls.length).toBe(2);
    });

    const runCalls = fetchMock.mock.calls.filter((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/run" &&
        String(init?.method || "GET").toUpperCase() === "POST"
      );
    });

    const firstBody = JSON.parse(String(runCalls[0][1]?.body || "{}"));
    const secondBody = JSON.parse(String(runCalls[1][1]?.body || "{}"));

    expect(firstBody.author).toBe("");
    expect(firstBody.ackChanged).toBe(true);
    expect(firstBody.showReason).toBe(false);
    expect(firstBody.quiet).toBe(true);
    expect(firstBody.prNumbersInput).toBe("101  xyz, 202");
    expect(firstBody.prNumberList).toEqual(["101", "202"]);
    expect(firstBody.prNumbers).toBe("101,202");
    expect(firstBody.prNumber).toBe("101");
    expect(secondBody.prNumber).toBe("202");
  });

  test("given label dropdown selections when Run script posts payload then label and excludeLabel map from selected label checkboxes", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Run payload labels",
                titleDisplay: "Run payload labels [CHK:PASS]",
                author: "Author One",
                authorLogin: "author-one",
                url: "https://github.com/owner/repo/pull/101",
                labels: ["bug", "frontend", "platform-team"],
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const prNumbersInput = document.getElementById("pr-numbers");
    await user.clear(prNumbersInput);
    await user.type(prNumbersInput, "101");

    await waitFor(() => {
      const includeValues = Array.from(
        getMultiSelectList("label-list").querySelectorAll("input[type='checkbox']"),
      ).map((cb) => cb.value);
      const excludeValues = Array.from(
        getMultiSelectList("exclude-label-list").querySelectorAll("input[type='checkbox']"),
      ).map((cb) => cb.value);
      expect(includeValues).toEqual(["bug", "frontend", "platform-team"]);
      expect(excludeValues).toEqual(["bug", "frontend", "platform-team"]);
    });

    await clickMultiSelectCheckbox("label-list", "frontend", user);

    await clickMultiSelectCheckbox("exclude-label-list", "bug", user);

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Run script" }));

    await waitFor(() => {
      const runCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/run" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(runCalls.length).toBe(1);
    });

    const runCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/run" &&
        String(init?.method || "GET").toUpperCase() === "POST"
      );
    });
    const payload = JSON.parse(String(runCall?.[1]?.body || "{}"));

    expect(payload.prNumber).toBe("101");
    expect(payload.label).toBe("frontend");
    expect(payload.excludeLabel).toBe("bug");
  });

  test("given PR-number filter and other local filters when applying locally then PR-number filter takes precedence", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 1,
            overrides: {
              data: {
                title: "Target PR",
                titleDisplay: "Target PR [CHK:PASS]",
                author: "Author Target",
                authorLogin: "author-target",
                url: "https://github.com/owner/repo/pull/1",
                assignees: [
                  { login: "assignee-target", name: "Assignee Target" },
                ],
                labels: ["bug"],
                updatedAt: "2026-03-09T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-changed",
            prNumber: 2,
            overrides: {
              data: {
                title: "Non-target PR",
                titleDisplay: "Non-target PR [CHK:PASS]",
                author: "Author Other",
                authorLogin: "author-other",
                url: "https://github.com/owner/repo/pull/2",
                assignees: [
                  { login: "assignee-other", name: "Assignee Other" },
                ],
                labels: ["frontend"],
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const scopeField = document.getElementById("scope-mode");
    const prFilterField = document.getElementById("filter-pr-numbers");
    const labelList = getMultiSelectList("label-list");
    const excludeLabelList = getMultiSelectList("exclude-label-list");
    const authorList = getMultiSelectList("author-list");
    const assignedList = getMultiSelectList("assigned-list");

    expect(scopeField).toBeInTheDocument();
    expect(prFilterField).toBeInTheDocument();
    expect(labelList).toBeInTheDocument();
    expect(excludeLabelList).toBeInTheDocument();
    expect(authorList).toBeInTheDocument();
    expect(assignedList).toBeInTheDocument();

    await waitFor(() => {
      const includeValues = Array.from(
        labelList.querySelectorAll("input[type='checkbox']"),
      ).map((cb) => cb.value);
      const excludeValues = Array.from(
        excludeLabelList.querySelectorAll("input[type='checkbox']"),
      ).map((cb) => cb.value);
      expect(includeValues).toEqual(["bug", "frontend"]);
      expect(excludeValues).toEqual(["bug", "frontend"]);
    });

    await user.selectOptions(scopeField, "needs-attention-or-interacted");
    await user.clear(prFilterField);
    await user.type(prFilterField, "1");
    await clickMultiSelectCheckbox("label-list", "frontend", user);
    await clickMultiSelectCheckbox("exclude-label-list", "bug", user);
    await clickMultiSelectCheckbox("author-list", "author-other", user);
    await clickMultiSelectCheckbox("assigned-list", "assignee-other", user);

    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(dataMetaText).toContain("pr-numbers=1");
      expect(dataMetaText).toContain("scope=all stored rows");
    });

    expect(
      screen.getByRole("button", { name: "View PR JSON details for #1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View PR JSON details for #2" }),
    ).not.toBeInTheDocument();
  });

  test("given needs-attention scope variants when applying locally then each scope yields the expected row set", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 1,
            overrides: {
              data: {
                title: "Needs attention row",
                titleDisplay: "Needs attention row [CHK:PASS]",
                author: "Author One",
                authorLogin: "author-one",
                url: "https://github.com/owner/repo/pull/1",
                baseline: "-",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 2,
            overrides: {
              data: {
                title: "Interacted row",
                titleDisplay: "Interacted row [CHK:PASS]",
                author: "Author Two",
                authorLogin: "author-two",
                url: "https://github.com/owner/repo/pull/2",
                baseline: "2026-03-08T10:00:00Z",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 3,
            overrides: {
              data: {
                title: "No attention no interaction",
                titleDisplay: "No attention no interaction [CHK:PASS]",
                author: "Author Three",
                authorLogin: "author-three",
                url: "https://github.com/owner/repo/pull/3",
                baseline: "-",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 4,
            overrides: {
              data: {
                title: "In-review row",
                titleDisplay: "In-review row [CHK:PASS]",
                author: "Author Four",
                authorLogin: "author-four",
                url: "https://github.com/owner/repo/pull/4",
                baseline: "-",
                inReview: true,
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    const scopeField = document.getElementById("scope-mode");
    expect(scopeField).toBeInTheDocument();

    await user.selectOptions(scopeField, "needs-attention");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 2");
      expect(dataMetaText).toContain("scope=needs attention rows");
    });

    await user.selectOptions(scopeField, "needs-attention-or-interacted");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 3");
      expect(dataMetaText).toContain("scope=needs attention or interacted rows");
    });
  });

  test("given a flagged PR, when rows render with needs-attention status, then the flag icon appears below attention with the flagged tooltip", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 101,
            overrides: {
              data: {
                title: "Flagged attention row",
                titleDisplay: "Flagged attention row [CHK:PASS]",
                author: "Author One",
                authorLogin: "author-one",
                url: "https://github.com/owner/repo/pull/101",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
        flaggedByRepo: {
          "owner/repo": {
            101: true,
          },
        },
      }),
    });

    await waitFor(() => {
      expect(screen.getByText("#101")).toBeInTheDocument();
    });

    const row = screen.getByText("#101").closest("tr");
    const icons = Array.from(row?.querySelectorAll(".attention-cell span") || []);

    expect(icons.map((node) => node.textContent)).toEqual(["⚠️", "🚩"]);
    expect(icons[1]?.getAttribute("title")).toBe("PR was flagged");
  });

  test("given a PR that is both in-review and flagged, when rows render, then attention and flag icons are both shown with flag below attention", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-in-review",
            prNumber: 202,
            overrides: {
              data: {
                title: "In-review flagged row",
                titleDisplay: "In-review flagged row [CHK:PASS]",
                author: "Author Two",
                authorLogin: "author-two",
                url: "https://github.com/owner/repo/pull/202",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
        flaggedByRepo: {
          "owner/repo": {
            202: true,
          },
        },
      }),
    });

    await waitFor(() => {
      expect(screen.getByText("#202")).toBeInTheDocument();
    });

    const row = screen.getByText("#202").closest("tr");
    const icons = Array.from(row?.querySelectorAll(".attention-cell span") || []);

    expect(icons.map((node) => node.textContent)).toEqual(["⚠️", "🚩"]);
    expect(icons[1]?.getAttribute("title")).toBe("PR was flagged");
  });

  test("scheduler polling toggles active PR progress indicators without row rerender", async () => {
    const originalSetInterval = global.setInterval;
    const intervalCallbacks = [];
    global.setInterval = jest.fn((callback, intervalMs) => {
      if (intervalMs === 30000) {
        intervalCallbacks.push(callback);
      }
      return intervalCallbacks.length;
    });

    try {
      jest.resetModules();
      latestDataPayload = createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 1,
            overrides: {
              data: {
                title: "Scheduler progress row",
                titleDisplay: "Scheduler progress row [CHK:PASS]",
                author: "Author One",
                authorLogin: "author-one",
                url: "https://github.com/owner/repo/pull/1",
                baseline: "-",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
      });
      actionLogEntries = [];
      document.body.innerHTML = extractBodyHtml(indexHtml);

      let schedulerActivePrNumbers = [];
      const baseFetch = createFetchMock();
      fetchMock = jest.fn(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();
        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: schedulerActivePrNumbers.length > 0,
              activePrNumbers: schedulerActivePrNumbers,
            },
          });
        }
        return baseFetch(url, init);
      });
      global.fetch = fetchMock;
      window.fetch = fetchMock;
      window.marked = {
        parse: (markdownText) => `<p>${String(markdownText || "")}</p>`,
      };

      require("../index.page.js");

      expect(intervalCallbacks.length).toBeGreaterThanOrEqual(2);
      const pollSchedulerStatusCallback = intervalCallbacks[1];
      expect(typeof pollSchedulerStatusCallback).toBe("function");

      await waitFor(() => {
        expect(screen.getByText("#1")).toBeInTheDocument();
      });

      const getIndicator = () => {
        const row = screen.getByText("#1").closest("tr");
        return row?.querySelector(".pr-progress-indicator");
      };

      const initialIndicator = getIndicator();
      expect(initialIndicator).toBeTruthy();
      expect(initialIndicator?.hidden).toBe(true);

      schedulerActivePrNumbers = ["1"];
      await pollSchedulerStatusCallback();

      await waitFor(() => {
        const updatedIndicator = getIndicator();
        expect(updatedIndicator).toBe(initialIndicator);
        expect(updatedIndicator?.hidden).toBe(false);
      });

      schedulerActivePrNumbers = [];
      await pollSchedulerStatusCallback();

      await waitFor(() => {
        const updatedIndicator = getIndicator();
        expect(updatedIndicator).toBe(initialIndicator);
        expect(updatedIndicator?.hidden).toBe(true);
      });
    } finally {
      global.setInterval = originalSetInterval;
    }
  });

  test("attention toggles update icons and persist non-default overrides", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Open no activity",
                titleDisplay: "Open no activity [CHK:PASS]",
                author: "Open Author",
                authorLogin: "open-author",
                url: "https://github.com/owner/repo/pull/101",
                status: "NO_ACTIVITY",
                assignees: [{ login: "ahall236_uhg", name: "Alison Hall" }],
                updatedAt: "2026-06-16T10:00:00Z",
                baseline: "2026-06-01T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 102,
            overrides: {
              data: {
                title: "Open merge-only changed",
                titleDisplay: "Open merge-only changed [CHK:PASS]",
                author: "Merge Author",
                authorLogin: "merge-author",
                url: "https://github.com/owner/repo/pull/102",
                status: "CHANGED(commit)",
                updatedAt: "2026-06-16T10:10:00Z",
                baseline: "2026-06-01T10:00:00Z",
                reason: "-",
                commits: [
                  {
                    oid: "merge-commit-1",
                    committedAt: "2026-06-16T09:30:00Z",
                    messageHeadline: "Merge branch 'main' into feature/test",
                    authors: [{ login: "ahall236_uhg", name: "Alison Hall" }],
                  },
                ],
              },
            },
          },
          {
            scenario: "draft",
            prNumber: 201,
            overrides: {
              data: {
                title: "Draft changed",
                titleDisplay: "Draft changed [CHK:PASS]",
                author: "Draft Author",
                authorLogin: "draft-author",
                url: "https://github.com/owner/repo/pull/201",
                status: "CHANGED",
                updatedAt: "2026-06-16T10:20:00Z",
                baseline: "2026-06-01T10:00:00Z",
              },
            },
          },
          {
            scenario: "draft",
            prNumber: 202,
            overrides: {
              data: {
                title: "Draft no activity",
                titleDisplay: "Draft no activity [CHK:PASS]",
                author: "Draft Author Two",
                authorLogin: "draft-author-two",
                url: "https://github.com/owner/repo/pull/202",
                status: "NO_ACTIVITY",
                updatedAt: "2026-06-16T10:25:00Z",
                baseline: "2026-06-01T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:30:00Z" },
      }),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("#101")).toBeInTheDocument();
    });

    const hasAttentionForPr = (prNumber) => {
      const prLink = screen.getByText(`#${prNumber}`);
      const row = prLink.closest("tr");
      return Boolean(row?.querySelector(".attention-icon"));
    };

    document.getElementById("status").textContent = "Viewer : ahall236_uhg";

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const noActivityMode = document.getElementById("attention-no-activity-mode");
    const includePendingComments = document.getElementById(
      "attention-include-pending-comments",
    );
    const ignoreMergeOnly = document.getElementById(
      "attention-ignore-merge-only-commits",
    );
    const includeDraftChanged = document.getElementById(
      "attention-include-draft-changed",
    );
    const includeDraftNoActivity = document.getElementById(
      "attention-include-draft-no-activity",
    );
    const includeClosedMerged = document.getElementById(
      "attention-include-closed-merged",
    );

    expect(noActivityMode).toBeInTheDocument();
    expect(includePendingComments).toBeInTheDocument();
    expect(ignoreMergeOnly).toBeInTheDocument();

    await user.click(includePendingComments);
    await user.selectOptions(noActivityMode, "none");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(hasAttentionForPr("101")).toBe(false);
    });

    await user.selectOptions(noActivityMode, "mine-only");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await user.selectOptions(noActivityMode, "all");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(hasAttentionForPr("101")).toBe(true);
    });

    await user.click(ignoreMergeOnly);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(hasAttentionForPr("102")).toBe(false);
    });

    if (includeDraftChanged.checked) {
      await user.click(includeDraftChanged);
    }
    if (includeDraftNoActivity.checked) {
      await user.click(includeDraftNoActivity);
    }
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(hasAttentionForPr("201")).toBe(false);
      expect(hasAttentionForPr("202")).toBe(false);
    });

    await user.click(includeDraftChanged);
    await user.click(includeDraftNoActivity);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(hasAttentionForPr("201")).toBe(true);
      expect(hasAttentionForPr("202")).toBe(true);
    });

    fetchMock.mockClear();
    await user.selectOptions(noActivityMode, "mine-only");
    if (includeClosedMerged.checked) {
      await user.click(includeClosedMerged);
    }
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    let putCall;
    await waitFor(() => {
      putCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "PUT"
        );
      });
      expect(putCall).toBeDefined();
    });

    const savedOverrides = JSON.parse(String(putCall?.[1]?.body || "{}"));
    expect(savedOverrides["attention-no-activity-mode"]).toBe("mine-only");
    expect(savedOverrides["attention-include-closed-merged"]).toBe(false);

    fetchMock.mockClear();
    await user.selectOptions(noActivityMode, "all");
    await user.click(includeClosedMerged);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    let resetPutCall;
    await waitFor(() => {
      resetPutCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "PUT"
        );
      });
      expect(resetPutCall).toBeDefined();
    });

    const savedOverridesAfterReset = JSON.parse(
      String(resetPutCall?.[1]?.body || "{}"),
    );
    expect(
      Object.prototype.hasOwnProperty.call(
        savedOverridesAfterReset,
        "attention-no-activity-mode",
      ),
    ).toBe(false);
  });

  test("preserves selected author filter through rerender after row actions", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 11,
            overrides: {
              data: {
                title: "Alpha author",
                titleDisplay: "Alpha author [CHK:PASS][MRG:YES]",
                author: "Alpha Author",
                authorLogin: "auser",
                url: "https://github.com/owner/repo/pull/11",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 12,
            overrides: {
              data: {
                title: "Zeta author",
                titleDisplay: "Zeta author [CHK:PASS][MRG:YES]",
                author: "Zeta User",
                authorLogin: "zuser",
                url: "https://github.com/owner/repo/pull/12",
                updatedAt: "2026-06-16T10:10:00Z",
              },
            },
          },
        ],
        actorsMap: {
          auser: "Alpha Author",
          zuser: "Zeta User",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:10:00Z" },
      }),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("#11")).toBeInTheDocument();
      expect(screen.getByText("#12")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const authorList = getMultiSelectList("author-list");
    expect(authorList).toBeInTheDocument();

    await clickMultiSelectCheckbox("author-list", "zuser", user);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(screen.getByText("#12")).toBeInTheDocument();
      expect(screen.queryByText("#11")).not.toBeInTheDocument();
    });

    const visibleAckButton = screen
      .getAllByRole("button", { name: /ack/i })
      .find((button) => button.closest("table"));
    expect(visibleAckButton).toBeDefined();
    await user.click(visibleAckButton);

    await waitFor(() => {
      const selectedAuthorValues = getSelectedMultiSelectValues("author-list");
      expect(selectedAuthorValues).toEqual(["zuser"]);

      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(screen.getByText("#12")).toBeInTheDocument();
      expect(screen.queryByText("#11")).not.toBeInTheDocument();
    });
  });

  test("section headings show needs-attention counts by PR group", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 1,
            overrides: {
              data: {
                title: "Open attention",
                titleDisplay: "Open attention [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/1",
                status: "NO_ACTIVITY",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 2,
            overrides: {
              data: {
                title: "Open no attention",
                titleDisplay: "Open no attention [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/2",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "draft",
            prNumber: 21,
            overrides: {
              data: {
                title: "Draft attention",
                titleDisplay: "Draft attention [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/21",
                status: "CHANGED",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 31,
            overrides: {
              section: "closed",
              data: {
                title: "Closed attention",
                titleDisplay: "Closed attention [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/31",
                status: "CHANGED",
                approved: "YES",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "merged",
            prNumber: 41,
            overrides: {
              data: {
                title: "Merged no attention",
                titleDisplay: "Merged no attention [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/41",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });

    await waitFor(() => {
      expect(document.querySelector("details[data-pr-section='open']")).toBeTruthy();
    });

    const openSection = document.querySelector("details[data-pr-section='open']");
    const draftSection = document.querySelector("details[data-pr-section='draft']");
    const closedSection = document.querySelector("details[data-pr-section='closed']");
    const mergedSection = document.querySelector("details[data-pr-section='merged']");

    const openAttention = openSection?.querySelector(".pr-group-section-attention-count");
    const draftAttention = draftSection?.querySelector(".pr-group-section-attention-count");
    const closedAttention = closedSection?.querySelector(".pr-group-section-attention-count");
    const mergedAttention = mergedSection?.querySelector(
      ".pr-group-section-attention-count",
    );

    expect(String(openAttention?.textContent || "")).toBe("Attention: 1");
    expect(String(draftAttention?.textContent || "")).toBe("Attention: 1");
    expect(String(closedAttention?.textContent || "")).toBe("Attention: 1");
    expect(mergedAttention).toBeNull();
  });

  test("renders compact table headers, author-note indicators, and merged note-only rows", async () => {
    initTestPage({
      dataPayload: {
        byPrNumber: {
          11: {
            repo: "owner/repo",
            prNumber: "11",
            section: "open",
            notes: {
              comments: [
                {
                  id: "comment-1",
                  author: "ahall236_uhg",
                  tone: "Positive",
                  note: "Remember to revisit metrics copy.",
                },
              ],
              otherNotes: "Follow up after release",
              prDifficulty: "4",
              rallyStories: ["US12345"],
              rallyLinks: ["https://rally.example/US12345"],
              analysisOfPr: "Risk is moderate due to API coupling.",
            },
            data: {
              number: "11",
              title: "Open row with notes",
              titleDisplay: "Open row with notes [CHK:PASS][MRG:YES]",
              url: "https://example.com/11",
              labels: [],
              author: "Alison Hall",
              authorLogin: "ahall236_uhg",
              status: "NO_ACTIVITY",
              approved: "NO",
              approvalCount: "0",
              approvers: [],
              openConversationCount: "0",
              viewedFilesCount: "0",
              changedFilesCount: "0",
              viewedFilesSummary: "0/0 viewed",
              activityTimelineSummary: "-",
              activityTimeline: [],
              baseline: "2026-03-01T10:00:00Z",
              mergedAt: "",
              reason: "-",
              inReview: false,
              updatedAt: "2026-03-10T10:00:00Z",
            },
          },
          12: {
            repo: "owner/repo",
            prNumber: "12",
            section: "open",
            notes: {
              comments: [],
              otherNotes: "",
              prDifficulty: "",
              rallyStories: [],
              rallyLinks: [],
              analysisOfPr: "",
            },
            data: {
              number: "12",
              title: "Open row without notes",
              titleDisplay: "Open row without notes [CHK:PASS][MRG:YES]",
              url: "https://example.com/12",
              labels: [],
              author: "Second Author",
              authorLogin: "second_author",
              status: "NO_CHANGE",
              approved: "NO",
              approvalCount: "0",
              approvers: [],
              openConversationCount: "0",
              viewedFilesCount: "0",
              changedFilesCount: "0",
              viewedFilesSummary: "0/0 viewed",
              activityTimelineSummary: "-",
              activityTimeline: [],
              baseline: "2026-03-01T10:00:00Z",
              mergedAt: "",
              reason: "-",
              inReview: false,
              updatedAt: "2026-03-10T10:00:00Z",
            },
          },
          999: {
            repo: "owner/repo",
            prNumber: "999",
            section: "merged",
            notes: {
              comments: [
                {
                  id: "comment-merged-1",
                  author: "reviewer-only",
                  tone: "Negative",
                  note: "This PR still needs follow-up context.",
                },
              ],
              otherNotes: "Saved without local PR data.",
            },
            data: {
              number: "999",
              title: "Stored notes only",
              titleDisplay: "Stored notes only",
              url: "https://example.com/999",
              labels: [],
              author: "",
              authorLogin: "",
              status: "NO_LOCAL_DATA",
              approved: "-",
              approvalCount: "0",
              approvers: [],
              comments: [],
              reviews: [],
              commits: [],
              reviewThreads: [],
              openConversationCount: "0",
              viewedFilesCount: "0",
              changedFilesCount: "0",
              viewedFilesSummary: "0/0 viewed",
              mergedAt: "",
              reason: "No retrieved PR data available",
              inReview: false,
            },
          },
        },
        actorsMap: { ahall236_uhg: "Alison Hall" },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      },
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("#11")).toBeInTheDocument();
      expect(screen.getByText("#999")).toBeInTheDocument();
    });

    const openSectionTable = document.querySelector(
      "details[data-pr-section='open'] table.pr-data-table",
    );
    expect(openSectionTable).toBeTruthy();

    const openHeaderCells = openSectionTable.querySelectorAll("thead th");
    expect(String(openHeaderCells[0]?.textContent || "")).toContain("Sel");
    expect(openHeaderCells[0]).toHaveAttribute("title", "Select PR");
    expect(String(openHeaderCells[1]?.textContent || "")).toContain("Attn");
    expect(openHeaderCells[1]).toHaveAttribute("title", "Needs Attention");

    const pr11Link = screen.getByText("#11");
    const pr11Row = pr11Link.closest("tr");
    expect(pr11Row).toBeTruthy();
    const pr11AuthorCell = pr11Row?.children?.[6];
    expect(String(pr11AuthorCell?.textContent || "")).toContain("Alison Hall");
    expect(String(pr11AuthorCell?.textContent || "")).toContain("📝 Notes");
    const pr11Indicator = pr11AuthorCell?.querySelector(".author-notes-indicator");
    expect(String(pr11Indicator?.className || "")).toContain("author-notes-indicator-has");

    const pr11DateCell = pr11Row?.children?.[9];
    const pr11FieldIndicators = Array.from(
      pr11DateCell?.querySelectorAll(".author-notes-field-indicator") || [],
    );
    expect(pr11FieldIndicators.length).toBe(6);
    expect(
      pr11FieldIndicators.every((node) =>
        String(node?.className || "").includes("author-notes-field-indicator-filled"),
      ),
    ).toBe(true);
    expect(
      String(
        pr11DateCell?.querySelector(".author-notes-field-indicator-difficulty")
          ?.textContent || "",
      ),
    ).toBe("4");

    const pr12Link = screen.getByText("#12");
    const pr12Row = pr12Link.closest("tr");
    expect(pr12Row).toBeTruthy();
    const pr12AuthorCell = pr12Row?.children?.[6];
    const pr12Indicator = pr12AuthorCell?.querySelector(".author-notes-indicator");
    expect(String(pr12Indicator?.className || "")).toContain("author-notes-indicator-none");

    const pr12DateCell = pr12Row?.children?.[9];
    const pr12FieldIndicators = Array.from(
      pr12DateCell?.querySelectorAll(".author-notes-field-indicator") || [],
    );
    expect(pr12FieldIndicators.length).toBe(6);
    expect(
      pr12FieldIndicators.every((node) =>
        String(node?.className || "").includes("author-notes-field-indicator-empty"),
      ),
    ).toBe(true);
    expect(
      String(
        pr12DateCell?.querySelector(".author-notes-field-indicator-difficulty")
          ?.textContent || "",
      ),
    ).toBe("");

    const pr999Link = screen.getByText("#999");
    const pr999Row = pr999Link.closest("tr");
    expect(pr999Row).toBeTruthy();
    expect(String(pr999Row?.textContent || "")).toContain("NO_LOCAL_DATA");

    const pr999InsightsButton = pr999Row?.querySelector(".row-insights-toggle");
    expect(pr999InsightsButton).toBeTruthy();
    await user.click(pr999InsightsButton);

    const pr999InsightsRow = pr999Row?.nextElementSibling;
    expect(pr999InsightsRow?.hidden).toBe(false);
    const mergedCommentNote = pr999InsightsRow?.querySelector(
      ".pr-notes-comment-note",
    );
    const mergedOtherNotes = Array.from(
      pr999InsightsRow?.querySelectorAll(".pr-notes-textarea") || [],
    ).find(
      (node) =>
        !String(node?.className || "").includes("pr-notes-comment-note"),
    );
    expect(String(mergedCommentNote?.value || "")).toBe(
      "This PR still needs follow-up context.",
    );
    expect(String(mergedOtherNotes?.value || "")).toBe(
      "Saved without local PR data.",
    );
  });

  test("attention toggle changes update row icons and persist non-default overrides", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Open no activity",
                titleDisplay: "Open no activity [CHK:PASS]",
                author: "octocat",
                authorLogin: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                status: "NO_ACTIVITY",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 102,
            overrides: {
              data: {
                title: "Merge-only commit change",
                titleDisplay: "Merge-only commit change [CHK:PASS]",
                author: "octocat",
                authorLogin: "octocat",
                url: "https://github.com/owner/repo/pull/102",
                status: "CHANGED(commit)",
                commits: [
                  {
                    oid: "merge-commit-1",
                    committedAt: "2026-03-10T09:30:00Z",
                    messageHeadline: "Merge branch 'main' into feature/test",
                    authors: [{ login: "ahall236_uhg", name: "Alison Hall" }],
                  },
                ],
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    const getAttentionIcon = (prNumber) =>
      screen
        .getByText(`#${prNumber}`)
        .closest("tr")
        ?.querySelector(".attention-icon");

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await waitFor(() => {
      expect(screen.getByText("#101")).toBeInTheDocument();
    });

    fetchMock.mockClear();
    const pendingCommentsToggle = document.getElementById(
      "attention-include-pending-comments",
    );
    const noActivityModeSelect = document.getElementById(
      "attention-no-activity-mode",
    );
    const ignoreMergeOnlyToggle = document.getElementById(
      "attention-ignore-merge-only-commits",
    );

    pendingCommentsToggle.checked = false;
    await user.selectOptions(noActivityModeSelect, "none");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getAttentionIcon("101")).toBeNull();
    });

    await user.selectOptions(noActivityModeSelect, "all");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("101")?.textContent || "").toBe("⚠️");
    });

    ignoreMergeOnlyToggle.checked = true;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("102")).toBeNull();
    });

    const includeClosedMergedToggle = document.getElementById(
      "attention-include-closed-merged",
    );
    const includeDraftNoActivityToggle = document.getElementById(
      "attention-include-draft-no-activity",
    );

    await user.selectOptions(noActivityModeSelect, "mine-only");
    includeClosedMergedToggle.checked = false;
    includeDraftNoActivityToggle.checked = true;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    let latestPutCall;
    await waitFor(() => {
      latestPutCall = fetchMock.mock.calls
        .slice()
        .reverse()
        .find((call) => {
          const [url, init] = call;
          return (
            String(url || "") === "/view-prs/user-defaults" &&
            String(init?.method || "GET").toUpperCase() === "PUT"
          );
        });
      expect(latestPutCall).toBeDefined();
    });

    const savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
    expect(savedOverrides["attention-no-activity-mode"]).toBe("mine-only");
    expect(savedOverrides["attention-include-closed-merged"]).toBe(false);
    expect(savedOverrides["attention-include-draft-no-activity"]).toBe(true);

    await user.selectOptions(noActivityModeSelect, "all");
    includeClosedMergedToggle.checked = true;
    includeDraftNoActivityToggle.checked = false;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      latestPutCall = fetchMock.mock.calls
        .slice()
        .reverse()
        .find((call) => {
          const [url, init] = call;
          return (
            String(url || "") === "/view-prs/user-defaults" &&
            String(init?.method || "GET").toUpperCase() === "PUT"
          );
        });
      expect(latestPutCall).toBeDefined();
    });

    const savedOverridesAfterReset = JSON.parse(
      String(latestPutCall?.[1]?.body || "{}"),
    );
    expect(
      Object.prototype.hasOwnProperty.call(
        savedOverridesAfterReset,
        "attention-no-activity-mode",
      ),
    ).toBe(false);
  });

    test("given author thread-resolution controls, when mode and actor selections change, then user-default overrides are persisted immediately", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 901,
              overrides: {
                data: {
                  title: "Thread policy save behavior",
                  titleDisplay: "Thread policy save behavior [CHK:PASS]",
                  author: "PR Author",
                  authorLogin: "pr-author",
                  url: "https://github.com/owner/repo/pull/901",
                  updatedAt: "2026-06-16T10:00:00Z",
                },
              },
            },
          ],
          actorsMap: {
            "pr-author": "PR Author",
            reviewer1: "Reviewer One",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
      await waitFor(() => {
        expect(screen.getByText("#901")).toBeInTheDocument();
      });

      fetchMock.mockClear();
      const modeField = document.getElementById(
        "attention-author-thread-resolution-mode",
      );
      await user.selectOptions(modeField, "deny-only");

      let latestPutCall;
      await waitFor(() => {
        latestPutCall = fetchMock.mock.calls
          .slice()
          .reverse()
          .find((call) => {
            const [url, init] = call;
            return (
              String(url || "") === "/view-prs/user-defaults" &&
              String(init?.method || "GET").toUpperCase() === "PUT"
            );
          });
        expect(latestPutCall).toBeDefined();
      });

      let savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
      expect(savedOverrides["attention-author-thread-resolution-mode"]).toBe(
        "deny-only",
      );

      await clickMultiSelectCheckbox(
        "attention-author-thread-resolution-deny-list",
        "reviewer1",
        user,
      );

      await waitFor(() => {
        latestPutCall = fetchMock.mock.calls
          .slice()
          .reverse()
          .find((call) => {
            const [url, init] = call;
            return (
              String(url || "") === "/view-prs/user-defaults" &&
              String(init?.method || "GET").toUpperCase() === "PUT"
            );
          });
        expect(latestPutCall).toBeDefined();
      });

      savedOverrides = JSON.parse(String(latestPutCall?.[1]?.body || "{}"));
      expect(savedOverrides["attention-author-thread-resolution-mode"]).toBe(
        "deny-only",
      );
      expect(savedOverrides["attention-author-thread-resolution-deny"]).toEqual([
        "reviewer1",
      ]);
    });

    test("given stored author thread-resolution overrides, when the page loads, then mode visibility and actor selections are restored", async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 902,
              overrides: {
                data: {
                  title: "Thread policy restore behavior",
                  titleDisplay: "Thread policy restore behavior [CHK:PASS]",
                  author: "PR Author",
                  authorLogin: "pr-author",
                  url: "https://github.com/owner/repo/pull/902",
                  updatedAt: "2026-06-16T10:00:00Z",
                },
              },
            },
          ],
          actorsMap: {
            "pr-author": "PR Author",
            reviewer1: "Reviewer One",
            reviewer2: "Reviewer Two",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        }),
        userDefaultsOverrides: {
          "attention-author-thread-resolution-mode": "deny-only",
          "attention-author-thread-resolution-deny": ["reviewer1"],
        },
      });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
      await waitFor(() => {
        expect(screen.getByText("#902")).toBeInTheDocument();
      });

      const modeField = document.getElementById(
        "attention-author-thread-resolution-mode",
      );
      const allowOptions = document.getElementById(
        "attention-author-thread-resolution-allow-options",
      );
      const denyOptions = document.getElementById(
        "attention-author-thread-resolution-deny-options",
      );

      expect(modeField?.value).toBe("deny-only");
      expect(Boolean(allowOptions?.hidden)).toBe(true);
      expect(Boolean(denyOptions?.hidden)).toBe(false);

      await waitFor(() => {
        expect(
          getSelectedMultiSelectValues("attention-author-thread-resolution-deny-list"),
        ).toEqual(["reviewer1"]);
      });
    });

  test("draft attention icon logic follows include-draft toggles", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "draft",
            prNumber: 201,
            overrides: {
              data: {
                title: "Draft changed",
                titleDisplay: "Draft changed [CHK:PASS]",
                author: "octocat",
                authorLogin: "octocat",
                url: "https://github.com/owner/repo/pull/201",
                status: "CHANGED",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "draft",
            prNumber: 202,
            overrides: {
              data: {
                title: "Draft no activity",
                titleDisplay: "Draft no activity [CHK:PASS]",
                author: "octocat",
                authorLogin: "octocat",
                url: "https://github.com/owner/repo/pull/202",
                status: "NO_ACTIVITY",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    const getAttentionIcon = (prNumber) =>
      screen
        .getByText(`#${prNumber}`)
        .closest("tr")
        ?.querySelector(".attention-icon");

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await waitFor(() => {
      expect(screen.getByText("#201")).toBeInTheDocument();
      expect(screen.getByText("#202")).toBeInTheDocument();
    });

    document.getElementById("attention-include-pending-comments").checked = false;
    await user.selectOptions(document.getElementById("attention-no-activity-mode"), "all");

    const includeDraftChangedToggle = document.getElementById(
      "attention-include-draft-changed",
    );
    includeDraftChangedToggle.checked = false;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("201")).toBeNull();
    });

    includeDraftChangedToggle.checked = true;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("201")?.textContent || "").toBe("⚠️");
    });

    const includeDraftNoActivityToggle = document.getElementById(
      "attention-include-draft-no-activity",
    );
    includeDraftNoActivityToggle.checked = false;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("202")).toBeNull();
    });

    includeDraftNoActivityToggle.checked = true;
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));
    await waitFor(() => {
      expect(getAttentionIcon("202")?.textContent || "").toBe("⚠️");
    });
  });

  test("author filter selections persist through rerender after applying filters", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changed",
            prNumber: 301,
            overrides: {
              data: {
                title: "Alpha author",
                titleDisplay: "Alpha author [CHK:PASS]",
                author: "Alison Hall",
                authorLogin: "auser",
                url: "https://github.com/owner/repo/pull/301",
                status: "NO_CHANGE",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-changed",
            prNumber: 302,
            overrides: {
              data: {
                title: "Middle author",
                titleDisplay: "Middle author [CHK:PASS]",
                author: "Marta Cole",
                authorLogin: "mcole",
                url: "https://github.com/owner/repo/pull/302",
                status: "NO_CHANGE",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-changed",
            prNumber: 303,
            overrides: {
              data: {
                title: "Last author",
                titleDisplay: "Last author [CHK:PASS]",
                author: "Zelda User",
                authorLogin: "zuser",
                url: "https://github.com/owner/repo/pull/303",
                status: "NO_CHANGE",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          auser: "Alison Hall",
          mcole: "Marta Cole",
          zuser: "Zelda User",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const scopeSelect = document.getElementById("scope-mode");
    const authorList = getMultiSelectList("author-list");
    expect(authorList).toBeInTheDocument();
    expect(scopeSelect).toBeInTheDocument();

    await waitFor(() => {
      const authorLogins = Array.from(authorList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(authorLogins).toEqual(["auser", "mcole", "zuser"]);
    });

    await clickMultiSelectCheckbox("author-list", "zuser", user);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("author-list")).toEqual(["zuser"]);
    });

    await user.selectOptions(scopeSelect, "needs-attention-or-interacted");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("author-list")).toEqual(["zuser"]);
    });
  });

  test("given authors with and without login, when author filter options are rendered, then login keys are preferred and fallback names are used only when login is missing", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 311,
            overrides: {
              data: {
                title: "Has login",
                titleDisplay: "Has login [CHK:PASS]",
                author: "Display Name Should Not Be Key",
                authorLogin: "login-key",
                url: "https://github.com/owner/repo/pull/311",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 312,
            overrides: {
              data: {
                title: "Missing login",
                titleDisplay: "Missing login [CHK:PASS]",
                author: "Fallback Name Key",
                authorLogin: "",
                url: "https://github.com/owner/repo/pull/312",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          "login-key": "Resolved Login Name",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const authorList = getMultiSelectList("author-list");
    await waitFor(() => {
      const values = Array.from(authorList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(values).toContain("login-key");
      expect(values).toContain("Fallback Name Key");
      expect(values).not.toContain("Display Name Should Not Be Key");

      const labelByValue = Array.from(authorList.querySelectorAll(".multi-select-item")).reduce(
        (acc, item) => {
          const value = String(item.querySelector("input[type='checkbox']")?.value || "").trim();
          const label = String(item.querySelector("label")?.textContent || "").trim();
          if (value) {
            acc[value] = label;
          }
          return acc;
        },
        {},
      );

      expect(labelByValue["login-key"]).toBe("Resolved Login Name");
      expect(labelByValue["Fallback Name Key"]).toBe("Fallback Name Key");
    });
  });

  test("given author login aliases map two logins to one person, when author filter options are rendered, then one canonical option is shown", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 313,
            overrides: {
              data: {
                title: "Alias author login",
                titleDisplay: "Alias author login [CHK:PASS]",
                author: "Martin Thomas",
                authorLogin: "7c7240971101674017d4597caddf24_uhg",
                url: "https://github.com/owner/repo/pull/313",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 314,
            overrides: {
              data: {
                title: "Canonical author login",
                titleDisplay: "Canonical author login [CHK:PASS]",
                author: "Martin Thomas",
                authorLogin: "mthom486_uhg",
                url: "https://github.com/owner/repo/pull/314",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          "7c7240971101674017d4597caddf24_uhg": "Martin Thomas",
          "mthom486_uhg": "Martin Thomas",
        },
        actorLoginAliases: {
          "7c7240971101674017d4597caddf24_uhg": "mthom486_uhg",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const authorList = getMultiSelectList("author-list");
    await waitFor(() => {
      const values = Array.from(authorList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(values).toEqual(["mthom486_uhg"]);

      const labels = Array.from(authorList.querySelectorAll("label")).map((label) => String(label.textContent || "").trim());
      expect(labels).toEqual(["Martin Thomas"]);
    });
  });

  test("given PRs with approvers, when approver filter is selected and applied, then only approved-by-matching-user PRs are shown", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 401,
            overrides: {
              data: {
                title: "Approved by Alice",
                titleDisplay: "Approved by Alice [CHK:PASS]",
                author: "Bob Smith",
                authorLogin: "bsmith",
                url: "https://github.com/owner/repo/pull/401",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "alice",
                      name: "Alice",
                      approvedAt: "2026-06-15T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 402,
            overrides: {
              data: {
                title: "No approval yet",
                titleDisplay: "No approval yet [CHK:PASS]",
                author: "Carol Jones",
                authorLogin: "cjones",
                url: "https://github.com/owner/repo/pull/402",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [],
                },
              },
            },
          },
        ],
        actorsMap: {
          alice: "Alice",
          bsmith: "Bob Smith",
          cjones: "Carol Jones",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["alice"]);
    });

    await clickMultiSelectCheckbox("approver-list", "alice", user);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
      expect(dataMetaText).toContain("approver=alice");
    });

    expect(screen.getByRole("button", { name: "View PR JSON details for #401" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View PR JSON details for #402" })).not.toBeInTheDocument();
  });

  test("given assigned and approver entries without login, when filter options are rendered, then fallback names are used as option keys", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 451,
            overrides: {
              data: {
                title: "Fallback identities",
                titleDisplay: "Fallback identities [CHK:PASS]",
                author: "Author Name",
                authorLogin: "author-login",
                url: "https://github.com/owner/repo/pull/451",
                assignees: [{ name: "Assigned Name Only" }],
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "",
                      name: "Approver Name Only",
                      approvedAt: "2026-06-15T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
        ],
        actorsMap: {
          "author-login": "Author Name",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const assignedList = getMultiSelectList("assigned-list");
    const approverList = getMultiSelectList("approver-list");
    await waitFor(() => {
      const assignedValues = Array.from(assignedList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      const approverValues = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(assignedValues).toContain("Assigned Name Only");
      expect(approverValues).toContain("Approver Name Only");
    });
  });

  test("given assigned users with login and fallback names, when assigned filter options are rendered, then actor-name-cache labels override fallback name formatting", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 452,
            overrides: {
              data: {
                title: "Assigned mapped label",
                titleDisplay: "Assigned mapped label [CHK:PASS]",
                author: "Author Name",
                authorLogin: "author-login",
                url: "https://github.com/owner/repo/pull/452",
                assignees: [{ login: "ahall236_uhg", name: "Hall, Alison" }],
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          "ahall236_uhg": "Alison Hall",
          "author-login": "Author Name",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const assignedList = getMultiSelectList("assigned-list");
    await waitFor(() => {
      const labelByValue = Array.from(assignedList.querySelectorAll(".multi-select-item")).reduce(
        (acc, item) => {
          const value = String(item.querySelector("input[type='checkbox']")?.value || "").trim();
          const label = String(item.querySelector("label")?.textContent || "").trim();
          if (value) {
            acc[value] = label;
          }
          return acc;
        },
        {},
      );

      expect(labelByValue["ahall236_uhg"]).toBe("Alison Hall");
    });
  });

  test("given approved-cell assigned users with login and fallback names, when row is rendered, then badge title uses actor-name-cache mapped name", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 453,
            overrides: {
              data: {
                title: "Approved cell mapping",
                titleDisplay: "Approved cell mapping [CHK:PASS]",
                author: "Author Name",
                authorLogin: "author-login",
                url: "https://github.com/owner/repo/pull/453",
                assignees: [{ login: "ahall236_uhg", name: "Hall, Alison" }],
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          "ahall236_uhg": "Alison Hall",
          "author-login": "Author Name",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    await waitFor(() => {
      expect(screen.getByText("#453")).toBeInTheDocument();
    });

    const badge = document.querySelector(".approved-assigned-badge");
    expect(badge).toBeTruthy();
    expect(String(badge?.getAttribute("title") || "")).toBe("Alison Hall");
  });

  test("given approver filter applied, when scope changes and filters are reapplied, then approver selection is preserved", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 501,
            overrides: {
              data: {
                title: "Approved by David",
                titleDisplay: "Approved by David [CHK:PASS]",
                author: "Eve Brown",
                authorLogin: "ebrown",
                url: "https://github.com/owner/repo/pull/501",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "david",
                      name: "David",
                      approvedAt: "2026-06-15T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 502,
            overrides: {
              data: {
                title: "Not approved",
                titleDisplay: "Not approved [CHK:PASS]",
                author: "Frank Green",
                authorLogin: "fgreen",
                url: "https://github.com/owner/repo/pull/502",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [],
                },
              },
            },
          },
        ],
        actorsMap: {
          david: "David",
          ebrown: "Eve Brown",
          fgreen: "Frank Green",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    const scopeSelect = document.getElementById("scope-mode");
    expect(approverList).toBeInTheDocument();
    expect(scopeSelect).toBeInTheDocument();

    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["david"]);
    });

    await clickMultiSelectCheckbox("approver-list", "david", user);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("approver-list")).toEqual(["david"]);
    });

    await user.selectOptions(scopeSelect, "needs-attention-or-interacted");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("approver-list")).toEqual(["david"]);
    });
  });

  test("given a PR approved by multiple users, when one approver is selected, then the PR is shown (OR match)", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 601,
            overrides: {
              data: {
                title: "Approved by two reviewers",
                titleDisplay: "Approved by two reviewers [CHK:PASS]",
                author: "Dev One",
                authorLogin: "devone",
                url: "https://github.com/owner/repo/pull/601",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "reviewer-a",
                      name: "Reviewer A",
                      approvedAt: "2026-06-14T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                    {
                      login: "reviewer-b",
                      name: "Reviewer B",
                      approvedAt: "2026-06-14T10:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
          {
            scenario: "open-approved",
            prNumber: 602,
            overrides: {
              data: {
                title: "Approved only by reviewer-b",
                titleDisplay: "Approved only by reviewer-b [CHK:PASS]",
                author: "Dev Two",
                authorLogin: "devtwo",
                url: "https://github.com/owner/repo/pull/602",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "reviewer-b",
                      name: "Reviewer B",
                      approvedAt: "2026-06-14T11:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 603,
            overrides: {
              data: {
                title: "No approvals",
                titleDisplay: "No approvals [CHK:PASS]",
                author: "Dev Three",
                authorLogin: "devthree",
                url: "https://github.com/owner/repo/pull/603",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: { approvals: [] },
              },
            },
          },
        ],
        actorsMap: {
          "reviewer-a": "Reviewer A",
          "reviewer-b": "Reviewer B",
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: { intervalMinutes: 15, manualCooldownMinutes: 15, isAutoRunInProgress: false },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["reviewer-a", "reviewer-b"]);
    });

    // Select only reviewer-a: should show #601 (approved by both) but not #602 (only reviewer-b) or #603 (no approvals)
    await clickMultiSelectCheckbox("approver-list", "reviewer-a", user);
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("Rows: 1");
    });

    expect(screen.getByRole("button", { name: "View PR JSON details for #601" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View PR JSON details for #602" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View PR JSON details for #603" })).not.toBeInTheDocument();
  });

  test("given no PRs have approval data, when data loads, then approver select is disabled", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 701,
            overrides: {
              data: {
                title: "No metrics",
                titleDisplay: "No metrics [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/701",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: { intervalMinutes: 15, manualCooldownMinutes: 15, isAutoRunInProgress: false },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    await waitFor(() => {
      expect(isMultiSelectEmpty("approver-list")).toBe(true);
    });
  });

  test("given approver filter is selected and applied, when filters are saved, then approver logins are persisted to user-defaults", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 801,
            overrides: {
              data: {
                title: "Approved by grace",
                titleDisplay: "Approved by grace [CHK:PASS]",
                author: "Harry",
                authorLogin: "harry",
                url: "https://github.com/owner/repo/pull/801",
                baseline: "-",
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "grace",
                      name: "Grace",
                      approvedAt: "2026-06-15T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
        ],
        actorsMap: { grace: "Grace" },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: { intervalMinutes: 15, manualCooldownMinutes: 15, isAutoRunInProgress: false },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    await waitFor(() => {
      const approverLogins = Array.from(approverList.querySelectorAll("input[type='checkbox']")).map((cb) => cb.value);
      expect(approverLogins).toEqual(["grace"]);
    });

    await clickMultiSelectCheckbox("approver-list", "grace", user);

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    let putCall;
    await waitFor(() => {
      putCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "PUT"
        );
      });
      expect(putCall).toBeDefined();
    });

    const savedOverrides = JSON.parse(String(putCall?.[1]?.body || "{}"));
    expect(savedOverrides.approver).toEqual(["grace"]);
  });

  test("given approver stored in user-defaults, when page loads and data renders, then approver select is pre-selected", async () => {
    initTestPage({
      userDefaultsOverrides: { approver: ["grace"] },
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-approved",
            prNumber: 901,
            overrides: {
              data: {
                title: "Approved by grace",
                titleDisplay: "Approved by grace [CHK:PASS]",
                author: "Harry",
                authorLogin: "harry",
                url: "https://github.com/owner/repo/pull/901",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: {
                  approvals: [
                    {
                      login: "grace",
                      name: "Grace",
                      approvedAt: "2026-06-15T09:00:00Z",
                      mergeLeadMinutes: null,
                      commentCountAfterApproval: 0,
                      reviewCountAfterApproval: 0,
                      changeRequestCountAfterApproval: 0,
                      commitCountAfterApproval: 0,
                      issueSignalsAfterApprovalCount: 0,
                      highRiskApproval: false,
                      riskyApproval: false,
                    },
                  ],
                },
              },
            },
          },
          {
            scenario: "open-no-change",
            prNumber: 902,
            overrides: {
              data: {
                title: "No approvals",
                titleDisplay: "No approvals [CHK:PASS]",
                author: "Ivan",
                authorLogin: "ivan",
                url: "https://github.com/owner/repo/pull/902",
                assignees: [],
                updatedAt: "2026-06-16T10:00:00Z",
                metrics: { approvals: [] },
              },
            },
          },
        ],
        actorsMap: { grace: "Grace" },
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        scheduler: { intervalMinutes: 15, manualCooldownMinutes: 15, isAutoRunInProgress: false },
      }),
    });
    const user = userEvent.setup();

    // Ensure user-defaults have been fetched and the pending restore is set
    // before navigating so Apply sees the pre-populated pending selections.
    await waitFor(() => {
      const defaultsCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      expect(defaultsCall).toBeDefined();
    });

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));

    const approverList = getMultiSelectList("approver-list");
    expect(approverList).toBeInTheDocument();

    // Apply triggers re-render which picks up pendingApproverFilterSelections.
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(getSelectedMultiSelectValues("approver-list")).toEqual(["grace"]);
    });

    await waitFor(() => {
      const dataMetaText = document.getElementById("data-meta")?.textContent || "";
      expect(dataMetaText).toContain("approver=grace");
      expect(dataMetaText).toContain("Rows: 1");
    });

    expect(screen.getByRole("button", { name: "View PR JSON details for #901" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View PR JSON details for #902" })).not.toBeInTheDocument();
  });

  test("cycles focus within PR JSON modal with Tab and Shift+Tab", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Test focus trap",
                titleDisplay: "Test focus trap [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                updatedAt: "2026-06-16T12:00:00Z",
              },
              prDetail: { reviewDecision: "REVIEW_REQUIRED" },
              notes: { otherNotes: "focus test" },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T12:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    const openButton = await screen.findByRole("button", {
      name: "View PR JSON details for #101",
    });
    await user.click(openButton);

    const modal = await screen.findByRole("dialog", {
      name: "PR JSON Details",
    });
    expect(modal).toBeInTheDocument();

    const focusableElements = Array.from(
      modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusableElements.length).toBeGreaterThan(1);

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement.focus();
    expect(document.activeElement).toBe(firstElement);

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(lastElement);

    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(firstElement);
  });

  test("loads and displays action-log entries when a user opens the Action Log tab", async () => {
    initTestPage({
      actionEntries: [
        {
          triggeredAt: "2026-03-10T10:15:00Z",
          action: "backfill:start",
          ok: true,
          durationMs: 345,
          detail: { repo: "owner/repo", actor: "ahall236_uhg" },
        },
      ],
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Action Log" }));

    await waitFor(() => {
      expect(screen.getByText(/backfill:start/i)).toBeInTheDocument();
    });

    const actionLogCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/action-log" &&
        String(init?.method || "GET").toUpperCase() === "GET"
      );
    });

    expect(actionLogCall).toBeDefined();
    expect(document.getElementById("tab-panel-action-log").hidden).toBe(false);
  });

  test("given actor-name and login-alias entries exist, when a user opens Actor Names and saves changes, then both mapping endpoints are called", async () => {
    initTestPage({
      actorNameEntries: {
        ahall236_uhg: "Alison Hall",
      },
      actorLoginAliasEntries: {
        "alias-login": "canonical-login",
      },
    });

    const user = userEvent.setup();
    fetchMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Actor Names" }));

    await waitFor(() => {
      expect(
        document.querySelector(".actor-name-cache-row .actor-name-cache-id")?.value,
      ).toBe("ahall236_uhg");
      expect(
        document.querySelector(".actor-login-alias-row .actor-login-alias-id")?.value,
      ).toBe("alias-login");
    });

    const getCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/actor-name-cache" &&
        String(init?.method || "GET").toUpperCase() === "GET"
      );
    });
    expect(getCall).toBeDefined();

    const aliasGetCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/actor-login-aliases" &&
        String(init?.method || "GET").toUpperCase() === "GET"
      );
    });
    expect(aliasGetCall).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Add display-name row" }));

    const rows = Array.from(document.querySelectorAll(".actor-name-cache-row"));
    const newestRow = rows[rows.length - 1];
    const idInput = newestRow.querySelector(".actor-name-cache-id");
    const nameInput = newestRow.querySelector(".actor-name-cache-name");
    await user.type(idInput, "reviewer1");
    await user.type(nameInput, "Reviewer One");

    await user.click(screen.getByRole("button", { name: "Save display names" }));

    let putCall;
    await waitFor(() => {
      putCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/actor-name-cache" &&
          String(init?.method || "GET").toUpperCase() === "PUT"
        );
      });
      expect(putCall).toBeDefined();
    });

    const putBody = JSON.parse(String(putCall[1]?.body || "{}"));
    expect(putBody).toMatchObject({
      ahall236_uhg: "Alison Hall",
      reviewer1: "Reviewer One",
    });

    await user.click(screen.getByRole("button", { name: "Add alias row" }));

    const aliasRows = Array.from(document.querySelectorAll(".actor-login-alias-row"));
    const newestAliasRow = aliasRows[aliasRows.length - 1];
    const aliasInput = newestAliasRow.querySelector(".actor-login-alias-id");
    const canonicalInput = newestAliasRow.querySelector(".actor-login-alias-canonical");
    await user.type(aliasInput, "legacy-login");
    await user.type(canonicalInput, "canonical-login");

    await user.click(screen.getByRole("button", { name: "Save login aliases" }));

    let aliasPutCall;
    await waitFor(() => {
      aliasPutCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/actor-login-aliases" &&
          String(init?.method || "GET").toUpperCase() === "PUT"
        );
      });
      expect(aliasPutCall).toBeDefined();
    });

    const aliasPutBody = JSON.parse(String(aliasPutCall[1]?.body || "{}"));
    expect(aliasPutBody).toMatchObject({
      "alias-login": "canonical-login",
      "legacy-login": "canonical-login",
    });
  });

  test("posts to backfill start endpoint when a user starts backfill from the Backfill tab", async () => {
    const user = userEvent.setup();
    fetchMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Backfill" }));
    await user.click(screen.getByRole("button", { name: "Start backfill" }));

    await waitFor(() => {
      expect(screen.getAllByText(/Started background backfill/i).length).toBeGreaterThan(0);
    });

    const startCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/backfill/start" &&
        String(init?.method || "GET").toUpperCase() === "POST"
      );
    });

    expect(startCall).toBeDefined();
  });

  test("posts to backfill stop endpoint and renders stop output and log tail", async () => {
    // Use a stateful mock so the backfill status stays running after start.
    let backfillRunning = false;
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/user-defaults" && method === "GET") {
        return createOkJsonResponse({ ok: true, overrides: {} });
      }
      if (normalizedUrl === "/view-prs/user-defaults" && method === "PUT") {
        return createOkJsonResponse({ ok: true });
      }
      if (normalizedUrl === "/view-prs/data" && method === "GET") {
        return createOkJsonResponse({ ok: true, byPrNumber: {}, lastRun: null });
      }
      if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
        return { ok: false, status: 404, json: async () => ({ ok: false }) };
      }
      if (normalizedUrl === "/view-prs/backfill/start" && method === "POST") {
        backfillRunning = true;
        return createOkJsonResponse({
          ok: true,
          running: true,
          summary: "Started background backfill (PID: 321).",
          output: "Started background backfill (PID: 321).",
        });
      }
      if (normalizedUrl === "/view-prs/backfill/stop" && method === "POST") {
        backfillRunning = false;
        return createOkJsonResponse({
          ok: true,
          running: false,
          summary: "Stopped background backfill (PID: 321).",
          output: "Stopped background backfill (PID: 321).",
        });
      }
      if (normalizedUrl === "/view-prs/backfill" && method === "GET") {
        return createOkJsonResponse({
          ok: true,
          running: backfillRunning,
          summary: backfillRunning ? "Backfill: running" : "Backfill: not running",
          output: "",
        });
      }
      if (normalizedUrl.startsWith("/view-prs/backfill/log") && method === "GET") {
        return createOkJsonResponse({
          ok: true,
          summary: "Showing 2 log line(s)",
          tail: "line-1\nline-2",
        });
      }
      return createOkJsonResponse({ ok: true });
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Backfill" }));
    await user.click(screen.getByRole("button", { name: "Start backfill" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop backfill" })).toBeEnabled();
    });

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Stop backfill" }));

    let stopCall;
    await waitFor(() => {
      stopCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/backfill/stop" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(stopCall).toBeDefined();
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/Stopped background backfill/i).length,
      ).toBeGreaterThan(0);
    });

    const backfillLog = document.getElementById("backfill-log");
    expect(String(backfillLog?.textContent || "")).toContain("Showing 2 log line(s)");
    expect(String(backfillLog?.textContent || "")).toContain("line-1");
  });

  test("shows Request more only for all scope and posts the expected merged request payload", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "merged",
            prNumber: 100,
            overrides: {
              data: {
                title: "Merged PR row",
                titleDisplay: "Merged PR row [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/100",
                labels: [{ name: "bug" }],
                mergedAt: "2026-03-10T10:00:00Z",
                updatedAt: "2026-03-11T11:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-11T11:00:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Request more" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Request more" }));

    let requestMoreCall;
    await waitFor(() => {
      requestMoreCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/merged/request-more" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(requestMoreCall).toBeDefined();
    });

    expect(requestMoreCall).toBeDefined();
    const requestMorePayload = JSON.parse(String(requestMoreCall?.[1]?.body || "{}"));
    expect(requestMorePayload.repo).toBe("owner/repo");
    expect(requestMorePayload.count).toBe(30);
    expect(requestMorePayload.scanLimit).toBe(100);

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await user.selectOptions(document.getElementById("scope-mode"), "last-run");
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Request more" })).not.toBeInTheDocument();
    });
  });

  test("renders row-level in-review control for PRs returned from data fetch", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Render PR table row",
                titleDisplay: "Render PR table row [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-15T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-15T10:00:00Z" },
      }),
    });

    await waitFor(() => {
      expect(screen.getByLabelText("In Review for PR #101")).toBeInTheDocument();
    });

    const labelChip = document.querySelector(".labels-cell .label-chip");
    expect(labelChip?.textContent).toBe("bug");
  });

  test("opens PR JSON details in a dialog and closes it when a user presses Escape", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Inspect JSON modal",
                titleDisplay: "Inspect JSON modal [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const detailsButton = await screen.findByRole("button", {
      name: "View PR JSON details for #101",
    });

    await user.click(detailsButton);

    const dialog = await screen.findByRole("dialog", {
      name: "PR JSON Details",
    });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Close PR JSON details")).toHaveFocus();

    await waitFor(() => {
      expect(document.getElementById("pr-json-modal-subtitle")?.textContent).toContain(
        "PR #101 (owner/repo)",
      );
      expect(document.getElementById("pr-json-modal-content")?.textContent).toContain(
        "Data File Entry",
      );
      expect(document.getElementById("pr-json-modal-content")?.textContent).toContain(
        "PR Detail File",
      );
      expect(document.getElementById("pr-json-modal-content")?.textContent).toContain(
        "User State Entry",
      );
      expect(document.getElementById("pr-json-modal-content")?.textContent).toContain(
        "PR Diff",
      );
      expect(document.querySelector(".pr-json-diff")?.textContent).toContain(
        "console.log('hello');",
      );
      expect(
        screen.getByRole("button", {
          name: "Copy all PR JSON details for AI chat",
        }),
      ).toBeEnabled();
    });

    const diffCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "").startsWith("/view-prs/diff?") &&
        String(init?.method || "GET").toUpperCase() === "GET"
      );
    });
    expect(diffCall).toBeDefined();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "PR JSON Details" })).not.toBeInTheDocument();
    });
  });

  test("copies the combined PR JSON payload when a user clicks Copy all in the details dialog", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Copy all modal payload",
                titleDisplay: "Copy all modal payload [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    const clipboardWriteMock = jest.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteMock },
      configurable: true,
    });

    await user.click(
      await screen.findByRole("button", {
        name: "View PR JSON details for #101",
      }),
    );

    const copyAllButton = await screen.findByRole("button", {
      name: "Copy all PR JSON details for AI chat",
    });

    await waitFor(() => {
      expect(copyAllButton).toBeEnabled();
    });

    await user.click(copyAllButton);

    await waitFor(() => {
      expect(clipboardWriteMock).toHaveBeenCalledTimes(1);
      const copiedText = clipboardWriteMock.mock.calls[0]?.[0];
      expect(typeof copiedText).toBe("string");
      expect(copiedText).toContain("PR JSON Details for AI Review");
      expect(copiedText).toContain("Repo: owner/repo");
      expect(copiedText).toContain("PR Number: 101");
      expect(copiedText).toContain("Data File Entry (check-open-pr-updates.data.json)");
      expect(copiedText).toContain("PR Detail File (data/pr-details/<repo>__pr-<number>.json)");
      expect(copiedText).toContain("User State Entry (check-open-pr-updates.user-state.json)");
      expect(copiedText).toContain("PR Diff Metadata (data/pr-diffs/<repo>__pr-<number>.json)");
      expect(copiedText).toContain("PR Diff Text");
      expect(copiedText).toContain("```json");
      expect(copiedText).toContain("```diff");
      expect(copiedText).toContain("console.log('hello');");
    });

    await waitFor(() => {
      expect(copyAllButton).toHaveTextContent("Copied");
    });
  });

  test("closes the PR JSON details dialog when a user clicks on the modal backdrop", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Modal backdrop dismiss test",
                titleDisplay: "Modal backdrop dismiss test [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    const detailsButton = await screen.findByRole("button", {
      name: "View PR JSON details for #101",
    });

    await user.click(detailsButton);

    const dialog = await screen.findByRole("dialog", {
      name: "PR JSON Details",
    });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Close PR JSON details")).toHaveFocus();

    const backdropElement = document.getElementById("pr-json-modal");
    expect(backdropElement).toEqual(dialog);

    await user.click(backdropElement);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "PR JSON Details" })).not.toBeInTheDocument();
    });

    expect(detailsButton).toHaveFocus();
  });

  test("copies the diff text to clipboard when a user clicks Copy diff in the details modal", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Copy diff modal button test",
                titleDisplay: "Copy diff modal button test [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    const clipboardWriteMock = jest.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteMock },
      configurable: true,
    });

    await user.click(
      await screen.findByRole("button", {
        name: "View PR JSON details for #101",
      }),
    );

    const copyDiffButton = await screen.findByRole("button", {
      name: "Copy diff",
    });

    await waitFor(() => {
      expect(copyDiffButton).toBeVisible();
    });

    await user.click(copyDiffButton);

    await waitFor(() => {
      expect(clipboardWriteMock).toHaveBeenCalledTimes(1);
      const copiedText = clipboardWriteMock.mock.calls[0]?.[0];
      expect(typeof copiedText).toBe("string");
      expect(copiedText).toContain("diff --git");
      expect(copiedText).toContain("console.log('hello');");
    });

    await waitFor(() => {
      expect(copyDiffButton).toHaveTextContent("Copied");
    });
  });

  test("renders diff text in grouped collapsible file blocks that are open by default", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Grouped diff block test",
                titleDisplay: "Grouped diff block test [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const defaultFetchImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl.startsWith("/view-prs/diff?") && method === "GET") {
        return createOkJsonResponse({
          ok: true,
          source: "cache",
          stale: false,
          warning: "",
          commitFingerprint: "abc123",
          fetchedAt: "2026-06-16T10:00:00Z",
          filePath: "data/pr-diffs/owner__repo__pr-101.json",
          diffText: [
            "diff --git a/src/a.js b/src/a.js",
            "index 123..456 100644",
            "@@ -1 +1 @@",
            "-old line a",
            "+new line a",
            "diff --git a/src/b.js b/src/b.js",
            "index 789..999 100644",
            "@@ -2 +2 @@",
            "-old line b",
            "+new line b",
          ].join("\n"),
        });
      }

      return defaultFetchImpl(url, init);
    });

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "View PR JSON details for #101",
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "PR JSON Details" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(document.querySelectorAll(".pr-json-diff-file-block").length).toBe(2);
    });

    const fileBlocks = Array.from(document.querySelectorAll(".pr-json-diff-file-block"));
    expect(fileBlocks.every((block) => block.open === true)).toBe(true);

    const fileSummaries = fileBlocks
      .map((block) => String(block.querySelector("summary")?.textContent || ""))
      .join(" ");
    expect(fileSummaries).toContain("src/a.js -> src/a.js");
    expect(fileSummaries).toContain("src/b.js -> src/b.js");

    const fileBodiesText = fileBlocks
      .map((block) => String(block.querySelector(".pr-json-diff-file-body")?.textContent || ""))
      .join(" ");
    expect(fileBodiesText).toContain("new line a");
    expect(fileBodiesText).toContain("new line b");
  });

  test("toggles word-wrap in the diff viewer when a user clicks Wrap lines button", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Wrap diff toggle test",
                titleDisplay: "Wrap diff toggle test [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: "View PR JSON details for #101",
      }),
    );

    const wrapDiffButton = await screen.findByRole("button", {
      name: "Wrap lines",
    });

    await waitFor(() => {
      expect(wrapDiffButton).toBeVisible();
    });

    const diffContent = document.querySelector(".pr-json-diff");
    expect(diffContent).toBeInTheDocument();
    expect(diffContent).not.toHaveClass("is-wrapped");

    await user.click(wrapDiffButton);

    await waitFor(() => {
      expect(wrapDiffButton).toHaveTextContent("Unwrap lines");
      expect(diffContent).toHaveClass("is-wrapped");
    });

    await user.click(wrapDiffButton);

    await waitFor(() => {
      expect(wrapDiffButton).toHaveTextContent("Wrap lines");
      expect(diffContent).not.toHaveClass("is-wrapped");
    });
  });

  test("posts Clear action payload when a user clicks Clear button on a row", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 101,
            overrides: {
              data: {
                title: "Test Clear action",
                titleDisplay: "Test Clear action [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/101",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-16T10:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "needs follow-up",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const clearButton = await screen.findByRole("button", {
      name: /Clear/,
    });
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);

    await waitFor(() => {
      const ackCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/ack" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(ackCalls.length).toBeGreaterThan(0);

      const [, ackInit] = ackCalls[0];
      const ackBody = String(ackInit?.body || "");
      expect(ackBody).toContain('"repo":"owner/repo"');
      expect(ackBody).toContain('"ackClear":"101"');
    });
  });

  test("posts Update action payload when a user clicks Update button on a row", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 202,
            overrides: {
              data: {
                title: "Test Update action",
                titleDisplay: "Test Update action [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/202",
                labels: [{ name: "feature" }],
                updatedAt: "2026-06-16T11:00:00Z",
              },
              prDetail: {
                reviewDecision: "REVIEW_REQUIRED",
              },
              notes: {
                otherNotes: "ready for update",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T11:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const updateButton = await screen.findByRole("button", {
      name: /Update/,
    });
    expect(updateButton).toBeInTheDocument();

    await user.click(updateButton);

    await waitFor(() => {
      const runCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/run" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(runCalls.length).toBeGreaterThan(0);

      const [, runInit] = runCalls[0];
      const runBody = String(runInit?.body || "");
      expect(runBody).toContain('"repo":"owner/repo"');
      expect(runBody).toContain('"prNumber":"202"');
      expect(runBody).toContain('"openMode":"none"');
      expect(runBody).toContain('"quiet":true');
    });
  });

  test("shows failure status and snackbar when row Update request fails", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 203,
            overrides: {
              data: {
                title: "Test Update failure",
                titleDisplay: "Test Update failure [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/203",
                labels: [{ name: "feature" }],
                updatedAt: "2026-06-16T11:05:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T11:05:00Z" },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const baseFetch = fetchMock;
    const failingFetch = jest.fn(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();
      if (normalizedUrl === "/view-prs/run" && method === "POST") {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: "mock update failure" }),
        };
      }
      return baseFetch(url, init);
    });
    global.fetch = failingFetch;
    window.fetch = failingFetch;
    fetchMock = failingFetch;

    const updateButton = await screen.findByRole("button", {
      name: /Update/,
    });
    await user.click(updateButton);

    await waitFor(() => {
      expect(document.getElementById("status").textContent).toBe(
        "Failed to update PR #203",
      );
    });

    const snackbar = document.getElementById("error-snackbar");
    const snackbarMessage = document.getElementById("error-snackbar-message");
    expect(snackbar.hidden).toBe(false);
    expect(snackbarMessage.textContent).toContain("Update failed for PR #203");
  });

  test("given row toggles and ack action, when controls are clicked, then in-review, flagged, and ack payloads are posted", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 1,
            overrides: {
              data: {
                title: "PR one",
                titleDisplay: "PR one [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/1",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-15T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const sharedPrInput = document.getElementById("pr-numbers");
    sharedPrInput.value = "88,89";

    const inReviewToggle = await screen.findByLabelText("In Review for PR #1");
    await user.click(inReviewToggle);

    await waitFor(() => {
      const inReviewCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/ack" &&
          String(init?.method || "GET").toUpperCase() === "POST" &&
          String(init?.body || "").includes('"inReview":"1"')
        );
      });
      expect(inReviewCall).toBeDefined();
    });

    const flaggedToggle = await screen.findByLabelText("Flagged for PR #1");
    await user.click(flaggedToggle);

    await waitFor(() => {
      const flaggedCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/ack" &&
          String(init?.method || "GET").toUpperCase() === "POST" &&
          String(init?.body || "").includes('"flagged":"1"')
        );
      });
      expect(flaggedCall).toBeDefined();
    });

    const rowAckButton = screen
      .getAllByRole("button", { name: /ack/i })
      .find((button) => button.closest("table"));
    expect(rowAckButton).toBeDefined();

    await user.click(rowAckButton);

    await waitFor(() => {
      const ackCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/ack" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(ackCalls.length).toBeGreaterThanOrEqual(2);
    });

    const inReviewCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/ack" &&
        String(init?.method || "GET").toUpperCase() === "POST" &&
        String(init?.body || "").includes('"inReview":"1"')
      );
    });
    const rowAckCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/ack" &&
        String(init?.method || "GET").toUpperCase() === "POST" &&
        String(init?.body || "").includes('"ack":"1"')
      );
    });
    const flaggedCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/ack" &&
        String(init?.method || "GET").toUpperCase() === "POST" &&
        String(init?.body || "").includes('"flagged":"1"')
      );
    });

    expect(inReviewCall).toBeDefined();
    expect(flaggedCall).toBeDefined();
    expect(rowAckCall).toBeDefined();
    expect(document.getElementById("pr-numbers").value).toBe("88,89");
    expect(document.getElementById("status").textContent).toBe("Ack only completed");
  });

  test("posts notes payload and renders saved comment after a user saves notes", async () => {
    initTestPage({
      dataPayload: {
        byPrNumber: {
          1: {
            repo: "owner/repo",
            prNumber: "1",
            section: "open",
            data: {
              number: "1",
              url: "https://github.com/owner/repo/pull/1",
              status: "NO_CHANGE",
              approved: "NO",
              title: "PR with notes",
              titleDisplay: "PR with notes [CHK:PASS] [MRG:YES]",
              author: "octocat",
              labels: [{ name: "bug" }],
              updatedAt: "2026-06-15T10:00:00Z",
              inReview: false,
            },
            notes: undefined,
          },
        },
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      },
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const baseFetch = fetchMock;
    const savedNote = {
      id: "save-test-c1",
      author: "octocat",
      tone: "Positive",
      note: "LGTM",
    };
    fetchMock = jest.fn(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/notes" && method === "POST") {
        return createOkJsonResponse({
          ok: true,
          prData: {
            byPrNumber: {
              1: {
                repo: "owner/repo",
                prNumber: "1",
                section: "open",
                data: {
                  number: "1",
                  url: "https://github.com/owner/repo/pull/1",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "PR with notes",
                  titleDisplay: "PR with notes [CHK:PASS] [MRG:YES]",
                  author: "octocat",
                  labels: [{ name: "bug" }],
                  updatedAt: "2026-06-15T10:00:00Z",
                  inReview: false,
                },
                notes: {
                  comments: [savedNote],
                  otherNotes: "",
                  prDifficulty: "5",
                  rallyStories: [],
                  rallyLinks: [],
                  analysisOfPr: "Deep analysis for save test",
                },
              },
            },
            lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
          },
        });
      }

      return baseFetch(url, init);
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    const insightsButton = await screen.findByRole("button", {
      name: "More insights",
    });
    await user.click(insightsButton);

    const addCommentButton = await screen.findByRole("button", {
      name: "+ Add comment",
    });
    await user.click(addCommentButton);

    const notesSection = addCommentButton.closest(".pr-notes-section");
    expect(notesSection).toBeInTheDocument();

    const noteTextarea = notesSection.querySelector(".pr-notes-comment-note");
    expect(noteTextarea).toBeInTheDocument();
    await user.type(noteTextarea, "LGTM");

    const difficultySelect = screen.getByLabelText("PR difficulty");
    await user.selectOptions(difficultySelect, "5");

    const analysisTextarea = screen.getByLabelText("Analysis of PR");
    await user.type(analysisTextarea, "Deep analysis for save test");

    const saveNotesButton = screen.getByRole("button", { name: "Save notes" });
    expect(saveNotesButton).toBeEnabled();

    await user.click(saveNotesButton);

    await waitFor(() => {
      const notesCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/notes" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(notesCalls.length).toBeGreaterThan(0);
    });

    const notesCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/notes" &&
        String(init?.method || "GET").toUpperCase() === "POST"
      );
    });
    const notesPayload = JSON.parse(String(notesCall?.[1]?.body || "{}"));

    expect(notesPayload.prNumber).toBe("1");
    expect(notesPayload.prDifficulty).toBe("5");
    expect(notesPayload.analysisOfPr).toBe("Deep analysis for save test");
    expect(Array.isArray(notesPayload.comments)).toBe(true);
    expect(notesPayload.comments.length).toBeGreaterThan(0);
    expect(String(notesPayload.comments[0]?.note || "")).toContain("LGTM");

    await waitFor(() => {
      const savedRows = document.querySelectorAll(".pr-notes-comment-row");
      expect(savedRows.length).toBe(1);
    });
  });

  test("enables Save notes when only difficulty or rally fields are edited", async () => {
    const renderCleanNotesSection = async () => {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 1,
              overrides: {
                data: {
                  title: "PR with notes",
                  titleDisplay: "PR with notes [CHK:PASS] [MRG:YES]",
                  author: "octocat",
                  url: "https://github.com/owner/repo/pull/1",
                  labels: [{ name: "bug" }],
                  updatedAt: "2026-06-15T10:00:00Z",
                },
                notes: undefined,
              },
            },
          ],
          lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
          scheduler: {
            intervalMinutes: 15,
            manualCooldownMinutes: 15,
            isAutoRunInProgress: false,
          },
        }),
      });

      const localUser = userEvent.setup();
      const insightsButton = await screen.findByRole("button", {
        name: "More insights",
      });
      await localUser.click(insightsButton);

      const saveNotesButton = await screen.findByRole("button", {
        name: "Save notes",
      });
      expect(saveNotesButton).toBeDisabled();

      const notesSection = saveNotesButton.closest(".pr-notes-section");
      expect(notesSection).toBeInTheDocument();
      return {
        user: localUser,
        notesSection,
        saveNotesButton,
      };
    };

    {
      const { user, saveNotesButton } = await renderCleanNotesSection();
      const difficultySelect = screen.getByLabelText("PR difficulty");
      await user.selectOptions(difficultySelect, "4");
      expect(saveNotesButton).toBeEnabled();
    }

    {
      const { user, notesSection, saveNotesButton } = await renderCleanNotesSection();
      const rallyStoryInput = notesSection.querySelector(
        ".pr-notes-rally-story-input",
      );
      expect(rallyStoryInput).toBeInTheDocument();
      await user.type(rallyStoryInput, "US12345");
      expect(saveNotesButton).toBeEnabled();
    }

    {
      const { user, notesSection, saveNotesButton } = await renderCleanNotesSection();
      const rallyLinkInput = notesSection.querySelector(".pr-notes-rally-link-input");
      expect(rallyLinkInput).toBeInTheDocument();
      await user.type(rallyLinkInput, "https://rally.example/US12345");
      expect(saveNotesButton).toBeEnabled();
    }
  });

  test("excludes removed note from the next Save notes payload", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 1,
            overrides: {
              data: {
                title: "PR with removable notes",
                titleDisplay: "PR with removable notes [CHK:PASS] [MRG:YES]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/1",
                labels: [{ name: "bug" }],
                updatedAt: "2026-06-15T10:00:00Z",
              },
              notes: undefined,
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    const baseFetch = fetchMock;
    fetchMock = jest.fn(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (normalizedUrl === "/view-prs/notes" && method === "POST") {
        const postedBody = JSON.parse(String(init?.body || "{}"));
        return createOkJsonResponse({
          ok: true,
          prData: {
            byPrNumber: {
              1: {
                repo: "owner/repo",
                prNumber: "1",
                section: "open",
                data: {
                  number: "1",
                  url: "https://github.com/owner/repo/pull/1",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "PR with removable notes",
                  titleDisplay: "PR with removable notes [CHK:PASS] [MRG:YES]",
                  author: "octocat",
                  labels: [{ name: "bug" }],
                  updatedAt: "2026-06-15T10:00:00Z",
                  inReview: false,
                },
                notes: {
                  comments: postedBody.comments || [],
                  otherNotes: "",
                },
              },
            },
            lastRun: { repo: "owner/repo", updatedAt: "2026-03-10T10:15:00Z" },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
          },
        });
      }

      return baseFetch(url, init);
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    await user.click(await screen.findByRole("button", { name: "More insights" }));

    const addCommentButton = await screen.findByRole("button", {
      name: "+ Add comment",
    });
    await user.click(addCommentButton);
    await user.click(addCommentButton);

    const notesSection = addCommentButton.closest(".pr-notes-section");
    expect(notesSection).toBeInTheDocument();

    const removeButtons = notesSection.querySelectorAll(".pr-notes-comment-remove");
    expect(removeButtons.length).toBe(2);
    await user.click(removeButtons[0]);

    const saveNotesButton = screen.getByRole("button", { name: "Save notes" });
    await user.click(saveNotesButton);

    await waitFor(() => {
      const notesCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/notes" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      expect(notesCalls.length).toBeGreaterThan(0);
    });

    const latestNotesCall = fetchMock.mock.calls
      .slice()
      .reverse()
      .find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/notes" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
    const latestNotesPayload = JSON.parse(String(latestNotesCall?.[1]?.body || "{}"));

    expect(Array.isArray(latestNotesPayload.comments)).toBe(true);
    expect(latestNotesPayload.comments.length).toBe(1);
  });

  test("supports manual author comment save and inline edit in author insights", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 55,
            overrides: {
              data: {
                title: "Author manual comments test",
                titleDisplay: "Author manual comments test [CHK:PASS]",
                author: "Alison Hall",
                authorLogin: "ahall236_uhg",
                url: "https://github.com/owner/repo/pull/55",
                updatedAt: "2026-03-25T12:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-03-25T12:00:00Z" },
        actorsMap: {
          ahall236_uhg: "Alison Hall",
        },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });
    fetchMock.mockClear();

    let inMemoryComments = [];
    const baseFetch = fetchMock;
    fetchMock = jest.fn(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();

      if (
        normalizedUrl.startsWith("/view-prs/author-comments?") &&
        method === "GET"
      ) {
        return createOkJsonResponse({ ok: true, comments: inMemoryComments });
      }

      if (normalizedUrl === "/view-prs/author-comments" && method === "POST") {
        const postedBody = JSON.parse(String(init?.body || "{}"));
        inMemoryComments = [
          {
            id: "ac-1",
            note: String(postedBody.note || ""),
            sentiment: String(postedBody.sentiment || "neutral"),
            createdAt: "2026-06-03T10:00:00Z",
            updatedAt: "2026-06-03T10:00:00Z",
          },
        ];
        return createOkJsonResponse({ ok: true, comments: inMemoryComments });
      }

      if (normalizedUrl === "/view-prs/author-comments" && method === "PUT") {
        const updatedBody = JSON.parse(String(init?.body || "{}"));
        inMemoryComments = [
          {
            id: "ac-1",
            note: String(updatedBody.note || ""),
            sentiment: String(updatedBody.sentiment || "neutral"),
            createdAt: "2026-06-03T10:00:00Z",
            updatedAt: "2026-06-03T10:05:00Z",
          },
        ];
        return createOkJsonResponse({ ok: true, comments: inMemoryComments });
      }

      return baseFetch(url, init);
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;
  });

  test("loads backfill log tail when a user clicks Refresh log in the Backfill tab", async () => {
    const user = userEvent.setup();
    fetchMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Backfill" }));
    await user.click(screen.getByRole("button", { name: "Refresh log" }));

    await waitFor(() => {
      expect(screen.getByText(/line-1/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/line-2/i)).toBeInTheDocument();

    const logTailCall = fetchMock.mock.calls.find((call) => {
      const [url, init] = call;
      return (
        String(url || "").startsWith("/view-prs/backfill/log") &&
        String(init?.method || "GET").toUpperCase() === "GET"
      );
    });
    expect(logTailCall).toBeDefined();
  });

  test("re-fetches action-log entries when a user clicks Refresh in the Action Log tab", async () => {
    initTestPage({
      actionEntries: [
        {
          triggeredAt: "2026-03-10T10:16:00Z",
          action: "post/run-auto",
          ok: true,
          durationMs: 120,
          detail: { repo: "owner/repo" },
        },
      ],
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Action Log" }));
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByText(/post\/run-auto/i)).toBeInTheDocument();
    });

    const actionLogGetCalls = fetchMock.mock.calls.filter((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/action-log" &&
        String(init?.method || "GET").toUpperCase() === "GET"
      );
    });
    expect(actionLogGetCalls.length).toBeGreaterThanOrEqual(2);
  });

  test("generates and displays JSON export preview when a user clicks Preview in the Export tab", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 11,
            overrides: {
              data: {
                title: "Open PR",
                titleDisplay: "Open PR [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/11",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-approved",
            prNumber: 22,
            overrides: {
              section: "closed",
              data: {
                title: "Closed PR",
                titleDisplay: "Closed PR [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/22",
                updatedAt: "2026-06-16T09:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();
    fetchMock.mockClear();

    await user.click(screen.getByRole("tab", { name: "Export" }));

    const previewButton = screen.getByRole("button", { name: /preview/i });
    expect(previewButton).toBeInTheDocument();

    await user.click(previewButton);

    await waitFor(() => {
      const previewText = document.getElementById("export-preview");
      expect(previewText?.textContent).toBeTruthy();
      const parsed = JSON.parse(String(previewText?.textContent || "{}"));
      expect(parsed).toHaveProperty("prs");
    });

    const putCalls = fetchMock.mock.calls.filter((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/user-defaults" &&
        String(init?.method || "GET").toUpperCase() === "PUT"
      );
    });
    expect(putCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("copies export JSON to clipboard when a user clicks Copy JSON in the Export tab", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 11,
            overrides: {
              data: {
                title: "Test PR",
                titleDisplay: "Test PR [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/11",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    const clipboardWriteMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteMock },
      configurable: true,
    });

    await user.click(screen.getByRole("tab", { name: "Export" }));

    const copyButton = screen.getByRole("button", { name: /copy json/i });
    expect(copyButton).toBeInTheDocument();

    await user.click(copyButton);

    await waitFor(() => {
      expect(clipboardWriteMock).toHaveBeenCalled();
      const callArg = clipboardWriteMock.mock.calls[0]?.[0];
      expect(typeof callArg).toBe("string");
      const parsed = JSON.parse(callArg);
      expect(parsed).toHaveProperty("prs");
      expect(Array.isArray(parsed.prs)).toBe(true);
    });

    clipboardWriteMock.mockRestore?.();
  });

  test("downloads export JSON file when a user clicks Download JSON in the Export tab", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 11,
            overrides: {
              data: {
                title: "Download Test",
                titleDisplay: "Download Test [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/11",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    const createObjectURLMock = jest.fn(() => "blob:http://localhost/mock-uuid");
    const revokeObjectURLMock = jest.fn();
    Object.defineProperty(window.URL, "createObjectURL", {
      value: createObjectURLMock,
      configurable: true,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      value: revokeObjectURLMock,
      configurable: true,
    });

    // Mock anchor.click to capture the download attribute
    const clickedAnchors = [];
    HTMLAnchorElement.prototype.click = function () {
      clickedAnchors.push(this);
    };

    await user.click(screen.getByRole("tab", { name: "Export" }));

    const downloadButton = screen.getByRole("button", { name: /download json/i });
    expect(downloadButton).toBeInTheDocument();

    await user.click(downloadButton);

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalled();
      expect(clickedAnchors.length).toBeGreaterThan(0);
      const anchor = clickedAnchors[clickedAnchors.length - 1];
      expect(anchor.download).toMatch(/view-prs-export.*\.json/);
      expect(anchor.href).toContain("blob:");
    });

    expect(revokeObjectURLMock).toHaveBeenCalled();
  });

  test("export field selections are persisted to user-defaults and only expanded-section rows appear in the preview", async () => {
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 11,
            overrides: {
              notes: { otherNotes: "open note" },
              data: {
                title: "Open PR for export",
                titleDisplay: "Open PR for export [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/11",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-approved",
            prNumber: 22,
            overrides: {
              section: "closed",
              notes: { otherNotes: "closed note" },
              data: {
                title: "Closed PR for export",
                titleDisplay: "Closed PR for export [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/22",
                updatedAt: "2026-06-16T09:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("tab", { name: "Export" }));

    await waitFor(() => {
      const fieldList = document.getElementById("export-field-list");
      expect(fieldList?.querySelectorAll("input[type='checkbox']").length).toBeGreaterThan(0);
    });

    const fieldList = document.getElementById("export-field-list");
    const allCheckboxes = Array.from(fieldList.querySelectorAll("input[type='checkbox']"));
    allCheckboxes.forEach((cb) => {
      cb.checked = false;
    });

    const prNumberCheckbox = allCheckboxes.find(
      (cb) => cb.getAttribute("data-export-field-id") === "data:prNumber",
    );
    const otherNotesCheckbox = allCheckboxes.find(
      (cb) =>
        cb.getAttribute("data-export-field-id") ===
        "user-state:notesByPrNumber.otherNotes",
    );
    expect(prNumberCheckbox).toBeDefined();
    expect(otherNotesCheckbox).toBeDefined();
    prNumberCheckbox.checked = true;
    otherNotesCheckbox.checked = true;

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: /preview/i }));

    await waitFor(() => {
      const previewEl = document.getElementById("export-preview");
      expect(previewEl?.textContent).toBeTruthy();
    });

    const putCalls = fetchMock.mock.calls.filter((call) => {
      const [url, init] = call;
      return (
        String(url || "") === "/view-prs/user-defaults" &&
        String(init?.method || "GET").toUpperCase() === "PUT"
      );
    });
    expect(putCalls.length).toBeGreaterThanOrEqual(1);
    const lastPutBody = JSON.parse(
      String(putCalls[putCalls.length - 1]?.[1]?.body || "{}"),
    );
    expect(lastPutBody["export-data-fields"]).toEqual(["prNumber"]);
    expect(lastPutBody["export-user-state-fields"]).toEqual([
      "notesByPrNumber.otherNotes",
    ]);

    const previewEl = document.getElementById("export-preview");
    const parsed = JSON.parse(String(previewEl?.textContent || "{}"));
    const exportedNumbers = Array.isArray(parsed?.prs)
      ? parsed.prs.map((item) => String(item?.prNumber ?? ""))
      : [];
    expect(exportedNumbers).toContain("11");
    expect(exportedNumbers).not.toContain("22");
  });

  test("export field checkboxes are restored from user-defaults on rerender", async () => {
    const savedOverrides = {
      "export-data-fields": ["prNumber"],
      "export-user-state-fields": ["notesByPrNumber.otherNotes"],
    };

    initTestPage({
      userDefaultsOverrides: savedOverrides,
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 11,
            overrides: {
              notes: { otherNotes: "open note" },
              data: {
                title: "Restore fields test",
                titleDisplay: "Restore fields test [CHK:PASS]",
                author: "octocat",
                url: "https://github.com/owner/repo/pull/11",
                updatedAt: "2026-06-16T10:00:00Z",
              },
            },
          },
        ],
        lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
      }),
    });

    const user = userEvent.setup();

    await waitFor(() => {
      const defaultsCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/user-defaults" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      expect(defaultsCall).toBeDefined();
    });

    await user.click(screen.getByRole("tab", { name: "Run & Filter" }));
    await user.click(screen.getByRole("button", { name: "Apply filters (local)" }));

    await user.click(screen.getByRole("tab", { name: "Export" }));

    await waitFor(() => {
      const fieldList = document.getElementById("export-field-list");
      expect(fieldList?.querySelectorAll("input[type='checkbox']").length).toBeGreaterThan(0);
    });

    const fieldList = document.getElementById("export-field-list");
    const allCheckboxes = Array.from(fieldList.querySelectorAll("input[type='checkbox']"));

    const prNumberCheckbox = allCheckboxes.find(
      (cb) => cb.getAttribute("data-export-field-id") === "data:prNumber",
    );
    const otherNotesCheckbox = allCheckboxes.find(
      (cb) =>
        cb.getAttribute("data-export-field-id") ===
        "user-state:notesByPrNumber.otherNotes",
    );
    const sectionCheckbox = allCheckboxes.find(
      (cb) => cb.getAttribute("data-export-field-id") === "data:section",
    );

    expect(prNumberCheckbox).toBeDefined();
    expect(otherNotesCheckbox).toBeDefined();

    await waitFor(() => {
      expect(
        document.getElementById("export-field-list")?.querySelector(
          "input[data-export-field-id='data:prNumber']",
        )?.checked,
      ).toBe(true);
    });

    expect(otherNotesCheckbox?.checked).toBe(true);
    if (sectionCheckbox) {
      expect(sectionCheckbox.checked).toBe(false);
    }
  });

  test("backfill log auto-scrolls to bottom when running and auto-scroll is enabled", async () => {
    initTestPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Backfill" }));

    // Force a running status refresh in-test to avoid startup timing races.
    const defaultImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url, init = {}) => {
      const normalizedUrl = String(url || "");
      const method = String(init?.method || "GET").toUpperCase();
      if (normalizedUrl === "/view-prs/backfill" && method === "GET") {
        return createOkJsonResponse({
          ok: true,
          running: true,
          pid: 321,
          summary: "Running",
          logFile: "/tmp/backfill.log",
          pidFile: "/tmp/backfill.pid",
          error: "",
        });
      }
      return defaultImpl(url, init);
    });

    await user.click(screen.getByRole("button", { name: "Refresh status" }));

    await waitFor(() => {
      const statusCall = fetchMock.mock.calls.find((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/backfill" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      expect(statusCall).toBeDefined();
    });

    const backfillLog = document.getElementById("backfill-log");
    Object.defineProperty(backfillLog, "scrollHeight", {
      get: () => 4321,
      configurable: true,
    });
    backfillLog.scrollTop = 0;

    const autoscrollToggle = document.getElementById("backfill-log-autoscroll");
    autoscrollToggle.checked = true;

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "Refresh log" }));

    await waitFor(() => {
      expect(backfillLog.scrollTop).toBe(4321);
    });
  });

  test("backfill log does not auto-scroll when the auto-scroll toggle is disabled", async () => {
    initTestPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Backfill" }));

    await waitFor(() => {
      expect(document.getElementById("backfill-log")).toBeInTheDocument();
    });

    const backfillLog = document.getElementById("backfill-log");
    backfillLog.scrollTop = 0;

    const autoscrollToggle = document.getElementById("backfill-log-autoscroll");
    autoscrollToggle.checked = false;

    await user.click(screen.getByRole("button", { name: "Refresh log" }));

    await waitFor(() => {
      expect(screen.getByText(/line-1/i)).toBeInTheDocument();
    });

    expect(backfillLog.scrollTop).toBe(0);
  });

  test("backfill log does not auto-scroll when backfill is not running", async () => {
    initTestPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Backfill" }));

    await waitFor(() => {
      expect(document.getElementById("backfill-log")).toBeInTheDocument();
    });

    const backfillLog = document.getElementById("backfill-log");
    Object.defineProperty(backfillLog, "scrollHeight", {
      get: () => 9999,
      configurable: true,
    });
    backfillLog.scrollTop = 0;

    // Default mock returns running: false, so isBackfillRunning stays false.
    const autoscrollToggle = document.getElementById("backfill-log-autoscroll");
    autoscrollToggle.checked = true;

    await user.click(screen.getByRole("button", { name: "Refresh log" }));

    await waitFor(() => {
      expect(screen.getByText(/line-1/i)).toBeInTheDocument();
    });

    expect(backfillLog.scrollTop).toBe(0);
  });

  test("falls back to full data polling after the first /view-prs/data-meta 404", async () => {
    const originalSetInterval = global.setInterval;
    let pollForDataChangesCallback = null;

    global.setInterval = jest.fn((callback, intervalMs) => {
      if (intervalMs === 30000 && !pollForDataChangesCallback) {
        pollForDataChangesCallback = callback;
      }
      return 1;
    });

    try {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "seed-version",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Fallback polling test",
                    titleDisplay: "Fallback polling test [CHK:PASS]",
                    author: "octocat",
                    url: "https://github.com/owner/repo/pull/101",
                    updatedAt: "2026-06-16T10:00:00Z",
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof pollForDataChangesCallback).toBe("function");

      fetchMock.mockClear();
      let dataFallbackCalls = 0;

      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false, error: "Not found" }),
          };
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          dataFallbackCalls += 1;
          return createOkJsonResponse({
            ok: true,
            dataMeta: {
              dataVersion: `fallback-version-${dataFallbackCalls}`,
            },
            byPrNumber: {
              101: {
                repo: "owner/repo",
                prNumber: "101",
                section: "open",
                data: {
                  number: "101",
                  url: "https://github.com/owner/repo/pull/101",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "Fallback polling test",
                  titleDisplay: `Fallback polling test [CHK:PASS:${dataFallbackCalls}]`,
                  author: "octocat",
                  labels: [],
                  updatedAt: "2026-06-16T10:00:00Z",
                  inReview: false,
                },
              },
            },
            lastRun: {
              repo: "owner/repo",
              updatedAt: "2026-06-16T10:00:00Z",
            },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await pollForDataChangesCallback();
      await pollForDataChangesCallback();

      const metaCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-meta" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      const dataCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });

      expect(metaCalls.length).toBe(1);
      expect(dataCalls.length).toBe(2);
    } finally {
      global.setInterval = originalSetInterval;
    }
  });

  test("given polling recovers after a transient failure, when the next poll succeeds, then auto-refresh warning snackbar is cleared", async () => {
    const originalSetInterval = global.setInterval;
    let pollForDataChangesCallback = null;

    global.setInterval = jest.fn((callback, intervalMs) => {
      if (intervalMs === 30000 && !pollForDataChangesCallback) {
        pollForDataChangesCallback = callback;
      }
      return 1;
    });

    try {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "seed-version",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Polling warning recovery",
                    titleDisplay: "Polling warning recovery [CHK:PASS]",
                    author: "octocat",
                    url: "https://github.com/owner/repo/pull/101",
                    updatedAt: "2026-06-16T10:00:00Z",
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof pollForDataChangesCallback).toBe("function");

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "seed-version",
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await pollForDataChangesCallback();

      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          throw new Error("net::ERR_NETWORK_CHANGED");
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await pollForDataChangesCallback();

      const snackbar = document.getElementById("error-snackbar");
      const snackbarMessage = document.getElementById("error-snackbar-message");
      expect(snackbar).not.toHaveAttribute("hidden");
      expect(String(snackbar?.className || "")).toContain("error-snackbar-warning");
      expect(String(snackbarMessage?.textContent || "")).toContain(
        "Auto-refresh warning",
      );
      expect(String(snackbarMessage?.textContent || "")).toContain(
        "Last successful check:",
      );
      expect(String(snackbarMessage?.textContent || "")).toContain("Last error at:");

      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "seed-version",
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await pollForDataChangesCallback();

      expect(snackbar).toHaveAttribute("hidden");
    } finally {
      global.setInterval = originalSetInterval;
    }
  });

  test("skips full data fetch when polling sees an unchanged data version", async () => {
    const originalSetInterval = global.setInterval;
    let pollForDataChangesCallback = null;

    global.setInterval = jest.fn((callback, intervalMs) => {
      if (intervalMs === 30000 && !pollForDataChangesCallback) {
        pollForDataChangesCallback = callback;
      }
      return 1;
    });

    try {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "seed-version",
          },
          byPrNumber: {
            101: {
              repo: "owner/repo",
              prNumber: "101",
              section: "open",
              data: {
                number: "101",
                url: "https://github.com/owner/repo/pull/101",
                status: "NO_CHANGE",
                approved: "NO",
                title: "Unchanged polling seed",
                titleDisplay: "Unchanged polling seed [CHK:PASS]",
                author: "octocat",
                labels: [],
                updatedAt: "2026-06-16T10:00:00Z",
                inReview: false,
              },
            },
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
        },
      });

      expect(typeof pollForDataChangesCallback).toBe("function");

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "seed-version",
          });
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            byPrNumber: {},
            lastRun: null,
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await pollForDataChangesCallback();

      const metaCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-meta" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      const dataCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });

      expect(metaCalls.length).toBe(1);
      expect(dataCalls.length).toBe(0);
    } finally {
      global.setInterval = originalSetInterval;
    }
  });

  test("rerenders visible PR cells when polling detects non-status data changes", async () => {
    const originalSetInterval = global.setInterval;
    let pollForDataChangesCallback = null;

    global.setInterval = jest.fn((callback, intervalMs) => {
      if (intervalMs === 30000 && !pollForDataChangesCallback) {
        pollForDataChangesCallback = callback;
      }
      return 1;
    });

    try {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "fingerprint-v1",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Fingerprint rerender one",
                    titleDisplay: "CHK-RERENDER-1",
                    author: "author-alpha-001",
                    url: "https://github.com/owner/repo/pull/101",
                    baseline: "2030-01-01T00:00:00Z",
                    updatedAt: "2026-06-16T10:00:00Z",
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof pollForDataChangesCallback).toBe("function");
      await waitFor(() => {
        const row = document.querySelector(
          "#pr-sections .pr-group-section-content table tbody tr",
        );
        expect(row).toBeTruthy();
      });
      const firstMainRowTextBefore = String(
        document.querySelector("#pr-sections .pr-group-section-content table tbody tr")
          ?.textContent || "",
      );

      fetchMock.mockClear();
      let dataCallCount = 0;
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "fingerprint-rerender-v2",
          });
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          dataCallCount += 1;
          return createOkJsonResponse({
            ok: true,
            dataMeta: {
              dataVersion: "fingerprint-rerender-v2",
            },
            byPrNumber: {
              101: {
                repo: "owner/repo",
                prNumber: "101",
                section: "open",
                data: {
                  number: "101",
                  url: "https://github.com/owner/repo/pull/101",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "Fingerprint rerender two",
                  titleDisplay: "CHK-RERENDER-2",
                  author: "author-beta-002",
                  labels: [],
                  baseline: "2030-01-01T00:00:00Z",
                  updatedAt: "2026-06-16T10:30:00Z",
                  inReview: false,
                },
              },
            },
            lastRun: {
              repo: "owner/repo",
              updatedAt: "2026-06-16T10:30:00Z",
            },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await pollForDataChangesCallback();

      let firstMainRowTextAfter = "";
      await waitFor(() => {
        firstMainRowTextAfter = String(
          document.querySelector("#pr-sections .pr-group-section-content table tbody tr")
            ?.textContent || "",
        );
        expect(firstMainRowTextAfter).toContain("author-beta-002");
      });
      expect(firstMainRowTextBefore).not.toEqual(firstMainRowTextAfter);
      expect(dataCallCount).toBe(1);

      const metaCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-meta" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      const dataCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });

      expect(metaCalls.length).toBe(1);
      expect(dataCalls.length).toBe(1);
    } finally {
      global.setInterval = originalSetInterval;
    }
  });

  test("given review conversations view controls changed, when polling rerenders the row, then filter mode and summaries toggle remain selected", async () => {
    const originalSetInterval = global.setInterval;
    let pollForDataChangesCallback = null;

    global.setInterval = jest.fn((callback, intervalMs) => {
      if (intervalMs === 30000 && !pollForDataChangesCallback) {
        pollForDataChangesCallback = callback;
      }
      return 1;
    });

    const buildPayload = ({
      dataVersion,
      titleDisplay,
      updatedAt,
      warningThreadCount,
    }) => ({
      ok: true,
      dataMeta: {
        dataVersion,
      },
      byPrNumber: {
        101: {
          repo: "owner/repo",
          prNumber: "101",
          section: "open",
          data: {
            number: "101",
            url: "https://github.com/owner/repo/pull/101",
            status: "NO_CHANGE",
            approved: "NO",
            title: "Review state persistence",
            titleDisplay,
            author: "PR Author",
            authorLogin: "pr-author",
            labels: [],
            baseline: "2030-01-01T00:00:00Z",
            updatedAt,
            inReview: false,
            comments: [
              {
                id: "top-level-1",
                createdAt: "2026-06-16T09:59:00Z",
                authorLogin: "reviewer-one",
                authorName: "Reviewer One",
                body: "Top-level summary comment.",
                url: "https://github.com/owner/repo/pull/101#issuecomment-1",
              },
            ],
            reviewThreads: [
              {
                id: "thread-open-1",
                isResolved: false,
                participants: ["reviewer-one", "pr-author"],
                comments: [
                  {
                    id: "open-comment-1",
                    createdAt: "2026-06-16T09:58:00Z",
                    authorLogin: "reviewer-one",
                    authorName: "Reviewer One",
                    body: "Please update this test case.",
                    url: "https://github.com/owner/repo/pull/101#discussion_r_open",
                  },
                ],
              },
              {
                id: "thread-resolved-1",
                isResolved: true,
                resolvedByLogin: "reviewer-one",
                participants: ["reviewer-one", "pr-author"],
                comments: [
                  {
                    id: "resolved-comment-1",
                    createdAt: "2026-06-16T10:01:00Z",
                    authorLogin: "reviewer-one",
                    authorName: "Reviewer One",
                    body: "Looks good now.",
                    url: "https://github.com/owner/repo/pull/101#discussion_r_resolved",
                  },
                ],
              },
              ...Array.from({ length: warningThreadCount }).map((_, index) => ({
                id: `thread-author-warning-${index + 1}`,
                isResolved: true,
                resolvedByLogin: "pr-author",
                participants: ["reviewer-one", "pr-author"],
                comments: [
                  {
                    id: `warning-comment-${index + 1}`,
                    createdAt: `2026-06-16T10:0${index + 2}:00Z`,
                    authorLogin: "reviewer-one",
                    authorName: "Reviewer One",
                    body: `Warning thread ${index + 1}`,
                    url: `https://github.com/owner/repo/pull/101#discussion_r_warning_${index + 1}`,
                  },
                ],
              })),
            ],
          },
        },
      },
      actorsMap: {
        "pr-author": "PR Author",
        "reviewer-one": "Reviewer One",
      },
      lastRun: { repo: "owner/repo", updatedAt },
      scheduler: {
        intervalMinutes: 15,
        manualCooldownMinutes: 15,
        isAutoRunInProgress: false,
      },
    });

    try {
      initTestPage({
        dataPayload: buildPayload({
          dataVersion: "review-state-v1",
          titleDisplay: "Review state persistence [CHK:PASS:1]",
          updatedAt: "2026-06-16T10:00:00Z",
          warningThreadCount: 1,
        }),
      });

      expect(typeof pollForDataChangesCallback).toBe("function");

      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByText("#101")).toBeInTheDocument();
      });

      const row = screen.getByText("#101").closest("tr");
      await user.click(row?.querySelector(".row-insights-toggle"));

      const reviewSectionSelector =
        '.row-insights-content details.insight-section[data-insight-key="review-conversations"]';
      const activitySectionSelector =
        '.row-insights-content details.insight-section[data-insight-key="activity sequence"]';
      const getReviewSection = () => document.querySelector(reviewSectionSelector);
      const getActivitySection = () => document.querySelector(activitySectionSelector);
      await waitFor(() => {
        expect(getReviewSection()).toBeTruthy();
        expect(getActivitySection()).toBeTruthy();
      });

      await user.click(getReviewSection()?.querySelector("summary"));
      await user.click(getActivitySection()?.querySelector("summary"));

      const resolvedButtonSelector =
        ".insight-thread-filter-btn:nth-child(3)";
      const summaryToggleSelector = ".insight-thread-summary-toggle-btn";

      await user.click(getReviewSection()?.querySelector(resolvedButtonSelector));
      await user.click(getReviewSection()?.querySelector(summaryToggleSelector));

      expect(
        String(getReviewSection()?.querySelector(summaryToggleSelector)?.textContent || ""),
      ).toBe("Summaries: Off");
      expect(
        String(getReviewSection()?.querySelector(resolvedButtonSelector)?.className || ""),
      ).toContain("insight-thread-filter-btn-active");
      expect(String(getReviewSection()?.textContent || "")).toContain("Resolved thread");
      expect(String(getReviewSection()?.textContent || "")).not.toContain("Open thread");
      expect(String(getActivitySection()?.textContent || "")).not.toContain(
        "Thread: resolved",
      );
      expect(String(getActivitySection()?.textContent || "")).not.toContain(
        "Thread: open",
      );

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "review-state-v2",
          });
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          return createOkJsonResponse(
            buildPayload({
              dataVersion: "review-state-v2",
              titleDisplay: "Review state persistence [CHK:PASS:2]",
              updatedAt: "2026-06-16T10:30:00Z",
              warningThreadCount: 2,
            }),
          );
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await pollForDataChangesCallback();

      await waitFor(() => {
        expect(screen.getByText("#101")).toBeInTheDocument();
      });

      const refreshedRow = screen.getByText("#101").closest("tr");
      const refreshedToggle = refreshedRow?.querySelector(".row-insights-toggle");
      expect(refreshedToggle?.getAttribute("aria-expanded")).toBe("true");

      const refreshedReviewSection = getReviewSection();
      const refreshedActivitySection = getActivitySection();
      expect(refreshedReviewSection?.open).toBe(true);
      expect(refreshedActivitySection?.open).toBe(true);
      expect(
        String(
          refreshedReviewSection?.querySelector(summaryToggleSelector)?.textContent || "",
        ),
      ).toBe("Summaries: Off");
      expect(
        String(
          refreshedReviewSection?.querySelector(resolvedButtonSelector)?.className || "",
        ),
      ).toContain("insight-thread-filter-btn-active");
      expect(String(refreshedReviewSection?.textContent || "")).toContain(
        "Resolved thread",
      );
      expect(String(refreshedReviewSection?.textContent || "")).not.toContain(
        "Open thread",
      );
      expect(String(refreshedActivitySection?.textContent || "")).not.toContain(
        "Thread: resolved",
      );
      expect(String(refreshedActivitySection?.textContent || "")).not.toContain(
        "Thread: open",
      );
    } finally {
      global.setInterval = originalSetInterval;
    }
  });

  test("uses manifest and delta polling endpoints when supported", async () => {
    const originalSetInterval = global.setInterval;
    let pollForDataChangesCallback = null;

    global.setInterval = jest.fn((callback, intervalMs) => {
      if (intervalMs === 30000 && !pollForDataChangesCallback) {
        pollForDataChangesCallback = callback;
      }
      return 1;
    });

    try {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "seed-version",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Manifest delta seed",
                    titleDisplay: "Manifest delta seed [CHK:PASS]",
                    author: "octocat",
                    url: "https://github.com/owner/repo/pull/101",
                    updatedAt: "2026-06-16T10:00:00Z",
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof pollForDataChangesCallback).toBe("function");

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            supportsDataManifest: true,
            dataVersion: "manifest-delta-v2",
          });
        }

        if (normalizedUrl === "/view-prs/data-manifest" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataMeta: { dataVersion: "manifest-delta-v2" },
            manifest: {
              101: {
                rowVersion: "changed-v2",
                section: "open",
                updatedAt: "2026-06-16T10:30:00Z",
                repo: "owner/repo",
              },
            },
          });
        }

        if (normalizedUrl === "/view-prs/data-delta" && method === "POST") {
          return createOkJsonResponse({
            ok: true,
            byPrNumber: {
              101: {
                repo: "owner/repo",
                prNumber: "101",
                section: "open",
                data: {
                  number: "101",
                  url: "https://github.com/owner/repo/pull/101",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "Manifest delta updated",
                  titleDisplay: "Manifest delta updated [CHK:PASS]",
                  author: "octocat",
                  labels: [],
                  updatedAt: "2026-06-16T10:30:00Z",
                  inReview: false,
                },
              },
            },
            missingPrNumbers: [],
            dataMeta: { dataVersion: "manifest-delta-v2" },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
            lastRun: {
              repo: "owner/repo",
              updatedAt: "2026-06-16T10:30:00Z",
            },
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        if (normalizedUrl === "/view-prs/user-defaults" && method === "GET") {
          return createOkJsonResponse({ ok: true, overrides: {} });
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            byPrNumber: {},
            lastRun: null,
          });
        }

        return createOkJsonResponse({ ok: true });
      });

      await pollForDataChangesCallback();

      const metaCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-meta" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      const manifestCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-manifest" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });
      const deltaCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data-delta" &&
          String(init?.method || "GET").toUpperCase() === "POST"
        );
      });
      const fullDataCalls = fetchMock.mock.calls.filter((call) => {
        const [url, init] = call;
        return (
          String(url || "") === "/view-prs/data" &&
          String(init?.method || "GET").toUpperCase() === "GET"
        );
      });

      expect(metaCalls.length).toBe(1);
      expect(manifestCalls.length).toBe(1);
      expect(deltaCalls.length).toBe(1);
      expect(fullDataCalls.length).toBe(0);

      const deltaCallBody = String(deltaCalls[0]?.[1]?.body || "");
      expect(deltaCallBody).toContain("101");
    } finally {
      global.setInterval = originalSetInterval;
    }
  });

  test("preserves expanded insights panel and open inner sections after polling rerenders", async () => {
    const originalSetInterval = global.setInterval;
    let pollForDataChangesCallback = null;

    global.setInterval = jest.fn((callback, intervalMs) => {
      if (intervalMs === 30000 && !pollForDataChangesCallback) {
        pollForDataChangesCallback = callback;
      }
      return 1;
    });

    try {
      initTestPage({
        dataPayload: {
          dataMeta: {
            dataVersion: "insights-seed-v1",
          },
          ...createMultiPrPayload({
            prs: [
              {
                scenario: "open-no-change",
                prNumber: 101,
                overrides: {
                  data: {
                    title: "Insights preservation test",
                    titleDisplay: "Insights preservation test [CHK:PASS]",
                    author: "octocat",
                    authorLogin: "octocat",
                    url: "https://github.com/owner/repo/pull/101",
                    updatedAt: "2026-06-16T10:00:00Z",
                    reviews: [
                      {
                        id: "rev-1",
                        authorLogin: "reviewer-one",
                        state: "APPROVED",
                        submittedAt: "2026-06-15T09:00:00Z",
                        body: "LGTM",
                        url: "https://github.com/owner/repo/pull/101#r1",
                        commitOid: "abc123",
                      },
                    ],
                  },
                },
              },
            ],
            lastRun: { repo: "owner/repo", updatedAt: "2026-06-16T10:00:00Z" },
          }),
        },
      });

      expect(typeof pollForDataChangesCallback).toBe("function");

      const insightsToggle = await screen.findByRole("button", {
        name: "More insights",
      });
      const user = userEvent.setup();
      await user.click(insightsToggle);

      await waitFor(() => {
        expect(
          document.querySelector(".row-insights-toggle[aria-expanded='true']"),
        ).toBeTruthy();
      });

      const insightsPanel = document.querySelector(".row-insights-content");
      expect(insightsPanel).toBeTruthy();
      const activityDetails = Array.from(
        insightsPanel.querySelectorAll("details[data-insight-key]"),
      ).find(
        (d) => d.getAttribute("data-insight-key") === "activity sequence",
      );
      expect(activityDetails).toBeTruthy();
      activityDetails.open = true;
      if (typeof activityDetails.setAttribute === "function") {
        activityDetails.setAttribute("open", "");
      }

      fetchMock.mockClear();
      fetchMock.mockImplementation(async (url, init = {}) => {
        const normalizedUrl = String(url || "");
        const method = String(init?.method || "GET").toUpperCase();

        if (normalizedUrl === "/view-prs/data-meta" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataVersion: "insights-seed-v2",
          });
        }

        if (normalizedUrl === "/view-prs/data" && method === "GET") {
          return createOkJsonResponse({
            ok: true,
            dataMeta: { dataVersion: "insights-seed-v2" },
            byPrNumber: {
              101: {
                repo: "owner/repo",
                prNumber: "101",
                section: "open",
                data: {
                  number: "101",
                  url: "https://github.com/owner/repo/pull/101",
                  status: "NO_CHANGE",
                  approved: "NO",
                  title: "Insights preservation test",
                  titleDisplay: "Insights preservation test [CHK:PASS:2]",
                  author: "octocat",
                  authorLogin: "octocat",
                  labels: [],
                  updatedAt: "2026-06-16T10:30:00Z",
                  inReview: false,
                  reviews: [
                    {
                      id: "rev-1",
                      authorLogin: "reviewer-one",
                      state: "APPROVED",
                      submittedAt: "2026-06-15T09:00:00Z",
                      body: "LGTM",
                      url: "https://github.com/owner/repo/pull/101#r1",
                      commitOid: "abc123",
                    },
                  ],
                },
              },
            },
            lastRun: {
              repo: "owner/repo",
              updatedAt: "2026-06-16T10:30:00Z",
            },
            scheduler: {
              intervalMinutes: 15,
              manualCooldownMinutes: 15,
              isAutoRunInProgress: false,
            },
          });
        }

        if (normalizedUrl === "/view-prs/scheduler" && method === "GET") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false }),
          };
        }

        return createOkJsonResponse({ ok: true });
      });

      await pollForDataChangesCallback();

      await waitFor(() => {
        const toggle = document.querySelector(".row-insights-toggle");
        expect(toggle?.getAttribute("aria-expanded")).toBe("true");
      });

      const insightsPanelAfter = document.querySelector(
        ".row-insights-content",
      );
      expect(insightsPanelAfter).toBeTruthy();
      const activityDetailsAfter = Array.from(
        insightsPanelAfter.querySelectorAll("details[data-insight-key]"),
      ).find(
        (d) => d.getAttribute("data-insight-key") === "activity sequence",
      );
      expect(activityDetailsAfter).toBeTruthy();
      expect(activityDetailsAfter.open).toBe(true);
    } finally {
      global.setInterval = originalSetInterval;
    }
  });

  test("author insights resolve display names and closed or merged sections sort by timestamps", async () => {
    initTestPage({
      dataPayload: {
        ok: true,
        byPrNumber: {
          55: {
            repo: "owner/repo",
            prNumber: "55",
            section: "open",
            updatedAt: "2026-03-25T12:00:00Z",
            rowOrder: 0,
            data: {
              number: "55",
              title: "Author insight coverage",
              titleDisplay: "Author insight coverage [CHK:PASS][MRG:YES]",
              url: "https://example.com/55",
              status: "NO_CHANGE",
              approved: "NO",
              author: "ahall236_uhg",
              authorLogin: "ahall236_uhg",
              labels: [],
              updatedAt: "2026-03-25T12:00:00Z",
            },
            notes: {
              comments: [
                {
                  id: "note-1",
                  author: "ahall236_uhg",
                  createdAt: "2026-03-24T10:00:00Z",
                  tone: "Positive",
                  note: "Older PR-linked comment",
                },
              ],
            },
          },
          56: {
            repo: "owner/repo",
            prNumber: "56",
            section: "open",
            updatedAt: "2026-03-24T12:00:00Z",
            rowOrder: 1,
            data: {
              number: "56",
              title: "Author insight newer comment",
              titleDisplay: "Author insight newer comment [CHK:PASS][MRG:YES]",
              url: "https://example.com/56",
              status: "CHANGED",
              approved: "NO",
              author: "ahall236_uhg",
              authorLogin: "ahall236_uhg",
              labels: [],
              updatedAt: "2026-03-24T12:00:00Z",
            },
            notes: {
              comments: [
                {
                  id: "note-2",
                  author: "ahall236_uhg",
                  createdAt: "2026-03-25T11:00:00Z",
                  tone: "Neutral",
                  note: "Newer PR-linked comment",
                },
              ],
            },
          },
          57: {
            repo: "owner/repo",
            prNumber: "57",
            section: "open",
            updatedAt: "2026-03-26T14:30:00Z",
            rowOrder: 2,
            data: {
              number: "57",
              title: "Author insight fallback date",
              titleDisplay: "Author insight fallback date [CHK:PASS][MRG:YES]",
              url: "https://example.com/57",
              status: "NO_CHANGE",
              approved: "NO",
              author: "ahall236_uhg",
              authorLogin: "ahall236_uhg",
              labels: [],
              updatedAt: "2026-03-26T14:30:00Z",
            },
            notes: {
              comments: [
                {
                  id: "note-3",
                  author: "ahall236_uhg",
                  tone: "Negative",
                  note: "Fallback timestamp PR-linked comment",
                },
              ],
            },
          },
        },
        actorsMap: {
          ahall236_uhg: "Alison Hall",
          no_prs_author: "No PR Author",
        },
        lastRun: {
          repo: "owner/repo",
          updatedAt: "2026-03-25T12:00:00Z",
        },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      },
      authorCommentsGetHandler: () =>
        createOkJsonResponse({
          ok: true,
          comments: [
            {
              id: "manual-1",
              note: "Older manual comment",
              sentiment: "negative",
              createdAt: "2026-03-24T09:00:00Z",
            },
            {
              id: "manual-2",
              note: "Newer manual comment",
              sentiment: "positive",
              createdAt: "2026-03-25T09:00:00Z",
            },
          ],
        }),
    });

    const user = userEvent.setup();

    const authorInsightsTab = screen.getByRole("tab", { name: "Author Insights" });
    await user.click(authorInsightsTab);

    await waitFor(() => {
      const authorSelect = document.getElementById("author-insights")?.querySelector("select");
      expect(authorSelect?.options?.[0]?.textContent).toContain("Alison Hall");
    });

    const authorInsightsHost = document.getElementById("author-insights");
    const authorSelect = authorInsightsHost?.querySelector("select");

    expect(authorSelect?.options?.[0]?.textContent).toContain("Alison Hall");

    const optionsText = Array.from(authorSelect?.options || [])
      .map((opt) => opt.textContent)
      .join("|");
    expect(optionsText).toContain("No PR Author");

    const authorInsightsHeader = authorInsightsHost?.querySelector(".author-insights-selected");
    expect(authorInsightsHeader?.textContent).toContain("Showing insights for Alison Hall");

    const prLinkedSection = Array.from(
      document.querySelectorAll("#author-insights .author-insights-section"),
    ).find((section) =>
      section.querySelector("h3")?.textContent === "PR-linked custom comments and sentiment",
    );
    const firstPrLinkedItemMetaTexts = Array.from(
      prLinkedSection?.querySelectorAll(".author-insights-item .author-insights-meta") || [],
    )
      .slice(0, 2)
      .map((node) => node.textContent || "");
    expect(
      firstPrLinkedItemMetaTexts.some((text) => text.includes("Author: Alison Hall")),
    ).toBe(true);
    expect(
      firstPrLinkedItemMetaTexts.some((text) =>
        text.includes("Added: Mar 26, 2026 10:30 AM"),
      ),
    ).toBe(true);
    const sentimentBadge = authorInsightsHost?.querySelector(
      ".author-insights-badge-sentiment-positive",
    );
    expect(sentimentBadge?.textContent).toContain("Sentiment: Positive");
    const statusBadge = authorInsightsHost?.querySelector(
      ".author-insights-badge-status-no-change",
    );
    expect(statusBadge?.textContent).toContain("Status: NO_CHANGE");

    await waitFor(() => {
      const manualSection = Array.from(
        document.querySelectorAll("#author-insights .author-insights-section"),
      ).find((section) => section.querySelector("h3")?.textContent === "Manual author comments");
      const manualBodies = Array.from(
        manualSection?.querySelectorAll(".author-insights-item .author-insights-body") || [],
      );
      expect(manualBodies.length).toBeGreaterThan(1);
    });

    const manualSection = Array.from(
      document.querySelectorAll("#author-insights .author-insights-section"),
    ).find((section) => section.querySelector("h3")?.textContent === "Manual author comments");
    const manualBodies = Array.from(
      manualSection?.querySelectorAll(".author-insights-item .author-insights-body") || [],
    ).map((node) => node.textContent?.trim());
    expect(manualBodies[0]).toBe("Newer manual comment");

    const prLinkedBodies = Array.from(
      prLinkedSection?.querySelectorAll(".author-insights-item .author-insights-body") || [],
    ).map((node) => node.textContent?.trim());
    expect(prLinkedBodies[0]).toBe("Fallback timestamp PR-linked comment");
    expect(prLinkedBodies[1]).toBe("Newer PR-linked comment");
    const prLinkedMetaTexts = Array.from(
      prLinkedSection?.querySelectorAll(".author-insights-item .author-insights-meta") || [],
    ).map((node) => node.textContent || "");
    expect(
      prLinkedMetaTexts.some((text) => text.includes("Added: Mar 26, 2026 10:30 AM")),
    ).toBe(true);
    expect(
      prLinkedMetaTexts.some((text) => text.includes("Added: Mar 25, 2026 7:00 AM")),
    ).toBe(true);

    // Test closed/merged timestamp sorting with a fresh page initialization
    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-changes-requested",
            prNumber: 300,
            overrides: {
              section: "closed",
              updatedAt: "2026-03-10T09:00:00Z",
              rowOrder: 5,
              data: {
                title: "PR 300 closed",
                titleDisplay: "PR 300 closed",
                url: "https://example.com/300",
                author: "test_author",
                authorLogin: "test_author",
                closedAt: "2026-03-10T09:00:00Z",
                updatedAt: "2026-03-10T09:00:00Z",
              },
            },
          },
          {
            scenario: "open-changes-requested",
            prNumber: 400,
            overrides: {
              section: "closed",
              updatedAt: "2026-03-11T09:00:00Z",
              rowOrder: 6,
              data: {
                title: "PR 400 closed",
                titleDisplay: "PR 400 closed",
                url: "https://example.com/400",
                author: "test_author",
                authorLogin: "test_author",
                closedAt: "2026-03-11T09:00:00Z",
                updatedAt: "2026-03-11T09:00:00Z",
              },
            },
          },
          {
            scenario: "open-approved",
            prNumber: 100,
            overrides: {
              section: "merged",
              updatedAt: "2026-03-10T10:00:00Z",
              rowOrder: 1,
              data: {
                title: "PR 100 merged",
                titleDisplay: "PR 100 merged",
                url: "https://example.com/100",
                author: "test_author",
                authorLogin: "test_author",
                mergedAt: "2026-03-10T10:00:00Z",
                updatedAt: "2026-03-10T10:00:00Z",
              },
            },
          },
          {
            scenario: "open-approved",
            prNumber: 200,
            overrides: {
              section: "merged",
              updatedAt: "2026-03-11T10:00:00Z",
              rowOrder: 2,
              data: {
                title: "PR 200 merged",
                titleDisplay: "PR 200 merged",
                url: "https://example.com/200",
                author: "test_author",
                authorLogin: "test_author",
                mergedAt: "2026-03-11T10:00:00Z",
                updatedAt: "2026-03-11T10:00:00Z",
              },
            },
          },
        ],
        actorsMap: { test_author: "Test Author" },
        lastRun: {
          repo: "owner/repo",
          updatedAt: "2026-03-11T11:00:00Z",
        },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
    });

    await waitFor(() => {
      const closedPrsSection = Array.from(
        document.querySelectorAll(".pr-group-section"),
      ).find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"));
      expect(closedPrsSection).toBeTruthy();
    });

    const closedPrsSection = Array.from(
      document.querySelectorAll(".pr-group-section"),
    ).find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"));

    const mergedPrsSection = Array.from(
      document.querySelectorAll(".pr-group-section"),
    ).find((s) => s.querySelector("summary")?.textContent?.includes("Latest Merged"));

    // Verify closed PRs sorted by closedAt descending (400 before 300)
    const closedPrLinks = Array.from(
      closedPrsSection?.querySelectorAll("a.pr-link") || [],
    );
    const closedPrNumbers = closedPrLinks
      .map((link) => link.textContent.trim())
      .filter((text) => /^#\d+$/.test(text));
    expect(closedPrNumbers[0]).toBe("#400");

    // Verify merged PRs sorted by mergedAt descending (200 before 100)
    const mergedPrLinks = Array.from(
      mergedPrsSection?.querySelectorAll("a.pr-link") || [],
    );
    const mergedPrNumbers = mergedPrLinks
      .map((link) => link.textContent.trim())
      .filter((text) => /^#\d+$/.test(text));
    expect(mergedPrNumbers[0]).toBe("#200");

    await user.click(screen.getByRole("tab", { name: "Author Insights" }));

    await waitFor(() => {
      const authorSelect = document.getElementById("author-insights")?.querySelector("select");
      expect(authorSelect?.options?.[0]?.textContent).toContain("Test Author");
    });

    const createdSection = Array.from(
      document.querySelectorAll("#author-insights .author-insights-section"),
    ).find((section) => section.querySelector("h3")?.textContent === "PRs created by this author");
    expect(createdSection).toBeTruthy();

    const createdItems = Array.from(
      createdSection?.querySelectorAll(".author-insights-item") || [],
    );
    const createdItemOrder = createdItems.map((item) =>
      item.querySelector(".author-insights-link")?.textContent?.trim().split(" ")[0],
    );
    expect(createdItemOrder.slice(0, 4)).toEqual(["#200", "#400", "#100", "#300"]);
    const closedCreatedItem = createdItems.find((item) =>
      item.querySelector(".author-insights-link")?.textContent?.includes("#400"),
    );
    const mergedCreatedItem = createdItems.find((item) =>
      item.querySelector(".author-insights-link")?.textContent?.includes("#200"),
    );

    expect(
      closedCreatedItem?.querySelector(".author-insights-badge-status-closed")?.textContent,
    ).toContain("Status: CLOSED");
    expect(
      mergedCreatedItem?.querySelector(".author-insights-badge-status-merged")?.textContent,
    ).toContain("Status: MERGED");

    // Re-init with changed rowOrder to verify timestamp-based sort persists
    initTestPage({
      dataPayload: {
        ok: true,
        byPrNumber: {
          300: {
            repo: "owner/repo",
            prNumber: "300",
            section: "closed",
            updatedAt: "2026-03-10T09:00:00Z",
            rowOrder: 20,
            data: {
              number: "300",
              title: "PR 300 closed",
              titleDisplay: "PR 300 closed",
              url: "https://example.com/300",
              status: "CHANGES_REQUESTED",
              approved: "NO",
              author: "test_author",
              authorLogin: "test_author",
              labels: [],
              closedAt: "2026-03-10T09:00:00Z",
              updatedAt: "2026-03-10T09:00:00Z",
            },
          },
          400: {
            repo: "owner/repo",
            prNumber: "400",
            section: "closed",
            updatedAt: "2026-03-11T09:00:00Z",
            rowOrder: 1,
            data: {
              number: "400",
              title: "PR 400 closed",
              titleDisplay: "PR 400 closed",
              url: "https://example.com/400",
              status: "CHANGES_REQUESTED",
              approved: "NO",
              author: "test_author",
              authorLogin: "test_author",
              labels: [],
              closedAt: "2026-03-11T09:00:00Z",
              updatedAt: "2026-03-11T09:00:00Z",
            },
          },
          100: {
            repo: "owner/repo",
            prNumber: "100",
            section: "merged",
            updatedAt: "2026-03-10T10:00:00Z",
            rowOrder: 20,
            data: {
              number: "100",
              title: "PR 100 merged",
              titleDisplay: "PR 100 merged",
              url: "https://example.com/100",
              status: "NO_CHANGE",
              approved: "YES",
              author: "test_author",
              authorLogin: "test_author",
              labels: [],
              mergedAt: "2026-03-10T10:00:00Z",
              updatedAt: "2026-03-10T10:00:00Z",
            },
          },
          200: {
            repo: "owner/repo",
            prNumber: "200",
            section: "merged",
            updatedAt: "2026-03-11T10:00:00Z",
            rowOrder: 1,
            data: {
              number: "200",
              title: "PR 200 merged",
              titleDisplay: "PR 200 merged",
              url: "https://example.com/200",
              status: "NO_CHANGE",
              approved: "YES",
              author: "test_author",
              authorLogin: "test_author",
              labels: [],
              mergedAt: "2026-03-11T10:00:00Z",
              updatedAt: "2026-03-11T10:00:00Z",
            },
          },
        },
        actorsMap: { test_author: "Test Author" },
        lastRun: {
          repo: "owner/repo",
          updatedAt: "2026-03-11T11:30:00Z",
        },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      },
    });

    await waitFor(() => {
      const closedTable = Array.from(
        document.querySelectorAll(".pr-group-section"),
      )
        .find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"))
        ?.querySelector("table");
      const firstClosedLink = closedTable?.querySelector("a.pr-link");
      expect(firstClosedLink?.textContent).toBe("#400");
    });

    const closedTableAfter = Array.from(
      document.querySelectorAll(".pr-group-section"),
    )
      .find((s) => s.querySelector("summary")?.textContent?.includes("Closed PRs"))
      ?.querySelector("table");
    const firstClosedLinkAfter = closedTableAfter?.querySelector("a.pr-link");
    expect(firstClosedLinkAfter?.textContent).toBe("#400");

    const mergedTableAfter = Array.from(
      document.querySelectorAll(".pr-group-section"),
    )
      .find((s) => s.querySelector("summary")?.textContent?.includes("Latest Merged"))
      ?.querySelector("table");
    const firstMergedLinkAfter = mergedTableAfter?.querySelector("a.pr-link");
    expect(firstMergedLinkAfter?.textContent).toBe("#200");
  });

  test("author insights composer draft survives async rerender while author comments finish loading", async () => {
    let resolveAuthorComments;
    const authorCommentsResponse = new Promise((resolve) => {
      resolveAuthorComments = resolve;
    });

    initTestPage({
      dataPayload: createMultiPrPayload({
        prs: [
          {
            scenario: "open-no-change",
            prNumber: 55,
            overrides: {
              updatedAt: "2026-03-25T12:00:00Z",
              rowOrder: 0,
              data: {
                title: "Author insight draft retention",
                titleDisplay: "Author insight draft retention [CHK:PASS][MRG:YES]",
                url: "https://example.com/55",
                author: "ahall236_uhg",
                authorLogin: "ahall236_uhg",
                mergedAt: "2026-03-25T11:00:00Z",
                updatedAt: "2026-03-25T12:00:00Z",
              },
            },
          },
        ],
        actorsMap: {
          ahall236_uhg: "Alison Hall",
        },
        lastRun: {
          repo: "owner/repo",
          updatedAt: "2026-03-25T12:00:00Z",
        },
        scheduler: {
          intervalMinutes: 15,
          manualCooldownMinutes: 15,
          isAutoRunInProgress: false,
        },
      }),
      authorCommentsGetHandler: () => authorCommentsResponse,
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Author Insights" }));

    let commentInput;
    await waitFor(() => {
      commentInput = document.querySelector(
        ".author-insights-comment-textarea[data-draft-kind=\"composer\"]",
      );
      expect(commentInput).toBeTruthy();
    });

    await user.type(commentInput, "Draft survives rerender");

    resolveAuthorComments(
      createOkJsonResponse({ ok: true, comments: [] }),
    );

    await waitFor(() => {
      const refreshedInput = document.querySelector(
        ".author-insights-comment-textarea[data-draft-kind=\"composer\"]",
      );
      expect(refreshedInput?.value).toBe("Draft survives rerender");
    });
  });

  test("form parsing applies credential hints to filter inputs without changing field names", () => {
    initTestPage();

    const repoField = document.getElementById("repo");
    expect(repoField.name).toBe("repo");
    expect(repoField.getAttribute("data-lpignore")).toBe("true");
    expect(repoField.getAttribute("data-1p-ignore")).toBe("true");
    expect(repoField.getAttribute("data-bwignore")).toBe("true");
    expect(repoField.getAttribute("autocomplete")).toBe("off");
    expect(repoField.getAttribute("autocapitalize")).toBe("off");
    expect(repoField.getAttribute("autocorrect")).toBe("off");
    expect(repoField.getAttribute("spellcheck")).toBe("false");
    expect(repoField.getAttribute("data-form-type")).toBe("other");

    // Verify field names are preserved (not overridden)
    expect(repoField.name).toBe("repo");

    const prNumbersField = document.getElementById("pr-numbers");
    expect(prNumbersField.name).toBe("prNumbers");
    expect(prNumbersField.getAttribute("data-lpignore")).toBe("true");

    const limitField = document.getElementById("limit");
    expect(limitField.name).toBe("limit");
    expect(limitField.getAttribute("data-1p-ignore")).toBe("true");
  });

  test("activity timeline only shows dates and dashes for weekdays without activity, skipping weekends", async () => {
    // Regression test for buildActivityTimelineSummary() weekends-filtering behavior.
    //
    // Test timeline spans a full week (Mon-Sun):
    // - Monday 2026-06-15: has activity (comment)
    // - Tuesday 2026-06-16: has activity (commit)
    // - Wed-Fri 2026-06-17-19: no activity, weekdays → should be shown with "-" dash
    // - Saturday 2026-06-20: no activity, weekend → should be SKIPPED
    // - Sunday 2026-06-21: no activity, weekend → should be SKIPPED
    //
    // Date.now() is mocked to today (Sunday 2026-06-21), so for an open PR the
    // timeline extends from today back to the oldest activity (Monday 2026-06-15).
    const nowSpy = jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-06-21T10:00:00Z").getTime());

    try {
      initTestPage({
        dataPayload: createMultiPrPayload({
          prs: [
            {
              scenario: "open-no-change",
              prNumber: 123,
              overrides: {
                data: {
                  title: "Activity timeline test",
                  titleDisplay: "Activity timeline test [CHK:PASS]",
                  url: "https://example.com/123",
                  author: "Test Author",
                  authorLogin: "test-author",
                  updatedAt: "2026-06-21T12:00:00Z",
                  baseline: "2026-06-15T10:00:00Z",
                  // Activity on Monday (2026-06-15) and Tuesday (2026-06-16)
                  activityTimeline: [
                    {
                      date: "2026-06-15",
                      actor: "test-author",
                      type: "comment",
                      count: 1,
                      latestAt: "2026-06-15T10:00:00Z",
                    },
                    {
                      date: "2026-06-16",
                      actor: "test-author",
                      type: "commit",
                      count: 1,
                      latestAt: "2026-06-16T12:00:00Z",
                    },
                  ],
                },
              },
            },
          ],
          actorsMap: {
            "test-author": "Test Author",
          },
          lastRun: { repo: "owner/repo", updatedAt: "2026-06-21T10:00:00Z" },
        }),
      });
      const user = userEvent.setup();

      const prLink = await screen.findByText("#123");
      const row = prLink.closest("tr");
      const insightsToggle = row?.querySelector(".row-insights-toggle");

      await user.click(insightsToggle);

      // Find the activity timeline table in the insights
      const insightsRow = row?.nextElementSibling;
      const timelineTable = insightsRow?.querySelector("table");
      expect(timelineTable).toBeTruthy();

      const rows = Array.from(timelineTable?.querySelectorAll("tr") || []);
      const dateTexts = rows.map((tr) => tr.querySelector("td")?.textContent?.trim());

      // The timeline extends from 2026-06-21 (today) back to 2026-06-15 (oldest activity date)
      // Should include:
      // - Monday 2026-06-15 (has activity, so show)
      // - Tuesday 2026-06-16 (has activity, so show)
      // - Wednesday 2026-06-17 (no activity, weekday, so show)
      // - Thursday 2026-06-18 (no activity, weekday, so show)
      // - Friday 2026-06-19 (no activity, weekday, so show)
      // Should NOT include:
      // - Saturday 2026-06-20 (no activity, weekend, so skip)
      // - Sunday 2026-06-21 (no activity, weekend, so skip)

      expect(dateTexts).toContain("2026-06-15");
      expect(dateTexts).toContain("2026-06-16");
      expect(dateTexts).toContain("2026-06-17");
      expect(dateTexts).toContain("2026-06-18");
      expect(dateTexts).toContain("2026-06-19");
      expect(dateTexts).not.toContain("2026-06-20"); // Saturday
      expect(dateTexts).not.toContain("2026-06-21"); // Sunday
    } finally {
      nowSpy.mockRestore();
    }
  });
});
