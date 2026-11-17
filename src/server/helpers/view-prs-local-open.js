// The pane's Open in editor, Terminal and Show in Explorer/Finder for a
// PR's worktree, or a clone's folder (POST /open-folder) - each started,
// not waited for:
//
// - editor: this computer's editor command (Settings › Local clones), else
//   VS Code's `code`.
// - terminal: this computer's terminal command, else the system's own -
//   Windows Terminal (else a Command Prompt window) on Windows, Terminal on
//   a Mac, x-terminal-emulator elsewhere - opened in the folder.
// - files: the folder in Explorer, Finder, or the desktop's file manager
//   (xdg-open). No setting.
//
// A command of the user's runs as Check out's commands do: in an
// interactive shell (Git Bash on Windows), so their rc file's aliases and
// functions work, in the folder, given it as {folder} (VIEW_PRS_FOLDER) -
// added at the end when the command doesn't name it.

const path = require("path");
const { commandNameOf } = require("./view-prs-local-checkout");

const OPEN_KINDS = ["editor", "terminal", "files"];

// Still running this long after starting: taken as started (an editor's
// launcher hands the folder over and exits, a terminal may keep running as
// the window itself).
const SETTLE_MS = 3000;

const toPosix = (value) => String(value || "").replace(/\\/g, "/");

// {folder} as the quoted variable; the folder added at the end when the
// command names neither.
const commandForFolder = (command) => {
  const text = String(command || "").trim();
  if (/\{folder\}|VIEW_PRS_FOLDER/.test(text)) return text.replace(/\{folder\}/g, '"$VIEW_PRS_FOLDER"');
  return `${text} "$VIEW_PRS_FOLDER"`;
};

const openError = (message, status = 502) => Object.assign(new Error(message), { status });

const createViewPrsLocalOpen = ({
  spawn,
  fs,
  platform = process.platform,
  env = process.env,
  // () => the user's shell, as Check out runs their commands in.
  userShell,
  settleMs = SETTLE_MS,
}) => {
  const isWindows = platform === "win32";

  // Starts it: resolves once it exits as it should, or is still running
  // after settleMs; rejects with why not. okExit: whether an exit code
  // means it worked (Explorer's is 1 when it did). hide: no console window
  // for a console program (cmd, Git Bash) - false for a window that has to
  // show, as Node's windowsHide starts any program hidden.
  const launch = (command, args, { cwd, extraEnv, verbatim = false, hide = true, okExit = (code) => code === 0, notFound, failed }) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const done = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      let child;
      try {
        child = spawn(command, args, {
          cwd,
          env: extraEnv ? { ...env, ...extraEnv } : env,
          stdio: "ignore",
          windowsHide: hide,
          windowsVerbatimArguments: verbatim,
          // Its own process group, so stopping the server (Ctrl+C) doesn't
          // close what it opened. (On Windows that would mean a console.)
          detached: !isWindows,
        });
      } catch (error) {
        done(openError(error?.message || String(error)));
        return;
      }
      const timer = setTimeout(() => done(), settleMs);
      child.once("error", (error) => done(openError(error?.code === "ENOENT" ? notFound : error?.message || String(error))));
      child.once("exit", (code) => done(okExit(code) ? null : openError(failed(code))));
      if (typeof child.unref === "function") child.unref();
    });

  // A command of the user's, in their shell, in the folder.
  const runUserCommand = async (command, folder, label) => {
    const shell = await userShell();
    const shellName = path.basename(shell).replace(/\.exe$/i, "");
    const name = commandNameOf(command) || command;
    await launch(shell, ["-ic", `exec </dev/null\ncd -- "$VIEW_PRS_FOLDER" || exit 1\n${commandForFolder(command)}`], {
      extraEnv: { VIEW_PRS_FOLDER: toPosix(folder) },
      notFound: `${shellName} wasn't found`,
      failed: (code) =>
        code === 127
          ? `${name} isn't known to your shell (${shellName}) - is it in the rc file an interactive ${shellName} reads?`
          : `The ${label} command failed (exit ${code}) - try it in a terminal, in the folder`,
    });
  };

  // cmd reads quotes and % itself: a folder with them can't be given to it.
  const refuseForCmd = (folder) => {
    if (/["%]/.test(folder)) throw openError("Can't open a folder whose path has a quote or % in it", 400);
  };

  const openEditor = (folder) => {
    const notFound = "The code command wasn't found (VS Code's Shell Command: Install 'code' command in PATH) - or set your editor's in Settings › Local clones";
    // `code` is a .cmd on Windows: run by cmd, the folder quoted.
    if (isWindows) {
      refuseForCmd(folder);
      return launch("cmd.exe", ["/d", "/s", "/c", `"code "${folder}""`], { verbatim: true, notFound, failed: () => notFound });
    }
    return launch("code", [folder], { notFound, failed: () => notFound });
  };

  // Windows Terminal's launcher, where Windows puts it - found by listing
  // the folder: it's an app execution alias, which fs.existsSync can't
  // see.
  const windowsTerminal = () => {
    if (!env.LOCALAPPDATA) return "";
    const folder = path.win32.join(env.LOCALAPPDATA, "Microsoft", "WindowsApps");
    try {
      return fs.readdirSync(folder).some((name) => name.toLowerCase() === "wt.exe") ? path.win32.join(folder, "wt.exe") : "";
    } catch (_error) {
      return "";
    }
  };

  const openTerminal = (folder) => {
    if (isWindows) {
      const terminal = windowsTerminal();
      if (terminal) {
        // Its arguments are split at ;, unless escaped.
        return launch(terminal, ["-d", folder.replace(/;/g, "\\;")], {
          hide: false,
          notFound: "Windows Terminal wasn't found",
          failed: (code) => `Windows Terminal failed (exit ${code})`,
        });
      }
      refuseForCmd(folder);
      return launch("cmd.exe", ["/d", "/s", "/c", `start "" /D "${folder}" cmd.exe`], {
        verbatim: true,
        notFound: "cmd.exe wasn't found",
        failed: (code) => `Couldn't start a Command Prompt (exit ${code})`,
      });
    }
    if (platform === "darwin") {
      return launch("open", ["-a", "Terminal", folder], { notFound: "open wasn't found", failed: (code) => `Terminal didn't open (exit ${code})` });
    }
    return launch("x-terminal-emulator", [], {
      cwd: folder,
      notFound: "x-terminal-emulator wasn't found - set your terminal's command in Settings › Local clones",
      failed: (code) => `x-terminal-emulator failed (exit ${code}) - set your terminal's command in Settings › Local clones`,
    });
  };

  const showFiles = (folder) => {
    if (isWindows) {
      // Explorer wants backslashes, and exits 1 when it worked.
      return launch("explorer.exe", [path.win32.normalize(folder)], { hide: false, notFound: "Explorer wasn't found", okExit: () => true, failed: () => "" });
    }
    if (platform === "darwin") {
      return launch("open", [folder], { notFound: "open wasn't found", failed: (code) => `Finder didn't open it (exit ${code})` });
    }
    return launch("xdg-open", [folder], {
      notFound: "xdg-open wasn't found - no file manager to show it in",
      failed: (code) => `xdg-open failed (exit ${code})`,
    });
  };

  // { kind, folder, settings: { editor?, terminal? } } => resolves once
  // started; rejects with .status and why not.
  const openFolder = async ({ kind, folder, settings = {} }) => {
    if (!OPEN_KINDS.includes(kind)) throw openError(`Can't open with ${kind}`, 400);
    if (!fs.existsSync(folder)) throw openError(`${folder} isn't there any more`, 404);
    if (kind === "files") return showFiles(folder);
    const command = String(settings?.[kind] || "").trim();
    if (command) return runUserCommand(command, folder, kind);
    return kind === "editor" ? openEditor(folder) : openTerminal(folder);
  };

  return { openFolder };
};

module.exports = { createViewPrsLocalOpen, commandForFolder, OPEN_KINDS };
