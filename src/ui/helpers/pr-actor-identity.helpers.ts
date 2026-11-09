import type { PrData, PrPerson } from "../types/pr-data.ts";

// People's identities across the UI. Each person (Settings › People,
// data/actors.json) has an id ("actor:alice") and any number of logins;
// the page groups a person's things under their key - their id, or for a
// login no one has, the login itself - and shows their name, else their
// main (first) login. A login's case doesn't matter.
// Person key -> display name (the server's actorsMap: each id's name, or
// the id itself when they have none).
export type ActorsMap = Record<string, string | undefined>;

// The people, for looking them up: each login's (lower-cased) person, each
// person's logins, and where each merged-away id went (actorIdMoves).
export interface ActorIndex {
  idByLoginKey: Map<string, string>;
  loginsById: Map<string, string[]>;
  movedIds?: Map<string, string>;
}

const ACTOR_ID_PREFIX = "actor:";
export const isActorId = (value: unknown): boolean => String(value ?? "").trim().startsWith(ACTOR_ID_PREFIX);

// The index for the payload's people (its `actors` and `actorIdMoves`).
export const buildActorIndex = (actors: unknown, actorIdMoves?: unknown): ActorIndex => {
  const idByLoginKey = new Map<string, string>();
  const loginsById = new Map<string, string[]>();
  (Array.isArray(actors) ? (actors as PrPerson[]) : []).forEach((actor) => {
    const id = String(actor?.id ?? "").trim();
    const logins = (Array.isArray(actor?.logins) ? actor.logins : []).map((login) => String(login ?? "").trim()).filter(Boolean);
    if (!isActorId(id) || logins.length === 0) return;
    loginsById.set(id, logins);
    logins.forEach((login) => {
      if (!idByLoginKey.has(login.toLowerCase())) idByLoginKey.set(login.toLowerCase(), id);
    });
  });
  const movedIds = new Map<string, string>();
  if (actorIdMoves && typeof actorIdMoves === "object" && !Array.isArray(actorIdMoves)) {
    Object.entries(actorIdMoves as Record<string, unknown>).forEach(([from, to]) => {
      if (isActorId(from) && isActorId(to) && from !== to) movedIds.set(from.trim(), String(to).trim());
    });
  }
  return { idByLoginKey, loginsById, movedIds };
};

const EMPTY_INDEX: ActorIndex = { idByLoginKey: new Map(), loginsById: new Map() };

// The shapes other helpers take these functions in as injected
// dependencies (ActorIdentityContext supplies the real ones).
export type NormalizeActorLogin = (login: unknown) => string;
export type GetPreferredActorKey = (login: unknown, fallback?: unknown) => string;
export type ResolveActorDisplayName = (login: string, actorsMap: ActorsMap, fallbackName?: string) => string;

export interface PrActorIdentityDeps {
  asArray?: (value: unknown) => unknown[];
  getActorIndex?: () => ActorIndex;
}

// The person fields buildRowActorsMap reads, including raw `gh` shapes
// (`author` as an object or a name) that the data schema doesn't list.
interface LoosePerson {
  login?: string;
  name?: string;
  authorLogin?: string;
  authorName?: string;
  author?: { name?: string } | string;
  actor?: string;
  actorName?: string;
}

const authorNameOf = (person: LoosePerson | undefined): string | undefined =>
  typeof person?.author === "object" ? person.author?.name : undefined;

const createPrActorIdentityHelpers = ({
  asArray = (value: unknown) => (Array.isArray(value) ? value : []),
  getActorIndex = () => EMPTY_INDEX,
}: PrActorIdentityDeps = {}) => {
  const people = (value: unknown): LoosePerson[] => asArray(value) as LoosePerson[];

  // A person's key: a login's person's id (ignoring case), an id after its
  // moves (a person merged into another is them), or a login no one has as
  // itself. Named for what it took before ids.
  const normalizeActorLogin = (loginValue: unknown, index: ActorIndex = getActorIndex()): string => {
    const normalizedLogin = String(loginValue || "").trim();
    if (!normalizedLogin) {
      return normalizedLogin;
    }
    if (isActorId(normalizedLogin)) {
      let current = normalizedLogin;
      for (let step = 0; step < 10 && index.movedIds?.has(current); step += 1) {
        current = index.movedIds.get(current) as string;
      }
      return current;
    }
    return index.idByLoginKey.get(normalizedLogin.toLowerCase()) || normalizedLogin;
  };

  const getPreferredActorKey = (loginValue: unknown, fallbackValue: unknown = ""): string => {
    const normalizedLogin = normalizeActorLogin(loginValue);
    if (normalizedLogin) {
      return normalizedLogin;
    }
    return String(fallbackValue || "").trim();
  };

  // Every login of a key's person (an id, or any of their logins); a login
  // no one has is its own only one. For comparing with logins as GitHub
  // gives them (a thread's starter, a saved list the script reads).
  const loginsOfActorKey = (value: unknown): string[] => {
    const key = normalizeActorLogin(value);
    if (!key) return [];
    return getActorIndex().loginsById.get(key) || (isActorId(key) ? [] : [key]);
  };

  // A key's person's main (first) login - to show, or to hand on, where a
  // login is wanted; a login no one has as itself.
  const loginOfActorKey = (value: unknown): string => {
    const key = normalizeActorLogin(value);
    return loginsOfActorKey(key)[0] || key;
  };

  // A display name worth showing: empty when it's missing or just the key
  // or one of the person's logins again; GitHub's Copilot reviewer bot
  // becomes "Copilot".
  const normalizeResolvedPersonName = (login: unknown, name: unknown): string => {
    const normalizedLogin = String(login || "").trim();
    const normalizedName = String(name || "").trim();
    if (!normalizedName || normalizedName === normalizedLogin) {
      return "";
    }
    // Exactly: "Hubot" is a name for the login hubot.
    if (isActorId(normalizedName) || loginsOfActorKey(normalizedLogin).includes(normalizedName)) {
      return "";
    }
    if (normalizedName === "copilot-pull-request-reviewer") {
      return "Copilot";
    }
    return normalizedName;
  };

  // A person's name: from actorsMap (by key, else by the login given),
  // else the fallback (the data's), else their main login.
  const resolveActorDisplayName = (login: unknown, actorsMap: ActorsMap = {}, fallbackName: unknown = ""): string => {
    const rawLogin = String(login || "").trim();
    const normalizedLogin = normalizeActorLogin(rawLogin);
    const mapped = normalizeResolvedPersonName(
      normalizedLogin,
      actorsMap?.[normalizedLogin],
    );
    if (mapped) {
      return mapped;
    }
    const rawMapped = normalizeResolvedPersonName(rawLogin, actorsMap?.[rawLogin]);
    if (rawMapped) {
      return rawMapped;
    }
    const normalizedFallback = normalizeResolvedPersonName(
      normalizedLogin,
      fallbackName,
    );
    if (normalizedFallback) {
      return normalizedFallback;
    }
    const mainLogin = loginOfActorKey(normalizedLogin);
    if (mainLogin === "copilot-pull-request-reviewer") {
      return "Copilot";
    }
    return (
      mainLogin || String(fallbackName || "unknown").trim() || "unknown"
    );
  };

  // The first good display name seen for each person's key, on top of
  // seedActorsMap (which wins for people it already names - not for one
  // whose entry is only their id, the server's for a person with no name).
  const buildRowActorsMap = (row: PrData = {}, seedActorsMap: ActorsMap | null = {}): ActorsMap => {
    const actorsMap: ActorsMap = { ...(seedActorsMap || {}) };
    const addActor = (login: unknown, name: unknown) => {
      const normalizedLogin = normalizeActorLogin(login);
      if (!normalizedLogin) return;
      const normalizedName = normalizeResolvedPersonName(normalizedLogin, name);
      if (normalizedName && !normalizeResolvedPersonName(normalizedLogin, actorsMap[normalizedLogin])) {
        actorsMap[normalizedLogin] = normalizedName;
      }
    };

    addActor(row.authorLogin, row.author);
    people(row.approvers).forEach((approver) =>
      addActor(approver?.login, approver?.name),
    );
    people(row.requestedReviewers).forEach((reviewer) =>
      addActor(reviewer?.login, reviewer?.name),
    );
    people(row.comments).forEach((comment) =>
      addActor(
        comment?.authorLogin,
        authorNameOf(comment) || comment?.authorName,
      ),
    );
    people(row.commentEvents).forEach((event) =>
      addActor(
        event?.actor,
        authorNameOf(event) || event?.author || event?.actorName,
      ),
    );
    people(row.reviews).forEach((review) =>
      addActor(review?.authorLogin, authorNameOf(review) || review?.authorName),
    );
    people(row.reviewThreads).forEach((thread) => {
      people((thread as { comments?: unknown })?.comments).forEach((comment) =>
        addActor(
          comment?.authorLogin,
          authorNameOf(comment) || comment?.authorName,
        ),
      );
    });
    people(row.commits).forEach((commit) => {
      people((commit as { authors?: unknown })?.authors).forEach((author) =>
        addActor(author?.login, author?.name),
      );
    });
    people(row.activityTimeline).forEach((bucket) => {
      addActor(bucket?.actor, authorNameOf(bucket) || bucket?.author);
      people((bucket as { events?: unknown })?.events).forEach((event) =>
        addActor(
          event?.actor,
          authorNameOf(event) || event?.author || event?.actorName,
        ),
      );
    });
    people(row.activityEvents).forEach((event) =>
      addActor(
        event?.actor,
        authorNameOf(event) || event?.author || event?.actorName,
      ),
    );
    people(row?.metrics?.commentsByActor).forEach((person) =>
      addActor(person?.login, person?.name),
    );
    people(row?.metrics?.reviewsByActor).forEach((person) =>
      addActor(person?.login, person?.name),
    );
    people(row?.metrics?.approvals).forEach((approval) =>
      addActor(approval?.login, approval?.name),
    );

    const copilotKey = normalizeActorLogin("copilot-pull-request-reviewer");
    if (!normalizeResolvedPersonName(copilotKey, actorsMap[copilotKey])) {
      actorsMap[copilotKey] = "Copilot";
    }

    return actorsMap;
  };

  return {
    normalizeActorLogin,
    loginOfActorKey,
    loginsOfActorKey,
    getPreferredActorKey,
    resolveActorDisplayName,
    buildRowActorsMap,
  };
};

export { createPrActorIdentityHelpers };
