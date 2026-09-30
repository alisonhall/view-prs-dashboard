const {
  createViewPrsMutationRouteHelpers,
} = require("./view-prs-mutation-route-helpers");

describe("mutation route helpers - minimal response optimization", () => {
  let helpers;

  beforeEach(() => {
    helpers = createViewPrsMutationRouteHelpers({
      formatScriptFailureMessage: (failure, defaultMessage) =>
        failure?.message || defaultMessage,
    });
  });

  describe("buildAckMinimalSuccessResult", () => {
    test("given checkbox operation result, when building minimal response, then returns only flag data", () => {
      const fullPrData = {
        prs: [
          { number: 123, title: "Test PR" },
          { number: 456, title: "Another PR" },
        ],
        flaggedByRepo: {
          "owner/repo": { "123": true },
        },
        inReviewByRepo: {
          "owner/repo": { "456": true },
        },
        actorsMap: { user1: { login: "user1" } },
        dataManifest: { version: "1.0" },
        // ... hundreds of other fields
      };

      const result = helpers.buildAckMinimalSuccessResult({
        displayCommand: "bash script.sh --flagged 123",
        stdout: "Success",
        stderr: "",
        prData: fullPrData,
      });

      expect(result.responseStatusCode).toBe(200);
      expect(result.responsePayload.ok).toBe(true);
      expect(result.responsePayload.command).toBe("bash script.sh --flagged 123");
      expect(result.responsePayload.output).toBe("Success");
      expect(result.responsePayload.stderr).toBe("");

      // CRITICAL: Only flag data returned, not full prData
      expect(result.responsePayload.flaggedByRepo).toEqual(fullPrData.flaggedByRepo);
      expect(result.responsePayload.inReviewByRepo).toEqual(fullPrData.inReviewByRepo);

      // CRITICAL: Full PR data NOT included
      expect(result.responsePayload.prData).toBeUndefined();
      expect(result.responsePayload.prs).toBeUndefined();
      expect(result.responsePayload.actorsMap).toBeUndefined();
      expect(result.responsePayload.dataManifest).toBeUndefined();
    });

    test("given missing prData, when building minimal response, then returns empty flag objects", () => {
      const result = helpers.buildAckMinimalSuccessResult({
        displayCommand: "bash script.sh --flagged 123",
        stdout: "Success",
        stderr: "",
        prData: null,
      });

      expect(result.responseStatusCode).toBe(200);
      expect(result.responsePayload.flaggedByRepo).toEqual({});
      expect(result.responsePayload.inReviewByRepo).toEqual({});
    });

    test("given prData with only flaggedByRepo, when building minimal response, then returns partial data", () => {
      const result = helpers.buildAckMinimalSuccessResult({
        displayCommand: "bash script.sh --flagged 123",
        stdout: "Success",
        stderr: "",
        prData: {
          flaggedByRepo: { "owner/repo": { "123": true } },
        },
      });

      expect(result.responseStatusCode).toBe(200);
      expect(result.responsePayload.flaggedByRepo).toEqual({
        "owner/repo": { "123": true },
      });
      expect(result.responsePayload.inReviewByRepo).toEqual({});
    });
  });

  describe("buildAckSuccessResult (full response)", () => {
    test("given ack operation result, when building full response, then returns complete prData", () => {
      const fullPrData = {
        prs: [{ number: 123, title: "Test PR" }],
        flaggedByRepo: { "owner/repo": { "123": true } },
        inReviewByRepo: {},
        actorsMap: { user1: { login: "user1" } },
      };

      const result = helpers.buildAckSuccessResult({
        displayCommand: "bash script.sh --ack 123",
        stdout: "Success",
        stderr: "",
        refreshedPrs: [{ number: 123 }],
        refreshErrors: [],
        prData: fullPrData,
      });

      expect(result.responseStatusCode).toBe(200);
      expect(result.responsePayload.ok).toBe(true);
      expect(result.responsePayload.prData).toEqual(fullPrData);
      expect(result.responsePayload.refreshedPrs).toEqual([{ number: 123 }]);
      expect(result.responsePayload.refreshErrors).toEqual([]);
    });
  });

  describe("payload size comparison", () => {
    test("given typical PR data, when comparing minimal vs full response, then minimal is significantly smaller", () => {
      // Simulate typical PR data (~100-500KB)
      const typicalPrData = {
        prs: Array(50)
          .fill(null)
          .map((_, i) => ({
            number: i + 1,
            title: `PR ${i + 1}`,
            body: "Long description...",
            comments: [],
            reviews: [],
            commits: [],
            // ... many more fields
          })),
        flaggedByRepo: { "owner/repo": { "1": true, "5": true } },
        inReviewByRepo: { "owner/repo": { "10": true } },
        actorsMap: {},
        dataManifest: {},
      };

      const fullResponse = helpers.buildAckSuccessResult({
        displayCommand: "bash script.sh --ack 1",
        stdout: "Success",
        stderr: "",
        refreshedPrs: [],
        refreshErrors: [],
        prData: typicalPrData,
      });

      const minimalResponse = helpers.buildAckMinimalSuccessResult({
        displayCommand: "bash script.sh --flagged 1",
        stdout: "Success",
        stderr: "",
        prData: typicalPrData,
      });

      const fullSize = JSON.stringify(fullResponse).length;
      const minimalSize = JSON.stringify(minimalResponse).length;

      // Minimal response should be at least 10x smaller
      expect(minimalSize).toBeLessThan(fullSize / 10);

      // Verify minimal response is small (< 1KB for typical case)
      expect(minimalSize).toBeLessThan(1000);
    });
  });
});
