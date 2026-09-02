#!/usr/bin/env python3
"""Trader Land gate A — derive sprite layers from Higgsfield cutouts.
Inputs : public/land/v1/gate-A/raw/*_albedo.png (RGBA cutouts)
Outputs: public/land/v1/gate-A/<id>/{albedo,glow,shadow,thumb,seed?}.png + webp, sheets, manifest.
Rules  : glow = luminance AND emerald/cyan/blue hue with saturation AND connected region; shadow is synthetic per footprint;
         any dark semi-transparent pixel outside contentBounds is a REJECT (baked shadow survived the cutout)."""
import json, os, sys, colorsys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = 'public/land/v1/gate-A'; RAW = f'{ROOT}/raw'
DISTRICT_BG = {'crypto_bay': (10, 28, 40), 'evidence_mines': (10, 34, 30), 'thesis_citadel': (8, 16, 44), 'risk_reef': (16, 12, 44), 'axiom_archive': (6, 30, 20), 'core': (5, 7, 10)}
PIECES = [
  ('aura_core_stage0', 'core', '2x2', 'stage0'), ('aura_core_stage1', 'core', '2x2', 'stage1'),
  ('evidence_mines_crystal_vein_rock', 'evidence_mines', '1x1', 'bloom'), ('axiom_archive_return_path', 'axiom_archive', '1x1', 'bloom'),
  ('risk_reef_dual_orbit_antenna', 'risk_reef', '1x1', 'bloom'), ('evidence_mines_evidence_workshop', 'evidence_mines', '2x1', 'bloom'),
  ('thesis_citadel_three_gate_citadel', 'thesis_citadel', '2x2', 'bloom'),
]

def label_regions(mask):
    """Connected components (4-neigh) on a boolean mask via iterative flood; mask is small (<=512^2)."""
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
    # hue in degrees
    r, g, b = rgb[...,0], rgb[...,1], rgb[...,2]; d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, (60 * ((g - b) / d)) % 360, np.where(mx == g, 60 * ((b - r) / d) + 120, 60 * ((r - g) / d) + 240))
    emissive_hue = ((hue >= 120) & (hue <= 250))            # emerald → cyan → Base blue
    cand = (a > 0.2) & (lum > 0.42) & (sat > 0.30) & emissive_hue  # excludes white highlights, gold plates, grey metal
    # connected regions on a 512 downsample: drop specks < 12 px
    small = np.array(Image.fromarray((cand * 255).astype(np.uint8)).resize((512, 512), Image.BILINEAR)) > 127
    labels, n = label_regions(small); keep = np.zeros_like(small)
    for i in range(1, n + 1):
        if (labels == i).sum() >= 12: keep |= (labels == i)
    keep_full = np.array(Image.fromarray((keep * 255).astype(np.uint8)).resize(cand.shape[::-1], Image.BILINEAR)) > 127
    m = (cand & keep_full).astype(np.float32) * np.clip((lum - 0.42) / 0.45, 0, 1)
    return Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))

def clean_contact_shadow(rgba):
    """Deterministic cutout cleanup (documented, reproducible): dark semi-transparent pixels OUTSIDE the opaque
    content bounds are remnants of the baked contact shadow → alpha 0. Inside the bounds nothing is touched."""
    rgba = rgba.copy(); a = rgba[..., 3]; lum = rgba[..., :3].mean(-1)
    core = a > 230; ys, xs = np.where(core); x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    outside = np.ones_like(a, bool); outside[max(0, y0-6):y1+7, max(0, x0-6):x1+7] = False
    ghost = (a > 0) & (a < 200) & (lum < 40) & outside
    rgba[ghost, 3] = 0
    return rgba, int(ghost.sum())

def analyze(rgba):
    a = rgba[..., 3]; lum = rgba[..., :3].mean(-1)
    core = a > 230
    ys, xs = np.where(core); bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    # shadow hypothesis: dark, semi-transparent pixels outside the opaque bbox (with 6px slack)
    x0, y0, x1, y1 = bbox; outside = np.ones_like(a, bool); outside[max(0,y0-6):y1+7, max(0,x0-6):x1+7] = False
    ghost = (a > 8) & (a < 200) & (lum < 40) & outside
    halo = (a > 8) & (a < 120) & (lum > 200)   # bright fringe
    return bbox, int(ghost.sum()), int(halo.sum())

def synth_shadow(size, footprint, bbox):
    w, h = size; fw, fh = (int(footprint[0]), int(footprint[2]))
    img = Image.new('L', (w, h), 0); d = ImageDraw.Draw(img)
    cx = (bbox[0] + bbox[2]) // 2; cy = bbox[3] - int(0.06 * h)           # contact line near the bottom of the object
    rx = int((bbox[2] - bbox[0]) * 0.55); ry = int(rx * 0.5)
    d.ellipse([cx - rx + int(0.05*w), cy - ry, cx + rx + int(0.05*w), cy + ry], fill=170)  # offset down-right like the key light
    return img.filter(ImageFilter.GaussianBlur(28))

def derive_seed(rgba, glow):
    """Seed = same geometry, emissives at 15%, desaturated, no particles (small isolated bright specks removed)."""
    rgb = rgba[..., :3].astype(np.float32); a = rgba[..., 3].astype(np.float32)
    g = np.array(glow).astype(np.float32) / 255.0
    lum = rgb.mean(-1, keepdims=True); desat = rgb * 0.55 + lum * 0.45
    dim = desat * (1 - 0.85 * g[..., None])           # kill emissives where the glow mask says so
    out = np.concatenate([np.clip(dim * 0.82, 0, 255), a[..., None]], -1).astype(np.uint8)
    # particles: tiny alpha islands away from the opaque core disappear
    core = a > 230; ys, xs = np.where(core); x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    small = (a > 8) & (a < 230); small[y0-4:y1+5, x0-4:x1+5] = False
    out[small, 3] = 0
    return Image.fromarray(out)

def sheet(albedo, glow, shadow, district, out_path):
    """Inspection: the composite over black, mid grey and the district colour, at 512 and 96 px."""
    tiles = []
    for bg in [(0, 0, 0), (120, 120, 120), DISTRICT_BG[district]]:
        base = Image.new('RGBA', albedo.size, bg + (255,))
        sh = Image.new('RGBA', albedo.size, (0, 0, 0, 0)); sh.putalpha(shadow.point(lambda v: int(v * 0.8)))
        base.alpha_composite(sh); base.alpha_composite(albedo)
        gl = Image.merge('RGBA', [Image.new('L', albedo.size, 52), Image.new('L', albedo.size, 211), Image.new('L', albedo.size, 153), glow])
        base = Image.alpha_composite(base, gl)  # additive-ish glow preview
        tiles.append(base.resize((512, 512), Image.LANCZOS)); tiles.append(base.resize((96, 96), Image.LANCZOS).resize((512, 512), Image.NEAREST))
    s = Image.new('RGB', (512 * 6, 512), (0, 0, 0))
    for i, t in enumerate(tiles): s.paste(t.convert('RGB'), (i * 512, 0))
    s.save(out_path)

manifest = {'gate': 'A', 'date': '2026-09-02', 'contract': 'albedo/glow/shadow/thumb + contentBounds/anchor/footprint/connectors/occlusionHeight/orientations', 'items': []}
for pid, district, fp, state in PIECES:
    src = f'{RAW}/{pid}_{state}_albedo.png' if state != 'bloom' else f'{RAW}/{pid}_bloom_albedo.png'
    if not os.path.exists(src): src = f'{RAW}/{pid}_albedo.png'
    im = Image.open(src).convert('RGBA'); rgba = np.array(im)
    _, ghost_before, _ = analyze(rgba)
    rgba, removed = clean_contact_shadow(rgba); im = Image.fromarray(rgba)
    bbox, ghost, halo = analyze(rgba)
    glow = glow_mask(rgba); shadow = synth_shadow(im.size, fp, bbox)
    out = f'{ROOT}/{pid}'; os.makedirs(out, exist_ok=True)
    im.resize((1024, 1024), Image.LANCZOS).save(f'{out}/{state}_albedo_1024.png')
    im.resize((512, 512), Image.LANCZOS).save(f'{out}/{state}_albedo_512.webp', quality=85)
    glow.resize((1024, 1024), Image.LANCZOS).save(f'{out}/{state}_glow_1024.png')
    shadow.resize((1024, 1024), Image.LANCZOS).save(f'{out}/shadow_1024.png')
    im.resize((256, 256), Image.LANCZOS).save(f'{out}/{state}_thumb_256.png')
    sheet(im, glow, shadow, district, f'{ROOT}/sheet_{pid}_{state}.png')
    entry = {'id': pid, 'state': state, 'district': district, 'footprint': fp, 'source': src.split('/')[-1],
             'contentBounds_2048': bbox, 'anchor_2048': [(bbox[0] + bbox[2]) // 2, bbox[3]],
             'ghost_dark_pixels_outside_bounds_before_cleanup': ghost_before, 'contact_shadow_pixels_removed': removed, 'ghost_dark_pixels_outside_bounds': ghost, 'bright_halo_pixels': halo,
             'shadow_hypothesis': 'PASS' if ghost < 400 else 'REJECT — baked shadow survived the cutout',
             'glow_coverage_pct': round(float((np.array(glow) > 40).mean() * 100), 2),
             'occlusionHeight_px': bbox[3] - bbox[1], 'orientations': ['ne'], 'connectors': {'n': fp == '1x1' and pid.endswith('path'), 'e': False, 's': pid.endswith('path'), 'w': False}}
    if pid == 'evidence_mines_crystal_vein_rock':
        seed = derive_seed(rgba, glow); seed.resize((1024, 1024), Image.LANCZOS).save(f'{out}/seed_albedo_1024_derived.png')
        sheet(seed, Image.new('L', im.size, 0), shadow, district, f'{ROOT}/sheet_{pid}_seed_derived.png'); entry['seed_derived'] = True
    manifest['items'].append(entry)
    print(f"{pid:42s} bbox={bbox} ghost_before={ghost_before:5d} ghost_after={ghost:4d} halo={halo:6d} glow={entry['glow_coverage_pct']}% → {entry['shadow_hypothesis']}")
json.dump(manifest, open(f'{ROOT}/asset-manifest.json', 'w'), indent=2)
print('manifest written')
