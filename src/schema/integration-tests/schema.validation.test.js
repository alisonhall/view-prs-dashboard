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
