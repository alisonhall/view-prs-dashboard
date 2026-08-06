(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsDiffRenderHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrDiffRenderHelpers = ({
    clearElementChildren,
    documentRef,
  } = {}) => {
    const clearElementChildrenSafe =
      typeof clearElementChildren === "function" ? clearElementChildren : () => {};

    const getDocument = () =>
      documentRef || (typeof document !== "undefined" ? document : null);

    const getDiffLineType = (line) => {
      const text = String(line || "");
      if (text.startsWith("diff --git ")) return "file";
      if (text.startsWith("index ") || text.startsWith("Binary files ")) {
        return "meta";
      }
      if (text.startsWith("@@")) return "hunk";
      if (text.startsWith("+") && !text.startsWith("+++")) return "add";
      if (text.startsWith("-") && !text.startsWith("---")) return "del";
      return "context";
    };

    const renderDiffText = (container, diffText) => {
      const doc = getDocument();
      if (!container || !doc || typeof doc.createElement !== "function") return;

      const rawText = String(diffText || "");
      container.dataset.rawDiff = rawText;
      clearElementChildrenSafe(container);

      const parseFileHeader = (line) => {
        const header = String(line || "");
        const fileHeaderMatch = header.match(/^diff --git\s+a\/(.+?)\s+b\/(.+)$/);
        if (fileHeaderMatch) {
          return `${fileHeaderMatch[1]} -> ${fileHeaderMatch[2]}`;
        }
        return header.replace(/^diff --git\s*/, "");
      };

      const createFileBlock = (line) => {
        const fileBlock = doc.createElement("details");
        fileBlock.className = "pr-json-diff-file-block";
        fileBlock.open = true;

        const fileSummary = doc.createElement("summary");
        fileSummary.className = "pr-json-diff-line pr-json-diff-line-file pr-json-diff-file-summary";

        const filePill = doc.createElement("span");
        filePill.className = "pr-json-diff-file-pill";
        filePill.textContent = "FILE";

        const filePath = doc.createElement("span");
        filePath.className = "pr-json-diff-file-path";
        filePath.textContent = parseFileHeader(line);

        fileSummary.appendChild(filePill);
        fileSummary.appendChild(filePath);

        const fileBody = doc.createElement("div");
        fileBody.className = "pr-json-diff-file-body";

        fileBlock.appendChild(fileSummary);
        fileBlock.appendChild(fileBody);
        container.appendChild(fileBlock);
        return fileBody;
      };

      let activeFileBody = null;
      const lines = rawText.split(/\r?\n/);
      lines.forEach((line) => {
        const lineType = getDiffLineType(line);
        if (lineType === "file") {
          activeFileBody = createFileBlock(line);
          return;
        }

        const row = doc.createElement("div");
        row.className = `pr-json-diff-line pr-json-diff-line-${lineType}`;
        row.textContent = line.length ? line : " ";

        if (activeFileBody) {
          activeFileBody.appendChild(row);
        } else {
          container.appendChild(row);
        }
      });
    };

    return {
      getDiffLineType,
      renderDiffText,
    };
  };

  return {
    createPrDiffRenderHelpers,
  };
});
