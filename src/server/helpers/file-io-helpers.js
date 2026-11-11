/**
 * File I/O Helpers - Extracted from app.js
 * 
 * Provides utilities for reading and writing JSON files with error handling.
 * 
 * @module file-io-helpers
 */

// Import view-prs-data-helpers directly (plain module)
const { isObject } = require('./view-prs-data-helpers');

/**
 * Writes a file's new content beside it and renames it over the file, so
 * a server stopped mid-write leaves the old content whole instead of a
 * cut-off file - which reads back as empty and loses everything in it.
 *
 * @param {Object} fs - Node.js fs module
 * @param {string} filePath - Path to write to
 * @param {string} content - The file's new content
 * @returns {void}
 * @throws {Error} If the write or rename fails (the temp file is removed)
 */
const writeFileReplacingSync = (fs, filePath, content) => {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, content, "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch (_error) {
      // Best effort temp cleanup.
    }
    throw error;
  }
};

/**
 * Creates file I/O helper functions.
 * 
 * @param {Object} deps - Dependencies
 * @param {Object} deps.fs - Node.js fs module
 * @param {Object} deps.path - Node.js path module
 * @returns {Object} File I/O helper functions
 */
function createFileIoHelpers({ fs, path }) {
  /**
   * Reads a JSON file if it exists, otherwise returns fallback value.
   * 
   * @param {string} filePath - Path to JSON file
   * @param {*} fallbackValue - Value to return if file doesn't exist or parse fails
   * @returns {*} Parsed JSON content or fallback value
   */
  const readJsonFileIfExists = (filePath, fallbackValue) => {
    try {
      if (!fs.existsSync(filePath)) {
        return fallbackValue;
      }
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (_error) {
      return fallbackValue;
    }
  };

  /**
   * Reads a JSON file with detailed result information.
   * 
   * @param {string} filePath - Path to JSON file
   * @returns {Object} Result object with exists, value, and parseError properties
   */
  const readJsonFileIfExistsDetailed = (filePath) => {
    if (!fs.existsSync(filePath)) {
      return {
        exists: false,
        value: null,
        parseError: null,
      };
    }

    try {
      return {
        exists: true,
        value: JSON.parse(fs.readFileSync(filePath, "utf8")),
        parseError: null,
      };
    } catch (error) {
      return {
        exists: true,
        value: null,
        parseError: error,
      };
    }
  };

  /**
   * Safely reads a JSON file with fallback.
   * Similar to readJsonFileIfExists but with explicit null default.
   * 
   * @param {string} filePath - Path to JSON file
   * @param {*} [fallbackValue=null] - Value to return on error
   * @returns {*} Parsed JSON or fallback
   */
  const safeReadJsonFile = (filePath, fallbackValue = null) => {
    try {
      if (!fs.existsSync(filePath)) {
        return fallbackValue;
      }
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (_error) {
      return fallbackValue;
    }
  };

  /**
   * Writes JSON to a file with best-effort error handling.
   * Creates parent directory if needed.
   * 
   * @param {string} filePath - Path to write to
   * @param {*} value - Value to serialize as JSON
   * @returns {void}
   */
  const writeJsonFileBestEffort = (filePath, value) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
    } catch (_error) {
      // Best effort - silently fail
    }
  };

  /**
   * Writes JSON to a file, throwing on error.
   * Creates parent directory if needed.
   * 
   * @param {string} filePath - Path to write to
   * @param {*} value - Value to serialize as JSON
   * @returns {void}
   * @throws {Error} If write fails
   */
  const writeJsonFile = (filePath, value) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileReplacingSync(fs, filePath, JSON.stringify(value, null, 2));
  };

  /**
   * Creates user-specific file I/O helpers.
   * These helpers know about specific file paths.
   * 
   * @param {Object} config - Configuration
   * @param {string} config.viewPrsUserDefaultsFile - Path to user defaults file
   * @param {string} config.viewPrsAuthorCommentsFile - Path to author comments file
   * @param {string} config.viewPrsActorLoginAliasesFile - Path to actor aliases file
   * @param {string} config.viewPrsActorNameCacheFile - Path to actor name cache file
   * @param {string} config.viewPrsUserStateFile - Path to user state file
   * @returns {Object} User-specific file I/O helpers
   */
  const createUserFileHelpers = (config) => {
    return {
      /**
       * Reads user defaults from configured file.
       * @returns {Object} User defaults or empty object
       */
      readUserDefaults: () => {
        if (!fs.existsSync(config.viewPrsUserDefaultsFile)) {
          return {};
        }
        try {
          const parsed = JSON.parse(
            fs.readFileSync(config.viewPrsUserDefaultsFile, "utf8")
          );
          return isObject(parsed) ? parsed : {};
        } catch (_error) {
          return {};
        }
      },

      /**
       * Writes user defaults to configured file.
       * @param {Object} overrides - User defaults to write
       * @returns {void}
       */
      writeUserDefaults: (overrides) => {
        const data = isObject(overrides) ? overrides : {};
        writeJsonFile(config.viewPrsUserDefaultsFile, data);
      },

      /**
       * Reads author comments from configured file.
       * @returns {Object} Author comments or empty object
       */
      readViewPrsAuthorComments: () =>
        readJsonFileIfExists(config.viewPrsAuthorCommentsFile, {}),

      /**
       * Reads actor login aliases from configured file.
       * @returns {Object} Actor aliases or empty object
       */
      readViewPrsActorLoginAliases: () =>
        readJsonFileIfExists(config.viewPrsActorLoginAliasesFile, {}),

      /**
       * Reads actor name cache from configured file.
       * @returns {Object} Actor name cache or empty object
       */
      readViewPrsActorNameCache: () =>
        readJsonFileIfExists(config.viewPrsActorNameCacheFile, {}),

      /**
       * Reads user state from configured file.
       * @returns {Object} User state or empty object
       */
      readViewPrsUserState: () =>
        readJsonFileIfExists(config.viewPrsUserStateFile, {}),
    };
  };

  // Return public API
  return {
    readJsonFileIfExists,
    readJsonFileIfExistsDetailed,
    safeReadJsonFile,
    writeJsonFileBestEffort,
    writeJsonFile,
    createUserFileHelpers,
  };
}

module.exports = { createFileIoHelpers, writeFileReplacingSync };
