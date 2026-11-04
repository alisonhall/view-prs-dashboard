const { parsePrUrl } = require("./view-prs-pr-url");

describe("parsePrUrl", () => {
  test("reads a github.com PR's URL, any page of it, with or without the scheme", () => {
    const pr = { repo: "acme/api", number: "12", host: "", url: "https://github.com/acme/api/pull/12" };

    expect(parsePrUrl("https://github.com/acme/api/pull/12")).toEqual(pr);
    expect(parsePrUrl("  https://www.github.com/acme/api/pull/12/files?w=1#diff-1  ")).toEqual(pr);
    expect(parsePrUrl("github.com/acme/api/pull/12")).toEqual(pr);
    expect(parsePrUrl("acme/api#12")).toEqual(pr);
  });

  test("keeps a GitHub Enterprise PR's host", () => {
    expect(parsePrUrl("https://GitHub.Example.com/corp/tool.js/pull/5/commits")).toEqual({
      repo: "corp/tool.js",
      number: "5",
      host: "github.example.com",
      url: "https://github.example.com/corp/tool.js/pull/5",
    });
  });

  test.each([
    "",
    "not a url",
    "https://github.com/acme/api/issues/12",
    "https://github.com/acme/api/pull/",
    "https://github.com/acme/api/pull/0",
    "https://github.com/acme/api/pull/12abc",
    "https://github.com/acme/pull/12",
    "ftp://github.com/acme/api/pull/12",
    "https://user:pass@github.com/acme/api/pull/12",
    "https://github.com:8443/acme/api/pull/12",
    "https://localhost/acme/api/pull/12",
    "acme/api#x",
  ])("isn't a PR: %p", (input) => {
    expect(parsePrUrl(input)).toBeNull();
  });
});
