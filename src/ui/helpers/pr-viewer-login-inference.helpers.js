// Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): extracted out of
// index.page.js so both it and PrDataProvider.jsx (React's own independent
// viewer-context derivation) can share the exact same last-resort fallback
// - previously index.page.js only exposed this indirectly, via computed
// values pushed through window.* bridges. This is a best-effort fallback
// used only when neither payload.viewerLogin nor a row's own
// data.viewerLogin is available; it scrapes the #output/#status panels for
// a "Viewer : <login>" string index.page.js itself writes there.
export const inferViewerLoginFromPage = ({
  documentRef = typeof document !== "undefined" ? document : null,
} = {}) => {
  if (!documentRef) return "";

  const candidates = [
    documentRef.getElementById("output")?.textContent,
    documentRef.getElementById("status")?.textContent,
  ];

  for (const candidate of candidates) {
    const text = String(candidate || "");
    const match = text.match(/Viewer\s*:\s*([^\s|]+)/i);
    if (match && match[1]) {
      return String(match[1]).trim();
    }
  }

  return "";
};
