// A PR given by URL - https://github.com/owner/repo/pull/12, a GitHub
// Enterprise one on its own host, with or without the scheme and with
// anything after the number (/files, ?query, #fragment) - or as
// owner/repo#12. { repo, number, host, url }: host is "" for github.com,
// and url the PR's own (whatever page of it was given). Null when it isn't
// one.

const NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const isName = (value) => NAME_PATTERN.test(value) && value !== "." && value !== ".." && !value.startsWith("-");

// Whether it's an owner/name GitHub could have: letters, digits, ".", "_"
// and "-" (not leading, so gh can't take it for an option), and not "." or
// "..". Stricter than isRepoSlug, for repos the background runs keep using.
const isRepoName = (value) => {
  const parts = String(value ?? "").trim().split("/");
  return parts.length === 2 && parts.every(isName);
};

const buildPr = ({ host, owner, name, number }) => {
  if (!isName(owner) || !isName(name) || !/^[1-9]\d*$/.test(number)) return null;
  const repo = `${owner}/${name}`;
  return {
    repo,
    number,
    host,
    url: `https://${host || "github.com"}/${repo}/pull/${number}`,
  };
};

const parsePrUrl = (input) => {
  const value = String(input ?? "").trim();
  if (!value) return null;

  const shorthand = value.match(/^([^/\s#]+)\/([^/\s#]+)#(\d+)$/);
  if (shorthand) {
    return buildPr({ host: "", owner: shorthand[1], name: shorthand[2], number: shorthand[3] });
  }

  let parsed;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch (_error) {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.username || parsed.password) return null;
  const hostname = parsed.host.toLowerCase();
  if (!HOST_PATTERN.test(hostname)) return null;
  const host = hostname === "github.com" || hostname === "www.github.com" ? "" : hostname;

  const [owner, name, kind, number] = parsed.pathname.split("/").filter(Boolean);
  if (kind !== "pull") return null;
  return buildPr({ host, owner: owner || "", name: name || "", number: number || "" });
};

module.exports = { parsePrUrl, isRepoName };
