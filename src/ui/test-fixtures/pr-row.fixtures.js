const createPrRowData = (overrides = {}) => ({
  number: "123",
  title: "Default PR title",
  titleDisplay: "Default PR title",
  authorLogin: "author-login",
  author: "Author Name",
  status: "NO_CHANGE",
  approved: "NO",
  approvalCount: 0,
  labels: [],
  comments: [],
  reviews: [],
  reviewThreads: [],
  ...overrides,
});

const createPrRowEntry = (overrides = {}) => {
  const dataOverrides = overrides.data || {};
  const base = {
    prNumber: "123",
    repo: "owner/repo",
    section: "open",
    updatedAt: "2026-07-14T10:00:00Z",
    notes: {
      comments: [],
    },
    data: createPrRowData(dataOverrides),
    ...overrides,
  };
  base.data = createPrRowData(dataOverrides);
  return base;
};

const validatePrRowEntryShape = (entry = {}) => {
  const issues = [];

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    issues.push("entry must be an object");
    return { valid: false, issues };
  }

  if (!String(entry.prNumber || "").trim()) {
    issues.push("prNumber is required");
  }
  if (!String(entry.repo || "").trim()) {
    issues.push("repo is required");
  }
  if (!entry.data || typeof entry.data !== "object" || Array.isArray(entry.data)) {
    issues.push("data object is required");
  }

  const data = entry.data || {};
  if (!String(data.number || "").trim()) {
    issues.push("data.number is required");
  }
  if (!String(data.title || data.titleDisplay || "").trim()) {
    issues.push("data.title or data.titleDisplay is required");
  }
  if (!String(data.status || "").trim()) {
    issues.push("data.status is required");
  }
  if (!Array.isArray(data.labels)) {
    issues.push("data.labels must be an array");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};

module.exports = {
  createPrRowData,
  createPrRowEntry,
  validatePrRowEntryShape,
};
