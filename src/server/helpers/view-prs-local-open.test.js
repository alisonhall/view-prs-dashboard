const { EventEmitter } = require("events");
const { createViewPrsLocalOpen, commandForFolder } = require("./view-prs-local-open");

// A spawn that records each call and ends the child as told: exit with a
// code, fail to start (ENOENT), or keep running.
const fakeSpawn = (outcome = { exit: 0 }) => {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.unref = () => {};
    const next = typeof outcome === "function" ? outcome(command, args) : outcome;
    setImmediate(() => {
      if (next.error) child.emit("error", Object.assign(new Error(next.error), { code: next.error }));
      else if (next.exit !== undefined) child.emit("exit", next.exit);
    });
    return child;
  };
  return { spawn, calls };
};

// listed: folder => its names. Windows Terminal's launcher is an app
// execution alias, which existsSync says isn't there: only listing finds it.
const setUp = ({ platform = "linux", outcome, existing = ["/work/repo-feature"], listed = {}, env = {} } = {}) => {
  const { spawn, calls } = fakeSpawn(outcome);
  const opener = createViewPrsLocalOpen({
    spawn,
    fs: {
      existsSync: (file) => existing.includes(file),
      readdirSync: (folder) => {
        if (!listed[folder]) throw Object.assign(new Error(`ENOENT: ${folder}`), { code: "ENOENT" });
        return listed[folder];
      },
    },
    platform,
    env,
    userShell: async () => (platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/bin/zsh"),
    settleMs: 50,
  });
  return { opener, calls };
};

describe("commandForFolder", () => {
  test("{folder} is the quoted variable; a command naming neither it nor VIEW_PRS_FOLDER has the folder added at the end", () => {
    expect(commandForFolder("cursor")).toBe('cursor "$VIEW_PRS_FOLDER"');
    expect(commandForFolder("wezterm start --cwd {folder}")).toBe('wezterm start --cwd "$VIEW_PRS_FOLDER"');
    expect(commandForFolder('open -a iTerm "$VIEW_PRS_FOLDER"')).toBe('open -a iTerm "$VIEW_PRS_FOLDER"');
  });
});

describe("openFolder", () => {
  test("the editor: VS Code's code by default - through cmd on Windows, the folder quoted", async () => {
    const linux = setUp();
    await linux.opener.openFolder({ kind: "editor", folder: "/work/repo-feature" });
    expect(linux.calls).toEqual([expect.objectContaining({ command: "code", args: ["/work/repo-feature"] })]);
    expect(linux.calls[0].options).toMatchObject({ stdio: "ignore", detached: true });

    const windows = setUp({ platform: "win32", existing: ["D:\\work\\repo feature"] });
    await windows.opener.openFolder({ kind: "editor", folder: "D:\\work\\repo feature" });
    expect(windows.calls[0]).toMatchObject({ command: "cmd.exe", args: ["/d", "/s", "/c", '"code "D:\\work\\repo feature""'] });
    // cmd is a console program: hidden, so no window flashes up.
    expect(windows.calls[0].options).toMatchObject({ windowsVerbatimArguments: true, detached: false, windowsHide: true });
  });

  test("the editor and terminal commands run in the user's shell, in the folder, given it", async () => {
    const { opener, calls } = setUp();
    await opener.openFolder({ kind: "editor", folder: "/work/repo-feature", settings: { editor: "cursor" } });
    await opener.openFolder({ kind: "terminal", folder: "/work/repo-feature", settings: { terminal: "wezterm start --cwd {folder}" } });
    expect(calls.map((call) => call.command)).toEqual(["/bin/zsh", "/bin/zsh"]);
    expect(calls[0].args).toEqual(["-ic", 'exec </dev/null\ncd -- "$VIEW_PRS_FOLDER" || exit 1\ncursor "$VIEW_PRS_FOLDER"']);
    expect(calls[1].args[1]).toMatch(/\nwezterm start --cwd "\$VIEW_PRS_FOLDER"$/);
    expect(calls[0].options.env).toMatchObject({ VIEW_PRS_FOLDER: "/work/repo-feature" });
  });

  test("on Windows Git Bash is given the folder with forward slashes", async () => {
    const { opener, calls } = setUp({ platform: "win32", existing: ["D:\\work\\tree"] });
    await opener.openFolder({ kind: "editor", folder: "D:\\work\\tree", settings: { editor: "subl" } });
    expect(calls[0].command).toBe("C:\\Program Files\\Git\\bin\\bash.exe");
    expect(calls[0].options.env.VIEW_PRS_FOLDER).toBe("D:/work/tree");
  });

  test("a command the shell doesn't know, or that fails, says so; a launcher that isn't there says what to set", async () => {
    const unknown = setUp({ outcome: { exit: 127 } });
    await expect(unknown.opener.openFolder({ kind: "editor", folder: "/work/repo-feature", settings: { editor: "nope --new-window" } })).rejects.toThrow(
      "nope isn't known to your shell (zsh) - is it in the rc file an interactive zsh reads?",
    );
    const failing = setUp({ outcome: { exit: 2 } });
    await expect(failing.opener.openFolder({ kind: "terminal", folder: "/work/repo-feature", settings: { terminal: "kitty" } })).rejects.toThrow(
      "The terminal command failed (exit 2)",
    );
    const missing = setUp({ outcome: { error: "ENOENT" } });
    await expect(missing.opener.openFolder({ kind: "terminal", folder: "/work/repo-feature" })).rejects.toThrow(
      "x-terminal-emulator wasn't found - set your terminal's command in Settings › Local clones",
    );
    await expect(missing.opener.openFolder({ kind: "editor", folder: "/work/repo-feature" })).rejects.toThrow(/set your editor's in Settings › Local clones/);
  });

  test("still running after a moment counts as started (a terminal that is the window)", async () => {
    const { opener, calls } = setUp({ outcome: {} });
    await opener.openFolder({ kind: "terminal", folder: "/work/repo-feature" });
    expect(calls[0]).toMatchObject({ command: "x-terminal-emulator", args: [] });
    expect(calls[0].options.cwd).toBe("/work/repo-feature");
  });

  test("the system's terminal: Windows Terminal when installed, else a Command Prompt; Terminal on a Mac", async () => {
    const wtPath = "C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe";
    const withTerminal = setUp({
      platform: "win32",
      existing: ["D:\\tree"],
      listed: { "C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps": ["python.exe", "wt.exe"] },
      env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
    });
    await withTerminal.opener.openFolder({ kind: "terminal", folder: "D:\\tree" });
    expect(withTerminal.calls[0]).toMatchObject({ command: wtPath, args: ["-d", "D:\\tree"] });
    // A window that has to show: not started hidden, as a console program is.
    expect(withTerminal.calls[0].options.windowsHide).toBe(false);
    // Windows Terminal splits its arguments at ; unless escaped.
    const semicolon = setUp({
      platform: "win32",
      existing: ["D:\\a;b"],
      listed: { "C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps": ["wt.exe"] },
      env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
    });
    await semicolon.opener.openFolder({ kind: "terminal", folder: "D:\\a;b" });
    expect(semicolon.calls[0].args).toEqual(["-d", "D:\\a\\;b"]);

    const without = setUp({ platform: "win32", existing: ["D:\\tree"], env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" } });
    await without.opener.openFolder({ kind: "terminal", folder: "D:\\tree" });
    expect(without.calls[0]).toMatchObject({ command: "cmd.exe", args: ["/d", "/s", "/c", 'start "" /D "D:\\tree" cmd.exe'] });

    const mac = setUp({ platform: "darwin" });
    await mac.opener.openFolder({ kind: "terminal", folder: "/work/repo-feature" });
    expect(mac.calls[0]).toMatchObject({ command: "open", args: ["-a", "Terminal", "/work/repo-feature"] });
  });

  test("show in files: Explorer (backslashes, its exit code 1 is fine), Finder, xdg-open", async () => {
    const windows = setUp({ platform: "win32", existing: ["D:/work/tree"], outcome: { exit: 1 } });
    await windows.opener.openFolder({ kind: "files", folder: "D:/work/tree", settings: { editor: "cursor", terminal: "x" } });
    expect(windows.calls[0]).toMatchObject({ command: "explorer.exe", args: ["D:\\work\\tree"] });
    expect(windows.calls[0].options.windowsHide).toBe(false);

    const mac = setUp({ platform: "darwin" });
    await mac.opener.openFolder({ kind: "files", folder: "/work/repo-feature" });
    expect(mac.calls[0]).toMatchObject({ command: "open", args: ["/work/repo-feature"] });

    const linux = setUp({ outcome: { exit: 4 } });
    await expect(linux.opener.openFolder({ kind: "files", folder: "/work/repo-feature" })).rejects.toThrow("xdg-open failed (exit 4)");
  });

  test("refused: a folder that's gone, cmd's quote or %, or an unknown kind - nothing started", async () => {
    const { opener, calls } = setUp({ platform: "win32", existing: ["D:\\100%", "D:\\tree"] });
    await expect(opener.openFolder({ kind: "editor", folder: "D:\\gone" })).rejects.toMatchObject({ status: 404 });
    await expect(opener.openFolder({ kind: "editor", folder: "D:\\100%" })).rejects.toMatchObject({ status: 400 });
    await expect(opener.openFolder({ kind: "terminal", folder: "D:\\100%" })).rejects.toMatchObject({ status: 400 });
    await expect(opener.openFolder({ kind: "shell", folder: "D:\\tree" })).rejects.toMatchObject({ status: 400 });
    expect(calls).toEqual([]);
  });
});
