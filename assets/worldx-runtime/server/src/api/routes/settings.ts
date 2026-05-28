import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appContext } from "../../services/app-context.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeRoot = path.resolve(__dirname, "../../../..");
const envPath = path.join(runtimeRoot, ".env");

const SIMULATION_KEYS = [
  "SIMULATION_BASE_URL",
  "SIMULATION_API_KEY",
  "SIMULATION_MODEL",
] as const;

type SimulationKey = typeof SIMULATION_KEYS[number];
type EnvMap = Record<string, string>;

const router = Router();

router.get("/llm", (_req, res) => {
  const env = readEnv();
  res.json({
    ok: true,
    simulation: {
      baseUrl: env.SIMULATION_BASE_URL || process.env.SIMULATION_BASE_URL || "",
      model: env.SIMULATION_MODEL || process.env.SIMULATION_MODEL || "",
      hasApiKey: Boolean(env.SIMULATION_API_KEY || process.env.SIMULATION_API_KEY),
      apiKeyPreview: maskApiKey(env.SIMULATION_API_KEY || process.env.SIMULATION_API_KEY || ""),
    },
  });
});

router.put("/llm", (req, res) => {
  const body = req.body || {};
  const baseUrl = normalizeString(body.baseUrl);
  const model = normalizeString(body.model);
  const apiKey = normalizeString(body.apiKey);
  const clearApiKey = body.clearApiKey === true;

  if (!baseUrl) {
    res.status(400).json({ error: "SIMULATION_BASE_URL is required" });
    return;
  }
  if (!model) {
    res.status(400).json({ error: "SIMULATION_MODEL is required" });
    return;
  }
  if (!isHttpUrl(baseUrl)) {
    res.status(400).json({ error: "SIMULATION_BASE_URL must start with http:// or https://" });
    return;
  }

  const env = readEnv();
  env.SIMULATION_BASE_URL = baseUrl;
  env.SIMULATION_MODEL = model;
  if (apiKey) {
    env.SIMULATION_API_KEY = apiKey;
  } else if (clearApiKey) {
    delete env.SIMULATION_API_KEY;
  }

  writeEnv(env);
  for (const key of SIMULATION_KEYS) {
    if (env[key]) process.env[key] = env[key];
    else delete process.env[key];
  }
  appContext.reloadLLMConfig();

  res.json({
    ok: true,
    simulation: {
      baseUrl: env.SIMULATION_BASE_URL || "",
      model: env.SIMULATION_MODEL || "",
      hasApiKey: Boolean(env.SIMULATION_API_KEY),
      apiKeyPreview: maskApiKey(env.SIMULATION_API_KEY || ""),
    },
  });
});

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function readEnv(): EnvMap {
  if (!fs.existsSync(envPath)) return {};
  const env: EnvMap = {};
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    env[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return env;
}

function writeEnv(env: EnvMap): void {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const seen = new Set<SimulationKey>();
  const nextLines = existing.map((rawLine) => {
    const trimmed = rawLine.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1 || trimmed.startsWith("#")) return rawLine;
    const key = trimmed.slice(0, eq) as SimulationKey;
    if (!SIMULATION_KEYS.includes(key)) return rawLine;
    seen.add(key);
    return env[key] ? `${key}=${env[key]}` : "";
  }).filter((line) => line !== "");

  for (const key of SIMULATION_KEYS) {
    if (!seen.has(key) && env[key]) nextLines.push(`${key}=${env[key]}`);
  }

  fs.writeFileSync(envPath, `${nextLines.join("\n").trimEnd()}\n`, "utf8");
}

function maskApiKey(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export default router;
