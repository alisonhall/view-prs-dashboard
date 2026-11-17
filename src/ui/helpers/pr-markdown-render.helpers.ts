// Renders GitHub comment/review markdown (the detail pane's Conversations
// and Activity tabs) to HTML for dangerouslySetInnerHTML. Depends on the
// window.marked and window.DOMPurify globals, both vendored via <script>
// tags in index.html.
//
// Comment bodies are written by anyone who can comment on the PR, and
// marked passes raw HTML straight through, so the output is always
// sanitized: an `<img onerror>` or `<script>` in a comment must not run in
// the dashboard, which can call the local server's script-running routes.
// Without DOMPurify (or marked) it fails closed, showing the comment as
// escaped plain text rather than unsanitized HTML.
//
// Images and videos uploaded to GitHub (its user-attachments links, or
// older signed image links) can't be loaded by the page: given the PR
// they're in, they're fetched through the server (/view-prs/attachment,
// with the gh login); without it, an image shows as "[image unavailable]".
// A bare attachment link alone in a paragraph is a video, as GitHub shows
// it.

// The PR a text is from, for fetching its attachments.
export interface MarkdownAttachmentSource {
  repo: string;
  prNumber: string;
}

const ATTACHMENT_LINK = /^https:\/\/[^/]+\/user-attachments\/assets\/[0-9a-f-]{36}$/i;
const SIGNED_IMAGE_LINK = /^https:\/\/private-user-images\.githubusercontent\.com\//i;
const isAttachmentLink = (url: string) => ATTACHMENT_LINK.test(url) || SIGNED_IMAGE_LINK.test(url);

export const attachmentUrl = (url: string, source: MarkdownAttachmentSource) =>
  `/view-prs/attachment?${new URLSearchParams({ url, repo: source.repo, prNumber: source.prNumber }).toString()}`;

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

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// The fail-closed fallback: the text escaped, in a box that keeps its line
// breaks (.md-plain; the rendered HTML's own boxes don't, or the line
// breaks between its blocks would show as gaps).
const asPlainText = (text: string): string => `<div class="md-plain">${escapeHtml(text)}</div>`;

// After sanitizing, in an inert <template> (nothing in it runs or loads),
// so nothing the sanitizer removed can come back - and the elements added
// here (the placeholder's class, a video) are this code's, not the text's:
// - GitHub's attachments go through the server, given the PR; else an
//   image is the placeholder.
// - A bare attachment link alone in a paragraph is a video.
// - Links open in a new tab, with no opener or referrer: followed in place,
//   a link would take the dashboard's own tab away, and any unsaved notes
//   with it. Links within the text (#...) stay.
const finishHtml = (html: string, source?: MarkdownAttachmentSource): string => {
  if (typeof document === "undefined" || !/<(a|img)\b/i.test(html)) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  const root = template.content;
  root.querySelectorAll("img[src]").forEach((image) => {
    const src = image.getAttribute("src") || "";
    if (!isAttachmentLink(src)) return;
    if (source) {
      image.setAttribute("src", attachmentUrl(src, source));
      image.setAttribute("loading", "lazy");
      return;
    }
    const placeholder = document.createElement("span");
    placeholder.className = "md-image-expired";
    placeholder.title = "Image unavailable (expired GitHub URL)";
    placeholder.textContent = "[image unavailable]";
    image.replaceWith(placeholder);
  });
  if (source) {
    root.querySelectorAll("p > a[href]").forEach((link) => {
      const href = link.getAttribute("href") || "";
      const paragraph = link.parentElement;
      const alone = paragraph && paragraph.childNodes.length === 1 && (link.textContent || "").trim() === href;
      if (!alone || !ATTACHMENT_LINK.test(href)) return;
      const video = document.createElement("video");
      video.className = "md-video";
      video.controls = true;
      video.preload = "metadata";
      video.src = attachmentUrl(href, source);
      // Where it can't play: the link to it on GitHub.
      const fallback = document.createElement("a");
      fallback.href = href;
      fallback.textContent = "Open the video on GitHub";
      video.append(fallback);
      paragraph.replaceWith(video);
    });
  }
  root.querySelectorAll("a[href]").forEach((link) => {
    if ((link.getAttribute("href") || "").startsWith("#")) return;
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });
  return template.innerHTML;
};

const createPrMarkdownRenderHelpers = () => {
  // `source`: the PR the text is from, for its attachments.
  const renderMarkdownAsHtml = (markdownText: unknown, source?: MarkdownAttachmentSource): string => {
    const text = String(markdownText || "").trim();
    if (!text) return "";

    const sanitizer = window.DOMPurify;
    const marked = window.marked;
    if (!marked || typeof sanitizer?.sanitize !== "function") {
      return asPlainText(text);
    }

    let html: string;
    try {
      // As GitHub renders a comment: a line break in a paragraph is one.
      html = marked.parse(text, { breaks: true, gfm: true });
    } catch (error) {
      console.warn("Failed to render markdown", error);
      return asPlainText(text);
    }
    return finishHtml(sanitizer.sanitize(html, MARKDOWN_SANITIZE_CONFIG), source);
  };

  return {
    renderMarkdownAsHtml,
  };
};

export { createPrMarkdownRenderHelpers };
