(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsActorIdentityStyleHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrActorIdentityStyleHelpers = () => {
    const buildActorIdentityClassName = ({
      identityState = {},
      className = "",
      baseClassName = "actor-identity",
    } = {}) => {
      const classes = [String(baseClassName || "actor-identity").trim()].filter(Boolean);

      if (className) {
        classes.push(...String(className).split(/\s+/).filter(Boolean));
      }
      if (identityState?.isViewer) {
        classes.push("actor-identity-viewer");
      }
      if (identityState?.isPrAuthor) {
        classes.push("actor-identity-pr-author");
      }

      return classes.join(" ");
    };

    const buildActorIdentityTitle = (identityState = {}) => {
      const titleParts = [];
      if (identityState?.isViewer) {
        titleParts.push("Current user");
      }
      if (identityState?.isPrAuthor) {
        titleParts.push("PR author");
      }
      return titleParts.join(" • ");
    };

    return {
      buildActorIdentityClassName,
      buildActorIdentityTitle,
    };
  };

  return {
    createPrActorIdentityStyleHelpers,
  };
});
