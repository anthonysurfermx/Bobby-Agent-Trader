#!/usr/bin/env python3
"""Trader Land gate A pipeline (v2, after Codex NO-GO round 1).

Inputs : art/trader-land/gate-A/raw/*.png        (Higgsfield cutouts, 2048x2048 RGBA; never shipped)
Outputs: public/land/v1/gate-A/<id>/<orient>/<state>_{albedo_1024.png,albedo_512.webp,glow_1024.png,thumb_256.png}
         public/land/v1/gate-A/<id>/<orient>/shadow_1024.png   (synthetic, from the FOOTPRINT rhombus, uniform per cell)
         public/land/v1/gate-A/asset-manifest.json             (normalized 0-1 coords + per-variant url/size)
         art/trader-land/gate-A/{sheets,diag}/                  (QA only; outside public so Vite never copies them)
Rules  : glow = luminance AND emerald/cyan/blue hue with saturation AND connected regions (no whites, no gold);
         contact-shadow remnants outside contentBounds are cleared deterministically and re-checked (must be 0);
         one master is never hand-retouched — fixes are prompt + regeneration by job id.
"""
import json, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = 'public/land/v1/gate-A'; ART = 'art/trader-land/gate-A'; RAW = f'{ART}/raw'
os.makedirs(f'{ART}/sheets', exist_ok=True); os.makedirs(f'{ART}/diag', exist_ok=True)
CANVAS = 2048
# Isometric 2:1 cell at master scale. Fixed for the whole catalog so shadows are uniform per cell,
# independent of how large the generator drew the object.
TILE_W, TILE_H = 1024, 512
DISTRICT_BG = {'crypto_bay': (10, 28, 40), 'evidence_mines': (10, 34, 30), 'thesis_citadel': (8, 16, 44),
               'risk_reef': (16, 12, 44), 'axiom_archive': (6, 30, 20), 'core': (5, 7, 10)}

# id, district, footprint (cols, rows), kind, orientations: {orient: {state: raw file, 'connectors': {...}}}
PIECES = [
  ('aura_core', 'core', (2, 2), 'core', {'ne': {'stage0': 'aura_core_stage0_albedo.png', 'stage1': 'aura_core_stage1_albedo.png', 'connectors': {}}}),
  # ---- Crypto Bay ----
  ('crypto_bay_data_dock', 'crypto_bay', (1, 1), 'ground', {'ne': {'bloom': 'crypto_bay_data_dock_bloom_albedo.png', 'connectors': {}}}),
  ('crypto_bay_water_walkway', 'crypto_bay', (1, 1), 'path_pavement', {'ne': {'bloom': 'crypto_bay_water_walkway_bloom_albedo.png', 'connectors': {'note': 'pavement only; filament procedural'}}}),
  ('crypto_bay_context_buoy', 'crypto_bay', (1, 1), 'decor', {'ne': {'bloom': 'crypto_bay_context_buoy_bloom_albedo.png', 'connectors': {}}}),
  ('crypto_bay_candle_tower', 'crypto_bay', (2, 1), 'building', {'ne': {'bloom': 'crypto_bay_candle_tower_bloom_albedo.png', 'connectors': {}}}),
  ('crypto_bay_waiting_lighthouse', 'crypto_bay', (2, 2), 'landmark', {'ne': {'bloom': 'crypto_bay_waiting_lighthouse_bloom_albedo.png', 'connectors': {}}}),
  # ---- Evidence Mines ----
  ('evidence_mines_crystal_vein_rock', 'evidence_mines', (1, 1), 'ground', {'ne': {'bloom': 'evidence_mines_crystal_vein_rock_bloom_albedo.png', 'connectors': {}}}),
  ('evidence_mines_open_tunnel', 'evidence_mines', (1, 1), 'path_pavement', {'ne': {'bloom': 'evidence_mines_open_tunnel_bloom_albedo.png', 'connectors': {'note': 'pavement only; filament procedural'}}}),
  ('evidence_mines_lantern_drone', 'evidence_mines', (1, 1), 'decor', {'ne': {'bloom': 'evidence_mines_lantern_drone_bloom_albedo.png', 'connectors': {}}}),
  ('evidence_mines_evidence_workshop', 'evidence_mines', (2, 1), 'building', {'ne': {'bloom': 'evidence_mines_evidence_workshop_bloom_albedo.png', 'connectors': {}}}),
  ('evidence_mines_mother_crystal', 'evidence_mines', (2, 2), 'landmark', {'ne': {'bloom': 'evidence_mines_mother_crystal_bloom_albedo.png', 'connectors': {}}}),
  # ---- Thesis Citadel ----
  ('thesis_citadel_wall_slab', 'thesis_citadel', (1, 1), 'ground', {'ne': {'bloom': 'thesis_citadel_wall_slab_bloom_albedo.png', 'connectors': {}}}),
  ('thesis_citadel_fortified_ramp', 'thesis_citadel', (1, 1), 'path_pavement', {'ne': {'bloom': 'thesis_citadel_fortified_ramp_bloom_albedo.png', 'connectors': {'note': 'pavement only; filament procedural'}}}),
  ('thesis_citadel_risk_shield', 'thesis_citadel', (1, 1), 'decor', {'ne': {'bloom': 'thesis_citadel_risk_shield_bloom_albedo.png', 'connectors': {}}}),
  ('thesis_citadel_double_gate', 'thesis_citadel', (2, 1), 'building', {'ne': {'bloom': 'thesis_citadel_double_gate_bloom_albedo.png', 'connectors': {}}}),
  ('thesis_citadel_three_gate_citadel', 'thesis_citadel', (2, 2), 'landmark', {'ne': {'bloom': 'thesis_citadel_three_gate_citadel_bloom_albedo.png', 'connectors': {}}}),
  # ---- Risk Reef ----
  ('risk_reef_reef_tile', 'risk_reef', (1, 1), 'ground', {'ne': {'bloom': 'risk_reef_reef_tile_bloom_albedo.png', 'connectors': {}}}),
  ('risk_reef_blue_sluice', 'risk_reef', (1, 1), 'path_pavement', {'ne': {'bloom': 'risk_reef_blue_sluice_bloom_albedo.png', 'connectors': {'note': 'pavement only; filament procedural'}}}),
  ('risk_reef_dual_orbit_antenna', 'risk_reef', (1, 1), 'decor', {'ne': {'bloom': 'risk_reef_dual_orbit_antenna_bloom_albedo.png', 'connectors': {}}}),
  ('risk_reef_red_team_observatory', 'risk_reef', (2, 1), 'building', {'ne': {'bloom': 'risk_reef_red_team_observatory_bloom_albedo.png', 'connectors': {}}}),
  ('risk_reef_double_bridge', 'risk_reef', (2, 2), 'landmark', {'ne': {'bloom': 'risk_reef_double_bridge_bloom_albedo.png', 'connectors': {}}}),
  # ---- Axiom Archive ----
  ('axiom_archive_archive_ring_tile', 'axiom_archive', (1, 1), 'ground', {'ne': {'bloom': 'axiom_archive_archive_ring_tile_bloom_albedo.png', 'connectors': {}}}),
  ('axiom_archive_path_straight', 'axiom_archive', (1, 1), 'path_pavement', {'ne_sw': {'bloom': 'axiom_archive_path_straight_ne_sw_bloom_albedo.png', 'connectors': {'note': 'reference for the procedural filament look; renderer owns topology'}}}),
  ('axiom_archive_return_path_curve', 'axiom_archive', (1, 1), 'decor', {'curve_a': {'bloom': 'axiom_archive_return_path_bloom_albedo.png', 'connectors': {'note': 'kept as decor; not a path'}}}),
  ('axiom_archive_aura_flower', 'axiom_archive', (1, 1), 'decor', {'ne': {'bloom': 'axiom_archive_aura_flower_bloom_albedo.png', 'connectors': {}}}),
  ('axiom_archive_lit_archive', 'axiom_archive', (2, 1), 'building', {'ne': {'bloom': 'axiom_archive_lit_archive_bloom_albedo.png', 'connectors': {}}}),
  ('axiom_archive_base_ring_seal', 'axiom_archive', (2, 2), 'landmark', {'ne': {'bloom': 'axiom_archive_base_ring_seal_bloom_albedo.png', 'connectors': {}}}),
]

def label_regions(mask):
    h, w = mask.shape; labels = np.zeros((h, w), np.int32); cur = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and labels[y, x] == 0:
                cur += 1; stack = [(y, x)]; labels[y, x] = cur
                while stack:
                    cy, cx = stack.pop()
                    for ny, nx in ((cy-1, cx), (cy+1, cx), (cy, cx-1), (cy, cx+1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and labels[ny, nx] == 0:
                            labels[ny, nx] = cur; stack.append((ny, nx))
    return labels, cur

def glow_mask(rgba):
    rgb = rgba[..., :3].astype(np.float32) / 255.0; a = rgba[..., 3].astype(np.float32) / 255.0
    mx = rgb.max(-1); mn = rgb.min(-1); lum = 0.2126*rgb[...,0] + 0.7152*rgb[...,1] + 0.0722*rgb[...,2]
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[...,0], rgb[...,1], rgb[...,2]; d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, (60 * ((g - b) / d)) % 360, np.where(mx == g, 60 * ((b - r) / d) + 120, 60 * ((r - g) / d) + 240))
    cand = (a > 0.2) & (lum > 0.42) & (sat > 0.30) & (hue >= 120) & (hue <= 250)
    small = np.array(Image.fromarray((cand * 255).astype(np.uint8)).resize((512, 512), Image.BILINEAR)) > 127
    labels, n = label_regions(small); keep = np.zeros_like(small)
    for i in range(1, n + 1):
        if (labels == i).sum() >= 12: keep |= (labels == i)
    keep_full = np.array(Image.fromarray((keep * 255).astype(np.uint8)).resize(cand.shape[::-1], Image.BILINEAR)) > 127
    m = (cand & keep_full).astype(np.float32) * np.clip((lum - 0.42) / 0.45, 0, 1)
    return Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))

def bounds(rgba, thr=230):
    a = rgba[..., 3]; ys, xs = np.where(a > thr)
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]

def clean_contact_shadow(rgba):
    rgba = rgba.copy(); a = rgba[..., 3]; lum = rgba[..., :3].mean(-1)
    x0, y0, x1, y1 = bounds(rgba); outside = np.ones_like(a, bool); outside[max(0, y0-6):y1+7, max(0, x0-6):x1+7] = False
    ghost = (a > 0) & (a < 200) & (lum < 40) & outside
    rgba[ghost, 3] = 0
    return rgba, int(ghost.sum())

def qa(rgba):
    a = rgba[..., 3]; lum = rgba[..., :3].mean(-1); x0, y0, x1, y1 = bounds(rgba)
    outside = np.ones_like(a, bool); outside[max(0, y0-6):y1+7, max(0, x0-6):x1+7] = False
    return int(((a > 8) & (a < 200) & (lum < 40) & outside).sum()), int(((a > 8) & (a < 120) & (lum > 200)).sum())

def footprint_shadow(fp, anchor):
    """Shadow = the footprint rhombus (cols x rows cells of TILE_W x TILE_H), anchored at the object's ground anchor
    (bottom vertex of the rhombus), offset slightly down-right like the key light. Identical for every piece of a
    given footprint, whatever the object looks like."""
    cols, rows = fp; ax, ay = anchor
    # bottom vertex at anchor; rhombus axes: cols along +x/-y (NE), rows along -x/-y (NW)
    e = (TILE_W / 2, -TILE_H / 2); n = (-TILE_W / 2, -TILE_H / 2)
    p0 = (ax, ay); p1 = (ax + cols * e[0], ay + cols * e[1]); p3 = (ax + rows * n[0], ay + rows * n[1]); p2 = (p1[0] + rows * n[0], p1[1] + rows * n[1])
    off = (int(0.02 * CANVAS), int(0.01 * CANVAS))
    img = Image.new('L', (CANVAS, CANVAS), 0); ImageDraw.Draw(img).polygon([(x + off[0], y + off[1]) for x, y in (p0, p1, p2, p3)], fill=175)
    return img.filter(ImageFilter.GaussianBlur(22))

def derive_seed(rgba, glow):
    rgb = rgba[..., :3].astype(np.float32); a = rgba[..., 3].astype(np.float32); g = np.array(glow).astype(np.float32) / 255.0
    lum = rgb.mean(-1, keepdims=True); desat = rgb * 0.55 + lum * 0.45; dim = desat * (1 - 0.85 * g[..., None])
    out = np.concatenate([np.clip(dim * 0.82, 0, 255), a[..., None]], -1).astype(np.uint8)
    x0, y0, x1, y1 = bounds(rgba); small = (a > 8) & (a < 230); small[y0-4:y1+5, x0-4:x1+5] = False; out[small, 3] = 0
    return Image.fromarray(out)

def sheet(albedo, glow, shadow, district, out_path):
    tiles = []
    for bg in [(0, 0, 0), (120, 120, 120), DISTRICT_BG[district]]:
        base = Image.new('RGBA', albedo.size, bg + (255,))
        sh = Image.new('RGBA', albedo.size, (0, 0, 0, 0)); sh.putalpha(shadow.point(lambda v: int(v * 0.8))); base.alpha_composite(sh); base.alpha_composite(albedo)
        gl = Image.merge('RGBA', [Image.new('L', albedo.size, 52), Image.new('L', albedo.size, 211), Image.new('L', albedo.size, 153), glow]); base = Image.alpha_composite(base, gl)
        tiles.append(base.resize((512, 512), Image.LANCZOS)); tiles.append(base.resize((96, 96), Image.LANCZOS).resize((512, 512), Image.NEAREST))
    s = Image.new('RGB', (512 * 6, 512), (0, 0, 0))
    for i, t in enumerate(tiles): s.paste(t.convert('RGB'), (i * 512, 0))
    s.save(out_path)

def norm(v): return round(v / CANVAS, 4)

# Seed samples derived before deriving all (Codex: validate a high-silhouette one too)
SEED_SAMPLES = None  # None = derive a seed for every bloom (approved after the rock + antenna samples)

manifest = {'gate': 'A', 'version': 2, 'date': '2026-09-02', 'canvas_master_px': CANVAS, 'tile_px_at_master': [TILE_W, TILE_H],
            'coordinate_space': 'all anchor/contentBounds/occlusionHeight values are fractions 0-1 of the sprite canvas; multiply by the variant width/height',
            'items': []}
for pid, district, fp, kind, orients in PIECES:
    item = {'id': pid, 'district': district, 'kind': kind, 'footprint': {'cols': fp[0], 'rows': fp[1]}, 'orientations': {}}
    for orient, spec in orients.items():
        odir = f'{ROOT}/{pid}/{orient}'; os.makedirs(odir, exist_ok=True)
        oentry = {'connectors': spec.get('connectors', {}), 'states': {}}
        if spec.get('status'): oentry['status'] = spec['status']
        for state, fname in spec.items():
            if state in ('connectors', 'status') or fname is None: continue
            src = f'{RAW}/{fname}'
            if not os.path.exists(src):
                oentry['states'][state] = {'status': 'MISSING', 'source': fname}; print(f'{pid}/{orient}/{state}: MISSING {fname}'); continue
            rgba = np.array(Image.open(src).convert('RGBA'))
            ghost_before, _ = qa(rgba); rgba, removed = clean_contact_shadow(rgba); ghost, halo = qa(rgba)
            im = Image.fromarray(rgba); cb = bounds(rgba); anchor = ((cb[0] + cb[2]) // 2, cb[3])
            glow = glow_mask(rgba); shadow = footprint_shadow(fp, anchor)
            base = f'{odir}/{state}'
            im.resize((1024, 1024), Image.LANCZOS).save(f'{base}_albedo_1024.png'); im.resize((512, 512), Image.LANCZOS).save(f'{base}_albedo_512.webp', quality=85)
            glow.resize((1024, 1024), Image.LANCZOS).save(f'{base}_glow_1024.png'); shadow.resize((1024, 1024), Image.LANCZOS).save(f'{odir}/shadow_1024.png')
            im.resize((256, 256), Image.LANCZOS).save(f'{base}_thumb_256.png')
            sheet(im, glow, shadow, district, f'{ART}/sheets/{pid}_{orient}_{state}.png')
            rel = lambda p: '/' + p.replace('public/', '', 1)
            sentry = {'source': fname, 'contentBounds': [norm(cb[0]), norm(cb[1]), norm(cb[2]), norm(cb[3])], 'anchor': [norm(anchor[0]), norm(anchor[1])],
                      'occlusionHeight': norm(cb[3] - cb[1]),
                      'qa': {'contact_shadow_px_before': ghost_before, 'contact_shadow_px_removed': removed, 'contact_shadow_px_after': ghost, 'bright_halo_px': halo,
                             'glow_coverage_pct': round(float((np.array(glow) > 40).mean() * 100), 2), 'verdict': 'PASS' if ghost == 0 else 'REJECT'},
                      'variants': {'albedo_1024': {'url': rel(f'{base}_albedo_1024.png'), 'w': 1024, 'h': 1024}, 'albedo_512': {'url': rel(f'{base}_albedo_512.webp'), 'w': 512, 'h': 512},
                                   'glow_1024': {'url': rel(f'{base}_glow_1024.png'), 'w': 1024, 'h': 1024}, 'shadow_1024': {'url': rel(f'{odir}/shadow_1024.png'), 'w': 1024, 'h': 1024},
                                   'thumb_256': {'url': rel(f'{base}_thumb_256.png'), 'w': 256, 'h': 256}}}
            if state == 'bloom' and (SEED_SAMPLES is None or pid in SEED_SAMPLES):
                seed = derive_seed(rgba, glow); seed.resize((1024, 1024), Image.LANCZOS).save(f'{odir}/seed_albedo_1024.png')
                sheet(seed, Image.new('L', im.size, 0), shadow, district, f'{ART}/sheets/{pid}_{orient}_seed_derived.png')
                sentry['derived_seed'] = {'url': rel(f'{odir}/seed_albedo_1024.png'), 'w': 1024, 'h': 1024, 'method': 'bloom albedo: emissives x0.15 via glow mask, 45% desaturation, particles removed; same alpha and geometry'}
            oentry['states'][state] = sentry
            print(f'{pid:36s} {orient:6s} {state:6s} shadow {ghost_before:5d}->{ghost:2d} halo {halo:4d} glow {sentry["qa"]["glow_coverage_pct"]:5.2f}% anchor {sentry["anchor"]} → {sentry["qa"]["verdict"]}')
        item['orientations'][orient] = oentry
    manifest['items'].append(item)
json.dump(manifest, open(f'{ROOT}/asset-manifest.json', 'w'), indent=2)
print('manifest v2 written')
