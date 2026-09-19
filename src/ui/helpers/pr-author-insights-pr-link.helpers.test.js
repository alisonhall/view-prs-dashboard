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
