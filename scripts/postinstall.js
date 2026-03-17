#!/usr/bin/env node
// Cross-platform postinstall script for Clui CC.
// Runs electron-builder install-app-deps, then macOS-only patch-dev-icon.sh.

const { execSync } = require("child_process");
const { platform } = require("os");
const { existsSync } = require("fs");
const { join } = require("path");

// Rebuild native modules (node-pty) for the target Electron version
console.log("postinstall: electron-builder install-app-deps");
try {
  execSync("npx electron-builder install-app-deps", {
    stdio: "inherit",
    shell: true,
  });
} catch (err) {
  console.error(
    `postinstall: electron-builder install-app-deps failed (exit code ${err.status})`
  );
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(err.status || 1);
}

// macOS only: patch the dev icon
if (platform() === "darwin") {
  const patchScript = join(__dirname, "patch-dev-icon.sh");
  if (existsSync(patchScript)) {
    console.log("postinstall: patch-dev-icon.sh");
    try {
      execSync(`bash "${patchScript}"`, { stdio: "inherit" });
    } catch {
      // Non-fatal — icon patch is cosmetic
    }
  }
}
