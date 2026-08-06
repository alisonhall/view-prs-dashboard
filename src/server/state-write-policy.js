const path = require("path");

const isDestructiveStateWriteAllowed = (rawValue) =>
  /^(1|true|yes)$/i.test(String(rawValue || "").trim());

const toPositiveInt = (value) => {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const countPerRepoEntries = (source, isObject) =>
  Object.values(source || {}).reduce((sum, perRepo) => {
    if (!isObject(perRepo)) {
      return sum;
    }
    return sum + Object.keys(perRepo).length;
  }, 0);

const getPrDataRowCount = (data, isObject) =>
  isObject(data?.byPrNumber) ? Object.keys(data.byPrNumber).length : 0;

const getUserStateSectionCounts = (state, isObject) => ({
  notesCount: isObject(state?.notesByPrNumber)
    ? Object.keys(state.notesByPrNumber).length
    : 0,
  ackCount: countPerRepoEntries(state?.ackByRepo, isObject),
  reverifyCount: countPerRepoEntries(state?.reverifyByRepo, isObject),
  inReviewCount: countPerRepoEntries(state?.inReviewByRepo, isObject),
  flaggedCount: countPerRepoEntries(state?.flaggedByRepo, isObject),
});

const getAuthorCommentsCounts = (state, isObject) => {
  const byAuthorLogin = isObject(state?.byAuthorLogin) ? state.byAuthorLogin : {};
  const authorCount = Object.keys(byAuthorLogin).length;
  const commentCount = Object.values(byAuthorLogin).reduce((sum, authorEntry) => {
    if (!isObject(authorEntry) || !Array.isArray(authorEntry.comments)) {
      return sum;
    }
    return sum + authorEntry.comments.length;
  }, 0);

  return {
    authorCount,
    commentCount,
  };
};

const getRetainRatio = (rawValue, fallback = 0.35) => {
  const ratioRaw = Number.parseFloat(String(rawValue || fallback));
  return Number.isFinite(ratioRaw) && ratioRaw > 0 && ratioRaw <= 1
    ? ratioRaw
    : fallback;
};

const enforceProtectedWritePolicy = ({
  filePath,
  incomingValue,
  viewPrsDataFile,
  viewPrsUserStateFile,
  viewPrsAuthorCommentsFile,
  readJsonFileIfExists,
  normalizeViewPrsUserState,
  normalizeViewPrsAuthorComments,
  isObject,
  allowDestructiveWriteRaw = process.env.VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE,
  minRetainRatioRaw = process.env.VIEW_PRS_DATA_MIN_RETAIN_RATIO,
}) => {
  if (isDestructiveStateWriteAllowed(allowDestructiveWriteRaw)) {
    return;
  }

  if (filePath === viewPrsUserStateFile) {
    const existing = normalizeViewPrsUserState(
      readJsonFileIfExists(viewPrsUserStateFile, {}),
    );
    const incoming = normalizeViewPrsUserState(incomingValue);

    const existingCounts = getUserStateSectionCounts(existing, isObject);
    const incomingCounts = getUserStateSectionCounts(incoming, isObject);

    const existingCount = Object.values(existingCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const incomingCount = Object.values(incomingCounts).reduce(
      (sum, count) => sum + count,
      0,
    );

    const fullyClearedSection = [
      ["notesByPrNumber", existingCounts.notesCount, incomingCounts.notesCount],
      ["ackByRepo", existingCounts.ackCount, incomingCounts.ackCount],
      ["reverifyByRepo", existingCounts.reverifyCount, incomingCounts.reverifyCount],
      ["inReviewByRepo", existingCounts.inReviewCount, incomingCounts.inReviewCount],
      ["flaggedByRepo", existingCounts.flaggedCount, incomingCounts.flaggedCount],
    ].find(([, existingSectionCount, incomingSectionCount]) =>
      existingSectionCount > 0 && incomingSectionCount === 0,
    );

    if (fullyClearedSection) {
      throw new Error(
        `Protected write blocked for ${path.basename(filePath)}: ${fullyClearedSection[0]} would be cleared. Set VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE=true to override intentionally.`,
      );
    }

    const minRetainRatio = getRetainRatio(
      process.env.VIEW_PRS_USER_STATE_MIN_RETAIN_RATIO,
      0.35,
    );
    const minRetainedCount = toPositiveInt(
      Math.floor(existingCount * minRetainRatio),
    );

    const overShrunkSection = [
      ["notesByPrNumber", existingCounts.notesCount, incomingCounts.notesCount],
      ["ackByRepo", existingCounts.ackCount, incomingCounts.ackCount],
      ["reverifyByRepo", existingCounts.reverifyCount, incomingCounts.reverifyCount],
      ["inReviewByRepo", existingCounts.inReviewCount, incomingCounts.inReviewCount],
      ["flaggedByRepo", existingCounts.flaggedCount, incomingCounts.flaggedCount],
    ].find(([, existingSectionCount, incomingSectionCount]) => {
      if (existingSectionCount < 50) {
        return false;
      }
      const minRetainedSectionCount = toPositiveInt(
        Math.floor(existingSectionCount * minRetainRatio),
      );
      return incomingSectionCount < minRetainedSectionCount;
    });

    if (overShrunkSection) {
      throw new Error(
        `Protected write blocked for ${path.basename(filePath)}: ${overShrunkSection[0]} would shrink too far (${overShrunkSection[2]}/${overShrunkSection[1]}, min ratio ${minRetainRatio}). Set VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE=true to override intentionally.`,
      );
    }

    if (existingCount >= 50 && incomingCount < minRetainedCount) {
      throw new Error(
        `Protected write blocked for ${path.basename(filePath)}: user-state would shrink too far (${incomingCount}/${existingCount}, min ratio ${minRetainRatio}). Set VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE=true to override intentionally.`,
      );
    }

    return;
  }

  if (filePath === viewPrsDataFile) {
    const existing = readJsonFileIfExists(viewPrsDataFile, {});
    const existingCount = getPrDataRowCount(existing, isObject);
    const incomingCount = getPrDataRowCount(incomingValue, isObject);

    if (existingCount > 0 && incomingCount === 0) {
      throw new Error(
        `Protected write blocked for ${path.basename(filePath)}: byPrNumber would be cleared. Set VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE=true to override intentionally.`,
      );
    }

    const minRetainRatio = getRetainRatio(minRetainRatioRaw, 0.35);

    const minRetainedCount = toPositiveInt(
      Math.floor(existingCount * minRetainRatio),
    );

    if (existingCount >= 50 && incomingCount < minRetainedCount) {
      throw new Error(
        `Protected write blocked for ${path.basename(filePath)}: byPrNumber would shrink too far (${incomingCount}/${existingCount}, min ratio ${minRetainRatio}). Set VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE=true to override intentionally.`,
      );
    }
  }

  if (filePath === viewPrsAuthorCommentsFile) {
    const existing = normalizeViewPrsAuthorComments(
      readJsonFileIfExists(viewPrsAuthorCommentsFile, {}),
    );
    const incoming = normalizeViewPrsAuthorComments(incomingValue);

    const existingCounts = getAuthorCommentsCounts(existing, isObject);
    const incomingCounts = getAuthorCommentsCounts(incoming, isObject);

    if (
      existingCounts.authorCount > 0 &&
      incomingCounts.authorCount === 0
    ) {
      throw new Error(
        `Protected write blocked for ${path.basename(filePath)}: byAuthorLogin would be cleared. Set VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE=true to override intentionally.`,
      );
    }

    if (
      existingCounts.commentCount > 0 &&
      incomingCounts.commentCount === 0
    ) {
      throw new Error(
        `Protected write blocked for ${path.basename(filePath)}: comments would be cleared. Set VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE=true to override intentionally.`,
      );
    }

    const minRetainRatio = getRetainRatio(
      process.env.VIEW_PRS_AUTHOR_COMMENTS_MIN_RETAIN_RATIO,
      0.35,
    );
    const minRetainedCommentCount = toPositiveInt(
      Math.floor(existingCounts.commentCount * minRetainRatio),
    );

    if (
      existingCounts.commentCount >= 50 &&
      incomingCounts.commentCount < minRetainedCommentCount
    ) {
      throw new Error(
        `Protected write blocked for ${path.basename(filePath)}: comments would shrink too far (${incomingCounts.commentCount}/${existingCounts.commentCount}, min ratio ${minRetainRatio}). Set VIEW_PRS_ALLOW_DESTRUCTIVE_WRITE=true to override intentionally.`,
      );
    }
  }
};

module.exports = {
  isDestructiveStateWriteAllowed,
  enforceProtectedWritePolicy,
};
