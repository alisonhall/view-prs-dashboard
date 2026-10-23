import type { PrActivityEvent, PrData } from "../types/pr-data.ts";

// A PR's assignees, deduped by normalized login. Assignment fields come in
// several shapes (plain logins, { login, name }, a nested user), so they're
// read as unknown and narrowed here; assignment events in the activity
// lists are also scanned.
type ActorsMap = Record<string, unknown>;
type LooseRecord = Record<string, unknown>;

export interface PrAssignedUsersDeps {
  asArray?: (value: unknown) => unknown[];
  normalizeActorLogin?: (value: unknown) => string;
  resolveActorDisplayName?: (login: string, actorsMap: ActorsMap, fallbackName?: string) => string;
}

export interface AssignedUser {
  login: string;
  name: string;
}

type AssignedUsersRow = PrData & {
  assigned?: unknown;
  assignedUsers?: unknown;
  assignedTo?: unknown;
  assignedUser?: unknown;
};

// Assignment events carry more fields than PrActivityEvent lists.
type AssignmentEvent = PrActivityEvent & {
  assignee?: unknown;
  assignees?: unknown;
  assigneeLogin?: unknown;
  assigneeName?: unknown;
  author?: unknown;
  actorName?: unknown;
};

const createPrAssignedUsersHelpers = ({
  asArray,
  normalizeActorLogin,
  resolveActorDisplayName,
}: PrAssignedUsersDeps = {}) => {
  // Callers pass typed lists; the injected asArray only coerces.
  const asArraySafe = <T>(value: T[] | null | undefined): T[] =>
    (typeof asArray === "function" ? asArray(value) : Array.isArray(value) ? value : []) as T[];
  const normalizeActorLoginSafe =
    typeof normalizeActorLogin === "function"
      ? normalizeActorLogin
      : (value: unknown) => String(value || "").trim();
  const resolveActorDisplayNameSafe =
    typeof resolveActorDisplayName === "function"
      ? resolveActorDisplayName
      : (login: string, _actorsMap: ActorsMap, fallbackName?: string) =>
          String(fallbackName || login || "").trim();

  const collectAssignedUsers = (row: AssignedUsersRow = {}): AssignedUser[] => {
    const ordered: AssignedUser[] = [];
    const seen = new Set<string>();

    const addAssigned = (login: unknown, name: unknown = "") => {
      const normalizedLogin = normalizeActorLoginSafe(login);
      if (!normalizedLogin || seen.has(normalizedLogin)) return;
      seen.add(normalizedLogin);
      ordered.push({ login: normalizedLogin, name: String(name || "").trim() });
    };

    const addFromValue = (value: unknown): void => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(addFromValue);
        return;
      }
      if (typeof value === "string") {
        addAssigned(value, "");
        return;
      }
      if (typeof value !== "object") return;

      const record = value as LooseRecord;
      const login =
        record.login ||
        record.userLogin ||
        record.assigneeLogin ||
        record.username ||
        record.user;
      const name = record.name || record.userName || record.assigneeName || "";
      if (typeof login === "string") {
        addAssigned(login, name);
      } else if (String(name || "").trim()) {
        addAssigned(name, name);
      }
      if (record.user && typeof record.user === "object") {
        addFromValue(record.user);
      }
    };

    [
      row.assignees,
      row.assigned,
      row.assignedUsers,
      row.assignedTo,
      row.assignedUser,
    ].forEach(addFromValue);

    const addFromAssignmentEvent = (event: AssignmentEvent) => {
      const type = String(event?.type || "")
        .trim()
        .toLowerCase();
      if (!type.includes("assign")) return;

      const beforeCount = ordered.length;
      addFromValue(event?.assignee);
      addFromValue(event?.assignees);
      addFromValue({
        login: event?.assigneeLogin,
        name: event?.assigneeName,
      });

      if (ordered.length === beforeCount) {
        const author = event?.author as { name?: unknown } | string | undefined;
        addFromValue({
          login: event?.actor,
          name: (typeof author === "object" ? author?.name : undefined) || author || event?.actorName,
        });
      }
    };

    asArraySafe(row.activityTimeline).forEach((bucket) => {
      asArraySafe(bucket?.events as AssignmentEvent[] | undefined).forEach(addFromAssignmentEvent);
    });
    asArraySafe(row.activityEvents as AssignmentEvent[] | undefined).forEach(addFromAssignmentEvent);

    return ordered;
  };

  const formatAssignedUsersDisplay = (row: AssignedUsersRow | undefined, actorsMap: ActorsMap = {}): string => {
    const assignees = collectAssignedUsers(row);
    if (!assignees.length) return "-";
    return assignees
      .map((assignee) => {
        const login = String(assignee?.login || "").trim();
        const name = resolveActorDisplayNameSafe(login, actorsMap, assignee?.name);
        return `${name}${login && login !== name ? ` (${login})` : ""}`;
      })
      .join("; ");
  };

  return {
    collectAssignedUsers,
    formatAssignedUsersDisplay,
  };
};

export { createPrAssignedUsersHelpers };
