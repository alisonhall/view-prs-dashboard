/**
 * The data folder (README "Data folder"): where every data file the app
 * keeps lives by default - the PR data, your notes and Acks, People,
 * settings, backups. The first of:
 * - VIEW_PRS_DATA_DIR in the environment (the server sets it to its own
 *   folder for the scripts and tools it runs);
 * - VIEW_PRS_DATA_DIR in the app's .env (the server reads .env into the
 *   environment when it starts; the tools run on their own read it here);
 * - the app's data/.
 * A relative path is from the app's folder; ~ is your home folder. DATA_DIR - a common name, which
 * a shell may have set for something else - is only check-open-pr-updates.sh's
 * (data-dir.sh), never read here.
 *
 * @module data-dir
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// One .env value as Node's own loader (process.loadEnvFile, which the
// server uses) reads it: a quoted one's contents up to the first closing
// quote, with \n a new line inside double quotes; else up to any #.
const unquote = (raw) => {
  const quoted = raw.match(/^(["'`])/);
  if (quoted) {
    const end = raw.indexOf(quoted[1], 1);
    if (end > 0) {
      const inner = raw.slice(1, end);
      return quoted[1] === '"' ? inner.replace(/\\n/g, "\n") : inner;
    }
  }
  return raw.replace(/#.*$/, "").trim();
};

// The last `name=` line's value in an env file ("" without one, or without
// the file).
const readEnvFileValue = (envFile, name) => {
  let text;
  try {
    text = fs.readFileSync(envFile, "utf8");
  } catch (_error) {
    return "";
  }
  let value = "";
  text.split(/\r?\n/).forEach((line) => {
    // "export NAME=..." too, as Node's loader takes it.
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && match[1] === name) value = unquote(match[2]);
  });
  return value;
};

const readDataDirFromEnvFile = (envFile) => readEnvFileValue(envFile, "VIEW_PRS_DATA_DIR");

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
  // ~ is your home folder, as in a shell (neither .env loader expands it).
  const home = /^~(?=$|[\\/])/.test(setting) ? path.join(os.homedir(), setting.slice(1)) : setting;
  return path.resolve(viewPrsDir, home);
};

/**
 * Why not to start with this data folder, or null: it's set elsewhere but
 * doesn't exist, while the app's data/ still holds the data - set before
 * the data was moved (npm run data:move), or mistyped. Starting would make
 * an empty dashboard there, and its new files would stop data:move.
 * @returns {string|null}
 */
const findDataDirProblem = ({ viewPrsDir, dataDir }) => {
  const appDataDir = path.resolve(viewPrsDir, "data");
  if (path.resolve(dataDir) === appDataDir || fs.existsSync(dataDir)) return null;
  if (!fs.existsSync(path.join(appDataDir, "check-open-pr-updates.data.json"))) return null;
  return (
    `The data folder ${dataDir} (VIEW_PRS_DATA_DIR) doesn't exist, and your data is still in ${appDataDir}. ` +
    "Move it there with `npm run data:move -- <folder>`, fix the setting, or create the folder to start with no data."
  );
};

module.exports = { findDataDirProblem, readDataDirFromEnvFile, readEnvFileValue, resolveDataDir };
