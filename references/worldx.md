# WorldX Local Reference

## Local Project

- Bundled root: `<skill>/assets/worldx-runtime`
- External override: pass `--root /path/to/WorldX` or set `WORLDX_ROOT=/path/to/WorldX`
- Frontend: `http://localhost:3200/`
- Backend: `http://localhost:3100/`
- Health: `GET http://localhost:3100/api/health`
- Logs: `<runtime>/.worldx-dev.log`
- Generated worlds: `<runtime>/output/worlds`

The skill bundles WorldX source code under `assets/worldx-runtime` so users do not need to clone WorldX separately. The bundle excludes `.env`, `.git`, `node_modules`, and generated `output` history. Dependencies are installed into the bundled runtime on first start.

## Useful Endpoints

- `POST /api/worlds/create` with `{ "prompt": string, "sizeK": 1|2|4, "keepArtifacts": boolean }`
- `GET /api/worlds/jobs/current`
- `GET /api/worlds/jobs/:jobId`
- `GET /api/worlds/jobs/:jobId/events` for server-sent events
- `GET /api/world/worlds`
- `POST /api/world/select` with `{ "worldId": string }`

## Script Commands

- `assemble-codex`: build a WorldX world from Codex-generated `world-design.json`, map PNG, and character PNGs. This bypasses `IMAGE_GEN_*` completely.
- `diagnose`: config, ports, health, current job, world list; never prints API keys.
- `preflight` / `doctor`: small chat-completion probes for `ORCHESTRATOR`, `VISION`, and `SIMULATION`, plus image config validation without generating images.
- `status`: health/current job/world list, starting WorldX if needed.
- `logs` / `inspect`: read generation and map pipeline logs for a world id, defaulting to the current job world id.
- `resume`: reconnect to the active generation job and continue streaming events.
- `create`: start generation; if the server returns `409`, resume the active job instead of failing.
- `start`, `restart`, `stop`: app lifecycle helpers.

## Codex Asset Mode

Use this mode when the user says not to use OpenRouter, asks for "Codex 来生成素材", or compares the desired flow to `agent-sprite-forge`.

Flow:

1. Codex writes `world-design.json` in a temporary run folder.
2. Codex uses built-in `image_gen` for the map and each character.
3. Codex copies the chosen PNGs from `$CODEX_HOME/generated_images/...` into:
   - `<run>/map.png`
   - `<run>/characters/01-name.png`
   - `<run>/characters/02-name.png`
4. Run:

```bash
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs assemble-codex \
  --design <run>/world-design.json \
  --map <run>/map.png \
  --chars-dir <run>/characters \
  --prompt "<original prompt>"
```

The assembler creates:

- `map/06-background.png`
- `map/06-final.tmj`
- `characters/*/spritesheet.png`
- `config/world.json`
- `config/scene.json`
- `config/characters/*.json`

The generated character sprite sheets are simple static sheets assembled from one Codex PNG per character. They are sufficient for WorldX loading and simulation. For richer animation, use a dedicated sprite-sheet skill later.

## Environment Notes

WorldX loads `.env` from the project root. Do not print API keys in final answers.

Codex Asset Mode does not use `IMAGE_GEN_*`, OpenRouter, or provider image credits. It still may use WorldX text-model config only if Codex chooses the legacy `create` path; for pure Codex design, Codex writes `world-design.json` itself.

Recommended resilient settings for slow orchestrator providers:

```env
ORCHESTRATOR_TIMEOUT_MS=300000
ORCHESTRATOR_JSON_RETRIES=1
ORCHESTRATOR_DESIGN_MAX_TOKENS=8192
```

For OpenRouter image generation:

```env
IMAGE_GEN_PROVIDER=openai-compatible
IMAGE_GEN_BASE_URL=https://openrouter.ai/api/v1
IMAGE_GEN_MODEL=google/gemini-3.1-flash-image-preview
```

OpenRouter API keys normally start with `sk-or-v1-`. If `.env` contains `sk-sk-or-v1-`, the extra `sk-` is usually a paste error.

## Interruption Recovery

If Codex is interrupted while WorldX is generating, do not start a duplicate job. Run:

```bash
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs resume --verbose
```

If the job is already done, `resume` reports the final world id and switches to it when possible.
