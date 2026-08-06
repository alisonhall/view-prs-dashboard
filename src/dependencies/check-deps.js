#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..", "..");
const pkgPath = path.join(projectRoot, "package.json");
const requiredCommands = ["bash", "gh", "jq"];
const depSections = ["dependencies", "devDependencies", "optionalDependencies"];

const isCommandAvailable = (command) => {
  const result = spawnSync("bash", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
};

const readPackageJson = () => {
  const raw = fs.readFileSync(pkgPath, "utf8");
  return JSON.parse(raw);
};

const collectDeclaredDeps = (pkg) => {
  const names = new Set();
  for (const section of depSections) {
    const map = pkg && typeof pkg[section] === "object" ? pkg[section] : null;
    if (!map) continue;
    for (const name of Object.keys(map)) {
      names.add(name);
    }
  }
  return [...names];
};

const missingCommands = requiredCommands.filter(
  (cmd) => !isCommandAvailable(cmd),
);

let pkg;
try {
  pkg = readPackageJson();
} catch (error) {
  console.error(`[deps:check] Unable to read ${pkgPath}: ${error.message}`);
  process.exit(1);
}

const declaredDeps = collectDeclaredDeps(pkg);
const missingPackages = declaredDeps.filter((dep) => {
  try {
    require.resolve(dep, { paths: [projectRoot] });
    return false;
  } catch (_error) {
    return true;
  }
});

if (missingCommands.length || missingPackages.length) {
  if (missingCommands.length) {
    console.error(
      `[deps:check] Missing commands: ${missingCommands.join(", ")}`,
    );
  }
  if (missingPackages.length) {
    console.error(
      `[deps:check] Missing packages from package.json: ${missingPackages.join(", ")}`,
    );
  }
  process.exit(1);
}
