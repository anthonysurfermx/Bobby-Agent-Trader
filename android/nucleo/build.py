#!/usr/bin/env python3
"""Build the release-only Núcleo pages bundled in the Android app.

    python3 android/nucleo/build.py --release

For every page P in PAGES with a src/P/template.html:
  src/shared/*.js (sorted; 9*-dev-*.js skipped in --release) -> <!--NUCLEO:SHARED-->
  src/P/*.js (sorted)                                         -> <!--NUCLEO:JS-->
  companions.json (with dataUri)                              -> __COMPANIONS_JSON__ (exactly once)
  the shared CSP                                              -> <!--NUCLEO:CSP-->
  => app/src/main/assets/nucleo/P.html
Node checks the complete page script. Development mocks, contract pages and
fixtures cannot be bundled by this Android builder. Nothing touches the network.
"""
import json, os, shutil, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
ANDROID = os.path.dirname(HERE)
OUT = os.path.join(ANDROID, "app", "src", "main", "assets", "nucleo")
SRC = os.path.join(HERE, "src")
FIX = os.path.join(HERE, "fixtures")
PAGES = ["app", "onboarding", "contract"]
DEV_ONLY_PAGES = {"contract"}
LEGACY = ["index.html", "nucleo-v2.html", "nucleo-onboarding.html"]
MARKER = ".generated-by-nucleo-build"
CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
       "font-src data:; img-src data: blob:; media-src data: blob:; "
       "connect-src 'none'; base-uri 'none'; form-action 'none'")


def js_json(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def shared_scripts(release):
    d = os.path.join(SRC, "shared")
    names = sorted(n for n in os.listdir(d) if n.endswith(".js"))
    if release:
        names = [n for n in names if not (n[:1] == "9" and "-dev-" in n)]
    return [(n, read(os.path.join(d, n))) for n in names]


def fixtures_blob():
    ask_dir = os.path.join(FIX, "ask")
    ask = {n[:-5]: json.load(open(os.path.join(ask_dir, n))) for n in sorted(os.listdir(ask_dir)) if n.endswith(".json")}
    nat = os.path.join(FIX, "native")
    return {
        "manifest": json.load(open(os.path.join(FIX, "manifest.json"))),
        "ask": ask,
        "native": {
            "roster": json.load(open(os.path.join(nat, "roster.json"))),
            "levels": json.load(open(os.path.join(nat, "levels.json"))),
            "riskNotice": json.load(open(os.path.join(nat, "risk-notice.json"))),
        },
    }


def node_check(script, label):
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as tf:
        tf.write(script)
        path = tf.name
    try:
        r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
    finally:
        os.unlink(path)
    if r.returncode != 0:
        sys.exit(f"node --check failed for {label}:\n{r.stderr}")


def build_page(page, release, companions_payload, fixtures_payload):
    tpl_path = os.path.join(SRC, page, "template.html")
    if not os.path.exists(tpl_path):
        return None
    tpl = read(tpl_path)
    for token in ("<!--NUCLEO:CSP-->", "<!--NUCLEO:SHARED-->", "<!--NUCLEO:JS-->"):
        if tpl.count(token) != 1:
            sys.exit(f"{page}/template.html must contain {token} exactly once")
    shared = shared_scripts(release)
    parts = sorted(n for n in os.listdir(os.path.join(SRC, page)) if n.endswith(".js"))
    page_js = "\n".join(f"/* ---- {page}/{n} ---- */\n" + read(os.path.join(SRC, page, n)) for n in parts)
    shared_js = "\n".join(f"/* ---- shared/{n} ---- */\n" + body for n, body in shared)
    fixtures_tag = "" if release else f"<script>window.NUCLEO_FIXTURES={fixtures_payload};</script>"
    # Order matters: fixtures before shared (the mock reads them at load), shared before page code.
    out = (tpl.replace("<!--NUCLEO:CSP-->", f'<meta http-equiv="Content-Security-Policy" content="{CSP}">')
              .replace("<!--NUCLEO:FIXTURES-->", fixtures_tag)
              .replace("<!--NUCLEO:SHARED-->", "<script>\n" + shared_js + "\n</script>")
              .replace("<!--NUCLEO:JS-->", "<script>\n" + page_js + "\n</script>"))
    if "<!--NUCLEO:FIXTURES-->" not in tpl and not release:
        sys.exit(f"{page}/template.html must contain <!--NUCLEO:FIXTURES--> (before SHARED) for dev builds")
    n = out.count("__COMPANIONS_JSON__")
    if n != 1:
        sys.exit(f"{page}: __COMPANIONS_JSON__ must appear exactly once in template or parts (found {n})")
    node_check(shared_js + "\n" + page_js.replace("__COMPANIONS_JSON__", "[]"), page)
    out = out.replace("__COMPANIONS_JSON__", companions_payload)
    dest = os.path.join(OUT, f"{page}.html")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(out)
    return dest, len(out)


def risk_notice_source(source=None):
    """Validate authored Android consent copy before generating any product assets."""
    source = source or os.path.join(HERE, "risk-notice.json")
    try:
        notice = json.loads(read(source))
        if not isinstance(notice, dict) or type(notice.get("v")) is not int or notice["v"] != 1 or type(notice.get("version")) is not int or notice["version"] != 6:
            raise ValueError("expected notice v1 and consent version 6")
        statements = notice.get("statements")
        if not isinstance(statements, dict) or set(statements) != {"en", "es", "fr", "pt", "it", "de"}:
            raise ValueError("expected all six supported languages")
        for language, entries in statements.items():
            if not isinstance(entries, list) or len(entries) != 4:
                raise ValueError("expected four statements for " + language)
            for entry in entries:
                if not isinstance(entry, dict) or not all(isinstance(entry.get(key), str) and entry[key].strip() for key in ("title", "body")):
                    raise ValueError("empty statement for " + language)
                if any(term in (entry["title"] + entry["body"]).lower() for term in ("apple", "iphone", "safari")):
                    raise ValueError("foreign platform disclosure in " + language)
            if not all(provider in entries[0]["body"] for provider in ("OpenAI", "Anthropic", "Microsoft", "Android")):
                raise ValueError("missing Android AI or narration disclosure in " + language)
    except (OSError, ValueError, TypeError) as error:
        sys.exit("Android risk-notice.json is missing or violates the six-language on-device consent contract: " + str(error))
    return source


def main():
    global OUT
    if "--output" in sys.argv:
        OUT = sys.argv[sys.argv.index("--output") + 1]
    if "--contract-only" in sys.argv or "--dev" in sys.argv:
        sys.exit("Android app assets are release-only; run contract tests outside the product bundle")
    release = True
    risk_source = risk_notice_source()
    os.makedirs(OUT, exist_ok=True)
    # The old scripted prototypes are not the app. NucleoPreview.swift still loads index.html until
    # the native builder switches routing, so they are parked (moved, never deleted) only on request.
    parked = os.path.join(HERE, "prototype")
    park = "--park-legacy" in sys.argv[1:]
    for name in LEGACY:
        p = os.path.join(OUT, name)
        if os.path.exists(p):
            if park:
                os.makedirs(parked, exist_ok=True)
                shutil.move(p, os.path.join(parked, name))
                print(f"moved legacy {name} -> Nucleo/prototype/{name}")
            else:
                print(f"note: legacy {name} still bundled (use --park-legacy once NucleoRoot routes to app.html)")
    shutil.copyfile(risk_source, os.path.join(OUT, "risk-notice.json"))
    companions = json.load(open(os.path.join(HERE, "companions.json")))
    payload = js_json(companions)
    meta = [{k: c.get(k) for k in ("id", "label", "palette", "tint")} for c in companions]
    with open(os.path.join(OUT, "companions-meta.json"), "w") as f:
        json.dump({"v": 1, "companions": meta}, f, indent=1)
    fixtures_payload = None if release else js_json(fixtures_blob())
    built = []
    for page in PAGES:
        target = os.path.join(OUT, f"{page}.html")
        if release and page in DEV_ONLY_PAGES:
            # Our own generated dev page (it carries data-page="<page>"): regenerated by any dev build.
            if os.path.exists(target) and f'data-page="{page}"' in read(target):
                os.remove(target)
            continue
        r = build_page(page, release, payload, fixtures_payload)
        if r:
            built.append((page, r[1]))
        else:
            print(f"skip {page}: no src/{page}/template.html yet")
    fx_out = os.path.join(OUT, "fixtures")
    if release:
        if os.path.isdir(fx_out):
            if not os.path.exists(os.path.join(fx_out, MARKER)):
                sys.exit(f"{fx_out} exists but was not generated by this script; refusing to touch it")
            shutil.rmtree(fx_out)  # our own generated copy; the source stays in Nucleo/fixtures
    else:
        if os.path.isdir(fx_out) and not os.path.exists(os.path.join(fx_out, MARKER)):
            sys.exit(f"{fx_out} exists but was not generated by this script; refusing to overwrite it")
        if os.path.isdir(fx_out):
            shutil.rmtree(fx_out)
        shutil.copytree(os.path.join(FIX, "raw"), os.path.join(fx_out, "raw"))
        shutil.copytree(os.path.join(FIX, "native"), os.path.join(fx_out, "native"))
        shutil.copy(os.path.join(FIX, "manifest.json"), os.path.join(fx_out, "manifest.json"))
        open(os.path.join(fx_out, MARKER), "w").write("delete-safe: regenerated by ios/Bobby/Nucleo/build.py\n")
    info = {"builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "release": release,
            "pages": [p for p, _ in built]}
    with open(os.path.join(OUT, "build-info.json"), "w") as f:
        json.dump(info, f, indent=1)
    for p, size in built:
        print(f"built {p}.html ({size:,} bytes){' [release]' if release else ' [dev: mock + fixtures inline]'}")
    print("NUCLEO_BUILD_OK")


if __name__ == "__main__":
    main()
