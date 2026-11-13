const fs = require("fs");
const os = require("os");
const path = require("path");
const { createViewPrsAttachmentProxy } = require("./view-prs-pr-attachment-proxy");

const ID = "af1d5a16-8556-4bd3-8d5b-079f77f86d33";
const ASSET = `https://github.com/user-attachments/assets/${ID}`;
const STORAGE = `https://github-production-user-asset-6210df.s3.amazonaws.com/x/${ID}.png?X-Amz-Signature=abc`;
const SIGNED = `https://private-user-images.githubusercontent.com/1/2-${ID}.png?jwt=signed`;

// A fetch answering by URL: { status, location?, type?, bytes? }.
const fakeFetch = (routes) =>
  jest.fn(async (url, init = {}) => {
    const route = routes[url];
    if (!route) return { status: 404, ok: false, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) };
    const result = typeof route === "function" ? route(init) : route;
    const headers = new Map([
      ["location", result.location || null],
      ["content-type", result.type || null],
    ]);
    return {
      status: result.status ?? 200,
      ok: (result.status ?? 200) < 300,
      headers: { get: (name) => headers.get(name) },
      arrayBuffer: async () => new Uint8Array(result.bytes ?? 3).buffer,
    };
  });

describe("the attachment proxy", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "attachments-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const proxyWith = ({ routes = {}, gh = {}, ghe = {} } = {}) => {
    const fetchImpl = fakeFetch(routes);
    const runViewPrsCommand = jest.fn(async (_command, args) => {
      if (args[0] === "auth") return { stdout: gh.token ?? "tok-123\n" };
      const endpoint = args[args.length - 1];
      if (gh.failApi) throw new Error("gh api failed");
      return { stdout: gh.api?.[endpoint] ?? "[]" };
    });
    const proxy = createViewPrsAttachmentProxy({
      fs,
      path,
      isRepoSlug: (repo) => /^[\w.-]+\/[\w.-]+$/.test(String(repo || "")),
      runViewPrsCommand,
      viewPrsAttachmentDir: dir,
      getRepoGhEnv: (repo) => ghe[repo] || {},
      fetchImpl,
    });
    return { proxy, fetchImpl, runViewPrsCommand };
  };

  test("takes GitHub attachment links (on github.com or the PR's own Enterprise host) and old signed image links, nothing else", () => {
    const { proxy } = proxyWith({ ghe: { "corp/app": { GH_HOST: "git.corp.example" } } });
    expect(proxy.parseAttachmentUrl(ASSET)).toEqual({ host: "github.com", id: ID });
    expect(proxy.parseAttachmentUrl(SIGNED)).toEqual({ host: "github.com", id: ID });
    expect(proxy.parseAttachmentUrl(`https://git.corp.example/user-attachments/assets/${ID}`, "corp/app")).toEqual({ host: "git.corp.example", id: ID });
    // Another repo's host, another host, not https, not an attachment.
    expect(proxy.parseAttachmentUrl(`https://git.corp.example/user-attachments/assets/${ID}`, "acme/app")).toBeNull();
    expect(proxy.parseAttachmentUrl(`https://evil.example/user-attachments/assets/${ID}`)).toBeNull();
    expect(proxy.parseAttachmentUrl(`http://github.com/user-attachments/assets/${ID}`)).toBeNull();
    expect(proxy.parseAttachmentUrl("https://github.com/acme/app/pull/1")).toBeNull();
    expect(proxy.parseAttachmentUrl("not a url")).toBeNull();
  });

  test("fetches with the gh token, sent only to GitHub - not on to the storage it redirects to - and keeps it", async () => {
    const { proxy, fetchImpl } = proxyWith({
      routes: {
        [ASSET]: { status: 302, location: STORAGE },
        [STORAGE]: { type: "image/png; charset=binary", bytes: 5 },
      },
    });

    const result = await proxy.getAttachment({ url: ASSET });

    expect(result).toMatchObject({ ok: true, source: "token", contentType: "image/png" });
    expect(fs.readFileSync(result.filePath).length).toBe(5);
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({ Authorization: "token tok-123" });
    expect(fetchImpl.mock.calls[1][0]).toBe(STORAGE);
    expect(fetchImpl.mock.calls[1][1].headers).toEqual({});

    // Kept: the next ask doesn't fetch.
    fetchImpl.mockClear();
    expect(await proxy.getAttachment({ url: ASSET })).toMatchObject({ ok: true, source: "kept", contentType: "image/png" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("an Enterprise repo's attachment asks gh for that host's token", async () => {
    const asset = `https://git.corp.example/user-attachments/assets/${ID}`;
    const { proxy, runViewPrsCommand } = proxyWith({
      ghe: { "corp/app": { GH_HOST: "git.corp.example" } },
      routes: { [asset]: { type: "image/gif" } },
    });
    expect(await proxy.getAttachment({ url: asset, repo: "corp/app", prNumber: "4" })).toMatchObject({ ok: true, source: "token" });
    expect(runViewPrsCommand.mock.calls[0][1]).toEqual(["auth", "token", "--hostname", "git.corp.example"]);
  });

  test("refused by the token, it's found in the PR's rendered bodies: their signed link to it, before the plain one", async () => {
    const pull = JSON.stringify({
      body: `![image](${ASSET})`,
      body_html: `<a href="${SIGNED.replace("&", "&amp;")}"><img src="${SIGNED}"></a>`,
    });
    const { proxy, fetchImpl, runViewPrsCommand } = proxyWith({
      routes: { [ASSET]: { status: 404 }, [SIGNED]: { type: "video/mp4", bytes: 9 } },
      gh: { api: { "repos/acme/app/pulls/7": pull } },
    });

    const result = await proxy.getAttachment({ url: ASSET, repo: "acme/app", prNumber: "7" });

    expect(result).toMatchObject({ ok: true, source: "rendered", contentType: "video/mp4" });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([ASSET, SIGNED]);
    expect(fetchImpl.mock.calls[1][1].headers).toEqual({});
    const endpoints = runViewPrsCommand.mock.calls.filter(([, args]) => args[0] === "api").map(([, args]) => args[args.length - 1]);
    expect(endpoints.sort()).toEqual(
      ["repos/acme/app/issues/7/comments", "repos/acme/app/pulls/7", "repos/acme/app/pulls/7/comments", "repos/acme/app/pulls/7/reviews"].sort(),
    );
  });

  test("only images and videos, not too big; without the PR, a refused link isn't found", async () => {
    const page = proxyWith({ routes: { [ASSET]: { type: "text/html" } } });
    expect(await page.proxy.getAttachment({ url: ASSET })).toMatchObject({ ok: false, statusCode: 404 });

    const big = createViewPrsAttachmentProxy({
      fs,
      path,
      isRepoSlug: () => true,
      runViewPrsCommand: async () => ({ stdout: "tok" }),
      viewPrsAttachmentDir: dir,
      fetchImpl: fakeFetch({ [ASSET]: { type: "image/png", bytes: 11 } }),
      maxBytes: 10,
    });
    expect(await big.getAttachment({ url: ASSET })).toMatchObject({ ok: false, statusCode: 404 });

    const refused = proxyWith({ routes: { [ASSET]: { status: 404 } } });
    expect(await refused.proxy.getAttachment({ url: ASSET })).toMatchObject({ ok: false, statusCode: 404 });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  test("links from the PR's comments are fetched only from GitHub's own file hosts, with the id in the path - a comment can't point the server elsewhere", async () => {
    const elsewhere = `https://internal.example/${ID}.png?jwt=planted`;
    const inQuery = `https://private-user-images.githubusercontent.com/1/someone-else.png?jwt=x&id=${ID}`;
    const pull = JSON.stringify({ body_html: `<img src="${elsewhere}"><img src="${inQuery}">` });
    const { proxy, fetchImpl } = proxyWith({
      routes: { [ASSET]: { status: 404 }, [elsewhere]: { type: "image/png" }, [inQuery]: { type: "image/png" } },
      gh: { api: { "repos/acme/app/pulls/7": pull } },
    });

    expect(await proxy.getAttachment({ url: ASSET, repo: "acme/app", prNumber: "7" })).toMatchObject({ ok: false, statusCode: 404 });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([ASSET]);
  });

  test("a redirect is followed only to GitHub's own file hosts", async () => {
    const { proxy, fetchImpl } = proxyWith({
      routes: { [ASSET]: { status: 302, location: `https://internal.example/${ID}.png` } },
    });
    expect(await proxy.getAttachment({ url: ASSET })).toMatchObject({ ok: false, statusCode: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a PR's attachments share one fetch of its rendered bodies, and the same file asked for twice at once is downloaded once", async () => {
    const other = "0b1d5a16-8556-4bd3-8d5b-079f77f86d33";
    const signedOther = `https://private-user-images.githubusercontent.com/1/3-${other}.png?jwt=signed`;
    const pull = JSON.stringify({ body_html: `<img src="${SIGNED}"><img src="${signedOther}">` });
    const { proxy, fetchImpl, runViewPrsCommand } = proxyWith({
      routes: { [SIGNED]: { type: "image/png" }, [signedOther]: { type: "image/png" } },
      gh: { api: { "repos/acme/app/pulls/7": pull }, token: "" },
    });

    const results = await Promise.all([
      proxy.getAttachment({ url: ASSET, repo: "acme/app", prNumber: "7" }),
      proxy.getAttachment({ url: ASSET, repo: "acme/app", prNumber: "7" }),
      proxy.getAttachment({ url: `https://github.com/user-attachments/assets/${other}`, repo: "acme/app", prNumber: "7" }),
    ]);

    expect(results.map((result) => result.ok)).toEqual([true, true, true]);
    expect(runViewPrsCommand.mock.calls.filter(([, args]) => args[0] === "api")).toHaveLength(4);
    expect(fetchImpl.mock.calls.map(([url]) => url).sort()).toEqual([SIGNED, signedOther].sort());
  });

  test("a link that isn't an attachment is a 400, without asking GitHub", async () => {
    const { proxy, fetchImpl, runViewPrsCommand } = proxyWith();
    expect(await proxy.getAttachment({ url: "https://evil.example/x.png" })).toMatchObject({ ok: false, statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(runViewPrsCommand).not.toHaveBeenCalled();
  });
});
