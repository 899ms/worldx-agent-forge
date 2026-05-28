# WorldX Agent Forge

WorldX Agent Forge is a self-contained Codex skill for turning one natural-language idea into a runnable WorldX simulation world.

It lets Codex design the world, generate map and character assets with Codex built-in image generation, assemble those assets into a WorldX-compatible world folder, and launch the bundled local WorldX runtime.

## What This Is

This repository is a Codex skill, not a standalone npm package.

It includes:

- `SKILL.md`: instructions that teach Codex when and how to use the skill
- `scripts/`: helper scripts for diagnosis, startup, asset preparation, and WorldX assembly
- `assets/worldx-runtime/`: a bundled copy of the WorldX runtime
- `references/`: operational notes for WorldX paths, APIs, and troubleshooting

The normal workflow is:

1. You ask Codex for a game world in one sentence.
2. Codex writes a `world-design.json`.
3. Codex generates a map image and character images.
4. The skill assembles those assets into a WorldX world.
5. The bundled WorldX app runs locally at `http://localhost:3200/`.

## Built On WorldX

This project bundles and adapts the open-source [YGYOOO/WorldX](https://github.com/YGYOOO/WorldX) project as its local simulation runtime.

WorldX provides the core app/runtime pieces:

- frontend world viewer
- backend simulation server
- world/timeline loading
- character state and event systems
- map and character asset formats

WorldX Agent Forge adds the Codex skill layer around WorldX:

- Codex-first world creation workflow
- Codex Asset Mode, avoiding the legacy image-provider pipeline
- local assembly from Codex-generated PNG assets
- startup, diagnosis, and recovery scripts
- a bundled runtime so users do not need to clone WorldX separately

The bundled WorldX code is kept under `assets/worldx-runtime/`. Its original license is included at `assets/worldx-runtime/LICENSE`.

## Install

Clone this repository into your Codex skills directory:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
git clone git@github.com:HuangLittleOrange/worldx-agent-forge.git \
  "${CODEX_HOME:-$HOME/.codex}/skills/worldx-agent-forge"
```

Restart Codex so it can discover the skill.

After restart, use it by mentioning:

```text
$worldx-agent-forge
```

## Quick Start

In Codex, ask something like:

```text
Use $worldx-agent-forge to generate a post-apocalyptic supermarket world where six rival survivors are trapped overnight.
Use Codex Asset Mode.
```

Codex will generate the design and visual assets, then run:

```bash
node ~/.codex/skills/worldx-agent-forge/scripts/worldx.mjs assemble-codex \
  --design /path/to/world-design.json \
  --map /path/to/map.png \
  --chars-dir /path/to/character-pngs \
  --prompt "original prompt"
```

When successful, open:

```text
http://localhost:3200/
```

## API Keys

For Codex Asset Mode, users do not need to configure OpenRouter or image-generation API keys.

Codex Asset Mode uses:

- Codex text reasoning for the world design
- Codex built-in image generation for map and character assets
- local scripts for resizing, sprite-sheet assembly, and WorldX world packaging

However, if you want WorldX characters to actively run AI simulation after the world is loaded, the bundled WorldX runtime may still need a text-model key for runtime behavior:

```env
SIMULATION_BASE_URL=
SIMULATION_API_KEY=
SIMULATION_MODEL=
```

The legacy WorldX generation pipeline also requires provider configuration:

```env
ORCHESTRATOR_BASE_URL=
ORCHESTRATOR_API_KEY=
ORCHESTRATOR_MODEL=

IMAGE_GEN_PROVIDER=
IMAGE_GEN_BASE_URL=
IMAGE_GEN_API_KEY=
IMAGE_GEN_MODEL=

VISION_BASE_URL=
VISION_API_KEY=
VISION_MODEL=
```

For this skill, prefer Codex Asset Mode unless you explicitly want to test WorldX's original provider-based generation pipeline.

## Useful Commands

Run from anywhere:

```bash
node ~/.codex/skills/worldx-agent-forge/scripts/self_test.mjs
node ~/.codex/skills/worldx-agent-forge/scripts/worldx.mjs status
node ~/.codex/skills/worldx-agent-forge/scripts/worldx.mjs start
node ~/.codex/skills/worldx-agent-forge/scripts/worldx.mjs stop
node ~/.codex/skills/worldx-agent-forge/scripts/worldx.mjs diagnose
```

The first launch installs dependencies inside the bundled runtime. `node_modules`, generated worlds, `.env`, logs, and runtime databases are ignored by git.

## Repository Layout

```text
worldx-agent-forge/
├── SKILL.md
├── agents/openai.yaml
├── assets/
│   └── worldx-runtime/       # bundled WorldX open-source runtime
├── references/
│   └── worldx.md
└── scripts/
    ├── assemble_codex_world.mjs
    ├── prepare_codex_assets.py
    ├── self_test.mjs
    └── worldx.mjs
```

## Attribution And License

WorldX Agent Forge bundles and adapts [YGYOOO/WorldX](https://github.com/YGYOOO/WorldX).

The bundled WorldX runtime is licensed under the MIT License. See:

```text
assets/worldx-runtime/LICENSE
```

Please preserve the WorldX license notice when redistributing this repository or derivative work.
