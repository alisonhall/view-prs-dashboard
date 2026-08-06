const http = require("http");
const { spawn } = require("child_process");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestServer = (url, timeoutMs = 1000) =>
  new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({
          status: response.statusCode || 0,
          body,
          headers: response.headers,
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out requesting ${url}`));
    });
    request.on("error", reject);
  });

const withTimeout = async (promise, timeoutMs, message) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const waitForServer = async ({ url, timeoutMs = 20000 }) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const remainingMs = Math.max(deadline - Date.now(), 1);
      const response = await requestServer(url, Math.min(remainingMs, 500));
      return response;
    } catch (_error) {
      await wait(150);
    }
  }

  throw new Error(`Timed out waiting for server at ${url}`);
};

const stopProcess = async (child) => {
  if (!child || child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let killTimeout = null;
    let forceResolveTimeout = null;
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (killTimeout) {
        clearTimeout(killTimeout);
      }
      if (forceResolveTimeout) {
        clearTimeout(forceResolveTimeout);
      }
      child.removeListener("exit", onExit);
      resolve();
    };

    const onExit = () => {
      finish();
    };

    child.once("exit", onExit);

    if (child.exitCode !== null) {
      finish();
      return;
    }

    child.kill("SIGTERM");

    killTimeout = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        // Ensure teardown completes even if the process never emits exit.
        forceResolveTimeout = setTimeout(() => {
          finish();
        }, 500);
      }
    }, 2000);
  });
};

const spawnServer = (envOverrides = {}) =>
  spawn("node", ["../server.js"], {
    cwd: __dirname,
    env: {
      ...process.env,
      VIEW_PRS_DISABLE_SCHEDULER_STARTUP: "1",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

const waitForReportedPort = async (child, timeoutMs = 20000) => {
  let detectedPort;
  let stdout = "";
  let stderr = "";

  const portPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      child.stdout.removeListener("data", onStdout);
      child.stderr.removeListener("data", onStderr);
      child.removeListener("exit", onExit);
    };

    const onStdout = (chunk) => {
      stdout += chunk.toString();
      const portMatch = stdout.match(/localhost:(\d+)/);
      if (portMatch && !detectedPort) {
        detectedPort = parseInt(portMatch[1], 10);
        cleanup();
        resolve({ port: detectedPort, stdout, stderr });
      }
    };

    const onStderr = (chunk) => {
      stderr += chunk.toString();
    };

    const onExit = (code, signal) => {
      if (!detectedPort) {
        cleanup();
        const message = `Server exited before reporting a port (code: ${String(code)}, signal: ${String(signal)})`;
        reject(new Error(stderr ? `${message}\n${stderr.trim()}` : message));
      }
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("exit", onExit);

    if (child.exitCode !== null && !detectedPort) {
      onExit(child.exitCode, null);
    }
  });

  return withTimeout(
    portPromise,
    timeoutMs,
    "Timeout waiting for server port",
  );
};

const waitForChildExit = async (child, timeoutMs, timeoutMessage) => {
  if (!child) {
    return null;
  }
  if (child.exitCode !== null) {
    return child.exitCode;
  }

  const exitPromise = new Promise((resolve) => {
    child.once("exit", (code) => {
      resolve(code);
    });
  });

  return withTimeout(exitPromise, timeoutMs, timeoutMessage);
};

describe("server startup behavior", () => {
  let child;
  let stderr = "";
  let port;
  const viewPrsDir = __dirname;
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Use port 0 to let OS assign an available port
    child = spawnServer({ VIEW_PRS_PORT: "0" });

    stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ({ port } = await waitForReportedPort(child));

    await waitForServer({
      url: `http://127.0.0.1:${port}/`,
    });
  });

  afterAll(async () => {
    await stopProcess(child);

    if (child.exitCode !== 0 && child.exitCode !== null) {
      throw new Error(
        `view-prs server process exited with code ${child.exitCode}\n${stderr}`,
      );
    }
  });

  test("returns 200 when GET / is requested from the started server", async () => {
    const response = await requestServer(`http://127.0.0.1:${port}/`);

    expect(response.status).toBe(200);
  });

  test("returns non-empty HTML when GET / is requested from the started server", async () => {
    const response = await requestServer(`http://127.0.0.1:${port}/`);

    expect(response.body.length).toBeGreaterThan(0);
  });

  test("uses default port 3000 when VIEW_PRS_PORT is not set", async () => {
    // Start server without VIEW_PRS_PORT env var
    const childEnv = { ...process.env };
    delete childEnv.VIEW_PRS_PORT;
    const child = spawn("node", ["../server.js"], {
      cwd: viewPrsDir,
      env: {
        ...childEnv,
        VIEW_PRS_DISABLE_SCHEDULER_STARTUP: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      const { port: detectedPort } = await waitForReportedPort(child);
      expect(detectedPort).toBe(3000);

      // Verify server is responsive on default port
      const response = await waitForServer({
        url: "http://127.0.0.1:3000/",
      });
      expect(response.status).toBe(200);
    } finally {
      await stopProcess(child);
    }
  });

  test("exits cleanly when the server receives SIGTERM", async () => {
    const child = spawnServer({ VIEW_PRS_PORT: "0" });

    try {
      const { port } = await waitForReportedPort(child);

      // Verify server is running
      const response = await waitForServer({
        url: `http://127.0.0.1:${port}/`,
      });
      expect(response.status).toBe(200);

      // Send SIGTERM and verify graceful shutdown
      const exitPromise = waitForChildExit(
        child,
        10000,
        "Server did not exit after SIGTERM",
      );
      child.kill("SIGTERM");
      const exitCode = await exitPromise;

      expect(exitCode).toBe(0);
    } finally {
      if (child.exitCode === null) {
        await stopProcess(child);
      }
    }
  });

  test("exits cleanly when the server receives SIGINT", async () => {
    const child = spawnServer({ VIEW_PRS_PORT: "0" });

    try {
      const { port } = await waitForReportedPort(child);

      // Verify server is running
      const response = await waitForServer({
        url: `http://127.0.0.1:${port}/`,
      });
      expect(response.status).toBe(200);

      // Send SIGINT and verify graceful shutdown
      const exitPromise = waitForChildExit(
        child,
        10000,
        "Server did not exit after SIGINT",
      );
      child.kill("SIGINT");
      const exitCode = await exitPromise;

      expect(exitCode).toBe(0);
    } finally {
      if (child.exitCode === null) {
        await stopProcess(child);
      }
    }
  });
});
