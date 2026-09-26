#!/usr/bin/env python3
"""Build the Núcleo pages bundled in the iOS app (ARCHITECTURE.md §1.2).

    python3 ios/Bobby/Nucleo/build.py            # dev: pages + inline mock + fixtures
    python3 ios/Bobby/Nucleo/build.py --release  # ship: no mock, no fixtures, no contract page
    python3 ios/Bobby/Nucleo/build.py --park-legacy  # dev build + move the old prototypes out of the bundle
    python3 nucleo/build.py --web                    # WEB (this copy, in the web repo): public/nucleo/{index,onboarding}.html

--web (web repo only; see nucleo/README.md) builds the release pages with the WEB transport
(src/web/*.js, the browser's answer to the native bridge) instead of a native handler, the web
CSP (connect-src 'self'), no mock and no fixtures. app -> public/nucleo/index.html,
onboarding -> public/nucleo/onboarding.html, plus public/nucleo/voice/select-*.mp3 (the pick
clips the iOS app bundles). The catalog the web transport needs (roster, levels, gear, quick
access, risk notice v4) is read from the site's own src/lib/companions/data.ts (the web port of
Companion.swift), companions.json (palettes) and nucleo/native/*.json (Companion.swift level
names in Spanish and RiskNotice v4, snapshots from the iOS branch), and inlined as NUCLEO_WEB.

For every page P in PAGES with a src/P/template.html:
  src/shared/*.js (sorted; 9*-dev-*.js skipped in --release) -> <!--NUCLEO:SHARED-->
  src/P/*.js (sorted)                                         -> <!--NUCLEO:JS-->
  companions.json (with dataUri)                              -> __COMPANIONS_JSON__ (exactly once)
  fixtures (dev only)                                         -> <!--NUCLEO:FIXTURES-->
  the shared CSP                                              -> <!--NUCLEO:CSP-->
  => Resources/Nucleo/P.html   (node --check runs on the page's full script first)
Also writes Resources/Nucleo/companions-meta.json (no art) for native, and in dev
copies fixtures/{raw,native,manifest.json} to Resources/Nucleo/fixtures/ for the
native -nucleo-fixtures mode. Nothing here touches the network.
"""
import json, os, shutil, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
IOS = os.path.dirname(HERE)
OUT = os.path.join(IOS, "Resources", "Nucleo")
SRC = os.path.join(HERE, "src")
FIX = os.path.join(HERE, "fixtures")
PAGES = ["app", "onboarding", "contract"]
DEV_ONLY_PAGES = {"contract"}
LEGACY = ["index.html", "nucleo-v2.html", "nucleo-onboarding.html"]
MARKER = ".generated-by-nucleo-build"
CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com data:; img-src data: blob:; media-src data: blob:; "
       "connect-src 'none'; base-uri 'none'; form-action 'none'")

# ---- web target (--web) --------------------------------------------------------------------
REPO = IOS                                   # in the web repo this copy lives at <repo>/nucleo
WEB_OUT = os.path.join(REPO, "public", "nucleo")
WEB_PAGES = {"app": "index.html", "onboarding": "onboarding.html"}
WEB_SRC = os.path.join(SRC, "web")
WEB_NATIVE = os.path.join(HERE, "native")
WEB_DATA_TS = os.path.join(REPO, "src", "lib", "companions", "data.ts")
WEB_VOICE_SRC = os.path.join(REPO, "ios", "Bobby", "Resources", "Voice")
WEB_BASE = "/nucleo/"
# Existing routes of the site (vercel.json, src/App.tsx): the daily app, the first run, the classic
# desk (openClassic), Trader Land (openNative isla) and the privacy policy (the account sheet).
WEB_ROUTES = {"app": WEB_BASE, "onboarding": WEB_BASE + "onboarding.html", "classic": "/desk",
              "isla": "/trader-land", "privacy": "/privacy"}
WEB_CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; "
           "font-src https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob: data:; "
           "connect-src 'self'; base-uri 'none'; form-action 'none'")
# Web-only differences from the canonical engine sources, applied at build time so src/ stays
# byte-identical to the iOS branch. Each (file, old, new) must match EXACTLY once or the build stops.
# They are CONTRACT CHANGE REQUESTS for the iOS branch (README.md); none changes native behaviour.
WEB_PATCHES = [
    # The pre-permission card must not promise an iOS prompt, nor on-device speech, in a browser.
    ("app/40-strings.js",
     "'perm.body': 'iOS will ask for the microphone and speech recognition once.',",
     "'perm.body': 'iOS will ask for the microphone and speech recognition once.', 'perm.bodyWeb': 'Your browser will ask for the microphone once. Its speech service turns your voice into text.',"),
    ("app/40-strings.js",
     "'perm.body': 'iOS pedirá el micrófono y el reconocimiento de voz una vez.',",
     "'perm.body': 'iOS pedirá el micrófono y el reconocimiento de voz una vez.', 'perm.bodyWeb': 'Tu navegador pedirá el micrófono una vez. Su servicio de voz convierte tu voz en texto.',"),
    ("app/60-fsm.js",
     "el.permP.textContent = tt('perm.body');",
     "el.permP.textContent = tt(SES && SES.platform === 'web' ? 'perm.bodyWeb' : 'perm.body');"),
    ("onboarding/40-strings.js",
     "'perm.body': 'iOS will ask for the microphone and speech recognition once.',",
     "'perm.body': 'iOS will ask for the microphone and speech recognition once.',\n    'perm.bodyWeb': 'Your browser will ask for the microphone once. Its speech service turns your voice into text.',"),
    ("onboarding/40-strings.js",
     "'perm.body': 'iOS te pedirá una vez el micrófono y el reconocimiento de voz.',",
     "'perm.body': 'iOS te pedirá una vez el micrófono y el reconocimiento de voz.',\n    'perm.bodyWeb': 'Tu navegador pedirá el micrófono una vez. Su servicio de voz convierte tu voz en texto.',"),
    ("onboarding/60-fsm.js",
     "txt($('permB'), Ls('perm.body'));",
     "txt($('permB'), Ls(SESSION && SESSION.platform === 'web' ? 'perm.bodyWeb' : 'perm.body'));"),
    ("onboarding/60-fsm.js",
     "  SESSION = s;\n",
     "  SESSION = s;\n  if (s.platform === 'web'){ txt($('permB'), Ls('perm.bodyWeb')); if (typeof permEl !== 'undefined' && permEl) permEl._h = 0; }\n"),
    # Bug (iOS too): the finger that completes hold-to-agree is still down when the first read starts
    # (+0.40 s); releasing it then counts as a tap on the thinking pill and cancels the read.
    ("onboarding/90-input.js",
     "function pillDown(){\n  var s = W.state;\n",
     "function pillDown(){\n  var s = W.state; W.pillFrom = s;\n"),
    ("onboarding/90-input.js",
     "function pillUp(cancelled){\n  var s = W.state;\n",
     "function pillUp(cancelled){\n  var s = W.state, from = W.pillFrom; W.pillFrom = null;\n  if (from === 'RISK' && s !== 'RISK') return;   /* the finger that agreed is not a tap on the read that follows */\n"),
    # A 600 KB page can paint its DOM before its scripts run (a flash of every element at 0,0, unscaled).
    # Native covers the load with a snapshot; the web keeps the stage hidden until the first session
    # reply has been rendered (90-web-install adds html.nw-live).
    ("app/template.html", "</head>", "<style>#stage{visibility:hidden}html.nw-live #stage{visibility:visible}</style>\n</head>"),
    ("onboarding/template.html", "</head>", "<style>#stage{visibility:hidden}html.nw-live #stage{visibility:visible}</style>\n</head>"),
    # Sign-in after value is offered only where it exists (session.signInAvailable; native omits it = available).
    ("onboarding/60-fsm.js",
     "if (W.saved && SESSION && !SESSION.signedIn) go('SIGN_IN');",
     "if (W.saved && SESSION && !SESSION.signedIn && SESSION.signInAvailable !== false) go('SIGN_IN');"),
]


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


# ---- web target ------------------------------------------------------------------------------

EXTRACT_JS = r"""
const m = await import(process.argv[1]);
const bi = (x) => ({ en: String(x.en), es: String(x.es) });
const tools = {};
for (const [id, list] of Object.entries(m.TOOLS)) tools[id] = list.map((t) => ({ tier: t.tier, unlockXP: m.toolUnlockXP(t.tier), name: bi(t.name) }));
process.stdout.write(JSON.stringify({
  companions: m.COMPANIONS.map((c) => ({ id: c.id, label: c.label, role: bi(c.role), selectLine: bi(c.selectLine), requiredLevel: c.requiredLevel, voicePersona: c.voicePersona })),
  levels: m.LEVELS.map((l) => ({ number: l.number, name: l.name, minXP: l.minXP })),
  tools, quickAccess: m.DEFAULT_QUICK_ACCESS,
}));
"""


def web_catalog(companions):
    """The data the web transport answers roster/levels/gear/riskNotice with. Real sources only."""
    if not os.path.exists(WEB_DATA_TS):
        sys.exit(f"--web: {WEB_DATA_TS} not found (run from the web repo copy)")
    r = subprocess.run(["node", "--no-warnings", "--experimental-strip-types", "--input-type=module", "-e", EXTRACT_JS, WEB_DATA_TS],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"--web: could not read {WEB_DATA_TS} (Node >= 22.6 strips TypeScript types):\n{r.stderr}")
    data = json.loads(r.stdout)
    art = {c["id"]: c for c in companions}
    levels_es = {l["number"]: l for l in json.load(open(os.path.join(WEB_NATIVE, "levels.json")))["levels"]}
    risk = json.load(open(os.path.join(WEB_NATIVE, "risk-notice.json")))
    roster = []
    for c in data["companions"]:
        web_id = "bobby" if c["id"] == "orb" else c["id"]           # NucleoSession.webId
        if web_id not in art:
            sys.exit(f"--web: companion {c['id']} has no art in companions.json")
        roster.append(dict(c, webId=web_id, palette=art[web_id].get("palette") or "matrix"))
    levels = []
    for l in data["levels"]:
        snap = levels_es.get(l["number"])
        if not snap or snap["en"] != l["name"] or snap["minXP"] != l["minXP"]:
            sys.exit(f"--web: level {l['number']} differs between data.ts and native/levels.json; resync them")
        levels.append({"number": l["number"], "minXP": l["minXP"], "en": snap["en"], "es": snap["es"]})
    if len(risk["statements"]["en"]) != 4 or len(risk["statements"]["es"]) != 4:
        sys.exit("--web: native/risk-notice.json must carry the 4 statements in en and es (R11)")
    clips = sorted(n[:-4] for n in os.listdir(WEB_VOICE_SRC) if n.startswith("select-") and n.endswith(".mp3")) \
        if os.path.isdir(WEB_VOICE_SRC) else []
    return {
        "v": 1, "builtAt": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()), "base": WEB_BASE, "routes": WEB_ROUTES,
        "companions": roster, "levels": levels, "tools": data["tools"], "quickAccess": data["quickAccess"],
        "riskNotice": {"version": risk["version"], "statements": risk["statements"]}, "clips": clips,
    }


def web_patched(rel, body):
    """`body` of src/<rel> with its WEB_PATCHES applied; each must match exactly once."""
    for (f, old, new) in WEB_PATCHES:
        if f == rel:
            if body.count(old) != 1:
                sys.exit(f"--web: patch for {f} matched {body.count(old)} times (the engine changed; update WEB_PATCHES):\n  {old}")
            body = body.replace(old, new)
    return body


def web_parts(page):
    """Page JS with WEB_PATCHES applied."""
    names = sorted(n for n in os.listdir(os.path.join(SRC, page)) if n.endswith(".js"))
    return "\n".join(f"/* ---- {page}/{n} ---- */\n" + web_patched(f"{page}/{n}", read(os.path.join(SRC, page, n))) for n in names)


def build_web_page(page, companions_payload, catalog_payload):
    tpl = web_patched(f"{page}/template.html", read(os.path.join(SRC, page, "template.html")))
    for token in ("<!--NUCLEO:CSP-->", "<!--NUCLEO:FIXTURES-->", "<!--NUCLEO:SHARED-->", "<!--NUCLEO:JS-->"):
        if tpl.count(token) != 1:
            sys.exit(f"{page}/template.html must contain {token} exactly once")
    shared = shared_scripts(True)                                   # release: the dev mock never ships
    web = sorted(n for n in os.listdir(WEB_SRC) if n.endswith(".js"))
    shared_js = "\n".join([f"/* ---- shared/{n} ---- */\n" + body for n, body in shared] +
                          [f"/* ---- web/{n} ---- */\n" + read(os.path.join(WEB_SRC, n)) for n in web])
    page_js = web_parts(page)
    out = (tpl.replace("<!--NUCLEO:CSP-->", f'<meta http-equiv="Content-Security-Policy" content="{WEB_CSP}">')
              .replace("<!--NUCLEO:FIXTURES-->", f"<script>window.NUCLEO_WEB={catalog_payload};</script>")
              .replace("<!--NUCLEO:SHARED-->", "<script>\n" + shared_js + "\n</script>")
              .replace("<!--NUCLEO:JS-->", "<script>\n" + page_js + "\n</script>"))
    n = out.count("__COMPANIONS_JSON__")
    if n != 1:
        sys.exit(f"{page}: __COMPANIONS_JSON__ must appear exactly once in template or parts (found {n})")
    node_check(shared_js + "\n" + page_js.replace("__COMPANIONS_JSON__", "[]"), page + " (web)")
    out = out.replace("__COMPANIONS_JSON__", companions_payload)
    for banned in ("NUCLEO_FIXTURES=", "90-dev-mock-bridge"):
        if banned in out:
            sys.exit(f"--web: {page} contains {banned}; the web build must never ship the mock or fixtures")
    dest = os.path.join(WEB_OUT, WEB_PAGES[page])
    with open(dest, "w", encoding="utf-8") as f:
        f.write(out)
    return dest, len(out)


def main_web():
    os.makedirs(WEB_OUT, exist_ok=True)
    companions = json.load(open(os.path.join(HERE, "companions.json")))
    catalog = web_catalog(companions)
    built = [build_web_page(p, js_json(companions), js_json(catalog)) for p in WEB_PAGES]
    # The pick clips (select-<id>-<en|es>.mp3), the same files the iOS app bundles.
    voice_out = os.path.join(WEB_OUT, "voice")
    os.makedirs(voice_out, exist_ok=True)
    for name in catalog["clips"]:
        src, dst = os.path.join(WEB_VOICE_SRC, name + ".mp3"), os.path.join(voice_out, name + ".mp3")
        if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src):
            shutil.copyfile(src, dst)
    for dest, size in built:
        print(f"built {os.path.relpath(dest, REPO)} ({size:,} bytes) [web]")
    print(f"voice: {len(catalog['clips'])} pick clips in {os.path.relpath(voice_out, REPO)}")
    print("NUCLEO_BUILD_OK")


def main():
    if "--web" in sys.argv[1:]:
        return main_web()
    if not os.path.isdir(FIX):
        sys.exit("this copy of the Núcleo builds only --web; the iOS pages are built on the ios/nucleo-preview branch")
    release = "--release" in sys.argv[1:]
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
