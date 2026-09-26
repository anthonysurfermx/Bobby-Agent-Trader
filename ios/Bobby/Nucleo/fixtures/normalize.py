#!/usr/bin/env python3
"""Golden bridge replies from the raw HTTP captures in fixtures/raw.

This file IS the normative spec of how the native bridge turns the app's HTTP
responses into the `ask()` reply (ARCHITECTURE.md §2.4). The native fixture
mode must produce JSON-equal output for every scenario below, ignoring only the
keys in VOLATILE. The browser mock (src/shared/dev-mock-bridge.js) serves these
files verbatim.

Usage: python3 ios/Bobby/Nucleo/fixtures/normalize.py   (writes fixtures/ask/*.json + manifest.json)
"""
import json, os, re, calendar, time

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
ASK = os.path.join(HERE, "ask")
VOLATILE = ["requestId", "elapsedMs", "fixture"]
V = 1

TREND = {"alcista": "up", "bajista": "down", "lateral": "sideways"}
MOMENTUM = {"sobrecompra": "overbought", "sobreventa": "oversold", "neutral": "neutral"}


def load(name):
    with open(os.path.join(RAW, name)) as f:
        return json.load(f)


def iso_ms(s):
    return calendar.timegm(time.strptime(s, "%Y-%m-%dT%H:%M:%SZ")) * 1000


def num(v):
    """Finite JSON number or None (strings are parsed like BobbyAPI.candles does)."""
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return v if v == v and abs(v) != float("inf") else None
    if isinstance(v, str):
        try:
            return num(float(v))
        except ValueError:
            return None
    return None


def pretty_name(raw, symbol):
    """BobbyAPI.prettyName: title-case an alias unless it holds '&' or digits."""
    if not raw or raw == symbol:
        return symbol
    if re.search(r"[&0-9]", raw):
        return raw
    return " ".join(w[:1].upper() + w[1:].lower() for w in raw.split(" "))


def asset_from_search(body):
    """BobbyAPI.resolution(from:): symbol = baseSymbol ?? symbol; name = first alias != symbol, prettified."""
    resolved = body.get("resolved") or {}
    symbol = resolved.get("baseSymbol") or resolved.get("symbol")
    aliases = resolved.get("aliases") or []
    alias = next((a for a in aliases if a != symbol), symbol)
    asset_class = resolved.get("assetClass") or "crypto"
    return {"symbol": symbol, "name": pretty_name(alias, symbol), "isEquity": asset_class == "equity", "assetClass": asset_class}


def candles(body):
    """BobbyAPI.candles: rows need ts/open/high/low/close; volume defaults to 0; ascending by t."""
    out = []
    for r in (body or {}).get("candles") or (body or {}).get("data") or []:
        t, o, h, l, c = (num(r.get(k)) for k in ("ts", "open", "high", "low", "close"))
        if None in (t, o, h, l, c):
            continue
        out.append({"t": int(t), "o": o, "h": h, "l": l, "c": c, "v": num(r.get("volume")) or 0})
    return sorted(out, key=lambda x: x["t"])


def pulse(body):
    """voice-tool run_debate -> pulse. null when the tool failed or sent no technical_pulse."""
    if not body or "error" in body:
        return None
    p = body.get("technical_pulse")
    if not isinstance(p, dict):
        return None
    tp = p.get("trade_plan") if isinstance(p.get("trade_plan"), dict) else None
    plan = None
    if tp and any(num(tp.get(k)) is not None for k in ("entry", "stop", "target")):
        plan = {"direction": tp.get("direction"), "entry": num(tp.get("entry")), "stop": num(tp.get("stop")),
                "target": num(tp.get("target")), "rewardRisk": num(tp.get("rewardRisk")),
                "invalidation": tp.get("invalidation") if isinstance(tp.get("invalidation"), str) else None}
    return {"signal": p.get("signal"), "direction": p.get("direction"), "convictionPct": num(p.get("conviction_pct")),
            "agreementPct": num(p.get("agreement_pct")), "overview": p.get("overview"), "source": p.get("source"),
            "instrument": p.get("instrument"), "plan": plan}


def ok_result(slug, question, language="en"):
    search, debate = load(f"asset-search.{slug}.json"), load(f"desk-debate.{slug}.json")
    market, pul, cand = load(f"market.{slug}.json"), load(f"pulse.{slug}.json"), load(f"candles.{slug}.json")
    body = debate["body"]
    asset = asset_from_search(search["body"])
    t = body["technicals"]
    agents = body["agents"]
    return {
        "v": V, "status": "ok", "requestId": "00000000-0000-4000-8000-000000000000",
        "question": question, "language": language,
        "asset": {k: asset[k] for k in ("symbol", "name", "isEquity")},
        "market": {"price": num(market["body"].get("price")), "changePct": num(market["body"].get("change_24h_pct"))},
        "technicals": {
            "price": num(t.get("price")), "rsi14": num(t.get("rsi14")), "ema20": num(t.get("ema20")),
            "ema50": num(t.get("ema50")), "support": num(t.get("support")), "resistance": num(t.get("resistance")),
            "atrPct": num(t.get("atrPct")),
            "trend": TREND.get(t.get("trend")), "momentum": MOMENTUM.get(t.get("momentum")),
        },
        "pulse": pulse(pul["body"]),
        "agents": {k: agents[k] for k in ("alpha", "red", "cio", "verdict", "direction")},
        "provenance": {k: body["provenance"][k] for k in ("provider", "instrument", "assetType", "timeframe", "asOf")},
        "candles": candles(cand["body"]),
        "receivedAt": iso_ms(debate["recordedAt"]),
        "elapsedMs": debate["elapsedMs"],
        "fixture": True,
    }


def refusal(name):
    rec = load(f"desk-debate.{name}.json")
    b = rec.get("body") or {}
    code = b.get("code")
    if rec["status"] == 429:
        ra = num((rec.get("headers") or {}).get("retry-after"))
        return {"v": V, "status": "quota", "retryAfterSec": int(ra) if ra else None, "message": b.get("error")}
    if rec["status"] == 400 and code == "question_too_long":
        return {"v": V, "status": "too_long", "maxLength": 1200, "message": b.get("error")}
    if rec["status"] == 503 and code in ("analysis_failed", "desk_unavailable"):
        return {"v": V, "status": "error", "code": code, "message": b.get("error")}
    # Non-JSON 504 page (Vercel timeout) or anything unexpected: honest error, never NO TRADE.
    return {"v": V, "status": "error", "code": "bad_response", "message": None}


def confirm(slug):
    b = load(f"asset-search.{slug}.json")["body"]
    a = asset_from_search(b)
    return {"v": V, "status": "confirm", "token": "fixture-confirm-" + slug, "asset": a,
            "matchKind": (b.get("resolution") or {}).get("matchKind"),
            "proxyNote": (b.get("resolution") or {}).get("proxyNote")}


def main():
    os.makedirs(ASK, exist_ok=True)
    out = {
        "nvda": ok_result("nvda", "Should I buy NVIDIA right now?"),
        "btc": ok_result("btc", "Is now a good time for Bitcoin?"),
        "quota": refusal("quota"),
        "too_long": refusal("too_long"),
        "failed": refusal("failed"),
        "unavailable": refusal("unavailable"),
        "gateway_timeout": refusal("gateway_timeout"),
        "confirm-fuzzy": confirm("fuzzy"),
        "confirm-proxy": confirm("proxy"),
        # asset-search.none: resolution null and zero results -> no suggestions.
        "unknown": {"v": V, "status": "unknown_asset", "query": "hello how are you", "suggestions": []},
        # XAUT is a commodity: the desk only charts equity|crypto, so native refuses BEFORE spending quota.
        "unsupported-proxy": {"v": V, "status": "unsupported", "asset": asset_from_search(load("asset-search.proxy.json")["body"]),
                              "reason": "asset_class"},
        "cancelled": {"v": V, "status": "cancelled"},
        "timeout": {"v": V, "status": "error", "code": "timeout", "message": None},
        "network": {"v": V, "status": "error", "code": "network", "message": None},
        "risk": {"v": V, "status": "error", "code": "risk_not_accepted", "message": None},
    }
    for k, v in out.items():
        with open(os.path.join(ASK, f"{k}.json"), "w") as f:
            json.dump(v, f, indent=1, ensure_ascii=False)
            f.write("\n")
    manifest = {
        "v": V,
        "volatileKeys": VOLATILE,
        "recorded": {"deskDebateCalls": 2, "at": load("desk-debate.nvda.json")["recordedAt"], "language": "en",
                     "note": "Both real reads returned verdict 'wait'. No real 'review' capture exists yet."},
        # Shared by the native URLProtocol and the browser mock. First match wins; q is lowercased.
        "assetSearch": [
            {"contains": ["nvidea"], "raw": "asset-search.fuzzy.json", "ask": "confirm-fuzzy"},
            {"contains": ["gold", " oro"], "raw": "asset-search.proxy.json", "ask": "confirm-proxy"},
            {"contains": ["nvidia", "nvda"], "raw": "asset-search.nvda.json", "ask": "nvda"},
            {"contains": ["bitcoin", "btc"], "raw": "asset-search.btc.json", "ask": "btc"},
            {"contains": [], "raw": "asset-search.none.json", "ask": "unknown"},
        ],
        "bySymbol": {
            "NVDA": {"candles": "candles.nvda.json", "market": "market.nvda.json", "pulse": "pulse.nvda.json", "debate": "desk-debate.nvda.json"},
            "BTC": {"candles": "candles.btc.json", "market": "market.btc.json", "pulse": "pulse.btc.json", "debate": "desk-debate.btc.json"},
        },
        "scenarios": {
            "default": "replay the recorded read (desk latency = min(recorded, 6000 ms))",
            "slow": "replay with a 45 s desk latency (THINK_WAIT long-wait copy)",
            "hang": "desk request never answers; ends as error.timeout after 20 s (client timeout stand-in)",
            "quota": "desk-debate.quota.json", "too_long": "desk-debate.too_long.json",
            "failed": "desk-debate.failed.json", "unavailable": "desk-debate.unavailable.json",
            "gateway_timeout": "desk-debate.gateway_timeout.json",
            "offline": "every request fails with URLError.notConnectedToInternet (error.network)",
        },
    }
    with open(os.path.join(HERE, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")
    print("golden:", ", ".join(sorted(out)))


if __name__ == "__main__":
    main()
