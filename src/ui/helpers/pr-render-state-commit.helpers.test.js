/** @jest-environment jsdom */

const {
  createPrRenderStateCommitHelpers,
} = require("./pr-render-state-commit.helpers.js");

describe("pr render state commit helpers", () => {
  test("given render result state, when deriving committed render state, then commit fields are returned as-is", () => {
    const { deriveCommittedRenderState } = createPrRenderStateCommitHelpers();
    const nextRenderState = {
      pendingAutoRenderPayload: null,
      lastRenderedPrFingerprint: "fingerprint-123",
      latestPrManifest: { key: "value" },
      filteredRows: [{ prNumber: "1" }],
    };

    expect(
      deriveCommittedRenderState({
        nextRenderState,
      }),
    ).toEqual({
      pendingAutoRenderPayload: null,
      lastRenderedPrFingerprint: "fingerprint-123",
      latestPrManifest: { key: "value" },
      filteredRows: [{ prNumber: "1" }],
    });
  });

  test("given missing render result state, when deriving committed render state, then safe defaults are returned", () => {
    const { deriveCommittedRenderState } = createPrRenderStateCommitHelpers();

    expect(
      deriveCommittedRenderState({
        nextRenderState: null,
      }),
    ).toEqual({
      pendingAutoRenderPayload: null,
      lastRenderedPrFingerprint: "",
      latestPrManifest: {},
      filteredRows: [],
    });
  });

  test("given partial render result state, when deriving committed render state, then unavailable fields fall back safely", () => {
    const { deriveCommittedRenderState } = createPrRenderStateCommitHelpers();

    expect(
      deriveCommittedRenderState({
        nextRenderState: {
          pendingAutoRenderPayload: { dataVersion: "v1" },
          lastRenderedPrFingerprint: 123,
          latestPrManifest: null,
        },
      }),
    ).toEqual({
      pendingAutoRenderPayload: { dataVersion: "v1" },
      lastRenderedPrFingerprint: "",
      latestPrManifest: {},
      filteredRows: [],
    });
  });
});
