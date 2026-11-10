/**
 * The data folder (README "Data folder"): where every data file the app
 * keeps lives by default - the PR data, your notes and Acks, People,
 * settings, backups. The first of:
 * - VIEW_PRS_DATA_DIR in the environment (the server sets it to its own
 *   folder for the scripts and tools it runs);
 * - VIEW_PRS_DATA_DIR in the app's .env (the server reads .env into the
 *   environment when it starts; the tools run on their own read it here);
 * - the app's data/.
 * A relative path is from the app's folder. DATA_DIR - a common name, which
 * a shell may have set for something else - is only check-open-pr-updates.sh's
 * (data-dir.sh), never read here.
 *
 * @module data-dir
 */

const fs = require("fs");
const path = require("path");

// One .env value: a quoted one's contents, else up to a " #" comment (as
// Node's own .env loader reads it).
const unquote = (raw) => {
  const quoted = raw.match(/^(["'])(.*)\1/);
  return quoted ? quoted[2] : raw.replace(/\s+#.*$/, "").trim();
};

// The last VIEW_PRS_DATA_DIR= line's value in an env file ("" without one,
// or without the file).
const readDataDirFromEnvFile = (envFile) => {
  let text;
  try {
    text = fs.readFileSync(envFile, "utf8");
  } catch (_error) {
    return "";
  }
  let value = "";
  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*VIEW_PRS_DATA_DIR\s*=\s*(.*?)\s*$/);
    if (match) value = unquote(match[1]);
  });
  return value;
};

/**
 * @param {Object} options
 * @param {string} options.viewPrsDir - The app's folder.
 * @param {Object} [options.env=process.env]
 * @param {string|null} [options.envFile] - The env file to read (default: the
 *   app's .env); null not to read one.
 * @returns {string} The data folder's absolute path.
 */
const resolveDataDir = ({ viewPrsDir, env = process.env, envFile } = {}) => {
  const file = envFile === undefined ? path.join(viewPrsDir, ".env") : envFile;
  const setting = String(env.VIEW_PRS_DATA_DIR || "").trim() || (file ? readDataDirFromEnvFile(file).trim() : "") || "data";
  return path.resolve(viewPrsDir, setting);
};

module.exports = { readDataDirFromEnvFile, resolveDataDir };
