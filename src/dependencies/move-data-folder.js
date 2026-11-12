#!/usr/bin/env node
/**
 * Moves the data folder (README "Data folder"): copies everything in it to
 * a new folder, checks the copy, renames the old folder aside
 * (<folder>.moved-<time>, kept until you delete it), and sets
 * VIEW_PRS_DATA_DIR in the app's .env so the server, the CLI and the tools
 * all use the new one. Also puts a .gitignore in the new folder, for
 * keeping it in git: what's yours (notes, Acks, People, settings, sources)
 * is tracked; what's fetched again or changes every minute isn't.
 *
 * Usage: npm run data:move -- <new folder> [--dry-run]
 * Stop the server first: it would go on writing to the old folder (it
 * won't move while the server answers on its port).
 */

"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { readEnvFileValue, resolveDataDir } = require("../server/config/data-dir.js");

// Fetched again, rebuilt, or changing all the time: not worth tracking.
const DATA_GITIGNORE = `# What the dashboard fetches again or keeps changing (README "Data folder").
# Tracked: your notes and Acks (check-open-pr-updates.user-state.json),
# Authors comments, People (actors.json), settings (user-defaults.json) and
# sources.
check-open-pr-updates.data.json
check-open-pr-updates.data.archive.json
check-open-pr-updates.live-summary.json
check-open-pr-updates.scheduler.json
action-log.json
pr-details/
pr-diffs/
backups/
*.lock/
*.pid
*.log
*.tmp-*
*.unreadable-*
`;

const stamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

// The same folder (case aside on Windows, as path.relative does).
const samePath = (a, b) => path.relative(path.resolve(a), path.resolve(b)) === "";

const isInside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

// Every file under a folder, relative paths and sizes.
const listFiles = (root) => {
  const files = [];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push({ path: path.relative(root, full), size: fs.statSync(full).size });
    });
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
};

// The .env text with VIEW_PRS_DATA_DIR set (the last such line replaced,
// others dropped; added at the end when there's none), in the file's own
// line endings.
const withDataDirSetting = (envText, dataDir) => {
  const eol = /\r\n/.test(envText || "") ? "\r\n" : "\n";
  const value = dataDir.replace(/\\/g, "/");
  // Quoted when Node's .env loader would cut or change it unquoted (at a #,
  // or its spaces at either end): single quotes keep it as it is.
  const needsQuotes = /[#"'`]|^\s|\s$/.test(value);
  const quoted = !needsQuotes ? value : value.includes("'") ? `"${value}"` : `'${value}'`;
  const line = `VIEW_PRS_DATA_DIR=${quoted}`;
  const lines = envText ? envText.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n") : [];
  const indexes = lines.map((each, index) => (/^\s*(?:export\s+)?VIEW_PRS_DATA_DIR\s*=/.test(each) ? index : -1)).filter((index) => index >= 0);
  const last = indexes[indexes.length - 1];
  const result =
    indexes.length === 0
      ? [...lines, ...(lines.length ? [""] : []), "# The data folder (README \"Data folder\"; set by npm run data:move).", line]
      : lines.flatMap((each, index) => (indexes.includes(index) ? (index === last ? [line] : []) : [each]));
  return `${result.join(eol)}${eol}`;
};

/**
 * Plans, and unless `dryRun` carries out, the move. Throws with what's wrong
 * (the destination not empty, inside the old folder, the old folder busy...).
 * Returns { source, destination, movedAside, files, envFile }.
 */
const moveDataFolder = ({ viewPrsDir, destination: destinationRaw, dryRun = false, now = new Date(), env = process.env }) => {
  if (!destinationRaw) throw new Error("Name the new folder: npm run data:move -- <new folder>");
  const source = resolveDataDir({ viewPrsDir, env });
  const destination = path.resolve(viewPrsDir, destinationRaw);
  const envFile = path.join(viewPrsDir, ".env");

  if (!fs.existsSync(source)) throw new Error(`The data folder ${source} doesn't exist: nothing to move.`);
  if (isInside(source, destination) || isInside(destination, source)) {
    throw new Error(`${destination} and the data folder ${source} can't be inside one another.`);
  }
  if (fs.existsSync(destination) && fs.readdirSync(destination).length > 0) {
    throw new Error(`${destination} isn't empty: pick a new or empty folder.`);
  }
  // A lock folder means a run (the server's, or the script's) is writing.
  const locks = fs.readdirSync(source).filter((name) => name.endsWith(".lock"));
  if (locks.length > 0) {
    throw new Error(`Something is writing to the data folder (${locks.join(", ")}): stop the server, or wait for the run, and try again.`);
  }

  const files = listFiles(source);
  const movedAside = `${source}.moved-${stamp(now)}`;
  // A VIEW_PRS_DATA_DIR in the environment wins over .env's.
  const envOverride = String(env.VIEW_PRS_DATA_DIR || "").trim() || null;
  const result = { source, destination, movedAside, files, envFile, envOverride, dryRun };
  if (dryRun) return result;

  // Renamed aside first: it fails (on Windows) while something has a file in
  // it open, before anything has changed - and nothing can write to it while
  // it's copied.
  try {
    fs.renameSync(source, movedAside);
  } catch (error) {
    throw new Error(`Couldn't rename ${source} (${error.code || error.message}) - is the server still running? Nothing was changed.`, {
      cause: error,
    });
  }
  try {
    fs.mkdirSync(destination, { recursive: true });
    fs.cpSync(movedAside, destination, { recursive: true, errorOnExist: true, force: false });
    const copied = listFiles(destination);
    const same =
      copied.length === files.length && copied.every((file, index) => file.path === files[index].path && file.size === files[index].size);
    if (!same) throw new Error(`The copy in ${destination} doesn't match ${source}.`);

    const gitignore = path.join(destination, ".gitignore");
    if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, DATA_GITIGNORE, "utf8");

    const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
    // Written beside it and renamed over it: a failed write (a full disk)
    // can't leave .env - your token too - half written. Beside the file a
    // symlinked .env points at, and with its permissions (chmod 600 kept).
    const envTarget = fs.existsSync(envFile) ? fs.realpathSync(envFile) : envFile;
    const envMode = fs.existsSync(envFile) ? fs.statSync(envTarget).mode & 0o777 : 0o600;
    const envTemp = `${envTarget}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(envTemp, withDataDirSetting(envText, destination), { encoding: "utf8", mode: envMode });
      fs.chmodSync(envTemp, envMode);
      fs.renameSync(envTemp, envTarget);
    } finally {
      fs.rmSync(envTemp, { force: true });
    }
  } catch (error) {
    try {
      fs.renameSync(movedAside, source);
    } catch (renameError) {
      throw new Error(
        `${error.message || error} Then couldn't rename ${movedAside} back to ${source} (${renameError.code || renameError.message}): rename it back yourself; .env is unchanged.`,
        { cause: renameError },
      );
    }
    throw new Error(
      `${error.message || error} The data folder is back at ${source} and .env unchanged; empty ${destination} before trying again.`,
      { cause: error },
    );
  }
  return result;
};

/**
 * The dashboard's server, when one is running on this computer (its /health
 * answers), as { port, dataDir }; else null. Moving the folder from under it
 * would leave it writing to the old one - which on macOS and Linux nothing
 * stops (Windows refuses the rename while a file in it is open).
 */
const findRunningServer = async ({ viewPrsDir, env = process.env, fetchImpl = globalThis.fetch }) => {
  const envFile = path.join(viewPrsDir, ".env");
  // As server.js finds it once .env is loaded (which never overrides the
  // environment): VIEW_PRS_PORT, then PORT, each from either.
  const setting = (name) => String(env[name] || "").trim() || readEnvFileValue(envFile, name);
  const port = setting("VIEW_PRS_PORT") || setting("PORT") || "9000";
  // Where server.js listens: VIEW_PRS_HOST, else 127.0.0.1 - not
  // "localhost", which may be ::1, where it doesn't. One listening on every
  // address answers on 127.0.0.1 too.
  const host = setting("VIEW_PRS_HOST") || "127.0.0.1";
  const address = ["0.0.0.0", "::", "[::]"].includes(host) ? "127.0.0.1" : host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  try {
    const response = await fetchImpl(`http://${address}:${port}/health`, { signal: AbortSignal.timeout(1500) });
    const body = response.ok ? await response.json() : null;
    return body && body.app === "view-prs" ? { port, dataDir: body.dataDir } : null;
  } catch (_error) {
    return null;
  }
};

// The running server (findRunningServer) when it uses this folder; null for
// one from another copy of the app, with its own folder, which can go on
// running. One that doesn't say which folder counts, to be safe.
const findServerUsing = async ({ folder, ...options }) => {
  const found = await findRunningServer(options);
  return found && (!found.dataDir || samePath(found.dataDir, folder)) ? found : null;
};

// Whether a folder inside the app's own folder would show up in the app's
// git status (your notes committed with the code by mistake).
const isUntrackedInAppRepo = (viewPrsDir, folder) => {
  const relative = path.relative(viewPrsDir, folder);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return false;
  // 1 is "not ignored"; 0 ignored; 128 (not a git checkout) or no git at
  // all (null) say nothing. Asked of a file in it: a "folder/" rule matches
  // only a folder that exists, and a dry run's doesn't yet.
  const check = spawnSync("git", ["check-ignore", "-q", path.join(folder, "actors.json")], { cwd: viewPrsDir });
  return check.status === 1;
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const destinationArg = args.find((arg) => !arg.startsWith("--"));
  const viewPrsDir = path.resolve(__dirname, "..", "..");
  (async () => {
    // A relative folder is from where you ran npm (it runs this from the app's).
    const destination = destinationArg && path.resolve(process.env.INIT_CWD || process.cwd(), destinationArg);
    const plan = moveDataFolder({ viewPrsDir, destination, dryRun: true });
    const server = await findServerUsing({ viewPrsDir, folder: plan.source });
    if (server && !dryRun) {
      throw new Error(`The dashboard's server is running (port ${server.port}): stop it first, then move the folder.`);
    }
    const result = dryRun ? plan : moveDataFolder({ viewPrsDir, destination, dryRun });
    if (server) console.log(`Note: the dashboard's server is running (port ${server.port}) - stop it before moving.`);
    const verb = result.dryRun ? "Would move" : "Moved";
    console.log(`${verb} ${result.files.length} files from ${result.source} to ${result.destination}.`);
    console.log(`${result.dryRun ? "Would set" : "Set"} VIEW_PRS_DATA_DIR in ${result.envFile}.`);
    console.log(`${result.dryRun ? "Would keep" : "Kept"} the old folder as ${result.movedAside} - delete it once the new one works.`);
    if (result.envOverride) {
      console.log(`Note: VIEW_PRS_DATA_DIR is also set in your environment (${result.envOverride}), which wins over .env - change or unset it there.`);
    }
    if (isUntrackedInAppRepo(viewPrsDir, result.destination)) {
      console.log(
        `Note: ${result.destination} is inside the app's folder and not in its .gitignore - add it there, or your notes will show up in the app's git status.`,
      );
    }
    if (!result.dryRun) console.log("Start the server again to use the new folder.");
  })().catch((error) => {
    console.error(`[data:move] ${error.message || error}`);
    process.exit(1);
  });
}

module.exports = { DATA_GITIGNORE, findRunningServer, findServerUsing, isUntrackedInAppRepo, moveDataFolder, withDataDirSetting };
