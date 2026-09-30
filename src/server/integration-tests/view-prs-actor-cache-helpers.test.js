const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createViewPrsActorCacheHelpers,
} = require("../helpers/view-prs-actor-cache-helpers");

describe("view-prs actor cache helpers", () => {
  const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-actor-cache-"));

  test("given missing cache files, when ensuring actor cache paths, then empty json files are created", () => {
    const tempDir = makeTempDir();
    const actorNameCacheFile = path.join(tempDir, "actor-name-cache.json");
    const actorAliasesFile = path.join(tempDir, "actor-login-aliases.json");

    const helpers = createViewPrsActorCacheHelpers({
      fs,
      readJsonFileIfExists: (filePath, fallbackValue) => {
        try {
          return JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (_error) {
          return fallbackValue;
        }
      },
      viewPrsActorNameCacheFile: actorNameCacheFile,
      viewPrsActorLoginAliasesFile: actorAliasesFile,
    });

    helpers.ensureActorNameCacheFile();
    helpers.ensureActorLoginAliasesFile();

    expect(fs.existsSync(actorNameCacheFile)).toBe(true);
    expect(fs.existsSync(actorAliasesFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(actorNameCacheFile, "utf8"))).toEqual({});
    expect(JSON.parse(fs.readFileSync(actorAliasesFile, "utf8"))).toEqual({});
  });

  test("given invalid cache entries, when normalizing actor name mappings, then only non-empty trimmed entries are kept", () => {
    const helpers = createViewPrsActorCacheHelpers();

    expect(
      helpers.normalizeActorNameCacheEntries({
        " user1 ": " Alice ",
        user2: "",
        "": "Nobody",
      }),
    ).toEqual({ user1: "Alice" });
  });

  test("given invalid alias mappings, when normalizing aliases, then only valid non-self aliases are kept", () => {
    const helpers = createViewPrsActorCacheHelpers();

    expect(
      helpers.normalizeActorLoginAliasEntries({
        " alias ": " canonical ",
        same: "same",
        emptyCanonical: "",
      }),
    ).toEqual({ alias: "canonical" });
  });

  test("given normalized entries, when writing actor cache and aliases, then persisted JSON matches expected mappings", () => {
    const tempDir = makeTempDir();
    const actorNameCacheFile = path.join(tempDir, "actor-name-cache.json");
    const actorAliasesFile = path.join(tempDir, "actor-login-aliases.json");

    const helpers = createViewPrsActorCacheHelpers({
      fs,
      readJsonFileIfExists: (filePath, fallbackValue) => {
        try {
          return JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (_error) {
          return fallbackValue;
        }
      },
      viewPrsActorNameCacheFile: actorNameCacheFile,
      viewPrsActorLoginAliasesFile: actorAliasesFile,
    });

    helpers.writeActorNameCacheEntries({ reviewer1: "Reviewer One" });
    helpers.writeActorLoginAliasEntries({ alias1: "canonical1" });

    expect(JSON.parse(fs.readFileSync(actorNameCacheFile, "utf8"))).toEqual({
      reviewer1: "Reviewer One",
    });
    expect(JSON.parse(fs.readFileSync(actorAliasesFile, "utf8"))).toEqual({
      alias1: "canonical1",
    });
  });
});
