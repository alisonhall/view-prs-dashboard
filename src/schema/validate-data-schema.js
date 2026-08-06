#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const schemaDir = __dirname;
const projectRoot = path.resolve(schemaDir, "..", "..");
const schemaPath = path.join(
  schemaDir,
  "check-open-pr-updates.data.schema.json",
);
const userStateSchemaPath = path.join(
  schemaDir,
  "check-open-pr-updates.user-state.schema.json",
);
const authorCommentsSchemaPath = path.join(
  schemaDir,
  "check-open-pr-updates.author-comments.schema.json",
);
const dataPath = path.join(
  projectRoot,
  "data",
  "check-open-pr-updates.data.json",
);
const userStatePath = path.join(
  projectRoot,
  "data",
  "check-open-pr-updates.user-state.json",
);
const authorCommentsPath = path.join(
  projectRoot,
  "data",
  "check-open-pr-updates.author-comments.json",
);

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const fail = (message) => {
  console.error(`[schema-validation] ${message}`);
  process.exit(1);
};

if (!fs.existsSync(schemaPath)) {
  fail(`Schema file not found: ${schemaPath}`);
}

if (!fs.existsSync(userStateSchemaPath)) {
  fail(`Schema file not found: ${userStateSchemaPath}`);
}

if (!fs.existsSync(authorCommentsSchemaPath)) {
  fail(`Schema file not found: ${authorCommentsSchemaPath}`);
}

if (!fs.existsSync(dataPath)) {
  fail(`Data file not found: ${dataPath}`);
}

let schema;
let userStateSchema;
let data;
let userState;
let authorComments;
try {
  schema = readJsonFile(schemaPath);
} catch (error) {
  fail(`Unable to parse schema JSON (${schemaPath}): ${error.message}`);
}

try {
  userStateSchema = readJsonFile(userStateSchemaPath);
} catch (error) {
  fail(
    `Unable to parse schema JSON (${userStateSchemaPath}): ${error.message}`,
  );
}

let authorCommentsSchema;
try {
  authorCommentsSchema = readJsonFile(authorCommentsSchemaPath);
} catch (error) {
  fail(
    `Unable to parse schema JSON (${authorCommentsSchemaPath}): ${error.message}`,
  );
}

try {
  data = readJsonFile(dataPath);
} catch (error) {
  fail(`Unable to parse data JSON (${dataPath}): ${error.message}`);
}

if (fs.existsSync(userStatePath)) {
  try {
    userState = readJsonFile(userStatePath);
  } catch (error) {
    fail(
      `Unable to parse user state JSON (${userStatePath}): ${error.message}`,
    );
  }
} else {
  userState = {
    notesByPrNumber: {},
    ackByRepo: {},
    reverifyByRepo: {},
    inReviewByRepo: {},
    flaggedByRepo: {},
  };
}

if (fs.existsSync(authorCommentsPath)) {
  try {
    authorComments = readJsonFile(authorCommentsPath);
  } catch (error) {
    fail(
      `Unable to parse author comments JSON (${authorCommentsPath}): ${error.message}`,
    );
  }
} else {
  authorComments = {
    byAuthorLogin: {},
  };
}

const byPrNumber =
  data && typeof data.byPrNumber === "object" && data.byPrNumber !== null
    ? data.byPrNumber
    : {};
const lastRun = data && typeof data.lastRun === "object" ? data.lastRun : null;
const lastRunUpdatedAt =
  lastRun && typeof lastRun.updatedAt === "string" ? lastRun.updatedAt : "";

const latestRunRows = Object.fromEntries(
  Object.entries(byPrNumber).filter(([, entry]) => {
    const updatedAt =
      entry && typeof entry.updatedAt === "string" ? entry.updatedAt : "";
    return lastRunUpdatedAt && updatedAt === lastRunUpdatedAt;
  }),
);

const validationPayload = {
  byPrNumber: latestRunRows,
  lastRun:
    data && Object.prototype.hasOwnProperty.call(data, "lastRun")
      ? data.lastRun
      : null,
};

const userStateValidationPayload = {
  notesByPrNumber:
    userState &&
    typeof userState.notesByPrNumber === "object" &&
    userState.notesByPrNumber !== null
      ? userState.notesByPrNumber
      : {},
  ackByRepo:
    userState &&
    typeof userState.ackByRepo === "object" &&
    userState.ackByRepo !== null
      ? userState.ackByRepo
      : {},
  reverifyByRepo:
    userState &&
    typeof userState.reverifyByRepo === "object" &&
    userState.reverifyByRepo !== null
      ? userState.reverifyByRepo
      : {},
  inReviewByRepo:
    userState &&
    typeof userState.inReviewByRepo === "object" &&
    userState.inReviewByRepo !== null
      ? userState.inReviewByRepo
      : {},
  flaggedByRepo:
    userState &&
    typeof userState.flaggedByRepo === "object" &&
    userState.flaggedByRepo !== null
      ? userState.flaggedByRepo
      : {},
};

const authorCommentsValidationPayload = {
  byAuthorLogin:
    authorComments &&
    typeof authorComments.byAuthorLogin === "object" &&
    authorComments.byAuthorLogin !== null
      ? authorComments.byAuthorLogin
      : {},
};

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const valid = validate(validationPayload);
const validateUserState = ajv.compile(userStateSchema);
const userStateValid = validateUserState(userStateValidationPayload);
const validateAuthorComments = ajv.compile(authorCommentsSchema);
const authorCommentsValid = validateAuthorComments(
  authorCommentsValidationPayload,
);

if (!valid) {
  const errorLines = (validate.errors || []).map((err) => {
    const location = err.instancePath || "/";
    return `- ${location} ${err.message || "validation error"}`;
  });
  fail(
    `Data file failed schema validation for latest-run snapshot (${Object.keys(latestRunRows).length} rows):\n${errorLines.join("\n")}`,
  );
}

if (!userStateValid) {
  const errorLines = (validateUserState.errors || []).map((err) => {
    const location = err.instancePath || "/";
    return `- ${location} ${err.message || "validation error"}`;
  });
  fail(
    `User state file failed schema validation (${path.basename(userStatePath)}):\n${errorLines.join("\n")}`,
  );
}

if (!authorCommentsValid) {
  const errorLines = (validateAuthorComments.errors || []).map((err) => {
    const location = err.instancePath || "/";
    return `- ${location} ${err.message || "validation error"}`;
  });
  fail(
    `Author comments file failed schema validation (${path.basename(authorCommentsPath)}):\n${errorLines.join("\n")}`,
  );
}

console.log(
  `[schema-validation] OK: validated latest-run snapshot (${Object.keys(latestRunRows).length} rows) against ${path.basename(schemaPath)}, validated user state against ${path.basename(userStateSchemaPath)}, and validated author comments against ${path.basename(authorCommentsSchemaPath)}`,
);
