const {
  createPrReactFilterDropdownsHelpers,
} = require("./pr-react-filter-dropdowns.helpers.js");

describe("pr react filter dropdowns helpers", () => {
  const makeInput = (value) => ({ value });

  describe("populateFilterDropdownsForCurrentPayload", () => {
    test("given both the repo and PR-numbers inputs exist, when called, then derives the run context from their trimmed values and re-runs the viewer filter setup with it", () => {
      const repoInput = makeInput("  owner/repo  ");
      const filterPrNumbersInput = makeInput(" 12,34 ");
      const getOptionalElementById = jest.fn((id) => {
        if (id === "repo") return repoInput;
        if (id === "filter-pr-numbers") return filterPrNumbersInput;
        return null;
      });
      const deriveRunPrDataContext = jest.fn(() => ({
        allEntries: [{ prNumber: "1" }],
        repoFilter: "owner/repo",
      }));
      const deriveViewerFilterSetup = jest.fn();

      const { populateFilterDropdownsForCurrentPayload } = createPrReactFilterDropdownsHelpers({
        getOptionalElementById,
        deriveRunPrDataContext,
        deriveViewerFilterSetup,
      });

      const payload = { byPrNumber: {} };
      populateFilterDropdownsForCurrentPayload(payload, "owner/repo");

      expect(deriveRunPrDataContext).toHaveBeenCalledWith({
        payload,
        selectedRepo: "owner/repo",
        inputRepo: "owner/repo",
        filterPrNumbersRaw: "12,34",
      });
      expect(deriveViewerFilterSetup).toHaveBeenCalledWith({
        payload,
        allEntries: [{ prNumber: "1" }],
        repoFilter: "owner/repo",
      });
    });

    test("given the repo input is missing, when called, then does not derive context or run the viewer filter setup", () => {
      const getOptionalElementById = jest.fn((id) =>
        id === "filter-pr-numbers" ? makeInput("") : null,
      );
      const deriveRunPrDataContext = jest.fn();
      const deriveViewerFilterSetup = jest.fn();

      const { populateFilterDropdownsForCurrentPayload } = createPrReactFilterDropdownsHelpers({
        getOptionalElementById,
        deriveRunPrDataContext,
        deriveViewerFilterSetup,
      });

      populateFilterDropdownsForCurrentPayload({}, "owner/repo");

      expect(deriveRunPrDataContext).not.toHaveBeenCalled();
      expect(deriveViewerFilterSetup).not.toHaveBeenCalled();
    });

    test("given the PR-numbers input is missing, when called, then does not derive context or run the viewer filter setup", () => {
      const getOptionalElementById = jest.fn((id) => (id === "repo" ? makeInput("owner/repo") : null));
      const deriveRunPrDataContext = jest.fn();
      const deriveViewerFilterSetup = jest.fn();

      const { populateFilterDropdownsForCurrentPayload } = createPrReactFilterDropdownsHelpers({
        getOptionalElementById,
        deriveRunPrDataContext,
        deriveViewerFilterSetup,
      });

      populateFilterDropdownsForCurrentPayload({}, "owner/repo");

      expect(deriveRunPrDataContext).not.toHaveBeenCalled();
      expect(deriveViewerFilterSetup).not.toHaveBeenCalled();
    });

    test("given no dependencies at all, when called, then does not throw", () => {
      const { populateFilterDropdownsForCurrentPayload } = createPrReactFilterDropdownsHelpers();
      expect(() => populateFilterDropdownsForCurrentPayload({}, "owner/repo")).not.toThrow();
    });
  });
});
