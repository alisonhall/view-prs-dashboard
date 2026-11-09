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
// first login is the person's main one, shown when they have no name. The
// page groups people by id (buildActorIndex).
//
// `movedIds` ({ "actor:old": "actor:new" }) records a person removed while
// another kept one of their logins - two people merged in Settings ›
// People - so what was picked or kept under the old id (a filter, a rule,
// the Authors view's comments) stays theirs.

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

// The id moves as saved: id to id, neither empty nor the same.
const normalizeMovedIds = (value) => {
  const moves = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return moves;
  Object.entries(value).forEach(([from, to]) => {
    const source = trim(from);
    const target = trim(to);
    if (isActorId(source) && isActorId(target) && source !== target) moves[source] = target;
  });
  return moves;
};

// An id after its moves (a few at most; a loop - only a hand edit makes one
// - stops where it is).
const followMoves = (id, movedIds = {}) => {
  let current = id;
  for (let step = 0; step < 10 && movedIds[current]; step += 1) current = movedIds[current];
  return current;
};

// The moves after a save of `next` over `previous`: each person removed whose
// logins someone now has moves to them; an id that's someone's again moves
// no longer.
const findMovedIds = (previous = [], next = [], movedIds = {}) => {
  const liveIds = new Set(next.map((actor) => actor.id));
  const ownerByLoginKey = new Map();
  next.forEach((actor) => actor.logins.forEach((login) => ownerByLoginKey.set(loginKey(login), actor.id)));
  const moves = Object.fromEntries(Object.entries(movedIds).filter(([from]) => !liveIds.has(from)));
  previous.forEach((actor) => {
    if (liveIds.has(actor.id)) return;
    const owner = actor.logins.map((login) => ownerByLoginKey.get(loginKey(login))).find(Boolean);
    if (owner) moves[actor.id] = owner;
  });
  return moves;
};

// The people, for looking them up: `actorsMap` - each person's id to their
// name, else the id itself (the page reads a name equal to the key as no
// name, and falls back to the data's, then the main login; the page lists
// people from it - the thread-resolution and change-detection lists,
// Authors) - and `keyOf`, a login's person (ignoring case) or an id after
// its moves; any other value is its own key.
const buildActorIndex = (actors = [], movedIds = {}) => {
  const actorsMap = {};
  const idByLoginKey = new Map();
  actors.forEach((actor) => {
    actorsMap[actor.id] = actor.name || actor.id;
    actor.logins.forEach((login) => idByLoginKey.set(loginKey(login), actor.id));
  });
  const keyOf = (value) => {
    const normalized = trim(value);
    if (!normalized) return normalized;
    if (isActorId(normalized)) return followMoves(normalized, movedIds);
    return idByLoginKey.get(loginKey(normalized)) || normalized;
  };
  return { actorsMap, keyOf };
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
    if (!fsSafe.existsSync(target)) return { exists: false, unreadable: false, actors: [], movedIds: {} };
    const raw = readJson(target, UNREADABLE);
    return raw === UNREADABLE
      ? { exists: true, unreadable: true, actors: [], movedIds: {} }
      : { exists: true, unreadable: false, actors: normalizeActors(raw), movedIds: normalizeMovedIds(raw?.movedIds) };
  };

  // Saves the people, with the id moves given (else the file's). An
  // unreadable file is kept beside it first (actors.json.unreadable-<time>),
  // so a save can't lose what was in it.
  const writeActors = (actors, movedIds) => {
    const normalized = normalizeActors(actors);
    const target = filePath();
    fsSafe.mkdirSync(path.dirname(target), { recursive: true });
    const file = readFile();
    if (file.unreadable) fsSafe.copyFileSync(target, `${target}.unreadable-${Date.now()}`);
    const moves = normalizeMovedIds(movedIds === undefined ? file.movedIds : movedIds);
    const body = Object.keys(moves).length > 0
      ? { version: ACTORS_FILE_VERSION, actors: normalized, movedIds: moves }
      : { version: ACTORS_FILE_VERSION, actors: normalized };
    fsSafe.writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    return normalized;
  };

  // Settings › People's save: everyone, replacing who's there, recording
  // where each person removed went if someone kept one of their logins.
  const replaceActors = (actors) => {
    const file = readFile();
    const next = normalizeActors(actors);
    return writeActors(next, findMovedIds(file.actors, next, file.movedIds));
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

  // The people, their id moves, and whether the file is there but
  // unreadable (Settings › People says so), from one read.
  const readState = () => {
    const file = readFile();
    return file.exists
      ? { actors: file.actors, movedIds: file.movedIds, unreadable: file.unreadable }
      : { actors: readActors(), movedIds: {}, unreadable: false };
  };

  return { readActors, readState, writeActors, replaceActors, addObservedLogins };
};

module.exports = {
  createViewPrsActorsStorage,
  buildActorIndex,
  findMovedIds,
  isActorId,
  migrateLegacyActors,
  normalizeActors,
  validateActorsInput,
};
