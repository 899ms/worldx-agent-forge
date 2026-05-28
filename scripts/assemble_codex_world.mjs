#!/usr/bin/env node
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, "..");
const BUNDLED_ROOT = path.join(SKILL_ROOT, "assets/worldx-runtime");
const TILE_SIZE = 8;

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.env.WORLDX_ROOT || BUNDLED_ROOT);

async function main() {
  const designPath = requiredPath(args.design, "--design");
  const mapPath = requiredPath(args.map, "--map");
  const charsDir = requiredPath(args.charsDir || args["chars-dir"], "--chars-dir");
  const originalPrompt = args.prompt || "";
  const width = Number(args.width || 1536);
  const height = Number(args.height || 864);
  const worldId = args.worldId || `world_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const worldDir = path.join(root, "output/worlds", worldId);

  mkdirSync(path.join(worldDir, "map"), { recursive: true });
  mkdirSync(path.join(worldDir, "logs"), { recursive: true });

  const design = JSON.parse(readFileSync(designPath, "utf8"));
  writeFileSync(path.join(worldDir, "world-design.json"), JSON.stringify(design, null, 2));

  const assetInfoPath = path.join(worldDir, "codex-assets.json");
  await execFileAsync("python3", [
    path.join(__dirname, "prepare_codex_assets.py"),
    "--design", designPath,
    "--map", mapPath,
    "--chars-dir", charsDir,
    "--world-dir", worldDir,
    "--width", String(width),
    "--height", String(height),
    "--out-info", assetInfoPath,
  ], { cwd: root, timeout: 120_000 });

  writeMapFiles({ worldDir, design, width, height });

  const { generateConfigs } = await import(pathToFileURL(path.join(root, "orchestrator/src/config-generator.mjs")));
  generateConfigs(design, worldDir, { originalPrompt });

  writeFileSync(
    path.join(worldDir, "logs/generation.log"),
    [
      `=== WorldX Codex Asset Assembly — ${new Date().toISOString()} ===`,
      `World ID: ${worldId}`,
      `Design: ${designPath}`,
      `Map: ${mapPath}`,
      `Characters: ${charsDir}`,
      "",
    ].join("\n"),
  );

  console.log(JSON.stringify({
    ok: true,
    worldId,
    worldDir,
    worldName: design.worldName || null,
    assetInfo: assetInfoPath,
    url: "http://localhost:3200/",
  }, null, 2));
}

function parseArgs(raw) {
  const out = {};
  for (let i = 0; i < raw.length; i += 1) {
    const key = raw[i];
    if (!key.startsWith("--")) continue;
    const value = raw[i + 1];
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

function requiredPath(value, name) {
  if (!value) throw new Error(`${name} is required`);
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) throw new Error(`${name} does not exist: ${resolved}`);
  return resolved;
}

function pathToFileURL(filePath) {
  const url = new URL("file://");
  url.pathname = path.resolve(filePath);
  return url.href;
}

function writeMapFiles({ worldDir, design, width, height }) {
  const gridWidth = Math.floor(width / TILE_SIZE);
  const gridHeight = Math.floor(height / TILE_SIZE);
  const mapDir = path.join(worldDir, "map");
  const regions = design.regions || [];
  const elements = design.interactiveElements || [];

  const tmj = {
    compressionlevel: -1,
    width: gridWidth,
    height: gridHeight,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    infinite: false,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.10.2",
    type: "map",
    version: "1.10",
    layers: [
      {
        id: 1,
        name: "background",
        type: "imagelayer",
        image: "06-background.png",
        imagewidth: width,
        imageheight: height,
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
      },
      {
        id: 2,
        name: "collision",
        type: "tilelayer",
        data: Array(gridWidth * gridHeight).fill(0),
        width: gridWidth,
        height: gridHeight,
        opacity: 1,
        visible: false,
        x: 0,
        y: 0,
      },
      {
        id: 3,
        name: "regions",
        type: "objectgroup",
        objects: makeRegionObjects(regions, width, height),
        opacity: 1,
        visible: true,
      },
      {
        id: 4,
        name: "interactive_objects",
        type: "objectgroup",
        objects: makeElementObjects(elements, width, height),
        opacity: 1,
        visible: true,
      },
    ],
    nextlayerid: 5,
    nextobjectid: 1 + regions.length + elements.length,
  };

  writeFileSync(path.join(mapDir, "06-final.tmj"), JSON.stringify(tmj, null, 2));
  writeFileSync(path.join(mapDir, "05-walkable-grid.json"), JSON.stringify({
    tileSize: TILE_SIZE,
    gridWidth,
    gridHeight,
    walkable: Array(gridWidth * gridHeight).fill(1),
  }, null, 2));
  writeFileSync(path.join(mapDir, "03-regions.json"), JSON.stringify(regions, null, 2));
  writeFileSync(path.join(mapDir, "03-designed-regions.json"), JSON.stringify(regions, null, 2));
  writeFileSync(path.join(mapDir, "03-elements.json"), JSON.stringify(elements, null, 2));
  writeFileSync(path.join(mapDir, "06-regions-scaled.json"), JSON.stringify(regions, null, 2));
  writeFileSync(path.join(mapDir, "06-elements-scaled.json"), JSON.stringify(elements, null, 2));
  writeFileSync(path.join(mapDir, "runs.json"), JSON.stringify([], null, 2));
  writeFileSync(path.join(mapDir, "metadata.json"), JSON.stringify({
    source: "codex-image-gen",
    width,
    height,
    tileSize: TILE_SIZE,
    gridWidth,
    gridHeight,
    generatedAt: new Date().toISOString(),
  }, null, 2));
}

function makeRegionObjects(regions, width, height) {
  const slots = rectSlots(regions.length, width, height, 0.18, 0.2);
  return regions.map((region, i) => ({
    id: i + 1,
    name: region.name || region.id || `region_${i + 1}`,
    type: "",
    x: slots[i].x,
    y: slots[i].y,
    width: slots[i].width,
    height: slots[i].height,
    rotation: 0,
    visible: true,
    properties: [
      prop("id", region.id || `region_${i + 1}`),
      prop("description", region.description || ""),
      prop("regionType", region.type || "outdoor"),
      prop("actions", JSON.stringify((region.interactions || []).map((item) => item.id).filter(Boolean))),
      prop("adjacentRegions", "[]"),
    ],
  }));
}

function makeElementObjects(elements, width, height) {
  const slots = rectSlots(elements.length, width, height, 0.12, 0.12, 0.5);
  return elements.map((element, i) => ({
    id: i + 1,
    name: element.name || element.id || `element_${i + 1}`,
    type: "",
    x: slots[i].x,
    y: slots[i].y,
    width: slots[i].width,
    height: slots[i].height,
    rotation: 0,
    visible: true,
    properties: [
      prop("objectId", element.id || `element_${i + 1}`),
      prop("interactions", JSON.stringify((element.interactions || []).map((item) => item.id).filter(Boolean))),
    ],
  }));
}

function rectSlots(count, width, height, slotWRatio, slotHRatio, yBias = 0.08) {
  if (count <= 0) return [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const slotW = Math.max(80, width * slotWRatio);
  const slotH = Math.max(80, height * slotHRatio);
  const marginX = width * 0.08;
  const marginY = height * yBias;
  const usableW = width - marginX * 2;
  const usableH = height - marginY * 2;
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = marginX + ((col + 0.5) / cols) * usableW;
    const cy = marginY + ((row + 0.5) / rows) * usableH;
    return {
      x: Math.max(0, Math.round(cx - slotW / 2)),
      y: Math.max(0, Math.round(cy - slotH / 2)),
      width: Math.round(slotW),
      height: Math.round(slotH),
    };
  });
}

function prop(name, value) {
  return { name, type: "string", value: String(value) };
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
