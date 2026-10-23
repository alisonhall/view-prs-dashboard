// Renders GitHub comment/review markdown (ReviewThreadsSection.jsx) to HTML
// for dangerouslySetInnerHTML. Depends on the window.marked and
// window.DOMPurify globals, both vendored via <script> tags in index.html.
//
// Comment bodies are written by anyone who can comment on the PR, and
// marked passes raw HTML straight through, so the output is always
// sanitized: an `<img onerror>` or `<script>` in a comment must not run in
// the dashboard, which can call the local server's script-running routes.
// Without DOMPurify (or marked) it fails closed, showing the comment as
// escaped plain text rather than unsanitized HTML.
const EXPIRED_GITHUB_IMAGE_PLACEHOLDER = `<span class="md-image-expired" title="Image unavailable (expired GitHub URL)">[image unavailable]</span>`;

// Same forbidden tags as InsightsHookSection.jsx's hook-output sanitizing:
// not script vectors (DOMPurify blocks those by default), but they can
// restyle or redirect the whole page, and a <form> is a phishing vector.
// `style`, `class` and `id` attributes go too (GitHub strips or prefixes
// them in comments as well). DOMPurify keeps them, so a comment could
// otherwise lay a fake full-page box over the dashboard (an inline
// `position: fixed`, or one of the app's own fixed classes such as
// pr-json-modal), or add a second element with an id the app looks up.
const MARKDOWN_SANITIZE_CONFIG = {
  FORBID_TAGS: ["style", "link", "base", "meta", "form"],
  FORBID_ATTR: ["style", "class", "id"],
};

const escapeHtml = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const createPrMarkdownRenderHelpers = () => {
  const replaceExpiredGithubImages = (html) => {
    // Replace entire <img ...> tags where src is from known expiring/private GitHub attachment hosts.
    return html.replace(
      /<img\b[^>]*\bsrc=["']https:\/\/(?:private-user-images\.githubusercontent\.com|github\.com\/user-attachments)\/[^"']*["'][^>]*>/gi,
      EXPIRED_GITHUB_IMAGE_PLACEHOLDER,
    );
  };

  const renderMarkdownAsHtml = (markdownText) => {
    const text = String(markdownText || "").trim();
    if (!text) return "";

    const sanitizer = window.DOMPurify;
    if (!window.marked || typeof sanitizer?.sanitize !== "function") {
      return escapeHtml(text);
    }

    let html;
    try {
      html = window.marked.parse(text);
    } catch (error) {
      console.warn("Failed to render markdown", error);
      return escapeHtml(text);
    }
    // Placeholders go in after sanitizing: they're a fixed trusted string,
    // and their class would otherwise be stripped.
    return replaceExpiredGithubImages(sanitizer.sanitize(html, MARKDOWN_SANITIZE_CONFIG));
  };

  return {
    renderMarkdownAsHtml,
  };
};

export { createPrMarkdownRenderHelpers };
