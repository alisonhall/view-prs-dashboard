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

describe("pr author insights pr-link helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("navigateToPrInTable", () => {
    test("given PR number, when navigating, then activates data tab", () => {
      const activateDataTab = jest.fn();
      const collectNodesByTag = jest.fn().mockReturnValue([]);
      const helpers = createPrAuthorInsightsPrLinkHelpers({
        activateDataTab,
        collectNodesByTag,
      });

      helpers.navigateToPrInTable("123", null, { activateDataTab, collectNodesByTag });

      expect(activateDataTab).toHaveBeenCalledWith("pr-data");
    });

    test("given missing dependencies, when navigating, then warning logged", () => {
      const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
      const helpers = createPrAuthorInsightsPrLinkHelpers();

      helpers.navigateToPrInTable("123", null, {});

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

      helpers.navigateToPrInTable("123", null, { activateDataTab, collectNodesByTag });

      setTimeout(() => {
        expect(mockPrLink.scrollIntoView).toHaveBeenCalledWith({
          behavior: "smooth",
          block: "center",
        });
        expect(mockPrLink.focus).toHaveBeenCalled();
        done();
      }, 10);
    });

    test("given two repos with the same PR number, when navigating with a repo, then only that repo's link is scrolled to (PR numbers are only unique within a repo)", (done) => {
      const makePrLink = (repo) => {
        const cell = document.createElement("td");
        cell.className = "pr-number-cell";
        cell.setAttribute("data-repo", repo);
        const link = document.createElement("a");
        link.className = "pr-link";
        link.textContent = "#123";
        link.scrollIntoView = jest.fn();
        link.focus = jest.fn();
        cell.appendChild(link);
        document.body.appendChild(cell);
        return link;
      };

      const wrongRepoLink = makePrLink("owner/repo-a");
      const correctRepoLink = makePrLink("owner/repo-b");

      const activateDataTab = jest.fn();
      const collectNodesByTag = jest.fn().mockReturnValue([wrongRepoLink, correctRepoLink]);
      const helpers = createPrAuthorInsightsPrLinkHelpers({
        activateDataTab,
        collectNodesByTag,
      });

      helpers.navigateToPrInTable("123", "owner/repo-b", { activateDataTab, collectNodesByTag });

      setTimeout(() => {
        expect(correctRepoLink.scrollIntoView).toHaveBeenCalled();
        expect(wrongRepoLink.scrollIntoView).not.toHaveBeenCalled();
        done();
      }, 10);
    });
  });
});
