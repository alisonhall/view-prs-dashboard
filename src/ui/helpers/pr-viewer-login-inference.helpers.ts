// Last-resort viewer-login fallback for PrDataProvider, used only when
// neither payload.viewerLogin nor a row's own viewerLogin is available: it
// reads the "Viewer     : <login>" line that check-open-pr-updates.sh
// prints, from the #output/#status panels.
export interface InferViewerLoginOptions {
  documentRef?: Pick<Document, "getElementById"> | null;
}

export const inferViewerLoginFromPage = ({
  documentRef = typeof document !== "undefined" ? document : null,
}: InferViewerLoginOptions = {}): string => {
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
