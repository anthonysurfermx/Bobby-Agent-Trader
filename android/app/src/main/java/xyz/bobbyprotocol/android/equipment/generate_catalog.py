"""Copy approved release art and deterministically extract the iOS locker catalogue."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path


def build(source: Path, output: Path) -> None:
    swift = (source / "Sources/CompanionTools.swift").read_text()
    assets = source / "Assets.xcassets"
    slots_block = swift.split("static let slots:", 1)[1].split("static func unlocked", 1)[0]
    slots = dict(re.findall(r'"([a-z]+-[123])": \.([a-z]+)', slots_block))
    item_blocks = re.findall(r'case "([a-z]+)":\s*return \[(.*?)\n\s*\]', swift, re.S)
    items = []
    quoted = r'"((?:\\.|[^"\\])*)"'
    tool_pattern = re.compile(r't\((\d),\s*' + ",\\s*".join([quoted] * 5) + r'\)')
    decode = lambda value: json.loads('"' + value + '"')
    for companion, block in item_blocks:
        for tier, symbol, name_en, name_es, lore_en, lore_es in tool_pattern.findall(block):
            tier = int(tier)
            item_id = f"{companion}-{tier}"
            items.append({"id": item_id, "companionId": companion, "tier": tier,
                          "kind": "tool", "unlockXP": 1 if tier == 1 else (tier - 1) * 100,
                          "slot": slots[item_id], "name": {"en": decode(name_en), "es": decode(name_es)},
                          "lore": {"en": decode(lore_en), "es": decode(lore_es)},
                          "fallback": decode(symbol), "art": f"tool_{companion}_{tier}.png"})
    pet_pattern = re.compile(r'case "([a-z]+)": return CompanionPet\(companionId: companionId, name: L\.t\(' + quoted + r',\s*' + quoted + r'\), emoji: ' + quoted + r', spins: (true|false)\)')
    for companion, name_en, name_es, emoji, spins in pet_pattern.findall(swift):
        items.append({"id": f"pet-{companion}", "companionId": companion, "tier": 0,
                      "kind": "pet", "unlockXP": 500, "slot": "pet", "spins": spins == "true",
                      "name": {"en": decode(name_en), "es": decode(name_es)},
                      "lore": {"en": "Spins next to you on the desk." if spins == "true" else "Lives at your companion's feet.",
                               "es": "Gira a tu lado en la mesa." if spins == "true" else "Vive a los pies de tu amigo."},
                      "fallback": decode(emoji), "art": f"pet_{companion}.png"})
    assert len(items) == 72 and len({row["id"] for row in items}) == 72, "Incomplete iOS catalogue"
    output.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for row in items:
        image = assets / (row["art"].removesuffix(".png") + ".imageset") / row["art"]
        assert image.is_file(), image
        shutil.copyfile(image, output / row["art"])
        hashes[row["art"]] = hashlib.sha256(image.read_bytes()).hexdigest()
    for companion in sorted({row["companionId"] for row in items}):
        image = source / "Resources/Mascots" / f"{companion}_thumb.png"
        assert image.is_file(), image
        shutil.copyfile(image, output / image.name)
        hashes[image.name] = hashlib.sha256(image.read_bytes()).hexdigest()
    catalog = {"version": 1, "provenance": "iOS Bobby release54 CompanionTools.swift and bundled approved art",
               "items": items, "sha256": hashes}
    (output / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    print(f"Copied {len(hashes)} approved images and {len(items)} exact catalogue entries")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.source, args.output)
