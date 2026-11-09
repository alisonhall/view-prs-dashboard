const path = require("path");

// The people the app knows (data/actors.json): one record per person - an
// id, the name to show, and every GitHub login that's them - in place of
// the old login-to-name cache (actor-name-cache.json) and alias map
// (actor-login-aliases.json), which it's moved over from the first time
// it's read.
//
//   { "version": 1, "actors": [{ "id": "actor:alice", "name": "Alice Smith", "logins": ["alice", "alice-work"] }] }
//
// An id is made once, from the person's first login, and kept however
// their logins change; "actor:" keeps it from ever being a login (GitHub's
// have no ":"). A login belongs to one person at most, ignoring case. The
// first login is the person's main one: the old alias map's canonical
// login, which the page groups people by.

const ACTORS_FILE_VERSION = 1;
const ID_PREFIX = "actor:";

const trim = (value) => String(value ?? "").trim();
const loginKey = (login) => trim(login).toLowerCase();

const isActorId = (value) => trim(value).startsWith(ID_PREFIX);

// A new id for a person whose first login is `login`, unlike any in `taken`.
const makeActorId = (login, taken) => {
  const base = `${ID_PREFIX}${loginKey(login) || "person"}`;
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
};

// A person's logins: trimmed, no blanks, each once (ignoring case), in
// their order.
const cleanLogins = (logins) => {
  const seen = new Set();
  const cleaned = [];
  (Array.isArray(logins) ? logins : []).forEach((raw) => {
    const login = trim(raw);
    if (!login || seen.has(login.toLowerCase())) return;
    seen.add(login.toLowerCase());
    cleaned.push(login);
  });
  return cleaned;
};

// The people as stored, made safe to use: each with at least one login, no
// login in two people (the first keeps it), each id a valid, unique one.
const normalizeActors = (value) => {
  const list = Array.isArray(value) ? value : Array.isArray(value?.actors) ? value.actors : [];
  const claimed = new Set();
  const ids = new Set();
  const actors = [];
  list.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const logins = cleanLogins(raw.logins).filter((login) => !claimed.has(login.toLowerCase()));
    if (logins.length === 0) return;
    logins.forEach((login) => claimed.add(login.toLowerCase()));
    const requestedId = trim(raw.id);
    const id = isActorId(requestedId) && !ids.has(requestedId) ? requestedId : makeActorId(logins[0], ids);
    ids.add(id);
    actors.push({ id, name: trim(raw.name), logins });
  });
  return actors;
};

// The people a PUT asks for, or why they can't be saved: every person
// needs a login, and no login can be two people's.
const validateActorsInput = (value) => {
  const list = Array.isArray(value) ? value : Array.isArray(value?.actors) ? value.actors : null;
  if (!list) return { error: "Expected { actors: [...] }." };
  const owners = new Map();
  for (let index = 0; index < list.length; index += 1) {
    const raw = list[index];
    const logins = cleanLogins(raw?.logins);
    const label = trim(raw?.name) || `Person ${index + 1}`;
    if (logins.length === 0) return { error: `${label} has no login.` };
    for (const login of logins) {
      const owner = owners.get(login.toLowerCase());
      if (owner !== undefined && owner !== index) {
        return { error: `${login} is in two people: ${trim(list[owner]?.name) || `Person ${owner + 1}`} and ${label}.` };
      }
      owners.set(login.toLowerCase(), index);
    }
  }
  return { actors: normalizeActors(list) };
};

// The old files' people: each alias joins the login it pointed to (followed
// to the end, stopping on a loop), that login first; every other login in
// the name cache is a person of its own. The name: the main login's, else
// an alias's - not one that's just the login again (the cache stored the
// login when GitHub had no name).
const migrateLegacyActors = (nameCache = {}, aliases = {}) => {
  const names = nameCache && typeof nameCache === "object" && !Array.isArray(nameCache) ? nameCache : {};
  const aliasMap = aliases && typeof aliases === "object" && !Array.isArray(aliases) ? aliases : {};
  const canonicalOf = (login) => {
    let current = trim(login);
    const seen = new Set([current]);
    for (;;) {
      const next = trim(aliasMap[current]);
      if (!next || seen.has(next)) return current;
      current = next;
      seen.add(current);
    }
  };
  const byCanonical = new Map();
  const addLogin = (login) => {
    const normalized = trim(login);
    if (!normalized) return;
    const canonical = canonicalOf(normalized);
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, [canonical]);
    const logins = byCanonical.get(canonical);
    if (!logins.includes(normalized)) logins.push(normalized);
  };
  Object.keys(aliasMap).forEach(addLogin);
  Object.keys(names).forEach(addLogin);
  return normalizeActors(
    Array.from(byCanonical.values(), (logins) => ({
      logins,
      name: logins.map((login) => trim(names[login])).find((name) => name && !logins.includes(name)) || "",
    })),
  );
};

// What the page reads today, worked out from the people: every login - the
// page lists people from it (the thread-resolution and change-detection
// lists, Authors) - with its person's name, else the login itself (which
// the page reads as no name, falling back to the data's), and each extra
// login's main login. The page matches logins exactly, so each of
// `observedLogins` (as the data spells them) that's a person's login in
// another case is added too, as that person's.
const deriveActorMaps = (actors = [], observedLogins = []) => {
  const actorsMap = {};
  const actorLoginAliases = {};
  const byLoginKey = new Map();
  actors.forEach((actor) => {
    const [main, ...others] = actor.logins;
    actor.logins.forEach((login) => {
      actorsMap[login] = actor.name || login;
      byLoginKey.set(loginKey(login), actor);
    });
    others.forEach((login) => {
      actorLoginAliases[login] = main;
    });
  });
  observedLogins.forEach((raw) => {
    const login = trim(raw);
    const actor = byLoginKey.get(loginKey(login));
    if (!login || !actor || login in actorsMap) return;
    actorsMap[login] = actor.name || login;
    actorLoginAliases[login] = actor.logins[0];
  });
  return { actorsMap, actorLoginAliases };
};

const createViewPrsActorsStorage = ({
  fs,
  readJsonFileIfExists,
  actorsFile,
  legacyNameCacheFile,
  legacyAliasesFile,
} = {}) => {
  const fsSafe = fs || require("fs");
  const readJson =
    typeof readJsonFileIfExists === "function" ? readJsonFileIfExists : (_filePath, fallbackValue) => fallbackValue;

  const filePath = () => {
    const resolved = trim(actorsFile);
    if (!resolved) throw new Error("Actors file path is not configured");
    return resolved;
  };

  // readJson's answer for a file it couldn't parse: only this.
  const UNREADABLE = {};

  // The file as it is: its people, or `unreadable` when it's there but
  // isn't JSON (a bad hand edit) - its people are unknown, not none.
  const readFile = () => {
    const target = filePath();
    if (!fsSafe.existsSync(target)) return { exists: false, unreadable: false, actors: [] };
    const raw = readJson(target, UNREADABLE);
    return raw === UNREADABLE
      ? { exists: true, unreadable: true, actors: [] }
      : { exists: true, unreadable: false, actors: normalizeActors(raw) };
  };

  // Saves the people. An unreadable file is kept beside it first
  // (actors.json.unreadable-<time>), so a save can't lose what was in it.
  const writeActors = (actors) => {
    const normalized = normalizeActors(actors);
    const target = filePath();
    fsSafe.mkdirSync(path.dirname(target), { recursive: true });
    if (readFile().unreadable) fsSafe.copyFileSync(target, `${target}.unreadable-${Date.now()}`);
    fsSafe.writeFileSync(target, `${JSON.stringify({ version: ACTORS_FILE_VERSION, actors: normalized }, null, 2)}\n`, "utf8");
    return normalized;
  };

  // A save that mustn't fail what asked for it (a data read): the people
  // either way, saved if the file can be written.
  const writeActorsBestEffort = (actors) => {
    try {
      return writeActors(actors);
    } catch (_error) {
      return normalizeActors(actors);
    }
  };

  // The people: from the file (none while it's unreadable), or - before
  // there is one - moved over from the old files (left as they are), and
  // saved when it can be.
  const readActors = () => {
    const file = readFile();
    if (file.exists) return file.actors;
    return writeActorsBestEffort(
      migrateLegacyActors(
        legacyNameCacheFile ? readJson(legacyNameCacheFile, {}) : {},
        legacyAliasesFile ? readJson(legacyAliasesFile, {}) : {},
      ),
    );
  };

  // Adds a person for each login no one has, with its name (or none), and
  // saves when it can - reading the file again first, so a save in between
  // is kept. Never changes a person already there, and never writes over
  // an unreadable file (whose people aren't known). Returns the people.
  const addObservedLogins = (entries = []) => {
    const file = readFile();
    if (file.unreadable) return [];
    const actors = file.exists ? file.actors : readActors();
    const claimed = new Set(actors.flatMap((actor) => actor.logins.map(loginKey)));
    const added = [];
    entries.forEach(({ login, name }) => {
      const normalized = trim(login);
      if (!normalized || claimed.has(loginKey(normalized))) return;
      claimed.add(loginKey(normalized));
      const normalizedName = trim(name);
      added.push({ name: normalizedName === normalized ? "" : normalizedName, logins: [normalized] });
    });
    return added.length > 0 ? writeActorsBestEffort([...actors, ...added]) : actors;
  };

  // The people and whether the file is there but unreadable (Settings ›
  // People says so), from one read.
  const readState = () => {
    const file = readFile();
    return file.exists ? { actors: file.actors, unreadable: file.unreadable } : { actors: readActors(), unreadable: false };
  };

  // Whether the file is there but unreadable.
  const isUnreadable = () => readFile().unreadable;

  return { readActors, readState, writeActors, addObservedLogins, isUnreadable };
};

module.exports = {
  ACTOR_ID_PREFIX: ID_PREFIX,
  createViewPrsActorsStorage,
  deriveActorMaps,
  isActorId,
  migrateLegacyActors,
  normalizeActors,
  validateActorsInput,
};
