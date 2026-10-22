//
const createPrHttpHelpers = ({ fetch }) => {
  const postJson = async (url, payload) => {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    const result = await response.json();
    return { response, result };
  };

  return {
    postJson,
  };
};

export { createPrHttpHelpers };

// Phase 7 (see REACT_MIGRATION_PLAN.md): a separate bare module-scope
// export for React component use, calling the real global fetch directly
// - NOT a reference to the factory's own postJson above, unlike
// safeJsonStringify's own hoisting fix elsewhere, because THIS factory's
// `fetch` DI parameter is genuinely load-bearing for
// pr-http.helpers.test.js's own mock-fetch assertions (verifying the
// exact call args/error propagation) - collapsing the two into one shared
// function would silently break that test's ability to intercept fetch at
// all. NotesSection.jsx imports this instead of reading window.postJson.
export const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
  const result = await response.json();
  return { response, result };
};
