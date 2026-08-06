const path = require("path");
const { sanitizeDiffPathToken, isObject } = require("./view-prs-data-helpers");

const VIEW_PRS_DETAIL_SCHEMA_VERSION = "v1";

const HEAVY_PR_DETAIL_FIELDS = [
  "activityTimeline",
  "activityEvents",
  "reviewThreads",
  "commentEvents",
];

const DETAIL_FIELD_DEFAULTS = {
  activityTimeline: [],
  activityEvents: [],
  reviewThreads: [],
  commentEvents: [],
};

const getPrDetailStorageFilePath = (prDetailDir, repo, prNumber) => {
  const safeRepo = sanitizeDiffPathToken(repo).replace(/-/g, "_");
  const safePr = String(prNumber || "").trim();
  return path.join(prDetailDir, `${safeRepo}__pr-${safePr}.json`);
};

const buildPrDetailRef = ({ filePath, schemaVersion = VIEW_PRS_DETAIL_SCHEMA_VERSION } = {}) => ({
  file: String(filePath || "").trim(),
  version: String(schemaVersion || VIEW_PRS_DETAIL_SCHEMA_VERSION),
});

const extractHeavyPrDetailFields = (prData = {}) => {
  const detailData = {};

  HEAVY_PR_DETAIL_FIELDS.forEach((field) => {
    const value = prData?.[field];
    if (Array.isArray(value)) {
      detailData[field] = value;
      return;
    }
    detailData[field] = DETAIL_FIELD_DEFAULTS[field];
  });

  return detailData;
};

const stripHeavyPrDetailFields = (prData = {}) => {
  if (!isObject(prData)) {
    return {};
  }

  const summaryData = { ...prData };
  HEAVY_PR_DETAIL_FIELDS.forEach((field) => {
    delete summaryData[field];
  });
  return summaryData;
};

const mergePrDetailFields = (summaryData = {}, detailData = {}) => {
  const merged = isObject(summaryData) ? { ...summaryData } : {};

  HEAVY_PR_DETAIL_FIELDS.forEach((field) => {
    const detailValue = detailData?.[field];
    if (Array.isArray(detailValue)) {
      merged[field] = detailValue;
      return;
    }

    const inlineValue = merged[field];
    if (!Array.isArray(inlineValue)) {
      merged[field] = DETAIL_FIELD_DEFAULTS[field];
    }
  });

  return merged;
};

module.exports = {
  VIEW_PRS_DETAIL_SCHEMA_VERSION,
  HEAVY_PR_DETAIL_FIELDS,
  DETAIL_FIELD_DEFAULTS,
  getPrDetailStorageFilePath,
  buildPrDetailRef,
  extractHeavyPrDetailFields,
  stripHeavyPrDetailFields,
  mergePrDetailFields,
};
