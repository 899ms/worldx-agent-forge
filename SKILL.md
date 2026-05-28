---
name: worldx-agent-forge
description: Use when the user asks Codex to create, assemble, diagnose, or run a WorldX AI simulation game/world from natural language, especially when they want Codex built-in image generation instead of OpenRouter/API image providers, one-prompt WorldX generation, local asset assembly, interruption recovery, or WorldX model/provider troubleshooting.
---

# WorldX Agent Forge

## Overview

Use this skill to turn a user prompt into a running WorldX world with the bundled runtime at `assets/worldx-runtime`. Prefer **Codex Asset Mode**: Codex designs the world, calls built-in `image_gen` for visible assets, saves PNGs locally, and uses the assembler script to make a WorldX world. Use WorldX's built-in API image pipeline only when the user explicitly asks for the legacy provider path and has configured provider credentials.

## Quick Start

For "one sentence to game" requests, use Codex Asset Mode:

```bash
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs assemble-codex \
  --design /path/to/world-design.json \
  --map /path/to/map.png \
  --chars-dir /path/to/character-pngs \
  --prompt "用户的一句话世界描述"
```

The assembler writes a complete `output/worlds/world_*` folder, starts WorldX if needed, switches to the new world, and prints a JSON summary.

Then open or verify:

```bash
http://localhost:3200/
```

Use the Browser skill for local page verification when available.

The skill is self-contained for normal use. Pass `--root /path/to/WorldX` or set `WORLDX_ROOT=/path/to/WorldX` only when intentionally testing an external WorldX checkout.

## Workflow

1. Understand the requested world and preserve important names, roles, style, and constraints.
2. Write `world-design.json` yourself. Keep it compatible with WorldX: `worldName`, `worldDescription`, `worldSocialContext`, `contentLanguage`, `mapDescription`, `sceneType`, `timeConfig`, `worldActions`, optional `regions`, optional `interactiveElements`, and 1-8 `characters`.
3. Use built-in `image_gen` for every visible asset:
   - one top-down map PNG, no UI labels, no text, no character actors baked into the map
   - one character PNG per WorldX character, full-body or bust-like game sprite source, preferably transparent or flat chroma-key background
4. Move/copy selected generated images from `$CODEX_HOME/generated_images/...` into a run folder:
   - `map.png`
   - `characters/01-name.png`, `characters/02-name.png`, etc. in the same order as `world-design.json`
   - save prompts next to assets as `.prompt.txt`
5. Run `assemble-codex` to make the playable WorldX world.
6. Verify `http://localhost:3200/` with the Browser skill when available.
7. On failure, run `status` and `logs`; do not guess from UI alone.

## Codex Asset Mode Commands

```bash
# Assemble a WorldX world from Codex-generated assets.
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs assemble-codex \
  --design /path/to/world-design.json \
  --map /path/to/map.png \
  --chars-dir /path/to/character-pngs \
  --prompt "original user prompt"
```

Important: local scripts cannot call Codex `image_gen` directly. The agent must call built-in `image_gen` in the conversation, then copy the generated PNGs into the run folder before running `assemble-codex`.

## Common Commands

```bash
# Check config, ports, and health without printing API keys.
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs diagnose

# Verify the packaged skill has a bundled runtime and no local developer path dependency.
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/self_test.mjs

# Check text model reachability and image config.
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs preflight

# Show app/job/world status.
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs status

# Inspect current or specific generation logs and classify the failure.
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs logs
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs logs world_2026-... --lines 120

# Continue watching the active generation after an interruption.
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs resume --verbose

# Start or restart the app.
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs start
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs restart

# Stop the app.
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs stop

# Generate and keep intermediate images/logs for debugging.
node /Users/huangju/.codex/skills/worldx-agent-forge/scripts/worldx.mjs create "..." --size 1 --keep
```

Treat `create` as the **legacy WorldX provider pipeline**. It uses WorldX's configured `IMAGE_GEN_*` provider and may spend OpenRouter/API credits. Do not use it when the user asked Codex itself to generate assets.

## Error Handling

- Active generation already exists: `create` automatically resumes the running job when the server returns `409`.
- Failed generation: run `logs` before proposing fixes; it reads `generation.log` and `map-pipeline.log` and classifies common provider errors.
- `Orchestrator request timed out`: the `ORCHESTRATOR_*` model is too slow for the long JSON design prompt. Prefer a faster orchestrator model, or set `ORCHESTRATOR_TIMEOUT_MS=300000`, `ORCHESTRATOR_JSON_RETRIES=1`, and `ORCHESTRATOR_DESIGN_MAX_TOKENS=8192`.
- `Missing Authentication header` from OpenRouter: check that the key starts with `sk-or-v1-`, not `sk-sk-or-v1-`.
- `401`, `invalid api key`, or `Unauthorized`: the key does not match the configured provider/base URL or lacks model access.
- `429`, `quota`, or `insufficient credits`: pause, lower `--size`, or switch provider/key.
- Image provider errors: WorldX supports `IMAGE_GEN_PROVIDER=openai-compatible` or `google-native`; use `openai-compatible` for OpenRouter.
- `gpt-image-2` unsupported in Codex/ChatGPT account flows: use a platform API key and a supported image model, or use OpenRouter/Gemini image models if configured.
- If generation succeeds but the UI still shows the old world, call `POST /api/world/select` or rerun the script; it switches worlds after `job_done`.
- Codex image output not found: search `$CODEX_HOME/generated_images` for recent PNGs, choose the accepted output, and copy it into the run folder. Never leave project assets only under `$CODEX_HOME/generated_images`.

## References

Read `references/worldx.md` when you need local paths, environment variable notes, endpoint details, or troubleshooting context.
