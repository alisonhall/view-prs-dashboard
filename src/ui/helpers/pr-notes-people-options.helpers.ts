import type { PrData } from "../types/pr-data.ts";
import type { ActorsMap, ResolveActorDisplayName } from "./pr-actor-identity.helpers.ts";

// The people offered in a PR's Notes "author" dropdown: the PR author,
// commenters, reviewers and approvers, each once, with display names
// resolved through the injected actor-identity lookup.

export interface PrNotesPeopleOptionsDeps {
  resolveActorDisplayName?: ResolveActorDisplayName;
  asArray?: (value: unknown) => unknown[];
}

export interface PersonOption {
  login: string;
  name: string;
}

interface LoginAndName {
  login?: string;
  name?: string;
}

const createPrNotesPeopleOptionsHelpers = ({ resolveActorDisplayName, asArray }: PrNotesPeopleOptionsDeps = {}) => {
  const resolveActorDisplayNameSafe =
    typeof resolveActorDisplayName === "function"
      ? resolveActorDisplayName
      : (login: string, _actorsMap: ActorsMap, fallbackName?: string) =>
          String(fallbackName || login || "").trim();
  const asArraySafe = (value: unknown): LoginAndName[] =>
    (typeof asArray === "function"
      ? asArray(value)
      : Array.isArray(value)
        ? value
        : []) as LoginAndName[];

  const buildPrPeopleOptions = (row: PrData | null | undefined, actorsMap: ActorsMap = {}): PersonOption[] => {
    const people = new Map<string, string>();
    const addPerson = (login: unknown, name: unknown) => {
      const l = String(login || "").trim();
      if (!l) return;
      if (!people.has(l)) {
        people.set(l, resolveActorDisplayNameSafe(l, actorsMap, name as string | undefined));
      }
    };
    addPerson(row?.authorLogin, row?.author);
    asArraySafe(row?.metrics?.commentsByActor).forEach((p) =>
      addPerson(p.login, p.name),
    );
    asArraySafe(row?.metrics?.reviewsByActor).forEach((p) =>
      addPerson(p.login, p.name),
    );
    asArraySafe(row?.approvers).forEach((p) => addPerson(p.login, p.name));
    return Array.from(people.entries()).map(([login, name]) => ({ login, name }));
  };

  return {
    buildPrPeopleOptions,
  };
};

export { createPrNotesPeopleOptionsHelpers };
