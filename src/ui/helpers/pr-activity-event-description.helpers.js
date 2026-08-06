(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsActivityEventDescriptionHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrActivityEventDescriptionHelpers = ({
    createActorIdentityElement,
    documentRef,
  } = {}) => {
    const createActorIdentityElementSafe =
      typeof createActorIdentityElement === "function"
        ? createActorIdentityElement
        : () => null;
    const getDocument = () =>
      documentRef ||
      (typeof document !== "undefined" && document ? document : null);

    const createActivityEventDescriptionFragment = (
      event,
      row = {},
      actorsMap = {},
    ) => {
      const doc = getDocument();
      if (!doc || typeof doc.createDocumentFragment !== "function") {
        return null;
      }

      const fragment = doc.createDocumentFragment();
      const type = String(event?.type || "activity");

      const actorNode = createActorIdentityElementSafe({
        row,
        login: event?.actor,
        actorsMap,
        fallbackName: event?.author?.name || event?.author || event?.actorName,
      });
      if (actorNode) {
        fragment.appendChild(actorNode);
      }

      if (type === "approval") {
        fragment.append(" approved");
        return fragment;
      }
      if (type === "review") {
        const state = String(event?.state || "").trim();
        fragment.append(state ? ` review (${state})` : " review");
        return fragment;
      }
      if (type === "comment") {
        fragment.append(event?.channel === "thread" ? " thread comment" : " comment");
        return fragment;
      }
      if (type === "commit") {
        fragment.append(" commit");
        return fragment;
      }
      if (type === "opened") {
        fragment.append(" opened PR");
        return fragment;
      }
      if (type === "merged") {
        fragment.append(" merged PR");
        return fragment;
      }

      fragment.append(` ${type}`);
      return fragment;
    };

    return {
      createActivityEventDescriptionFragment,
    };
  };

  return {
    createPrActivityEventDescriptionHelpers,
  };
});
