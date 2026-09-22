#!/usr/bin/env python3
"""Audit the native bilingual voice catalog; generation requires an explicit flag.

python3 scripts/audit-ios-avatar-audio.py --output /tmp/avatar-audio.json
uv run --with faster-whisper python scripts/audit-ios-avatar-audio.py --transcribe --output /tmp/avatar-audio.json
"""
import argparse
import array
import concurrent.futures
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VOICE = ROOT / "ios/Bobby/Resources/Voice"
VIBES = {"chill": "wise", "directo": "direct", "pro": "analytical"}


def catalog():
    source = (ROOT / "ios/Bobby/Sources/Companion.swift").read_text()
    companions = re.findall(r'\.init\(id: "([^"]+)".*?selectLine: L\.t\("([^"]+)", "([^"]+)"\).*?voicePersona: "([^"]+)"', source, re.S)
    assert len(companions) == 18, "Review catalog parser when the avatar roster changes"
    entries = []
    for avatar, en, es, persona in companions:
        for lang, text in (("en", en), ("es", es)):
            entries.append(dict(name=f"select-{avatar}-{lang}", persona=persona, lang=lang, text=text))
    profile = (ROOT / "ios/Bobby/Sources/AgentProfile.swift").read_text().split("var sample: String", 1)[1]
    samples = re.findall(r'case \.(\w+): return L\.t\("([^"]+)", "([^"]+)"\)', profile)
    assert {v[0] for v in samples} == set(VIBES)
    for persona in sorted({c[3] for c in companions}):
        for vibe, en, es in samples:
            for lang, text in (("en", en), ("es", es)):
                entries.append(dict(name=f"vibe-{vibe}-{persona}-{lang}", persona=persona, lang=lang, text=text, vibe=VIBES[vibe]))
    return entries


def generate(entry):
    body = dict(text=entry["text"], voice=entry["persona"], lang=entry["lang"])
    if "vibe" in entry:
        body["vibe"] = entry["vibe"]
    request = urllib.request.Request("https://bobbyprotocol.xyz/api/bobby-voice-free", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read()
        assert response.headers.get("X-TTS-Provider") == "openai", "Do not bundle a generic fallback as a persona voice"
        assert "audio/" in response.headers.get("Content-Type", "") and len(data) > 500
    (VOICE / f'{entry["name"]}.mp3').write_bytes(data)
    print(f'Generated {entry["name"]}', flush=True)


def measure(entry):
    path = VOICE / f'{entry["name"]}.mp3'
    if not path.exists():
        return dict(**entry, error="missing")
    pcm = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"])
    samples = array.array("f", pcm)
    rms = math.sqrt(sum(s * s for s in samples) / max(1, len(samples)))
    duration = len(samples) / 16000
    result = dict(**entry, duration=round(duration, 3), rms=round(rms, 5), sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    if duration < 0.8 or rms < 0.005:
        result["error"] = "short or silent"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generate-missing", action="store_true", help="Uses the existing paid persona TTS endpoint, up to two requests at once")
    parser.add_argument("--transcribe", action="store_true", help="Requires faster-whisper; saves transcripts for human review")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    entries = catalog()
    missing = [e for e in entries if not (VOICE / f'{e["name"]}.mp3').exists()]
    print(f"Catalog: {len(entries)} clips; {len(missing)} missing", flush=True)
    if args.generate_missing:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(generate, missing))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(measure, entries))
    if args.transcribe:
        from faster_whisper import WhisperModel
        model = WhisperModel("base", device="cpu", compute_type="int8", cpu_threads=4)
        for result in results:
            if "error" in result:
                continue
            segments, info = model.transcribe(str(VOICE / f'{result["name"]}.mp3'), beam_size=5)
            result.update(transcript=" ".join(s.text.strip() for s in segments), detectedLanguage=info.language, languageProbability=round(info.language_probability, 4))
            print(f'{result["name"]} [{info.language}]: {result["transcript"]}', flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")
    errors = [r for r in results if "error" in r]
    print(f"Measured {len(results)} clips; {len(errors)} errors; report: {args.output}", flush=True)
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
