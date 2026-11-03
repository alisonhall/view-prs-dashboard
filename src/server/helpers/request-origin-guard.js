// Keeps web pages other than the dashboard's own from using the server
// through the browser. It has no sign-in, so a page on any site could
// otherwise:
// - change things with a request the browser sends without asking (a form
//   post, or a fetch with no body): Ack, notes, labels on GitHub, runs;
// - read the data and notes, by pointing its own hostname at 127.0.0.1 (DNS
//   rebinding) so the browser treats the server as that site.
//
// So a request must name this computer as its Host (rebinding can't), and
// one that changes something must come from a page on this computer or the
// server's own address (its Origin). Requests without an Origin - curl,
// scripts, tests - aren't a browser page's, and pass. When the server is
// opened to the network (VIEW_PRS_HOST), any Host is allowed.

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const isLoopbackHostname = (hostname) => {
  const normalized = String(hostname || "").trim().toLowerCase();
  return LOOPBACK_HOSTNAMES.has(normalized) || normalized.endsWith(".localhost");
};

// The hostname of a Host header ("localhost:9000", "[::1]:9000").
const hostnameOfHostHeader = (hostHeader) => {
  try {
    return new URL(`http://${String(hostHeader || "").trim()}`).hostname;
  } catch (_error) {
    return "";
  }
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const createRequestOriginGuard = ({ allowAnyHost = false } = {}) =>
  (req, res, next) => {
    const hostHeader = String(req.headers.host || "").trim();
    if (!allowAnyHost && !isLoopbackHostname(hostnameOfHostHeader(hostHeader))) {
      res.status(403).json({ ok: false, error: "Requests must be made to this computer (localhost)" });
      return;
    }

    const origin = req.headers.origin;
    if (origin === undefined || SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    let originUrl = null;
    try {
      originUrl = new URL(String(origin));
    } catch (_error) {
      // "null" (a sandboxed page, a file) or malformed: not allowed.
    }
    if (originUrl && (isLoopbackHostname(originUrl.hostname) || originUrl.host === hostHeader.toLowerCase())) {
      next();
      return;
    }
    res.status(403).json({ ok: false, error: "Requests from other sites aren't allowed" });
  };

module.exports = { createRequestOriginGuard, isLoopbackHostname };
