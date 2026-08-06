(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsActorIdentityRenderHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrActorIdentityRenderHelpers = ({
    normalizeActorLogin,
    getCurrentViewerLogin,
    inferViewerLoginFromPage,
    resolveActorDisplayName,
    buildActorIdentityClassName,
    buildActorIdentityTitle,
    formatIsoDatetime,
    documentRef,
  } = {}) => {
    const normalizeActorLoginSafe =
      typeof normalizeActorLogin === "function"
        ? normalizeActorLogin
        : (value) => String(value || "").trim();
    const getCurrentViewerLoginSafe =
      typeof getCurrentViewerLogin === "function"
        ? getCurrentViewerLogin
        : () => "";
    const inferViewerLoginFromPageSafe =
      typeof inferViewerLoginFromPage === "function"
        ? inferViewerLoginFromPage
        : () => "";
    const resolveActorDisplayNameSafe =
      typeof resolveActorDisplayName === "function"
        ? resolveActorDisplayName
        : (login, _actorsMap, fallbackName) =>
            String(fallbackName || login || "").trim();
    const formatIsoDatetimeSafe =
      typeof formatIsoDatetime === "function"
        ? formatIsoDatetime
        : (value) => String(value || "-");
    const buildActorIdentityClassNameSafe =
      typeof buildActorIdentityClassName === "function"
        ? buildActorIdentityClassName
        : ({ identityState = {}, className = "", baseClassName = "actor-identity" } = {}) => {
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
    const buildActorIdentityTitleSafe =
      typeof buildActorIdentityTitle === "function"
        ? buildActorIdentityTitle
        : (identityState = {}) => {
            const titleParts = [];
            if (identityState?.isViewer) {
              titleParts.push("Current user");
            }
            if (identityState?.isPrAuthor) {
              titleParts.push("PR author");
            }
            return titleParts.join(" • ");
          };
    const getDocument = () =>
      documentRef ||
      (typeof document !== "undefined" && document ? document : null);

    const getEffectiveViewerLogin = (row = {}) =>
      normalizeActorLoginSafe(
        getCurrentViewerLoginSafe() ||
          row?.viewerLogin ||
          inferViewerLoginFromPageSafe() ||
          "",
      ).toLowerCase();

    const getPrAuthorLogin = (row = {}) =>
      normalizeActorLoginSafe(row?.authorLogin || row?.author || "").toLowerCase();

    const getActorIdentityState = (login, row = {}) => {
      const normalizedLogin = normalizeActorLoginSafe(login).toLowerCase();
      if (!normalizedLogin) {
        return {
          normalizedLogin: "",
          isViewer: false,
          isPrAuthor: false,
        };
      }

      const viewerLogin = getEffectiveViewerLogin(row);
      const prAuthorLogin = getPrAuthorLogin(row);
      return {
        normalizedLogin,
        isViewer: Boolean(viewerLogin) && normalizedLogin === viewerLogin,
        isPrAuthor: Boolean(prAuthorLogin) && normalizedLogin === prAuthorLogin,
      };
    };

    const createActorIdentityElement = ({
      row = {},
      login = "",
      actorsMap = {},
      fallbackName = "",
      tagName = "span",
      className = "",
    } = {}) => {
      const doc = getDocument();
      if (!doc || typeof doc.createElement !== "function") {
        return null;
      }

      const actor = doc.createElement(tagName);
      const displayName = resolveActorDisplayNameSafe(login, actorsMap, fallbackName);
      const identity = getActorIdentityState(login, row);
      actor.className = buildActorIdentityClassNameSafe({
        identityState: identity,
        className,
      });
      actor.textContent = displayName;

      const identityTitle = buildActorIdentityTitleSafe(identity);
      if (identityTitle) {
        actor.title = identityTitle;
      }

      return actor;
    };

    const createActorIdentityFragment = ({
      row = {},
      login = "",
      actorsMap = {},
      fallbackName = "",
      prefix = "",
      suffix = "",
      className = "",
    } = {}) => {
      const doc = getDocument();
      if (!doc || typeof doc.createDocumentFragment !== "function") {
        return null;
      }

      const fragment = doc.createDocumentFragment();
      if (prefix) {
        fragment.append(prefix);
      }
      const actor = createActorIdentityElement({
        row,
        login,
        actorsMap,
        fallbackName,
        className,
      });
      if (actor) {
        fragment.appendChild(actor);
      }
      if (suffix) {
        fragment.append(suffix);
      }
      return fragment;
    };

    const appendInlineSegment = (container, separatorState, content) => {
      if (!container || !separatorState) {
        return;
      }
      if (content == null) {
        return;
      }
      if (typeof content === "string" && !content) {
        return;
      }
      if (!separatorState.first) {
        container.append(" | ");
      }
      container.append(content);
      separatorState.first = false;
    };

    const createActorListFragment = (actors = [], row = {}, actorsMap = {}) => {
      const doc = getDocument();
      if (!doc || typeof doc.createDocumentFragment !== "function") {
        return null;
      }

      const fragment = doc.createDocumentFragment();
      actors.forEach((actor, index) => {
        if (index > 0) {
          fragment.append(", ");
        }
        const actorElement = createActorIdentityElement({
          row,
          login: actor?.login || actor,
          actorsMap,
          fallbackName: actor?.fallbackName || "",
        });
        if (actorElement) {
          fragment.appendChild(actorElement);
        }
      });
      return fragment;
    };

    const appendTimestampAndActor = ({
      container,
      row = {},
      timestamp = "-",
      login = "",
      actorsMap = {},
      fallbackName = "",
      suffix = "",
    }) => {
      if (!container) {
        return;
      }

      container.append(`${formatIsoDatetimeSafe(timestamp)} | `);
      const actor = createActorIdentityElement({
        row,
        login,
        actorsMap,
        fallbackName,
      });
      if (actor) {
        container.appendChild(actor);
      }
      if (suffix) {
        container.append(suffix);
      }
    };

    return {
      getEffectiveViewerLogin,
      getPrAuthorLogin,
      getActorIdentityState,
      createActorIdentityElement,
      createActorIdentityFragment,
      appendInlineSegment,
      createActorListFragment,
      appendTimestampAndActor,
    };
  };

  return {
    createPrActorIdentityRenderHelpers,
  };
});
