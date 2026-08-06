/**
 * PR Link Helpers Contract Tests
 * 
 * Validates that PR link and navigation helpers work correctly.
 *
 * @jest-environment jsdom
 */

const {
  createPrAuthorInsightsPrLinkHelpers,
} = require("./pr-author-insights-pr-link.helpers.js");
const { createPrRowEntry } = require("../test-fixtures/pr-row.fixtures.js");

describe("pr author insights pr-link helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("createAuthorInsightsPrLink", () => {
    test("given PR entry, when creating link, then external link and table button rendered", () => {
      const helpers = createPrAuthorInsightsPrLinkHelpers({
        DEFAULT_REPO: "owner/repo",
      });
      const entry = createPrRowEntry({
        prNumber: "123",
        repo: "owner/repo",
        data: {
          number: "123",
          title: "Test PR",
          url: "https://github.com/owner/repo/pull/123",
        },
      });

      const container = helpers.createAuthorInsightsPrLink(entry);

      expect(container.tagName).toBe("DIV");
      const link = container.querySelector("a.author-insights-link");
      expect(link).toBeTruthy();
      expect(link.textContent).toBe("#123 Test PR");
      expect(link.href).toBe("https://github.com/owner/repo/pull/123");

      const button = container.querySelector("button.author-insights-table-link");
      expect(button).toBeTruthy();
      expect(button.textContent).toBe("View in table");
    });

    test("given entry without URL, when creating link, then GitHub URL generated from repo", () => {
      const helpers = createPrAuthorInsightsPrLinkHelpers({
        DEFAULT_REPO: "owner/repo",
      });
      const entry = createPrRowEntry({
        prNumber: "456",
        repo: "custom/repo",
        data: {
          number: "456",
          title: "Another PR",
          url: "",
        },
      });

      const container = helpers.createAuthorInsightsPrLink(entry);
      const link = container.querySelector("a.author-insights-link");

      expect(link.href).toBe("https://github.com/custom/repo/pull/456");
    });

    test("given entry with titleDisplay, when creating link, then title display used", () => {
      const helpers = createPrAuthorInsightsPrLinkHelpers({
        DEFAULT_REPO: "owner/repo",
      });
      const entry = createPrRowEntry({
        prNumber: "789",
        data: {
          number: "789",
          title: "",
          titleDisplay: "Test PR [CHK:PASS]",
        },
      });

      const container = helpers.createAuthorInsightsPrLink(entry);
      const link = container.querySelector("a.author-insights-link");

      expect(link.textContent).toBe("#789 Test PR [CHK:PASS]");
    });
  });

  describe("navigateToPrInTable", () => {
    test("given PR number, when navigating, then activates data tab", () => {
      const activateDataTab = jest.fn();
      const collectNodesByTag = jest.fn().mockReturnValue([]);
      const helpers = createPrAuthorInsightsPrLinkHelpers({
        activateDataTab,
        collectNodesByTag,
      });

      helpers.navigateToPrInTable("123", { activateDataTab, collectNodesByTag });

      expect(activateDataTab).toHaveBeenCalledWith("pr-data");
    });

    test("given missing dependencies, when navigating, then warning logged", () => {
      const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
      const helpers = createPrAuthorInsightsPrLinkHelpers();

      helpers.navigateToPrInTable("123", {});

      expect(consoleWarn).toHaveBeenCalledWith(
        "Navigation dependencies not provided",
      );
      consoleWarn.mockRestore();
    });

    test("given PR link exists, when navigating, then link scrolled into view", (done) => {
      const mockPrLink = document.createElement("a");
      mockPrLink.className = "pr-link";
      mockPrLink.textContent = "#123";
      mockPrLink.scrollIntoView = jest.fn();
      mockPrLink.focus = jest.fn();
      document.body.appendChild(mockPrLink);

      const activateDataTab = jest.fn();
      const collectNodesByTag = jest.fn().mockReturnValue([mockPrLink]);
      const helpers = createPrAuthorInsightsPrLinkHelpers({
        activateDataTab,
        collectNodesByTag,
      });

      helpers.navigateToPrInTable("123", { activateDataTab, collectNodesByTag });

      setTimeout(() => {
        expect(mockPrLink.scrollIntoView).toHaveBeenCalledWith({
          behavior: "smooth",
          block: "center",
        });
        expect(mockPrLink.focus).toHaveBeenCalled();
        done();
      }, 10);
    });
  });
});
