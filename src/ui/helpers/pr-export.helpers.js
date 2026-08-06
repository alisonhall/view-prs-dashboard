(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrExportHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrExportHelpers = ({ getPerPrUserStateFromPayload }) => {
    const asArray = (value) => (Array.isArray(value) ? value : []);

    const isPlainObject = (value) =>
      Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) === "[object Object]";

    const toSortedUnique = (values) =>
      Array.from(new Set(asArray(values).filter(Boolean))).sort((a, b) =>
        String(a).localeCompare(String(b)),
      );

    const collectLeafPaths = (value, prefix = "", collector = new Set()) => {
      if (Array.isArray(value)) {
        if (prefix) collector.add(prefix);
        return collector;
      }

      if (!isPlainObject(value)) {
        if (prefix) collector.add(prefix);
        return collector;
      }

      const keys = Object.keys(value);
      if (keys.length === 0 && prefix) {
        collector.add(prefix);
      }

      keys.forEach((key) => {
        const path = prefix ? `${prefix}.${key}` : String(key);
        const next = value[key];
        if (isPlainObject(next)) {
          collectLeafPaths(next, path, collector);
          return;
        }
        collector.add(path);
      });

      return collector;
    };

    const setByPath = (target, path, value) => {
      const parts = String(path || "")
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean);
      if (!parts.length) return;

      let cursor = target;
      for (let index = 0; index < parts.length; index += 1) {
        const key = parts[index];
        const isLast = index === parts.length - 1;
        if (isLast) {
          cursor[key] = value;
          return;
        }
        if (!isPlainObject(cursor[key])) {
          cursor[key] = {};
        }
        cursor = cursor[key];
      }
    };

    const readByPath = (source, path) => {
      const parts = String(path || "")
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean);
      if (!parts.length) return undefined;

      let cursor = source;
      for (let index = 0; index < parts.length; index += 1) {
        const key = parts[index];
        if (!cursor || typeof cursor !== "object") return undefined;
        if (!Object.prototype.hasOwnProperty.call(cursor, key)) return undefined;
        cursor = cursor[key];
      }

      return cursor;
    };

    const pickByPaths = (source, selectedPaths = []) => {
      const output = {};
      toSortedUnique(selectedPaths).forEach((path) => {
        const value = readByPath(source, path);
        if (value === undefined) return;
        setByPath(output, path, value);
      });
      return output;
    };

    const collectNodesByClass = (root, className) => {
      const results = [];
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        const classNames = String(node.className || "")
          .split(/\s+/)
          .map((value) => value.trim())
          .filter(Boolean);
        if (classNames.includes(className)) {
          results.push(node);
        }
        const children = node.children ? Array.from(node.children) : [];
        children.forEach(visit);
      };
      visit(root);
      return results;
    };

    const readAttribute = (element, name) => {
      if (!element || !name) return "";
      if (typeof element.getAttribute === "function") {
        return String(element.getAttribute(name) || "");
      }
      if (element.attributes && typeof element.attributes === "object") {
        return String(element.attributes[name] || "");
      }
      return "";
    };

    const getVisiblePrNumbersFromSectionsHost = (sectionsHost) => {
      const result = [];
      const seen = new Set();
      const sections = collectNodesByClass(sectionsHost, "pr-group-section");
      sections.forEach((section) => {
        if (section.open !== true) {
          return;
        }

        const numberCells = collectNodesByClass(section, "pr-number-cell");
        numberCells.forEach((cell) => {
          const prNumber = readAttribute(cell, "data-pr-number").trim();
          if (!prNumber || seen.has(prNumber)) return;
          seen.add(prNumber);
          result.push(prNumber);
        });
      });
      return result;
    };

    const buildDataSourceEntry = (entry) => {
      if (!isPlainObject(entry)) {
        return {};
      }

      const copy = { ...entry };
      delete copy.notes;
      return copy;
    };

    const getFieldCatalog = (payload = {}) => {
      const byPrNumber = payload?.byPrNumber || {};
      const dataPaths = new Set();
      const userStatePaths = new Set();

      Object.values(byPrNumber).forEach((entryRaw) => {
        const entry = isPlainObject(entryRaw) ? entryRaw : {};
        collectLeafPaths(buildDataSourceEntry(entry), "", dataPaths);

        const prNumber = String(entry?.prNumber || entry?.data?.number || "").trim();
        if (!prNumber) return;
        const repo = String(entry?.repo || payload?.lastRun?.repo || "").trim();
        const userState = getPerPrUserStateFromPayload(payload, entry, prNumber, repo);
        collectLeafPaths(userState, "", userStatePaths);
      });

      return {
        dataPaths: toSortedUnique(Array.from(dataPaths)),
        userStatePaths: toSortedUnique(Array.from(userStatePaths)),
      };
    };

    const buildExportPayload = ({
      payload = {},
      visiblePrNumbers = [],
      selectedDataPaths = [],
      selectedUserStatePaths = [],
    }) => {
      const byPrNumber = payload?.byPrNumber || {};
      const selectedPrNumbers = toSortedUnique(visiblePrNumbers);

      const items = selectedPrNumbers
        .map((prNumber) => {
          const entryRaw = byPrNumber?.[prNumber] || byPrNumber?.[String(prNumber)] || {};
          const entry = isPlainObject(entryRaw) ? entryRaw : {};
          const repo = String(entry?.repo || payload?.lastRun?.repo || "").trim();
          const data = pickByPaths(buildDataSourceEntry(entry), selectedDataPaths);
          const userState = pickByPaths(
            getPerPrUserStateFromPayload(payload, entry, String(prNumber), repo),
            selectedUserStatePaths,
          );

          return {
            prNumber: String(prNumber),
            repo,
            data,
            userState,
          };
        })
        .filter((item) => item.prNumber);

      return {
        generatedAt: new Date().toISOString(),
        lastRunUpdatedAt: payload?.lastRun?.updatedAt || null,
        selectedFields: {
          data: toSortedUnique(selectedDataPaths),
          userState: toSortedUnique(selectedUserStatePaths),
        },
        prCount: items.length,
        prs: items,
      };
    };

    return {
      getFieldCatalog,
      getVisiblePrNumbersFromSectionsHost,
      buildExportPayload,
      pickByPaths,
      collectLeafPaths,
    };
  };

  return {
    createPrExportHelpers,
  };
});
