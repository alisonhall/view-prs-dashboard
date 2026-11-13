// Files uploaded to GitHub in a PR's description or comments (images and
// videos at https://<host>/user-attachments/assets/<id>), for the page to
// show: GitHub serves them only to someone signed in, or through short-lived
// signed links, so the page can't load them itself. GET /view-prs/attachment
// fetches one with the user's gh login and keeps it in viewPrsAttachmentDir
// by its id (an upload never changes), so each is downloaded once.
//
// In order: the kept copy; the link with the gh token (sent only to the
// attachment's own host - github.com, or the PR's GitHub Enterprise host -
// and not on to the storage it redirects to); then, given the PR, the
// signed link to the same id in the PR's rendered description, comments
// and reviews (GitHub's API gives them with each body_html).
const ATTACHMENT_PATH = /^\/user-attachments\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
// Older links: a signed image link (its signature long expired), with the
// id in its file name.
const SIGNED_IMAGE_HOST = "private-user-images.githubusercontent.com";
const ID_IN_NAME = /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]+$/i;
const ALLOWED_TYPES = /^(image|video)\//i;

const createViewPrsAttachmentProxy = ({
  fs,
  path,
  isRepoSlug,
  runViewPrsCommand,
  viewPrsAttachmentDir,
  getRepoGhEnv = () => ({}),
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = 30000,
  maxBytes = 50 * 1024 * 1024,
}) => {
  // The attachment a link is to - { host, id } - when it's one this can
  // fetch: an attachment link on github.com or the PR's own host, or an old
  // signed image link.
  const parseAttachmentUrl = (rawUrl, repo) => {
    let url;
    try {
      url = new URL(String(rawUrl || ""));
    } catch (_error) {
      return null;
    }
    if (url.protocol !== "https:") return null;
    const repoHost = (isRepoSlug(repo) && getRepoGhEnv(repo).GH_HOST) || "github.com";
    const asset = url.pathname.match(ATTACHMENT_PATH);
    if (asset && (url.host === "github.com" || url.host === repoHost)) return { host: url.host, id: asset[1].toLowerCase() };
    const named = url.host === SIGNED_IMAGE_HOST && url.pathname.match(ID_IN_NAME);
    if (named) return { host: "github.com", id: named[1].toLowerCase() };
    return null;
  };

  const filePaths = (id) => ({ data: path.join(viewPrsAttachmentDir, `${id}.bin`), meta: path.join(viewPrsAttachmentDir, `${id}.json`) });

  // The kept file's path and type (the route serves it from disk, with
  // range requests for video seeking), or null.
  const readKept = (id) => {
    const { data, meta } = filePaths(id);
    try {
      const { contentType } = JSON.parse(fs.readFileSync(meta, "utf8"));
      return ALLOWED_TYPES.test(contentType || "") && fs.existsSync(data) ? { contentType, filePath: data } : null;
    } catch (_error) {
      return null;
    }
  };

  // The file, then its type: a reader never finds a type without its file.
  const keep = (id, file) => {
    fs.mkdirSync(viewPrsAttachmentDir, { recursive: true });
    const { data, meta } = filePaths(id);
    const suffix = `.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(data + suffix, file.body);
    fs.renameSync(data + suffix, data);
    fs.writeFileSync(meta + suffix, JSON.stringify({ contentType: file.contentType, keptAt: new Date().toISOString() }));
    fs.renameSync(meta + suffix, meta);
    return { contentType: file.contentType, filePath: data };
  };

  const ghToken = async (host) => {
    const result = await runViewPrsCommand("gh", ["auth", "token", "--hostname", host], 64 * 1024, { timeoutMs });
    return String(result?.stdout || "").trim();
  };

  // Whether a link is to one of GitHub's own file hosts - the attachment's
  // host, its user-content hosts, or its upload storage - with the file's id
  // in its path. Links from a PR's rendered bodies come from comments
  // anyone on the PR can write, and redirects are followed: nothing else is
  // fetched, so a comment can't make the server request an address of its
  // choosing, or put another file under an id.
  const isGitHubFileLink = (link, host, id) => {
    let url;
    try {
      url = new URL(link);
    } catch (_error) {
      return false;
    }
    const githubHost =
      url.host === host ||
      url.host === "github.com" ||
      url.host.endsWith(".githubusercontent.com") ||
      /^github-production-user-asset-[0-9a-z]+\.s3\.amazonaws\.com$/i.test(url.host);
    return url.protocol === "https:" && githubHost && url.pathname.toLowerCase().includes(id);
  };

  // A file it can show (an image or video, not too big), else null; a
  // redirect is { redirect } with its target, resolved.
  const download = async (url, headers = {}) => {
    const response = await fetchImpl(url, { headers, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") || "";
      return { redirect: location ? new URL(location, url).toString() : "" };
    }
    if (!response.ok) return null;
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim();
    if (!ALLOWED_TYPES.test(contentType)) return null;
    const body = Buffer.from(await response.arrayBuffer());
    return body.length > maxBytes ? null : { contentType, body };
  };

  // Downloads a link, following one redirect - without any token, and only
  // to GitHub's own file hosts.
  const downloadFollowing = async (link, { host, id }, headers = {}) => {
    const first = await download(link, headers);
    if (!first?.redirect) return first;
    if (!isGitHubFileLink(first.redirect, host, id)) return null;
    const next = await download(first.redirect);
    return next && !next.redirect ? next : null;
  };

  // GitHub's answer is a redirect to its storage, whose link is signed.
  const fetchWithToken = async (attachment) => {
    const token = await ghToken(attachment.host);
    if (!token) return null;
    return downloadFollowing(`https://${attachment.host}/user-attachments/assets/${attachment.id}`, attachment, {
      Authorization: `token ${token}`,
    });
  };

  // The PR's rendered bodies (description, comments, review comments,
  // reviews), as GitHub's API gives them - with signed links to its images.
  // Shared by every attachment asked for in the PR within a few minutes
  // (the links last about five): a description with ten images asks once.
  const RENDERED_BODIES_MS = 4 * 60 * 1000;
  const renderedBodiesByPr = new Map();
  const fetchRenderedBodies = async (repo, prNumber) => {
    const env = getRepoGhEnv(repo);
    const html = async (endpoint, paginate) => {
      const args = ["api", ...(paginate ? ["--paginate"] : []), "-H", "Accept: application/vnd.github.full+json", endpoint];
      const result = await runViewPrsCommand("gh", args, 20 * 1024 * 1024, { timeoutMs, env });
      return String(result?.stdout || "");
    };
    const settled = await Promise.allSettled([
      html(`repos/${repo}/pulls/${prNumber}`, false),
      html(`repos/${repo}/issues/${prNumber}/comments`, true),
      html(`repos/${repo}/pulls/${prNumber}/comments`, true),
      html(`repos/${repo}/pulls/${prNumber}/reviews`, true),
    ]);
    return settled.map((item) => (item.status === "fulfilled" ? item.value : "")).join("\n");
  };
  const renderedBodies = (repo, prNumber) => {
    const key = `${repo}#${prNumber}`;
    const now = Date.now();
    const shared = renderedBodiesByPr.get(key);
    if (shared && now - shared.at < RENDERED_BODIES_MS) return shared.promise;
    renderedBodiesByPr.forEach((entry, entryKey) => {
      if (now - entry.at >= RENDERED_BODIES_MS) renderedBodiesByPr.delete(entryKey);
    });
    const promise = fetchRenderedBodies(repo, prNumber);
    renderedBodiesByPr.set(key, { at: now, promise });
    promise.catch(() => renderedBodiesByPr.delete(key));
    return promise;
  };

  const fetchFromRenderedBodies = async (attachment, repo, prNumber) => {
    if (!isRepoSlug(repo) || !/^\d+$/.test(String(prNumber || ""))) return null;
    // In the JSON, a body_html's quotes are escaped and its &s may be &amp;.
    const text = (await renderedBodies(repo, prNumber)).replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
    // GitHub's own links to this file; the signed one (jwt=) first - the
    // answer has the raw Markdown's plain link too.
    const links = (text.match(new RegExp(`https://[^"'\\s\\\\<>]*${attachment.id}[^"'\\s\\\\<>]*`, "gi")) || []).filter((link) =>
      isGitHubFileLink(link, attachment.host, attachment.id),
    );
    const signed = links.find((link) => /[?&]jwt=/.test(link)) || links[0];
    return signed ? downloadFollowing(signed, attachment) : null;
  };

  const fetchAndKeep = async (attachment, repo, prNumber) => {
    const errors = [];
    for (const [source, attempt] of [
      ["token", () => fetchWithToken(attachment)],
      ["rendered", () => fetchFromRenderedBodies(attachment, repo, prNumber)],
    ]) {
      try {
        const file = await attempt();
        if (file) return { ok: true, source, ...keep(attachment.id, file) };
      } catch (error) {
        errors.push(error?.message || String(error));
      }
    }
    return { ok: false, statusCode: 404, error: errors[0] || "GitHub didn't give the attachment" };
  };

  // One download per file at a time: the same image twice on a page, or
  // two tabs, share it.
  const inFlight = new Map();

  // { ok, contentType, filePath, source } or { ok: false, statusCode, error }.
  const getAttachment = async ({ url, repo = "", prNumber = "" }) => {
    const attachment = parseAttachmentUrl(url, repo);
    if (!attachment) return { ok: false, statusCode: 400, error: "Not a GitHub attachment link" };
    const kept = readKept(attachment.id);
    if (kept) return { ok: true, source: "kept", ...kept };
    if (!inFlight.has(attachment.id)) {
      const pending = fetchAndKeep(attachment, repo, prNumber).finally(() => inFlight.delete(attachment.id));
      inFlight.set(attachment.id, pending);
    }
    return inFlight.get(attachment.id);
  };

  return { getAttachment, parseAttachmentUrl };
};

module.exports = {
  createViewPrsAttachmentProxy,
};
