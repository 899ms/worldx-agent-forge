#!/usr/bin/env python3
import argparse
import json
import re
import time
from pathlib import Path

from PIL import Image, ImageOps


FRAME_W = 170
FRAME_H = 204
COLS = 6
ROWS = 5


def slug(value: str) -> str:
    value = re.sub(r"\s+", "-", value.strip().lower())
    value = re.sub(r"[^a-z0-9\u4e00-\u9fff_-]+", "", value)
    return value or "character"


def fit_contain(img: Image.Image, size: tuple[int, int], bg=(0, 0, 0, 0)) -> Image.Image:
    img = img.convert("RGBA")
    img.thumbnail(size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", size, bg)
    x = (size[0] - img.width) // 2
    y = size[1] - img.height
    out.alpha_composite(img, (x, y))
    return out


def prepare_map(src: Path, dest: Path, width: int, height: int) -> dict:
    img = Image.open(src).convert("RGB")
    img = ImageOps.fit(img, (width, height), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest)
    return {"width": width, "height": height, "bytes": dest.stat().st_size}


def find_character_images(chars_dir: Path) -> list[Path]:
    if not chars_dir.exists():
        return []
    return sorted(
        [
            p
            for p in chars_dir.iterdir()
            if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        ]
    )


def make_spritesheet(src: Path, dest: Path) -> None:
    base = fit_contain(Image.open(src), (FRAME_W, FRAME_H))
    sheet = Image.new("RGBA", (FRAME_W * COLS, FRAME_H * ROWS), (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            frame = base
            if row == 0 and col % 2 == 1:
                frame = ImageOps.mirror(base)
            sheet.alpha_composite(frame, (col * FRAME_W, row * FRAME_H))
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest)


def write_character_assets(world_dir: Path, design: dict, chars_dir: Path) -> list[dict]:
    output_dir = world_dir / "characters"
    output_dir.mkdir(parents=True, exist_ok=True)
    images = find_character_images(chars_dir)
    characters = design.get("characters") or []
    manifest = []
    now_ms = int(time.time() * 1000)

    if len(images) < len(characters):
        raise SystemExit(
            f"Need at least {len(characters)} character images in {chars_dir}, found {len(images)}"
        )

    for i, char in enumerate(characters):
        char_id = f"char_{now_ms}_{i + 1:02d}"
        char_dir = output_dir / char_id
        char_dir.mkdir(parents=True, exist_ok=True)
        make_spritesheet(images[i], char_dir / "spritesheet.png")
        description = char.get("appearance") or char.get("role") or char.get("name") or char_id
        metadata = {
            "id": char_id,
            "name": char.get("name") or char_id,
            "description": description,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            "frameWidth": FRAME_W,
            "frameHeight": FRAME_H,
            "columns": COLS,
            "rows": ROWS,
            "animations": {
                "walk-left": {"start": 0, "end": 5, "frameRate": 8},
                "walk-down": {"start": 6, "end": 11, "frameRate": 8},
                "walk-up": {"start": 12, "end": 17, "frameRate": 8},
                "idle-front": {"frame": 18},
                "idle-back": {"frame": 19},
                "idle-left": {"frame": 20},
            },
        }
        (char_dir / "metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        manifest.append(
            {
                "id": char_id,
                "name": metadata["name"],
                "description": description,
                "createdAt": metadata["createdAt"],
            }
        )

    (output_dir / "characters.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--design", required=True)
    parser.add_argument("--map", required=True)
    parser.add_argument("--chars-dir", required=True)
    parser.add_argument("--world-dir", required=True)
    parser.add_argument("--width", type=int, default=1536)
    parser.add_argument("--height", type=int, default=864)
    parser.add_argument("--out-info", required=True)
    args = parser.parse_args()

    design = json.loads(Path(args.design).read_text(encoding="utf-8"))
    world_dir = Path(args.world_dir)
    map_info = prepare_map(Path(args.map), world_dir / "map/06-background.png", args.width, args.height)
    characters = write_character_assets(world_dir, design, Path(args.chars_dir))
    Path(args.out_info).write_text(
        json.dumps({"map": map_info, "characters": characters}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
