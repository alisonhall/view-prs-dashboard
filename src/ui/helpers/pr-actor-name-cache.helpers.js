(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrActorNameCacheHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrActorNameCacheHelpers = ({ fetch, getOptionalElementById }) => {
    const setSectionStatus = (statusId, message, tone = "info") => {
      const statusEl = getOptionalElementById(statusId);
      if (!statusEl) return;
      statusEl.textContent = String(message || "");
      statusEl.className = `actor-name-cache-status actor-name-cache-status-${tone}`;
    };

    const setActorNameCacheStatus = (message, tone = "info") => {
      setSectionStatus("actor-name-cache-status", message, tone);
    };

    const setActorLoginAliasesStatus = (message, tone = "info") => {
      setSectionStatus("actor-login-aliases-status", message, tone);
    };

    const createMappingRow = ({
      rowClassName,
      keyInputClassName,
      valueInputClassName,
      keyPlaceholder,
      valuePlaceholder,
      keyAriaLabel,
      valueAriaLabel,
      removeAriaLabel,
      key = "",
      value = "",
    }) => {
      const row = document.createElement("div");
      row.className = rowClassName;

      const idInput = document.createElement("input");
      idInput.type = "text";
      idInput.className = keyInputClassName;
      idInput.placeholder = keyPlaceholder;
      idInput.value = String(key || "").trim();
      idInput.setAttribute("aria-label", keyAriaLabel);

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = valueInputClassName;
      nameInput.placeholder = valuePlaceholder;
      nameInput.value = String(value || "").trim();
      nameInput.setAttribute("aria-label", valueAriaLabel);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "actor-name-cache-remove";
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", removeAriaLabel);
      removeButton.addEventListener("click", () => {
        row.remove();
      });

      row.appendChild(idInput);
      row.appendChild(nameInput);
      row.appendChild(removeButton);
      return row;
    };

    const createActorNameCacheRow = ({ id = "", name = "" } = {}) =>
      createMappingRow({
        rowClassName: "actor-name-cache-row",
        keyInputClassName: "actor-name-cache-id",
        valueInputClassName: "actor-name-cache-name",
        keyPlaceholder: "authorLogin or user ID",
        valuePlaceholder: "Display name",
        keyAriaLabel: "Author/user ID",
        valueAriaLabel: "Display name",
        removeAriaLabel: "Remove actor name mapping row",
        key: id,
        value: name,
      });

    const createActorLoginAliasRow = ({ alias = "", canonical = "" } = {}) =>
      createMappingRow({
        rowClassName: "actor-login-alias-row",
        keyInputClassName: "actor-login-alias-id",
        valueInputClassName: "actor-login-alias-canonical",
        keyPlaceholder: "Alias login",
        valuePlaceholder: "Canonical login",
        keyAriaLabel: "Alias login",
        valueAriaLabel: "Canonical login",
        removeAriaLabel: "Remove actor login alias row",
        key: alias,
        value: canonical,
      });

    const renderMappingRows = ({ entries = {}, rowsHostId, rowFactory }) => {
      const rowsHost = getOptionalElementById(rowsHostId);
      if (!rowsHost) return;
      rowsHost.innerHTML = "";

      const sortedEntries = Object.entries(entries)
        .map(([id, value]) => [String(id || "").trim(), String(value || "").trim()])
        .filter(([id, value]) => id && value)
        .sort(([a], [b]) => a.localeCompare(b));

      if (sortedEntries.length === 0) {
        rowsHost.appendChild(rowFactory({}));
        return;
      }

      sortedEntries.forEach(([id, value]) => {
        rowsHost.appendChild(rowFactory({ id, name: value, alias: id, canonical: value }));
      });
    };

    const renderActorNameCacheRows = (entries = {}) => {
      renderMappingRows({
        entries,
        rowsHostId: "actor-name-cache-rows",
        rowFactory: createActorNameCacheRow,
      });
    };

    const renderActorLoginAliasRows = (entries = {}) => {
      renderMappingRows({
        entries,
        rowsHostId: "actor-login-aliases-rows",
        rowFactory: createActorLoginAliasRow,
      });
    };

    const getMappingPayloadFromRows = ({
      rowsHostId,
      rowClassName,
      keyInputSelector,
      valueInputSelector,
      emptyError,
      duplicatePrefix,
      incompleteError,
      disallowSameValue = false,
      sameValueError,
    }) => {
      const rowsHost = getOptionalElementById(rowsHostId);
      if (!rowsHost) {
        return { ok: false, error: "Actor mapping container is missing" };
      }

      const rows = Array.from(rowsHost.querySelectorAll(`.${rowClassName}`));

      const entries = {};
      for (const row of rows) {
        const id = String(row.querySelector(keyInputSelector)?.value || "").trim();
        const value = String(row.querySelector(valueInputSelector)?.value || "").trim();

        if (!id && !value) {
          continue;
        }

        if (!id || !value) {
          return {
            ok: false,
            error: incompleteError,
          };
        }

        if (Object.prototype.hasOwnProperty.call(entries, id)) {
          return { ok: false, error: `${duplicatePrefix}: ${id}` };
        }

        if (disallowSameValue && id === value) {
          return { ok: false, error: `${sameValueError}: ${id}` };
        }

        entries[id] = value;
      }

      if (Object.keys(entries).length === 0) {
        return {
          ok: false,
          error: emptyError,
        };
      }

      return { ok: true, entries };
    };

    const getActorNameCachePayloadFromRows = () =>
      getMappingPayloadFromRows({
        rowsHostId: "actor-name-cache-rows",
        rowClassName: "actor-name-cache-row",
        keyInputSelector: ".actor-name-cache-id",
        valueInputSelector: ".actor-name-cache-name",
        emptyError: "At least one mapping is required. Clearing all entries is blocked.",
        duplicatePrefix: "Duplicate ID detected",
        incompleteError: "Each non-empty row must include both an ID and a display name",
      });

    const getActorLoginAliasesPayloadFromRows = () =>
      getMappingPayloadFromRows({
        rowsHostId: "actor-login-aliases-rows",
        rowClassName: "actor-login-alias-row",
        keyInputSelector: ".actor-login-alias-id",
        valueInputSelector: ".actor-login-alias-canonical",
        emptyError: "At least one alias mapping is required. Clearing all entries is blocked.",
        duplicatePrefix: "Duplicate alias login detected",
        incompleteError: "Each non-empty alias row must include both an alias login and a canonical login",
        disallowSameValue: true,
        sameValueError: "Alias login and canonical login must differ",
      });

    const loadActorNameCache = async () => {
      setActorNameCacheStatus("Loading cache...", "info");
      try {
        const response = await fetch("/view-prs/actor-name-cache");
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.error || "Failed to load actor name cache");
        }

        const entries = payload?.entries && typeof payload.entries === "object"
          ? payload.entries
          : {};
        renderActorNameCacheRows(entries);
        const count = Object.keys(entries).length;
        setActorNameCacheStatus(
          `Loaded ${count} mapping${count === 1 ? "" : "s"}.`,
          "success",
        );
      } catch (error) {
        setActorNameCacheStatus(
          `Failed to load cache: ${error.message || String(error)}`,
          "error",
        );
      }

      setActorLoginAliasesStatus("Loading aliases...", "info");
      try {
        const response = await fetch("/view-prs/actor-login-aliases");
        const payload = await response.json();
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.error || "Failed to load actor login aliases");
        }

        const entries = payload?.entries && typeof payload.entries === "object"
          ? payload.entries
          : {};
        renderActorLoginAliasRows(entries);
        const count = Object.keys(entries).length;
        setActorLoginAliasesStatus(
          `Loaded ${count} alias mapping${count === 1 ? "" : "s"}.`,
          "success",
        );
      } catch (error) {
        setActorLoginAliasesStatus(
          `Failed to load aliases: ${error.message || String(error)}`,
          "error",
        );
      }
    };

    const saveActorNameCache = async () => {
      const payload = getActorNameCachePayloadFromRows();
      if (!payload.ok) {
        setActorNameCacheStatus(payload.error, "error");
        return;
      }

      setActorNameCacheStatus("Saving mappings...", "info");
      try {
        const response = await fetch("/view-prs/actor-name-cache", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload.entries),
        });
        const result = await response.json();
        if (!response.ok || result?.ok === false) {
          throw new Error(result?.error || "Failed to save actor name cache");
        }

        renderActorNameCacheRows(result.entries || payload.entries);
        const count = Object.keys(result.entries || payload.entries).length;
        setActorNameCacheStatus(
          `Saved ${count} mapping${count === 1 ? "" : "s"}.`,
          "success",
        );
      } catch (error) {
        setActorNameCacheStatus(
          `Failed to save cache: ${error.message || String(error)}`,
          "error",
        );
      }
    };

    const saveActorLoginAliases = async () => {
      const payload = getActorLoginAliasesPayloadFromRows();
      if (!payload.ok) {
        setActorLoginAliasesStatus(payload.error, "error");
        return;
      }

      setActorLoginAliasesStatus("Saving aliases...", "info");
      try {
        const response = await fetch("/view-prs/actor-login-aliases", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload.entries),
        });
        const result = await response.json();
        if (!response.ok || result?.ok === false) {
          throw new Error(result?.error || "Failed to save actor login aliases");
        }

        renderActorLoginAliasRows(result.entries || payload.entries);
        const count = Object.keys(result.entries || payload.entries).length;
        setActorLoginAliasesStatus(
          `Saved ${count} alias mapping${count === 1 ? "" : "s"}.`,
          "success",
        );
      } catch (error) {
        setActorLoginAliasesStatus(
          `Failed to save aliases: ${error.message || String(error)}`,
          "error",
        );
      }
    };

    const initActorNameCacheControls = () => {
      const refreshBtn = getOptionalElementById("actor-name-cache-refresh-btn");
      const addRowBtn = getOptionalElementById("actor-name-cache-add-row-btn");
      const saveBtn = getOptionalElementById("actor-name-cache-save-btn");
      const rowsHost = getOptionalElementById("actor-name-cache-rows");
      const aliasRefreshBtn = getOptionalElementById("actor-login-aliases-refresh-btn");
      const aliasAddRowBtn = getOptionalElementById("actor-login-aliases-add-row-btn");
      const aliasSaveBtn = getOptionalElementById("actor-login-aliases-save-btn");
      const aliasRowsHost = getOptionalElementById("actor-login-aliases-rows");
      if (
        !refreshBtn ||
        !addRowBtn ||
        !saveBtn ||
        !rowsHost ||
        !aliasRefreshBtn ||
        !aliasAddRowBtn ||
        !aliasSaveBtn ||
        !aliasRowsHost
      ) {
        return;
      }

      refreshBtn.addEventListener("click", () => {
        void loadActorNameCache();
      });
      addRowBtn.addEventListener("click", () => {
        rowsHost.appendChild(createActorNameCacheRow({}));
      });
      saveBtn.addEventListener("click", () => {
        void saveActorNameCache();
      });

      aliasRefreshBtn.addEventListener("click", () => {
        void loadActorNameCache();
      });
      aliasAddRowBtn.addEventListener("click", () => {
        aliasRowsHost.appendChild(createActorLoginAliasRow({}));
      });
      aliasSaveBtn.addEventListener("click", () => {
        void saveActorLoginAliases();
      });
    };

    return {
      createActorNameCacheRow,
      createActorLoginAliasRow,
      renderActorNameCacheRows,
      renderActorLoginAliasRows,
      getActorNameCachePayloadFromRows,
      getActorLoginAliasesPayloadFromRows,
      loadActorNameCache,
      saveActorNameCache,
      saveActorLoginAliases,
      initActorNameCacheControls,
      setActorNameCacheStatus,
      setActorLoginAliasesStatus,
    };
  };

  return {
    createPrActorNameCacheHelpers,
  };
});
