// Class names and tooltip text marking a person as the current viewer
// and/or the PR author (ActorIdentity).
export interface ActorIdentityState {
  isViewer?: boolean;
  isPrAuthor?: boolean;
}

export interface ActorIdentityClassNameInput {
  identityState?: ActorIdentityState | null;
  className?: string;
  baseClassName?: string;
}

const createPrActorIdentityStyleHelpers = () => {
  const buildActorIdentityClassName = ({
    identityState = {},
    className = "",
    baseClassName = "actor-identity",
  }: ActorIdentityClassNameInput = {}): string => {
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

  const buildActorIdentityTitle = (identityState: ActorIdentityState | null | undefined = {}): string => {
    const titleParts: string[] = [];
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

export { createPrActorIdentityStyleHelpers };
