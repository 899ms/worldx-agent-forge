#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(skillRoot, "assets/worldx-runtime");
const worldxScript = path.join(__dirname, "worldx.mjs");
const assemblerScript = path.join(__dirname, "assemble_codex_world.mjs");
const localDeveloperRoot = path.join("/Users", "huangju", "code", "eos", "bugbug", "WorldX");

const help = execFileSync("node", [worldxScript, "help"], {
  cwd: skillRoot,
  encoding: "utf8",
});

assert(help.includes(runtimeRoot), "help output should advertise the bundled runtime root");
assert(!help.includes(localDeveloperRoot), "help output must not advertise a local developer path");

for (const file of [worldxScript, assemblerScript]) {
  const source = readFileSync(file, "utf8");
  assert(!source.includes(JSON.stringify(localDeveloperRoot)), `${path.basename(file)} must not hard-code a local developer path`);
  assert(!source.includes(`'${localDeveloperRoot}'`), `${path.basename(file)} must not hard-code a local developer path`);
}

for (const relative of [
  "package.json",
  "client",
  "server",
  "orchestrator",
  "generators",
  "scripts",
  "LICENSE",
]) {
  assert(existsSync(path.join(runtimeRoot, relative)), `bundled WorldX runtime missing ${relative}`);
}

for (const forbidden of [".env", ".git", "node_modules"]) {
  assert(!existsSync(path.join(runtimeRoot, forbidden)), `bundled runtime must not include ${forbidden}`);
}

console.log(JSON.stringify({
  ok: true,
  skillRoot,
  runtimeRoot,
}, null, 2));

function assert(condition, message) {
  if (!condition) {
    console.error(`[self-test] ${message}`);
    process.exit(1);
  }
}
