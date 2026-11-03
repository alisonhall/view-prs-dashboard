const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const loadSchema = (fileName) =>
  require(path.join("..", fileName));

describe("data schema", () => {
  const schema = loadSchema("check-open-pr-updates.data.schema.json");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  test("accepts a minimal payload with empty byPrNumber", () => {
    const payload = {
      byPrNumber: {},
    };

    expect(validate(payload)).toBe(true);
  });

  test("rejects payload missing byPrNumber", () => {
    const payload = {
      lastRun: null,
    };

    expect(validate(payload)).toBe(false);
    expect(validate.errors || []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "required",
          params: expect.objectContaining({ missingProperty: "byPrNumber" }),
        }),
      ]),
    );
  });

  test("rejects non-numeric byPrNumber keys", () => {
    const payload = {
      byPrNumber: {
        abc: {},
      },
    };

    expect(validate(payload)).toBe(false);
  });

  // A row as the script writes it: computed by compute-pr-row.js, its
  // detail fields moved to their file (attach_pr_detail_ref), under its
  // "owner/repo#number" key. The schema had fallen behind the rows.
  test("accepts a row as the script stores it", () => {
    const { computePrRow } = require("../../script/compute-pr-row");
    const { row } = computePrRow({
      pr: { number: 12, title: "Add widgets", url: "https://github.com/o/r/pull/12", author: { login: "alice" }, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-02T00:00:00Z" },
      viewerLogin: "me",
      detail: {
        reviews: [{ author: { login: "me" }, state: "COMMENTED", submittedAt: "2026-03-01T11:00:00Z", commit: { oid: "a1" } }],
        commits: [
          { oid: "a1", committedDate: "2026-03-01T09:00:00Z", messageHeadline: "feat: one", authors: [{ login: "alice" }] },
          { oid: "a2", committedDate: "2026-03-01T10:00:00Z", messageHeadline: "fix: two", authors: [{ login: "alice" }] },
        ],
      },
      viewedFilesStats: { changedFiles: 3, viewedFiles: 1 },
    });
    const { activityTimeline, activityEvents, reviewThreads, commentEvents, ...stored } = row;
    const payload = {
      byPrNumber: {
        "o/r#12": {
          prNumber: "12",
          repo: "o/r",
          section: "open",
          updatedAt: "2026-03-02T00:00:00Z",
          rowOrder: 0,
          fetchedAt: "2026-03-02T00:00:05Z",
          ciFetchedAt: "2026-03-02T00:00:05Z",
          data: { ...stored, localStateKey: "1|me|false|false", detailRef: { file: "pr-details/o_r__pr-12.json", version: "v1" } },
        },
      },
      lastRun: { repo: "o/r", updatedAt: "2026-03-02T00:00:00Z" },
    };

    expect(row.commitsAfterReview).toEqual(["a2"]);
    expect(validate(payload) ? [] : validate.errors).toEqual([]);
  });
});

describe("user-state schema", () => {
  const schema = loadSchema("check-open-pr-updates.user-state.schema.json");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  test("accepts a minimal payload with all required maps", () => {
    const payload = {
      notesByPrNumber: {},
      ackByRepo: {},
      reverifyByRepo: {},
      inReviewByRepo: {},
      flaggedByRepo: {},
    };

    expect(validate(payload)).toBe(true);
  });

  test("rejects payload missing required top-level keys", () => {
    const payload = {
      notesByPrNumber: {},
      ackByRepo: {},
      reverifyByRepo: {},
      inReviewByRepo: {},
    };

    expect(validate(payload)).toBe(false);
    expect(validate.errors || []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "required",
          params: expect.objectContaining({ missingProperty: "flaggedByRepo" }),
        }),
      ]),
    );
  });

  test("rejects non-numeric PR keys in notesByPrNumber", () => {
    const payload = {
      notesByPrNumber: {
        notANumber: {
          comments: [],
          otherNotes: "",
        },
      },
      ackByRepo: {},
      reverifyByRepo: {},
      inReviewByRepo: {},
      flaggedByRepo: {},
    };

    expect(validate(payload)).toBe(false);
  });

  test("accepts notes under their PR's \"owner/repo#number\" key", () => {
    const payload = {
      notesByPrNumber: { "o/r#12": { comments: [], otherNotes: "" } },
      ackByRepo: {},
      reverifyByRepo: {},
      inReviewByRepo: {},
      flaggedByRepo: {},
    };

    expect(validate(payload) ? [] : validate.errors).toEqual([]);
  });

  test("accepts PR-linked note comments with createdAt and updatedAt timestamps", () => {
    const payload = {
      notesByPrNumber: {
        101: {
          comments: [
            {
              id: "c-1",
              author: "ahall236_uhg",
              tone: "Positive",
              note: "Looks solid",
              createdAt: "2026-07-14T10:00:00Z",
              updatedAt: "2026-07-14T11:00:00Z",
            },
          ],
          otherNotes: "",
        },
      },
      ackByRepo: {},
      reverifyByRepo: {},
      inReviewByRepo: {},
      flaggedByRepo: {},
    };

    expect(validate(payload)).toBe(true);
  });

  const notesPayload = (notes) => ({
    notesByPrNumber: { 101: { comments: [], otherNotes: "", ...notes } },
    ackByRepo: {},
    reverifyByRepo: {},
    inReviewByRepo: {},
    flaggedByRepo: {},
  });

  test("accepts notes with stories, each a name and URL", () => {
    expect(
      validate(
        notesPayload({
          stories: [
            { name: "US1001", url: "https://stories.example/US1001" },
            { name: "DE1002", url: "" },
          ],
        }),
      ),
    ).toBe(true);
  });

  test("rejects a story missing its url or with an unknown field", () => {
    expect(validate(notesPayload({ stories: [{ name: "US1001" }] }))).toBe(false);
    expect(validate(notesPayload({ stories: [{ name: "US1001", url: "", id: "x" }] }))).toBe(false);
  });

  test("still accepts the deprecated rallyStories/rallyLinks lists in files not yet rewritten", () => {
    expect(validate(notesPayload({ rallyStories: ["US1001"], rallyLinks: ["https://stories.example/US1001"] }))).toBe(true);
  });
});

describe("author-comments schema", () => {
  const schema = loadSchema("check-open-pr-updates.author-comments.schema.json");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  test("accepts a minimal payload with empty byAuthorLogin", () => {
    const payload = {
      byAuthorLogin: {},
    };

    expect(validate(payload)).toBe(true);
  });

  test("accepts author comments grouped by author login", () => {
    const payload = {
      byAuthorLogin: {
        ahall236_uhg: {
          comments: [
            {
              id: "ac-1",
              note: "Consistent reviewer",
              sentiment: "positive",
              createdAt: "2026-06-03T10:00:00Z",
              updatedAt: "2026-06-03T10:00:00Z",
            },
          ],
        },
      },
    };

    expect(validate(payload)).toBe(true);
  });

  test("rejects unsupported sentiment values", () => {
    const payload = {
      byAuthorLogin: {
        reviewer1: {
          comments: [
            {
              id: "ac-1",
              note: "Something",
              sentiment: "mixed",
              createdAt: "2026-06-03T10:00:00Z",
              updatedAt: "2026-06-03T10:00:00Z",
            },
          ],
        },
      },
    };

    expect(validate(payload)).toBe(false);
  });
});

describe("data schema note timestamps", () => {
  const schema = loadSchema("check-open-pr-updates.data.schema.json");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile({
    $ref: "#/$defs/notesComment",
    $defs: schema.$defs,
  });

  test("accepts PR-linked note comments with createdAt and updatedAt timestamps", () => {
    const payload = {
      id: "c-1",
      author: "ahall236_uhg",
      tone: "Positive",
      note: "Looks solid",
      createdAt: "2026-07-14T10:00:00Z",
      updatedAt: "2026-07-14T11:00:00Z",
    };

    expect(validate(payload)).toBe(true);
  });
});
