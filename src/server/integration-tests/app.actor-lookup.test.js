// Someone new in the data is named as GitHub names them (gh api
// users/<login>) - but not a commit author's name or email, which no
// account has: that call only fails, and it's synchronous (up to 15s each),
// holding up the data read.
describe("naming someone new from GitHub", () => {
  test("asks GitHub about a new login, not about a commit author's name or email", () => {
    const asked = [];
    jest.isolateModules(() => {
      jest.doMock("child_process", () => {
        const actual = jest.requireActual("child_process");
        return {
          ...actual,
          spawnSync: (command, args = [], options) => {
            if (command === "gh" && args[0] === "api" && String(args[1]).startsWith("users/")) {
              asked.push(String(args[1]).slice("users/".length));
              return { status: 1, stdout: "", stderr: "" };
            }
            return actual.spawnSync(command, args, options);
          },
        };
      });
      const app = require("../app.js");
      app.buildViewPrsActorsMap({
        "owner/repo#1": {
          repo: "owner/repo",
          data: {
            activityTimeline: [
              {
                actor: "newcomer-login",
                events: [{ actor: "Kandal, Vipul" }, { actor: "vipul@corp.example" }, { actor: "Lee Ann" }],
              },
            ],
          },
        },
      });
    });
    jest.dontMock("child_process");
    expect(asked).toEqual(["newcomer-login"]);
  });
});
