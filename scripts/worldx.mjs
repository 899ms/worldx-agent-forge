#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SKILL_ROOT = path.resolve(__dirname, "..");
const BUNDLED_ROOT = path.join(SKILL_ROOT, "assets/worldx-runtime");
const SERVER_URL = "http://localhost:3100";
const CLIENT_URL = "http://localhost:3200";
const SCREEN_NAME = "worldx-local";

const args = process.argv.slice(2);
const command = args.shift() || "help";
const options = parseOptions(args);
const root = resolveWorldXRoot(options.root || process.env.WORLDX_ROOT);

async function main() {
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "diagnose") {
    await diagnose();
    return;
  }
  if (command === "preflight" || command === "doctor") {
    await preflight();
    return;
  }
  if (command === "status") {
    await status();
    return;
  }
  if (command === "logs" || command === "inspect") {
    await inspectLogs({
      worldId: options.world || options.worldId || options._[0],
      lines: Number(options.lines || 80),
    });
    return;
  }
  if (command === "resume") {
    await resumeJob({ verbose: Boolean(options.verbose) });
    return;
  }
  if (command === "start") {
    await startWorldX();
    return;
  }
  if (command === "restart") {
    await stopWorldX();
    await startWorldX({ force: true });
    return;
  }
  if (command === "stop") {
    await stopWorldX();
    return;
  }
  if (command === "create") {
    const prompt = options.prompt || options._.join(" ").trim();
    if (!prompt) throw new Error("create requires a prompt");
    await createWorld(prompt, {
      sizeK: Number(options.size || options.sizeK || 1),
      keepArtifacts: Boolean(options.keep || options.keepArtifacts),
      verbose: Boolean(options.verbose),
    });
    return;
  }
  if (command === "assemble-codex" || command === "codex-assemble") {
    await assembleCodexWorld();
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

function parseOptions(raw) {
  const out = { _: [] };
  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i];
    if (arg === "--keep" || arg === "--verbose") {
      out[arg.slice(2)] = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = raw[i + 1];
      if (next == null || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
      continue;
    }
    out._.push(arg);
  }
  return out;
}

function printHelp() {
  console.log(`WorldX Agent Forge

Usage:
  worldx.mjs diagnose
  worldx.mjs preflight|doctor
  worldx.mjs status
  worldx.mjs logs [world_id] [--lines 80]
  worldx.mjs resume [--verbose]
  worldx.mjs start|restart|stop
  worldx.mjs create "world prompt" [--size 1|2|4] [--keep] [--verbose]
  worldx.mjs assemble-codex --design world-design.json --map map.png --chars-dir character-pngs [--prompt "..."]

Defaults:
  root: ${BUNDLED_ROOT}
  app:  ${CLIENT_URL}

Override runtime root with --root /path/to/WorldX or WORLDX_ROOT=/path/to/WorldX.
`);
}

async function diagnose() {
  const env = readEnvFile();
  const health = await getHealth().catch((error) => ({ ok: false, error: error.message }));
  const ports = await getPorts();

  const roles = [
    "ORCHESTRATOR",
    "IMAGE_GEN",
    "VISION",
    "SIMULATION",
  ].map((prefix) => ({
    prefix,
    baseUrl: env[`${prefix}_BASE_URL`] || "",
    model: env[`${prefix}_MODEL`] || "",
    hasKey: Boolean(env[`${prefix}_API_KEY`]),
  }));

  const warnings = [];
  if (env.IMAGE_GEN_PROVIDER && !["openai-compatible", "google-native"].includes(env.IMAGE_GEN_PROVIDER)) {
    warnings.push(`IMAGE_GEN_PROVIDER=${env.IMAGE_GEN_PROVIDER} is not one of openai-compatible/google-native`);
  }
  if ((env.IMAGE_GEN_API_KEY || "").startsWith("sk-sk-or-v1-")) {
    warnings.push("IMAGE_GEN_API_KEY appears to have an extra sk- prefix before sk-or-v1-");
  }
  if (!existsSync(path.join(root, "package.json"))) {
    warnings.push(`WorldX root does not look valid: ${root}`);
  }

  const currentJob = await getJSON("/api/worlds/jobs/current").catch((error) => ({
    error: error.message,
  }));
  const worlds = await getJSON("/api/world/worlds").catch((error) => ({
    error: error.message,
  }));

  printJSON({
    ok: warnings.length === 0 && health.ok !== false,
    root,
    clientUrl: CLIENT_URL,
    serverUrl: SERVER_URL,
    health,
    ports,
    currentJob,
    worlds,
    imageProvider: env.IMAGE_GEN_PROVIDER || "",
    tuning: {
      ORCHESTRATOR_TIMEOUT_MS: env.ORCHESTRATOR_TIMEOUT_MS || "",
      ORCHESTRATOR_JSON_RETRIES: env.ORCHESTRATOR_JSON_RETRIES || "",
      ORCHESTRATOR_DESIGN_MAX_TOKENS: env.ORCHESTRATOR_DESIGN_MAX_TOKENS || "",
    },
    roles,
    warnings,
  });
}

async function preflight() {
  const env = readEnvFile();
  const checks = [];

  for (const prefix of ["ORCHESTRATOR", "VISION", "SIMULATION"]) {
    checks.push(await preflightChatRole(prefix, env));
  }

  checks.push(preflightImageConfig(env));

  printJSON({
    ok: checks.every((check) => check.ok),
    root,
    checks,
  });
}

async function status() {
  await startWorldX({ quiet: true });
  const [health, currentJob, worlds] = await Promise.all([
    getHealth().catch((error) => ({ ok: false, error: error.message })),
    getJSON("/api/worlds/jobs/current").catch((error) => ({ error: error.message })),
    getJSON("/api/world/worlds").catch((error) => ({ error: error.message })),
  ]);
  printJSON({
    ok: health.status === "ok",
    clientUrl: CLIENT_URL,
    health,
    currentJob,
    worlds,
  });
}

async function inspectLogs({ worldId, lines }) {
  await startWorldX({ quiet: true });
  let resolvedWorldId = worldId;
  if (!resolvedWorldId) {
    const current = await getJSON("/api/worlds/jobs/current").catch(() => null);
    resolvedWorldId = current?.snapshot?.worldId || null;
  }
  if (!resolvedWorldId) {
    throw new Error("logs requires a world id when there is no current job worldId");
  }

  const generationLog = path.join(root, "output/worlds", resolvedWorldId, "logs/generation.log");
  const mapLog = path.join(root, "output/worlds", resolvedWorldId, "logs/map-pipeline.log");
  const generationTail = tailFile(generationLog, lines);
  const mapTail = existsSync(mapLog) ? tailFile(mapLog, Math.min(lines, 120)) : [];
  const combined = [...generationTail, ...mapTail];

  printJSON({
    ok: existsSync(generationLog),
    worldId: resolvedWorldId,
    generationLog,
    mapLog: existsSync(mapLog) ? mapLog : null,
    diagnosis: diagnoseTail(combined),
    generationTail,
    mapTail,
  });
}

async function resumeJob({ verbose }) {
  await startWorldX({ quiet: true });
  const current = await getJSON("/api/worlds/jobs/current");
  if (!current.jobId) {
    printJSON({ ok: true, status: "idle", message: "No active create job" });
    return;
  }
  if (current.snapshot?.status === "running") {
    const result = await streamJob(current.jobId, { verbose });
    await selectWorldIfDone(result);
    result.clientUrl = CLIENT_URL;
    printJSON(result);
    return;
  }
  const result = {
    ok: current.snapshot?.status === "done",
    status: current.snapshot?.status,
    jobId: current.jobId,
    worldId: current.snapshot?.worldId || null,
    worldName: current.snapshot?.worldName || null,
    error: current.snapshot?.error || null,
    clientUrl: CLIENT_URL,
  };
  await selectWorldIfDone(result);
  printJSON(result);
}

async function startWorldX({ force = false, quiet = false } = {}) {
  if (!force) {
    const health = await getHealth().catch(() => null);
    if (health?.status === "ok") {
      if (!quiet) {
        console.log(`[worldx] already running: ${CLIENT_URL}`);
        printJSON({ ok: true, action: "start", alreadyRunning: true, clientUrl: CLIENT_URL, health });
      }
      return;
    }
  }

  ensureWorldXRoot();

  if (!existsSync(path.join(root, "node_modules"))) {
    console.log("[worldx] installing dependencies...");
    await run("npm", ["install"], { cwd: root, timeout: 10 * 60 * 1000 });
  }

  const hasScreen = await commandExists("screen");
  if (hasScreen) {
    await run("screen", ["-S", SCREEN_NAME, "-X", "quit"], { cwd: root, allowFailure: true });
    await run("screen", [
      "-dmS",
      SCREEN_NAME,
      "zsh",
      "-lc",
      `cd ${shellQuote(root)} && npm run dev > .worldx-dev.log 2>&1`,
    ], { cwd: root });
  } else {
    const out = openLogFile();
    const child = spawn("npm", ["run", "dev"], {
      cwd: root,
      detached: true,
      stdio: ["ignore", out, out],
    });
    child.unref();
  }

  const health = await waitForHealth(45_000);
  if (!quiet) {
    console.log(`[worldx] running: ${CLIENT_URL}`);
    printJSON({ ok: true, action: "start", clientUrl: CLIENT_URL, health });
  }
}

async function stopWorldX() {
  await run("npm", ["run", "stop"], { cwd: root, allowFailure: true, timeout: 20_000 });
  await run("screen", ["-S", SCREEN_NAME, "-X", "quit"], { cwd: root, allowFailure: true });
  printJSON({ ok: true, action: "stop" });
}

async function createWorld(prompt, { sizeK, keepArtifacts, verbose }) {
  if (![1, 2, 4].includes(sizeK)) {
    throw new Error("--size must be 1, 2, or 4");
  }

  await startWorldX({ quiet: true });

  console.log(`[worldx] creating world, sizeK=${sizeK}`);
  let createRes;
  try {
    createRes = await postJSON("/api/worlds/create", {
      prompt,
      sizeK,
      keepArtifacts,
    });
  } catch (error) {
    if (error.status === 409 && error.body?.activeJobId) {
      console.log(`[worldx] create job already running, resuming ${error.body.activeJobId}`);
      const resumed = await streamJob(error.body.activeJobId, { verbose });
      await selectWorldIfDone(resumed);
      resumed.clientUrl = CLIENT_URL;
      printJSON(resumed);
      return;
    }
    throw error;
  }
  const jobId = createRes.jobId;
  if (!jobId) throw new Error("Create API did not return jobId");

  const result = await streamJob(jobId, { verbose });
  if (result.status !== "done") {
    printJSON(result);
    process.exitCode = 1;
    return;
  }

  await selectWorldIfDone(result);
  result.clientUrl = CLIENT_URL;
  result.logPath = result.worldId
    ? path.join(root, "output/worlds", result.worldId, "logs/generation.log")
    : null;
  printJSON(result);
}

async function assembleCodexWorld() {
  const design = options.design;
  const map = options.map;
  const charsDir = options.charsDir || options["chars-dir"];
  if (!design || !map || !charsDir) {
    throw new Error("assemble-codex requires --design, --map, and --chars-dir");
  }

  const { stdout } = await execFileAsync("node", [
    path.join(__dirname, "assemble_codex_world.mjs"),
    "--root", root,
    "--design", design,
    "--map", map,
    "--chars-dir", charsDir,
    ...(options.prompt ? ["--prompt", options.prompt] : []),
    ...(options.width ? ["--width", options.width] : []),
    ...(options.height ? ["--height", options.height] : []),
    ...(options.worldId ? ["--worldId", options.worldId] : []),
  ], { cwd: root, timeout: 180_000 });

  const assembled = extractLastJSONObject(stdout);
  await startWorldX({ quiet: true });
  if (assembled?.worldId) {
    await selectWorldIfDone({ status: "done", worldId: assembled.worldId });
  }
  printJSON({
    ...assembled,
    selected: assembled?.worldId ? true : false,
    clientUrl: CLIENT_URL,
  });
}

async function selectWorldIfDone(result) {
  if (result.status !== "done" || !result.worldId) return;
  try {
    result.selected = await postJSON("/api/world/select", { worldId: result.worldId });
  } catch (error) {
    result.selectError = error.message;
  }
}

async function streamJob(jobId, { verbose }) {
  const tail = [];
  let worldId = null;
  let worldName = null;
  let phase = null;
  let step = null;

  const res = await fetch(`${SERVER_URL}/api/worlds/jobs/${encodeURIComponent(jobId)}/events`);
  if (!res.ok || !res.body) {
    throw new Error(`SSE failed: ${res.status} ${await res.text()}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const dataLine = part
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.slice(6));

      if (event.kind === "world_id") worldId = event.worldId;
      if (event.kind === "phase") {
        phase = event.phase;
        step = null;
        console.log(`[worldx] phase ${event.phase}: ${event.label}`);
      }
      if (event.kind === "step") {
        phase = event.phase;
        step = event.step;
        console.log(`[worldx] step ${event.phase}.${event.step}: ${event.label}`);
      }
      if (event.kind === "info") console.log(`[worldx] ${event.label}`);
      if (event.kind === "log") {
        tail.push(event.line);
        if (tail.length > 40) tail.shift();
        if (verbose || /error|failed|timeout|API error|unsupported/i.test(event.line)) {
          console.log(`[${event.stream}] ${event.line}`);
        }
      }
      if (event.kind === "job_done") {
        worldId = event.worldId || worldId;
        worldName = event.worldName || worldName;
        return { ok: true, status: "done", jobId, worldId, worldName, phase, step };
      }
      if (event.kind === "job_error") {
        return {
          ok: false,
          status: "error",
          jobId,
          worldId,
          phase,
          step,
          error: event.message,
          diagnosis: diagnoseTail(event.tail || tail),
          tail: event.tail || tail,
        };
      }
    }
  }

  const snapshot = await getJSON(`/api/worlds/jobs/${encodeURIComponent(jobId)}`);
  return {
    ok: snapshot.status === "done",
    status: snapshot.status,
    jobId,
    worldId: snapshot.worldId || worldId,
    worldName: snapshot.worldName || worldName,
    phase: snapshot.phase || phase,
    step: snapshot.step || step,
    error: snapshot.error || null,
    diagnosis: snapshot.error ? diagnoseTail(tail) : null,
    tail,
  };
}

function diagnoseTail(lines) {
  const text = lines.join("\n");
  if (/Orchestrator request timed out/i.test(text)) {
    return "Orchestrator model timed out during world design. Use a faster ORCHESTRATOR_MODEL or increase ORCHESTRATOR_TIMEOUT_MS and reduce retries.";
  }
  if (/Missing Authentication header/i.test(text)) {
    return "Provider rejected authentication. Check API key formatting and whether the key belongs to the configured BASE_URL.";
  }
  if (/401|Unauthorized|invalid api key|incorrect api key/i.test(text)) {
    return "Provider rejected the API key. Verify the key belongs to the configured BASE_URL and has access to the selected model.";
  }
  if (/429|rate limit|quota|insufficient credits/i.test(text)) {
    return "Provider rate limit, quota, or credit exhaustion. Wait, reduce generation size, or switch provider/key.";
  }
  if (/model.*not.*available|No endpoints found|not found/i.test(text)) {
    return "Configured model is unavailable for this provider/key. Pick a model the provider exposes.";
  }
  if (/IMAGE_GEN_PROVIDER|provider/i.test(text) && /unsupported|invalid/i.test(text)) {
    return "Image provider setting likely unsupported. Use IMAGE_GEN_PROVIDER=openai-compatible for OpenRouter.";
  }
  if (/gpt-image-2.*not supported|model is not supported/i.test(text)) {
    return "The configured image model is unsupported in this account/API path. Use a supported image model or provider.";
  }
  if (/Map generation failed|TMJ output/i.test(text)) {
    return "Map image or map validation failed. Check IMAGE_GEN_* and VISION_* settings, then inspect map-pipeline.log.";
  }
  return "Inspect the generation log tail for the provider-specific error.";
}

async function preflightChatRole(prefix, env) {
  const baseUrl = env[`${prefix}_BASE_URL`];
  const apiKey = env[`${prefix}_API_KEY`];
  const model = env[`${prefix}_MODEL`];
  if (!baseUrl || !apiKey || !model) {
    return { prefix, ok: false, model: model || "", error: "Missing BASE_URL/API_KEY/MODEL" };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: 'Return JSON {"ok":true} only.' }],
        temperature: 0,
        max_tokens: 64,
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    return {
      prefix,
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      model,
      preview: sanitizeProviderText(text).slice(0, 240),
    };
  } catch (error) {
    return {
      prefix,
      ok: false,
      ms: Date.now() - started,
      model,
      error: error.name === "AbortError" ? "Timed out after 20s" : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function preflightImageConfig(env) {
  const warnings = [];
  if (!env.IMAGE_GEN_BASE_URL || !env.IMAGE_GEN_API_KEY || !env.IMAGE_GEN_MODEL) {
    warnings.push("Missing IMAGE_GEN_BASE_URL/API_KEY/MODEL");
  }
  if (!["openai-compatible", "google-native"].includes(env.IMAGE_GEN_PROVIDER || "")) {
    warnings.push("IMAGE_GEN_PROVIDER should be openai-compatible or google-native");
  }
  if ((env.IMAGE_GEN_API_KEY || "").startsWith("sk-sk-or-v1-")) {
    warnings.push("OpenRouter key appears to have an extra sk- prefix");
  }
  return {
    prefix: "IMAGE_GEN",
    ok: warnings.length === 0,
    model: env.IMAGE_GEN_MODEL || "",
    provider: env.IMAGE_GEN_PROVIDER || "",
    baseUrl: env.IMAGE_GEN_BASE_URL || "",
    warnings,
    note: "Image preflight is config-only to avoid spending image-generation credits.",
  };
}

function sanitizeProviderText(text) {
  return text.replace(/sk-[A-Za-z0-9._-]+/g, "sk-***");
}

function tailFile(filePath, maxLines) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf8");
  return content.split(/\r?\n/).filter(Boolean).slice(-Math.max(1, maxLines || 80));
}

function readEnvFile() {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    env[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return env;
}

function resolveWorldXRoot(explicitRoot) {
  return path.resolve(explicitRoot || BUNDLED_ROOT);
}

function ensureWorldXRoot() {
  if (!existsSync(path.join(root, "package.json"))) {
    throw new Error(
      `WorldX runtime not found at ${root}. Reinstall the skill, or pass --root /path/to/WorldX.`,
    );
  }
}

async function waitForHealth(timeoutMs) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const health = await getHealth();
      if (health.status === "ok") return health;
    } catch (error) {
      lastError = error;
    }
    await sleep(750);
  }
  throw new Error(`WorldX did not become healthy: ${lastError?.message || "timeout"}`);
}

async function getHealth() {
  return getJSON("/api/health");
}

async function getPorts() {
  const out = {};
  for (const port of [3100, 3200]) {
    try {
      const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
      out[port] = stdout.trim();
    } catch {
      out[port] = "";
    }
  }
  return out;
}

async function getJSON(pathname) {
  const res = await fetch(`${SERVER_URL}${pathname}`);
  if (!res.ok) throw await buildHTTPError(pathname, res);
  return res.json();
}

async function postJSON(pathname, body) {
  const res = await fetch(`${SERVER_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await buildHTTPError(pathname, res);
  return res.json();
}

async function buildHTTPError(pathname, res) {
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Keep raw text below.
  }
  const error = new Error(`${pathname} ${res.status}: ${text}`);
  error.status = res.status;
  error.body = body;
  return error;
}

async function run(cmd, cmdArgs, { cwd, timeout = 60_000, allowFailure = false } = {}) {
  try {
    const result = await execFileAsync(cmd, cmdArgs, { cwd, timeout });
    return result;
  } catch (error) {
    if (allowFailure) return { stdout: error.stdout || "", stderr: error.stderr || "" };
    throw error;
  }
}

async function commandExists(cmd) {
  try {
    await execFileAsync("command", ["-v", cmd]);
    return true;
  } catch {
    try {
      await execFileAsync("which", [cmd]);
      return true;
    } catch {
      return false;
    }
  }
}

function openLogFile() {
  const logPath = path.join(root, ".worldx-dev.log");
  writeFileSync(logPath, "", { flag: "a" });
  return openSync(logPath, "a");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printJSON(value) {
  console.log(JSON.stringify(value, null, 2));
}

function extractLastJSONObject(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  if (start === -1) return { ok: false, raw: text };
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return { ok: false, raw: text };
  }
}

main().catch((error) => {
  console.error(`[worldx] ${error.stack || error.message}`);
  process.exit(1);
});
