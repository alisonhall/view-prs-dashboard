(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsActivityTimelineRenderHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrActivityTimelineRenderHelpers = ({
    createActorIdentityElement,
  } = {}) => {
    const createActorIdentityElementSafe =
      typeof createActorIdentityElement === "function"
        ? createActorIdentityElement
        : () => null;

    const renderTimelineItems = ({
      container,
      items = [],
      row = {},
      actorsMap = {},
    } = {}) => {
      if (!container) {
        return;
      }

      if (!items.length) {
        container.textContent = "-";
        return;
      }

      items.forEach((item, index) => {
        if (index > 0) {
          container.append("; ");
        }
        const actorNode = createActorIdentityElementSafe({
          row,
          login: item?.actor,
          actorsMap,
          fallbackName: item?.fallbackName,
        });
        if (actorNode) {
          container.appendChild(actorNode);
        }
        const label = String(item?.label || "").trim();
        const count = Number(item?.count || 0);
        container.append(count > 1 ? ` ${label} (${count})` : ` ${label}`);
      });
    };

    return {
      renderTimelineItems,
    };
  };

  return {
    createPrActivityTimelineRenderHelpers,
  };
});
