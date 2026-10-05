// Phase 7 (see REACT_MIGRATION_PLAN.md): pure extraction of index.page.js's
// former renderMarkdownAsHtml/replaceExpiredGithubImages bodies into a
// DI-factory module, so ReviewThreadsSection.jsx can import it directly
// instead of reading window.renderMarkdownAsHtml. Byte-for-byte-logic-
// preserving move - depends only on the third-party window.marked global
// (vendored via a <script> tag in index.html, not an app-state bridge),
// so there's nothing else to inject.
export const { createPrMarkdownRenderHelpers } = (() => {
  const EXPIRED_GITHUB_IMAGE_PLACEHOLDER = `<span class="md-image-expired" title="Image unavailable (expired GitHub URL)">[image unavailable]</span>`;

  const createPrMarkdownRenderHelpers = () => {
    const replaceExpiredGithubImages = (html) => {
      // Replace entire <img ...> tags where src is from known expiring/private GitHub attachment hosts.
      return html.replace(
        /<img\b[^>]*\bsrc=["']https:\/\/(?:private-user-images\.githubusercontent\.com|github\.com\/user-attachments)\/[^"']*["'][^>]*>/gi,
        EXPIRED_GITHUB_IMAGE_PLACEHOLDER,
      );
    };

    const renderMarkdownAsHtml = (markdownText) => {
      if (!markdownText || !window.marked) return String(markdownText || "").trim();
      try {
        const html = window.marked.parse(String(markdownText).trim());
        return replaceExpiredGithubImages(html);
      } catch (error) {
        console.warn("Failed to render markdown", error);
        return String(markdownText).trim();
      }
    };

    return {
      renderMarkdownAsHtml,
    };
  };

  return {
    createPrMarkdownRenderHelpers,
  };
})();
