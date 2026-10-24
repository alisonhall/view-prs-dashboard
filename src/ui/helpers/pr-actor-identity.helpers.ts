import type { PrData } from "../types/pr-data.ts";

// People's identities across the UI: login aliases (a person's alternate
// logins mapped to one canonical login), the key a person is grouped
// under, display names, and a login -> display-name map built from every
// person a PR mentions.
export type ActorLoginAliases = Record<string, string>;
// Canonical login -> display name.
export type ActorsMap = Record<string, string | undefined>;

// The shapes other helpers take these functions in as injected
// dependencies (ActorIdentityContext supplies the real ones).
export type NormalizeActorLogin = (login: unknown) => string;
export type GetPreferredActorKey = (login: unknown, fallback?: unknown) => string;
export type ResolveActorDisplayName = (login: string, actorsMap: ActorsMap, fallbackName?: string) => string;

export interface PrActorIdentityDeps {
  asArray?: (value: unknown) => unknown[];
  getActorLoginAliases?: () => ActorLoginAliases;
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
  getActorLoginAliases = () => ({}),
}: PrActorIdentityDeps = {}) => {
  const people = (value: unknown): LoosePerson[] => asArray(value) as LoosePerson[];

  // A display name worth showing: empty when it's missing or just the
  // login again; GitHub's Copilot reviewer bot becomes "Copilot".
  const normalizeResolvedPersonName = (login: unknown, name: unknown): string => {
    const normalizedLogin = String(login || "").trim();
    const normalizedName = String(name || "").trim();
    if (!normalizedName || normalizedName === normalizedLogin) {
      return "";
    }
    if (normalizedName === "copilot-pull-request-reviewer") {
      return "Copilot";
    }
    return normalizedName;
  };

  const normalizeActorLoginAliases = (value: unknown = {}): ActorLoginAliases => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const normalized: ActorLoginAliases = {};
    Object.entries(value).forEach(([aliasLogin, canonicalLogin]) => {
      const alias = String(aliasLogin || "").trim();
      const canonical = String(canonicalLogin || "").trim();
      if (!alias || !canonical || alias === canonical) {
        return;
      }
      normalized[alias] = canonical;
    });

    return normalized;
  };

  // Follows alias -> canonical links to the end (stopping on a cycle).
  const normalizeActorLogin = (
    loginValue: unknown,
    actorLoginAliases: ActorLoginAliases = getActorLoginAliases(),
  ): string => {
    const normalizedLogin = String(loginValue || "").trim();
    if (!normalizedLogin) {
      return "";
    }

    let currentLogin = normalizedLogin;
    const seen = new Set([currentLogin]);
    while (true) {
      const nextLogin = String(actorLoginAliases?.[currentLogin] || "").trim();
      if (!nextLogin || seen.has(nextLogin)) {
        return currentLogin;
      }
      currentLogin = nextLogin;
      seen.add(currentLogin);
    }
  };

  const getPreferredActorKey = (loginValue: unknown, fallbackValue: unknown = ""): string => {
    const normalizedLogin = normalizeActorLogin(loginValue);
    if (normalizedLogin) {
      return normalizedLogin;
    }
    return String(fallbackValue || "").trim();
  };

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
    if (normalizedLogin === "copilot-pull-request-reviewer") {
      return "Copilot";
    }
    return (
      normalizedLogin || String(fallbackName || "unknown").trim() || "unknown"
    );
  };

  // The first good display name seen for each canonical login, on top of
  // seedActorsMap (which wins for logins it already has).
  const buildRowActorsMap = (row: PrData = {}, seedActorsMap: ActorsMap | null = {}): ActorsMap => {
    const actorsMap: ActorsMap = { ...(seedActorsMap || {}) };
    const addActor = (login: unknown, name: unknown) => {
      const normalizedLogin = normalizeActorLogin(login);
      if (!normalizedLogin) return;
      const normalizedName = normalizeResolvedPersonName(normalizedLogin, name);
      if (normalizedName && !actorsMap[normalizedLogin]) {
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

    if (!actorsMap["copilot-pull-request-reviewer"]) {
      actorsMap["copilot-pull-request-reviewer"] = "Copilot";
    }

    return actorsMap;
  };

  return {
    normalizeActorLoginAliases,
    normalizeActorLogin,
    getPreferredActorKey,
    resolveActorDisplayName,
    buildRowActorsMap,
  };
};

export { createPrActorIdentityHelpers };
