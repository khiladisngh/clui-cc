#!/usr/bin/env node
// Cross-platform postinstall script for Clui CC.
// Runs electron-builder install-app-deps, then macOS-only patch-dev-icon.sh.

const { execFileSync } = require("child_process");
const { platform } = require("os");
const { existsSync } = require("fs");
const { join } = require("path");

function run(cmd, args, label) {
  console.log(`postinstall: ${label}`);
  try {
    execFileSync(cmd, args, { stdio: "inherit" });
  } catch (err) {
    console.error(`postinstall: ${label} failed (exit code ${err.status})`);
    process.exit(err.status || 1);
  }
}

// Always run electron-builder install-app-deps
run("npx", ["electron-builder", "install-app-deps"], "electron-builder install-app-deps");

// macOS only: patch the dev icon
if (platform() === "darwin") {
  const patchScript = join(__dirname, "patch-dev-icon.sh");
  if (existsSync(patchScript)) {
    run("bash", [patchScript], "patch-dev-icon.sh");
  }
}
