// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsActorIdentityStyleHelpers fallback.
export const { createPrActorIdentityStyleHelpers } = (() => {
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
})();
