// Phase 7 (see REACT_MIGRATION_PLAN.md): pure extraction of index.page.js's
// former buildPrPeopleOptions body into a DI-factory module, so
// NotesSection.jsx can import it directly instead of reading
// window.buildPrPeopleOptions. Byte-for-byte-logic-preserving move -
// resolveActorDisplayName is now an injected dependency instead of a
// closure over index.page.js's own module-level actor-identity functions
// (it genuinely needs actor identity - confirmed by reading the body
// directly, not a zero-dependency function despite first appearances).
export const { createPrNotesPeopleOptionsHelpers } = (() => {
  const createPrNotesPeopleOptionsHelpers = ({ resolveActorDisplayName, asArray } = {}) => {
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login, _actorsMap, fallbackName) => String(fallbackName || login || "").trim();
    const asArraySafe =
      typeof asArray === "function" ? asArray : (value) => (Array.isArray(value) ? value : []);

    const buildPrPeopleOptions = (row, actorsMap = {}) => {
      const people = new Map();
      const addPerson = (login, name) => {
        const l = String(login || "").trim();
        if (!l) return;
        if (!people.has(l)) {
          people.set(l, resolveActorDisplayNameSafe(l, actorsMap, name));
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

  return {
    createPrNotesPeopleOptionsHelpers,
  };
})();
