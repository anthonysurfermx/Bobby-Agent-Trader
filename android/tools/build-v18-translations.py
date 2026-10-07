#!/usr/bin/env python3
"""Brings the iOS 1.8 translations into the Android native catalog.

iOS keeps French, Portuguese, Italian and German for the 1.8 screens in
ios/Bobby/Sources/V18/Translations/*.swift, one `result["English"] = ["fr": …, "pt": …, "it": …, "de": …]`
row per string. Android looks the same English string up in
android/app/src/main/assets/nucleo/native-android-translations.json (NucleoSession.text).

This script reads every iOS row and merges it into that JSON:
  - a key the JSON already has keeps its value (the JSON is also edited by hand);
  - a row that names an iPhone, an Apple Account or the App Store is replaced by its Android wording
    from v18-android-wording.json (key = the iOS English string; `en` there is the Android key,
    `es` is the Spanish to pass to `text(en, es)`);
  - the file is written sorted by key, so running it again changes nothing and two branches that
    each add rows merge without a fight (when they do conflict: take either side, run this again).

To add a string iOS does not have: add `"English": {"fr": …, "pt": …, "it": …, "de": …}` to the JSON
anywhere, then run this script to put it in its place.

    python3 android/tools/build-v18-translations.py           # write
    python3 android/tools/build-v18-translations.py --check   # exit 1 if the JSON is not up to date
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IOS = os.path.join(ROOT, "ios", "Bobby", "Sources", "V18", "Translations")
CATALOG = os.path.join(ROOT, "android", "app", "src", "main", "assets", "nucleo", "native-android-translations.json")
WORDING = os.path.join(ROOT, "android", "tools", "v18-android-wording.json")

ADDED = ("fr", "pt", "it", "de")
FIELDS = ("en", "es") + ADDED
# A row starts its line (a comment that quotes the pattern does not).
ROW = re.compile(r'^\s*result\["((?:[^"\\]|\\.)*)"\]\s*=\s*\[(.*)\]\s*$')
PAIR = re.compile(r'"(fr|pt|it|de)"\s*:\s*"((?:[^"\\]|\\.)*)"')
PLACEHOLDER = re.compile(r"\{\d+\}")
APPLE = re.compile(r"iPhone|iPad|Apple|App Store")


def unquote(text):
    return json.loads('"' + text + '"')


def placeholders(text):
    return sorted(PLACEHOLDER.findall(text))


def ios_rows():
    rows = {}
    for path in sorted(glob.glob(os.path.join(IOS, "*.swift"))):
        with open(path, encoding="utf-8") as source:
            for number, line in enumerate(source, 1):
                match = ROW.match(line)
                if not match:
                    continue
                key = unquote(match.group(1))
                values = {language: unquote(value) for language, value in PAIR.findall(match.group(2))}
                where = f"{os.path.basename(path)}:{number}"
                if sorted(values) != sorted(ADDED) or not all(values[language].strip() for language in ADDED):
                    sys.exit(f"{where}: a row needs fr, pt, it and de: {key!r}")
                if key in rows and rows[key] != values:
                    sys.exit(f"{where}: two different rows for {key!r}")
                rows[key] = values
    if not rows:
        sys.exit(f"no translation rows found under {IOS}")
    return rows


def android_rows(rows, wording):
    """The iOS rows as Android says them."""
    out = {}
    needs_wording = []
    for key, values in rows.items():
        if key in wording:
            entry = wording[key]
            if sorted(entry) != sorted(FIELDS) or not all(str(entry[field]).strip() for field in FIELDS):
                sys.exit(f"v18-android-wording.json: {key!r} needs en, es, fr, pt, it and de")
            key, values = entry["en"], {language: entry[language] for language in ADDED}
        if APPLE.search(key) or any(APPLE.search(value) for value in values.values()):
            needs_wording.append(key)
            continue
        for language in ADDED:
            if placeholders(values[language]) != placeholders(key):
                sys.exit(f"placeholders differ in {language}: {key!r}")
        out[key] = values
    if needs_wording:
        sys.exit("These iOS rows name Apple hardware or stores. Add their Android wording to v18-android-wording.json:\n  "
                 + "\n  ".join(repr(key) for key in sorted(needs_wording)))
    unused = sorted(set(wording) - set(rows))
    if unused:
        sys.exit("v18-android-wording.json rewords rows iOS no longer has:\n  " + "\n  ".join(repr(key) for key in unused))
    return out


def render(catalog):
    ordered = {key: {field: catalog[key][field] for field in FIELDS if field in catalog[key]} for key in sorted(catalog)}
    return json.dumps(ordered, ensure_ascii=False, indent=2) + "\n"


def main():
    check = "--check" in sys.argv[1:]
    with open(CATALOG, encoding="utf-8") as source:
        before = source.read()
    catalog = json.loads(before)
    with open(WORDING, encoding="utf-8") as source:
        wording = json.load(source)
    rows = android_rows(ios_rows(), wording)
    added = 0
    for key, values in rows.items():
        if key not in catalog:
            catalog[key] = values
            added += 1
    after = render(catalog)
    if after == before:
        print(f"native-android-translations.json is up to date ({len(catalog)} keys, {len(rows)} from iOS 1.8)")
        return
    if check:
        sys.exit("native-android-translations.json is not up to date: run python3 android/tools/build-v18-translations.py")
    with open(CATALOG, "w", encoding="utf-8") as target:
        target.write(after)
    print(f"native-android-translations.json: {len(catalog)} keys ({added} added, {len(rows)} from iOS 1.8), sorted")


if __name__ == "__main__":
    main()
