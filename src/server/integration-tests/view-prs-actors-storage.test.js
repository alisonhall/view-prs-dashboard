const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createViewPrsActorsStorage,
  buildActorIndex,
  findMovedIds,
  isActorId,
  migrateLegacyActors,
  normalizeActors,
  validateActorsInput,
} = require("../helpers/view-prs-actors-storage");

const readJson = (filePath, fallbackValue) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return fallbackValue;
  }
};

describe("view-prs actors storage", () => {
  const makeStorage = ({ nameCache, aliases } = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "view-prs-actors-"));
    const files = {
      actorsFile: path.join(dir, "actors.json"),
      legacyNameCacheFile: path.join(dir, "actor-name-cache.json"),
      legacyAliasesFile: path.join(dir, "actor-login-aliases.json"),
    };
    if (nameCache) fs.writeFileSync(files.legacyNameCacheFile, JSON.stringify(nameCache));
    if (aliases) fs.writeFileSync(files.legacyAliasesFile, JSON.stringify(aliases));
    return { files, storage: createViewPrsActorsStorage({ fs, readJsonFileIfExists: readJson, ...files }) };
  };

  describe("moving the old files over", () => {
    test("each alias joins the login it points to (that login first, followed to the end), every other cached login is a person of its own", () => {
      expect(
        migrateLegacyActors(
          { alice: "Alice Smith", "alice-work": "Alice (work)", bob: "bob", carol: "Carol" },
          { "alice-work": "alice", "alice-old": "alice-work", loop1: "loop2", loop2: "loop1" },
        ),
      ).toEqual([
        { id: "actor:alice", name: "Alice Smith", logins: ["alice", "alice-work", "alice-old"] },
        // A loop stops at the last login reached, as the old alias lookup did.
        { id: "actor:loop2", name: "", logins: ["loop2", "loop1"] },
        // The cache stored the login when GitHub had no name: not a name.
        { id: "actor:bob", name: "", logins: ["bob"] },
        { id: "actor:carol", name: "Carol", logins: ["carol"] },
      ]);
    });

    test("an alias's name is used when its main login has none", () => {
      expect(migrateLegacyActors({ "b-work": "Bea" }, { "b-work": "b" })).toEqual([
        { id: "actor:b", name: "Bea", logins: ["b", "b-work"] },
      ]);
    });

    test("read before the actors file exists, it's made from the old files, which are left as they are", () => {
      const { files, storage } = makeStorage({ nameCache: { alice: "Alice" }, aliases: { al: "alice" } });
      expect(storage.readActors()).toEqual([{ id: "actor:alice", name: "Alice", logins: ["alice", "al"] }]);
      expect(readJson(files.actorsFile)).toEqual({
        version: 1,
        actors: [{ id: "actor:alice", name: "Alice", logins: ["alice", "al"] }],
      });
      expect(readJson(files.legacyNameCacheFile)).toEqual({ alice: "Alice" });
      expect(readJson(files.legacyAliasesFile)).toEqual({ al: "alice" });
    });

    test("with no old files, it starts empty", () => {
      const { files, storage } = makeStorage();
      expect(storage.readActors()).toEqual([]);
      expect(readJson(files.actorsFile)).toEqual({ version: 1, actors: [] });
    });

    test("once the actors file exists, the old files aren't read again", () => {
      const { files, storage } = makeStorage({ nameCache: { alice: "Alice" } });
      storage.readActors();
      fs.writeFileSync(files.legacyNameCacheFile, JSON.stringify({ alice: "Alice", zed: "Zed" }));
      expect(storage.readActors().map((actor) => actor.id)).toEqual(["actor:alice"]);
    });
  });

  describe("normalizing what's stored", () => {
    test("drops a person with no login, a login already someone's (ignoring case) and duplicates; keeps ids, making one where it's missing, invalid or taken", () => {
      expect(
        normalizeActors({
          actors: [
            { id: "actor:a", name: " Ann ", logins: [" ann ", "ANN", "", "ann2"] },
            { id: "actor:a", name: "Dup id", logins: ["dup"] },
            { id: "ann", name: "Login as id", logins: ["Ann2", "other"] },
            { name: "No logins", logins: [] },
            null,
          ],
        }),
      ).toEqual([
        { id: "actor:a", name: "Ann", logins: ["ann", "ann2"] },
        { id: "actor:dup", name: "Dup id", logins: ["dup"] },
        { id: "actor:other", name: "Login as id", logins: ["other"] },
      ]);
    });

    test("an id is never a login", () => {
      expect(isActorId("actor:alice")).toBe(true);
      expect(isActorId("alice")).toBe(false);
      expect(isActorId("dependabot[bot]")).toBe(false);
    });

    test("a made id that's taken gets a number", () => {
      expect(
        normalizeActors([
          { id: "actor:sam", logins: ["sam-old"] },
          { logins: ["sam"] },
        ]).map((actor) => actor.id),
      ).toEqual(["actor:sam", "actor:sam-2"]);
    });
  });

  describe("validating a save", () => {
    test("refuses a person with no login", () => {
      expect(validateActorsInput({ actors: [{ name: "Ann", logins: ["  "] }] })).toEqual({ error: "Ann has no login." });
    });

    test("refuses a login in two people, ignoring case, naming both", () => {
      expect(
        validateActorsInput({
          actors: [
            { name: "Ann", logins: ["ann"] },
            { name: "", logins: ["ANN"] },
          ],
        }),
      ).toEqual({ error: "ANN is in two people: Ann and Person 2." });
    });

    test("refuses a body without a list", () => {
      expect(validateActorsInput({})).toEqual({ error: "Expected { actors: [...] }." });
    });

    test("a valid list comes back normalized, a login repeated within one person kept once", () => {
      expect(validateActorsInput({ actors: [{ id: "actor:ann", name: "Ann", logins: ["ann", "Ann", "ann-2"] }] })).toEqual({
        actors: [{ id: "actor:ann", name: "Ann", logins: ["ann", "ann-2"] }],
      });
    });
  });

  describe("adding logins seen in the data", () => {
    test("adds a person for each login no one has, with its name unless that's the login again; never changes anyone already there", () => {
      const { storage } = makeStorage();
      storage.writeActors([{ id: "actor:ann", name: "Ann Set In Settings", logins: ["ann"] }]);
      expect(
        storage.addObservedLogins([
          { login: "ANN", name: "Ann From GitHub" },
          { login: "bob", name: "Bob" },
          { login: "cy", name: "cy" },
          { login: "bob", name: "Bob again" },
        ]),
      ).toEqual([
        { id: "actor:ann", name: "Ann Set In Settings", logins: ["ann"] },
        { id: "actor:bob", name: "Bob", logins: ["bob"] },
        { id: "actor:cy", name: "", logins: ["cy"] },
      ]);
    });

    test("reads the file again first, so a save made in between is kept", () => {
      const { storage } = makeStorage();
      const other = makeStorage();
      // Two handles on one file: one saves, the other then adds.
      const shared = createViewPrsActorsStorage({ fs, readJsonFileIfExists: readJson, actorsFile: other.files.actorsFile });
      other.storage.writeActors([{ name: "Saved elsewhere", logins: ["x"] }]);
      expect(shared.addObservedLogins([{ login: "y", name: "" }]).map((actor) => actor.logins[0])).toEqual(["x", "y"]);
      expect(storage.readActors()).toEqual([]);
    });
  });

  describe("a damaged file", () => {
    test("is never written over by people seen in the data, and is said to be unreadable", () => {
      const { files, storage } = makeStorage();
      fs.writeFileSync(files.actorsFile, "{ not json");
      expect(storage.readState().unreadable).toBe(true);
      expect(storage.readActors()).toEqual([]);
      expect(storage.addObservedLogins([{ login: "bob", name: "Bob" }])).toEqual([]);
      expect(fs.readFileSync(files.actorsFile, "utf8")).toBe("{ not json");
    });

    test("a save keeps a copy of it beside the new file", () => {
      const { files, storage } = makeStorage();
      fs.writeFileSync(files.actorsFile, "{ not json");
      storage.writeActors([{ name: "Ann", logins: ["ann"] }]);
      expect(storage.readState().unreadable).toBe(false);
      expect(storage.readActors()).toEqual([{ id: "actor:ann", name: "Ann", logins: ["ann"] }]);
      const kept = fs.readdirSync(path.dirname(files.actorsFile)).filter((name) => name.startsWith("actors.json.unreadable-"));
      expect(kept).toHaveLength(1);
      expect(fs.readFileSync(path.join(path.dirname(files.actorsFile), kept[0]), "utf8")).toBe("{ not json");
    });
  });

  test("a write that fails while adding people seen in the data doesn't fail the read: the people come back unsaved", () => {
    const { files } = makeStorage();
    const failingFs = { ...fs, writeFileSync: () => { throw new Error("EACCES"); } };
    const storage = createViewPrsActorsStorage({ fs: failingFs, readJsonFileIfExists: readJson, actorsFile: files.actorsFile });
    expect(storage.addObservedLogins([{ login: "bob", name: "Bob" }])).toEqual([{ id: "actor:bob", name: "Bob", logins: ["bob"] }]);
    expect(fs.existsSync(files.actorsFile)).toBe(false);
    // A save asked for (Settings › People) still reports it.
    expect(() => storage.writeActors([{ name: "Ann", logins: ["ann"] }])).toThrow("EACCES");
  });

  describe("merging two people (Settings › People)", () => {
    test("a person removed while another kept one of their logins moves to them; one removed with their logins gone moves nowhere", () => {
      const previous = [
        { id: "actor:bob", name: "Bob", logins: ["bob"] },
        { id: "actor:bob-alt", name: "", logins: ["bob-alt"] },
        { id: "actor:cy", name: "", logins: ["cy"] },
      ];
      const next = [{ id: "actor:bob", name: "Bob", logins: ["bob", "BOB-ALT"] }];
      expect(findMovedIds(previous, next)).toEqual({ "actor:bob-alt": "actor:bob" });
    });

    test("earlier moves are kept, and one whose id is someone's again is dropped", () => {
      expect(
        findMovedIds([], [{ id: "actor:old", name: "", logins: ["old"] }], { "actor:old": "actor:x", "actor:y": "actor:x" }),
      ).toEqual({ "actor:y": "actor:x" });
    });

    test("a save records the moves, keeps them through later saves and additions, and the index follows them", () => {
      const { files, storage } = makeStorage();
      storage.writeActors([
        { id: "actor:bob", name: "Bob", logins: ["bob"] },
        { id: "actor:bob-alt", name: "", logins: ["bob-alt"] },
      ]);
      storage.replaceActors([{ id: "actor:bob", name: "Bob", logins: ["bob", "bob-alt"] }]);
      storage.addObservedLogins([{ login: "newcomer", name: "" }]);
      storage.writeActors([...storage.readActors()]);

      const { actors, movedIds } = storage.readState();
      expect(movedIds).toEqual({ "actor:bob-alt": "actor:bob" });
      expect(readJson(files.actorsFile).movedIds).toEqual({ "actor:bob-alt": "actor:bob" });
      expect(buildActorIndex(actors, movedIds).keyOf("actor:bob-alt")).toBe("actor:bob");
    });

    test("moves are followed to the end, stopping on a loop", () => {
      const { keyOf } = buildActorIndex([], { "actor:a": "actor:b", "actor:b": "actor:c", "actor:x": "actor:y", "actor:y": "actor:x" });
      expect(keyOf("actor:a")).toBe("actor:c");
      expect(["actor:x", "actor:y"]).toContain(keyOf("actor:x"));
    });
  });

  test("the index: each person's id to their name (else the id itself), and any login's person ignoring case", () => {
    const { actorsMap, keyOf } = buildActorIndex([
      { id: "actor:ann", name: "Ann", logins: ["ann", "Ann-Work"] },
      { id: "actor:bob", name: "", logins: ["bob"] },
    ]);
    expect(actorsMap).toEqual({ "actor:ann": "Ann", "actor:bob": "actor:bob" });
    expect(keyOf("ANN-work")).toBe("actor:ann");
    expect(keyOf(" bob ")).toBe("actor:bob");
    // An id as it is, whether or not someone has it; any other value itself.
    expect(keyOf("actor:gone")).toBe("actor:gone");
    expect(keyOf("stranger")).toBe("stranger");
    expect(keyOf("")).toBe("");
  });
});
