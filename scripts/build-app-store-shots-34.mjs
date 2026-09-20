#!/usr/bin/env node
/**
 * build-app-store-shots-34.mjs
 *
 * Deterministic compositor for the Bobby 1.2 (34) App Store frames.
 *
 * Contract: review33/app-store-handoff-33/SCREENSHOTS.md
 *   - 1320 x 2868 RGB PNG (6.9" iPhone slot)
 *   - lifestyle plate art as background
 *   - headline + support line in large white copy, EN wording from the spec table
 *   - the AUTHENTIC screen inside the phone: unaltered pixels, correct aspect,
 *     DOWNSCALED ONLY (raws are native 1320 x 2868)
 *
 * Hard rules enforced by construction:
 *   - the screenshot is resized with lanczos3 and never enlarged (assert below)
 *   - nothing is drawn on top of the screen rectangle (no fake island, no
 *     retouching, no invented UI); only a hardware bezel around it
 *   - the plates' AI-generated phones and their baked (partly wrong) captions
 *     are removed from the background by a pull/push diffusion fill before the
 *     real device and the corrected copy are drawn
 *
 * Inputs (all inside the repo, so this is re-runnable):
 *   docs/app-store/build-34/screenshots/raw/*.png      authentic captures
 *   docs/app-store/build-34/screenshots/plates/*.png   lifestyle plate art
 * Outputs:
 *   docs/app-store/build-34/screenshots/en-US/NN.png
 *   docs/app-store/build-34/screenshots/manifest.json
 *
 * Usage: node scripts/build-app-store-shots-34.mjs
 *   SHOTS34_DEBUG_BG=<dir> node scripts/build-app-store-shots-34.mjs
 *     also dumps the inpainted background and the removal mask per frame, so
 *     the plate cleanup can be audited without the device and copy on top.
 */

import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(ROOT, 'docs/app-store/build-34/screenshots');
const RAW_DIR = path.join(SHOTS, 'raw');
const PLATE_DIR = path.join(SHOTS, 'plates');
const OUT_DIR = path.join(SHOTS, 'en-US');

// ---------------------------------------------------------------- canvas ---
const W = 1320;
const H = 2868;

// Device frame. SCREEN_W / SCREEN_H keeps the 1320:2868 capture aspect to
// within 0.02%, and both are smaller than the raw, so the UI is only ever
// downscaled.
const SCREEN_W = 641;
const SCREEN_H = 1393;
const BEZEL = 14;
const DEV_W = SCREEN_W + BEZEL * 2; // 669
const DEV_H = SCREEN_H + BEZEL * 2; // 1421
const DEV_R = 98; // outer corner radius
const SCREEN_R = DEV_R - BEZEL; // 84
const DEV_X = 643; // right edge lands at 1312 (8px canvas margin)

// ------------------------------------------------------------ typography ---
const ML = 88; // left margin
const MR = 60; // right margin
const TEXT_W = W - ML - MR; // 1172
const RULE_TOP = 170;
const RULE_W = 78;
const RULE_H = 5;
const EYEBROW_TOP = 212; // ink top
const EYEBROW_SIZE = 27;
const EYEBROW_TRACK = 5;
const HEADLINE_TOP = 268; // ink top
const HEADLINE_LEADING = 1.02;
const SUPPORT_GAP = 60;
const SUPPORT_SIZE = 56;

const EMERALD = '#34d399';
const WHITE = '#ffffff';
const SUPPORT_FILL = '#dfe6ed';
const FONT = 'SF Pro Display, SF Pro Text, Helvetica Neue, Helvetica, sans-serif';

// ------------------------------------------------------------ frame table --
// Rects are in PLATE pixel coordinates (851 x 1848/1849) and are rescaled to
// the canvas at run time.
const FRAMES = [
  {
    id: '01',
    plate: '01-meet-bobby.png',
    raw: '01-desk-and-composer.png',
    eyebrow: '01 / MEET BOBBY',
    headline: ['Make sense', 'of the market.'],
    support: 'Ask Bobby by text.',
    screenNote: 'Desk with the real companion, LIVE status, earned gear row, QUICK ACCESS and the text composer.',
    textMask: [55, 128, 820, 552],
    phoneHole: [452, 792, 812, 1620],
    devY: 1180,
  },
  {
    id: '02',
    plate: '02-perspective.png',
    raw: '02-three-perspective.png',
    eyebrow: '02 / GET PERSPECTIVE',
    headline: ['See both sides', 'before you decide.'],
    support: 'Read the case for and against.',
    screenNote: 'Completed ADVERSARIAL DESK: Alpha, Red Team and CIO all "review complete", with the full Alpha case, the Red Team rebuttal and the OKX evidence label.',
    textMask: [55, 128, 812, 486],
    phoneHole: [436, 760, 842, 1676],
    devY: 1180,
  },
  {
    id: '03',
    plate: '03-patience.png',
    raw: '03-wait-verdict.png',
    eyebrow: '03 / STAY PATIENT',
    headline: ['Know when', 'to wait.'],
    support: 'No clear setup? Bobby says so.',
    screenNote: 'Genuine NO TRADE returned by the live backend: "No clear setup. Waiting is an option." with the model\'s own explanation.',
    textMask: [55, 58, 800, 466],
    phoneHole: [416, 786, 851, 1718],
    devY: 1230,
  },
  {
    id: '04',
    plate: '04-learning.png',
    raw: '04-chart.png',
    eyebrow: '04 / KEEP LEARNING',
    headline: ['Build your', 'market', 'understanding.'],
    support: 'Explore the chart behind the analysis.',
    screenNote: 'Real chart card: BTC CRYPTO $81,096, 1H // LIVE, CRYPTO · OKX, 100 OHLCV · 1H, EMA20/EMA50, SIDEWAYS / RSI 42.',
    textMask: [55, 128, 812, 592],
    phoneHole: [462, 786, 824, 1644],
    devY: 1180,
  },
  {
    id: '06',
    plate: '06-understand-the-why-plate.png',
    raw: '06-cio-conclusion.png',
    eyebrow: '06 / UNDERSTAND BOBBY',
    headline: ['Understand', 'the why.'],
    support: 'Read the reasons behind the answer.',
    screenNote: 'The CIO // VERDICT written conclusion in full, with REFERENCE ONLY and the "General technical context · Bobby never executes trades" footer.',
    textMask: [45, 168, 640, 572],
    phoneHole: null, // the closing corridor plate ships without a phone
    devY: 1180,
  },
];

// Frame 05 has no authentic capture; see manifest.missing.
const MISSING = [
  {
    id: '05',
    plate: '05-progress.png',
    headline: 'Make progress you can see. / Build a world of your own.',
    reason:
      'Needs a real signed-in personal Trader Land with legitimately earned progress. The build-34 walkthrough is signed out / practice, and the spec forbids substituting the public gallery, the practice island or seeded XP. No honest frame can be produced from the available raws.',
  },
];

// ------------------------------------------------------------- utilities ---
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function rasterize(svg, w, h) {
  const { data } = await sharp(Buffer.from(svg), { density: 72 })
    .resize(w, h, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data; // RGBA
}

/** Alpha-composite an RGBA layer over an RGB canvas at (ox, oy). */
function over(dst, dw, dh, src, sw, sh, ox, oy) {
  for (let y = 0; y < sh; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= dh) continue;
    for (let x = 0; x < sw; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= dw) continue;
      const si = (y * sw + x) * 4;
      const a = src[si + 3] / 255;
      if (a === 0) continue;
      const di = (dy * dw + dx) * 3;
      dst[di] = clamp255(Math.round(src[si] * a + dst[di] * (1 - a)));
      dst[di + 1] = clamp255(Math.round(src[si + 1] * a + dst[di + 1] * (1 - a)));
      dst[di + 2] = clamp255(Math.round(src[si + 2] * a + dst[di + 2] * (1 - a)));
    }
  }
}

/** Separable box blur on a single-channel Float32Array (repeatable => gaussian-ish). */
function boxBlur1(src, w, h, r, passes = 3) {
  let a = Float32Array.from(src);
  let b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
      const inv = 1 / (2 * r + 1);
      for (let x = 0; x < w; x++) {
        b[row + x] = sum * inv;
        const add = a[row + Math.min(w - 1, x + r + 1)];
        const sub = a[row + Math.max(0, x - r)];
        sum += add - sub;
      }
    }
    // vertical
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      const inv = 1 / (2 * r + 1);
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum * inv;
        const add = b[Math.min(h - 1, y + r + 1) * w + x];
        const sub = b[Math.max(0, y - r) * w + x];
        sum += add - sub;
      }
    }
  }
  return a;
}

/**
 * Pull/push diffusion fill. `keep` is 1 where the pixel is known, 0 in the hole.
 * Returns an RGB Float32Array where the hole is filled by smooth diffusion from
 * the surrounding photograph.
 */
function pullPush(rgb, w, h, keep) {
  const levels = [];
  let cw = w;
  let ch = h;
  let ci = new Float32Array(w * h * 3);
  let cm = Float32Array.from(keep);
  for (let i = 0; i < w * h; i++) {
    const k = keep[i];
    ci[i * 3] = rgb[i * 3] * k;
    ci[i * 3 + 1] = rgb[i * 3 + 1] * k;
    ci[i * 3 + 2] = rgb[i * 3 + 2] * k;
  }
  levels.push({ w: cw, h: ch, img: ci, m: cm });

  while (cw > 4 && ch > 4) {
    const nw = Math.max(1, cw >> 1);
    const nh = Math.max(1, ch >> 1);
    const ni = new Float32Array(nw * nh * 3);
    const nm = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let r = 0, g = 0, b = 0, m = 0, n = 0;
        for (let dy = 0; dy < 2; dy++) {
          const sy = y * 2 + dy;
          if (sy >= ch) continue;
          for (let dx = 0; dx < 2; dx++) {
            const sx = x * 2 + dx;
            if (sx >= cw) continue;
            const si = sy * cw + sx;
            r += ci[si * 3];
            g += ci[si * 3 + 1];
            b += ci[si * 3 + 2];
            m += cm[si];
            n++;
          }
        }
        const di = y * nw + x;
        ni[di * 3] = r / n;
        ni[di * 3 + 1] = g / n;
        ni[di * 3 + 2] = b / n;
        nm[di] = m / n;
      }
    }
    cw = nw; ch = nh; ci = ni; cm = nm;
    levels.push({ w: cw, h: ch, img: ci, m: cm });
  }

  // push: coarse -> fine
  const top = levels[levels.length - 1];
  let coarse = new Float32Array(top.w * top.h * 3);
  for (let i = 0; i < top.w * top.h; i++) {
    const m = Math.max(top.m[i], 1e-6);
    coarse[i * 3] = top.img[i * 3] / m;
    coarse[i * 3 + 1] = top.img[i * 3 + 1] / m;
    coarse[i * 3 + 2] = top.img[i * 3 + 2] / m;
  }
  let cW = top.w;
  let cH = top.h;

  for (let l = levels.length - 2; l >= 0; l--) {
    const lv = levels[l];
    const out = new Float32Array(lv.w * lv.h * 3);
    for (let y = 0; y < lv.h; y++) {
      // bilinear upsample from the coarser level
      const fy = Math.min(cH - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(cH - 1, y0 + 1);
      const wy = fy - y0;
      for (let x = 0; x < lv.w; x++) {
        const fx = Math.min(cW - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
        const x0 = Math.floor(fx);
        const x1 = Math.min(cW - 1, x0 + 1);
        const wx = fx - x0;
        const di = (y * lv.w + x) * 3;
        const a = Math.min(1, lv.m[y * lv.w + x]);
        const denom = Math.max(lv.m[y * lv.w + x], 1e-6);
        for (let c = 0; c < 3; c++) {
          const p00 = coarse[(y0 * cW + x0) * 3 + c];
          const p10 = coarse[(y0 * cW + x1) * 3 + c];
          const p01 = coarse[(y1 * cW + x0) * 3 + c];
          const p11 = coarse[(y1 * cW + x1) * 3 + c];
          const up = (p00 * (1 - wx) + p10 * wx) * (1 - wy) + (p01 * (1 - wx) + p11 * wx) * wy;
          const known = lv.img[di + c] / denom;
          out[di + c] = a * known + (1 - a) * up;
        }
      }
    }
    coarse = out;
    cW = lv.w;
    cH = lv.h;
  }
  return coarse;
}

/**
 * Remove a region from the background and replace it with a diffusion fill,
 * feathered so the seam disappears.
 * `hole` is 1 inside the region to remove.
 */
function inpaint(rgb, w, h, hole, featherRadius) {
  const keep = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) keep[i] = 1 - hole[i];
  const filled = pullPush(rgb, w, h, keep);
  const soft = boxBlur1(hole, w, h, featherRadius, 3);
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(1, soft[i] * 1.35);
    if (a <= 0.001) continue;
    for (let c = 0; c < 3; c++) {
      const di = i * 3 + c;
      rgb[di] = clamp255(Math.round(filled[di] * a + rgb[di] * (1 - a)));
    }
  }
}

// ------------------------------------------------------------- text bits ---
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Ink bounding box of an RGBA layer (alpha > 8). */
function inkBox(rgba, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function headlineSvg(lines, size, fill) {
  const lead = size * HEADLINE_LEADING;
  const pad = Math.ceil(size * 0.6);
  const boxW = Math.ceil(size * 14) + pad * 2;
  const boxH = Math.ceil(lead * lines.length + size * 0.8) + pad * 2;
  const tspans = lines
    .map((l, i) => `<text x="${pad}" y="${pad + size + i * lead}" font-family="${FONT}" font-weight="700" font-size="${size}" fill="${fill}" xml:space="preserve">${esc(l)}</text>`)
    .join('');
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}">${tspans}</svg>`, boxW, boxH, pad };
}

function lineSvg(text, size, weight, fill, tracking = 0) {
  const pad = Math.ceil(size * 0.8);
  const boxW = Math.ceil(text.length * size * 1.1) + pad * 2;
  const boxH = Math.ceil(size * 2.2) + pad * 2;
  const track = tracking ? ` letter-spacing="${tracking}"` : '';
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}"><text x="${pad}" y="${pad + size}" font-family="${FONT}" font-weight="${weight}" font-size="${size}" fill="${fill}"${track} xml:space="preserve">${esc(text)}</text></svg>`,
    boxW,
    boxH,
  };
}

/** Render an RGBA layer, then also produce a blurred black copy for legibility. */
async function withShadow(rgba, w, h, sigma, opacity) {
  const shadow = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    shadow[i * 4] = 0;
    shadow[i * 4 + 1] = 0;
    shadow[i * 4 + 2] = 0;
    shadow[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * opacity);
  }
  const blurred = await sharp(shadow, { raw: { width: w, height: h, channels: 4 } })
    .blur(sigma)
    .raw()
    .toBuffer();
  return blurred;
}

// ------------------------------------------------------------ phone frame --
async function buildDevice(rawPath) {
  const meta = await sharp(rawPath).metadata();
  if (meta.width !== 1320 || meta.height !== 2868) {
    throw new Error(`${path.basename(rawPath)} is ${meta.width}x${meta.height}; expected a native 1320x2868 capture`);
  }
  if (SCREEN_W > meta.width || SCREEN_H > meta.height) {
    throw new Error('refusing to upscale the UI capture');
  }

  // The authentic screen: downscale only, lanczos3, no other processing.
  const screen = await sharp(rawPath)
    .removeAlpha()
    .resize(SCREEN_W, SCREEN_H, { kernel: 'lanczos3', fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Round the screen corners with the device radius (hardware, not app UI).
  const screenMask = await rasterize(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_W}" height="${SCREEN_H}"><rect x="0" y="0" width="${SCREEN_W}" height="${SCREEN_H}" rx="${SCREEN_R}" ry="${SCREEN_R}" fill="#fff"/></svg>`,
    SCREEN_W,
    SCREEN_H,
  );
  for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
    screen[i * 4 + 3] = screenMask[i * 4 + 3];
  }

  // Body: titanium rim -> near-black inner shell.
  const bodySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${DEV_W}" height="${DEV_H}">
  <defs>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b9c2cc"/>
      <stop offset="0.18" stop-color="#6f7a86"/>
      <stop offset="0.5" stop-color="#39424c"/>
      <stop offset="0.82" stop-color="#7c8794"/>
      <stop offset="1" stop-color="#2d353d"/>
    </linearGradient>
    <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d1116"/>
      <stop offset="1" stop-color="#05070a"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${DEV_W}" height="${DEV_H}" rx="${DEV_R}" ry="${DEV_R}" fill="url(#rim)"/>
  <rect x="3.5" y="3.5" width="${DEV_W - 7}" height="${DEV_H - 7}" rx="${DEV_R - 3.5}" ry="${DEV_R - 3.5}" fill="url(#shell)"/>
  <rect x="${BEZEL - 1.2}" y="${BEZEL - 1.2}" width="${SCREEN_W + 2.4}" height="${SCREEN_H + 2.4}" rx="${SCREEN_R + 1.2}" ry="${SCREEN_R + 1.2}" fill="#000000"/>
</svg>`;
  const body = await rasterize(bodySvg, DEV_W, DEV_H);

  // Screen goes on last; nothing is ever drawn over it.
  over3in4(body, DEV_W, DEV_H, screen, SCREEN_W, SCREEN_H, BEZEL, BEZEL);
  return body;
}

/** Composite an RGBA source onto an RGBA destination. */
function over3in4(dst, dw, dh, src, sw, sh, ox, oy) {
  for (let y = 0; y < sh; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= dh) continue;
    for (let x = 0; x < sw; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= dw) continue;
      const si = (y * sw + x) * 4;
      const a = src[si + 3] / 255;
      if (a === 0) continue;
      const di = (dy * dw + dx) * 4;
      const da = dst[di + 3] / 255;
      const oa = a + da * (1 - a);
      for (let c = 0; c < 3; c++) {
        dst[di + c] = clamp255(Math.round((src[si + c] * a + dst[di + c] * da * (1 - a)) / (oa || 1)));
      }
      dst[di + 3] = Math.round(oa * 255);
    }
  }
}

// ----------------------------------------------------------------- build ---
async function buildFrame(frame) {
  const platePath = path.join(PLATE_DIR, frame.plate);
  const rawPath = path.join(RAW_DIR, frame.raw);
  const plateMeta = await sharp(platePath).metadata();
  const sx = W / plateMeta.width;
  const sy = H / plateMeta.height;

  // 1. background: plate art upscaled to the 6.9" slot (lanczos3)
  const bg = await sharp(platePath)
    .removeAlpha()
    .resize(W, H, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer();
  const canvas = Buffer.from(bg); // RGB

  // 2. hole mask: the plate's baked caption + its AI-generated phone
  const hole = new Float32Array(W * H);

  const [tx0, ty0, tx1, ty1] = frame.textMask.map((v, i) => Math.round(v * (i % 2 === 0 ? sx : sy)));
  const glyph = new Float32Array(W * H);
  for (let y = ty0; y < ty1; y++) {
    for (let x = tx0; x < tx1; x++) {
      const i = y * W + x;
      const r = canvas[i * 3];
      const g = canvas[i * 3 + 1];
      const b = canvas[i * 3 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const isWhite = lum > 195;
      const isEmerald = g > 150 && g > r * 1.6 && g > b * 1.15;
      if (isWhite || isEmerald) glyph[i] = 1;
    }
  }
  // dilate the glyph mask so anti-aliased edges are swallowed too
  const grow = Math.round(9 * sx);
  const spread = boxBlur1(glyph, W, H, grow, 2);
  for (let y = Math.max(0, ty0 - grow * 2); y < Math.min(H, ty1 + grow * 2); y++) {
    for (let x = Math.max(0, tx0 - grow * 2); x < Math.min(W, tx1 + grow * 2); x++) {
      const i = y * W + x;
      if (spread[i] > 0.012) hole[i] = 1;
    }
  }

  if (frame.phoneHole) {
    const [px0, py0, px1, py1] = frame.phoneHole.map((v, i) => Math.round(v * (i % 2 === 0 ? sx : sy)));
    for (let y = Math.max(0, py0); y < Math.min(H, py1); y++) {
      for (let x = Math.max(0, px0); x < Math.min(W, px1); x++) hole[y * W + x] = 1;
    }
  }

  // 3. diffusion fill
  inpaint(canvas, W, H, hole, 7);

  if (process.env.SHOTS34_DEBUG_BG) {
    await sharp(canvas, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toFile(path.join(process.env.SHOTS34_DEBUG_BG, `bg-${frame.id}.png`));
    const maskBuf = Buffer.alloc(W * H);
    for (let i = 0; i < W * H; i++) maskBuf[i] = hole[i] > 0 ? 255 : 0;
    await sharp(maskBuf, { raw: { width: W, height: H, channels: 1 } })
      .png()
      .toFile(path.join(process.env.SHOTS34_DEBUG_BG, `mask-${frame.id}.png`));
  }

  // 4. legibility scrim over the copy area (soft, keeps the art visible)
  const scrim = await rasterize(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#04070b" stop-opacity="0.62"/>
        <stop offset="0.24" stop-color="#04070b" stop-opacity="0.46"/>
        <stop offset="0.42" stop-color="#04070b" stop-opacity="0"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#s)"/>
    </svg>`,
    W,
    H,
  );
  over(canvas, W, H, scrim, W, H, 0, 0);

  // 5. ambient darkening + contact shadow under the device
  const devY = frame.devY;
  const ambW = Math.round(DEV_W * 2.0);
  const ambH = Math.round(DEV_H * 1.5);
  const ambient = await rasterize(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ambW}" height="${ambH}">
      <defs><radialGradient id="a" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#010306" stop-opacity="0.72"/>
        <stop offset="0.45" stop-color="#010306" stop-opacity="0.5"/>
        <stop offset="1" stop-color="#010306" stop-opacity="0"/>
      </radialGradient></defs>
      <rect width="${ambW}" height="${ambH}" fill="url(#a)"/>
    </svg>`,
    ambW,
    ambH,
  );
  over(canvas, W, H, ambient, ambW, ambH, DEV_X + DEV_W / 2 - ambW / 2, devY + DEV_H / 2 - ambH / 2);

  const shW = DEV_W + 120;
  const shH = DEV_H + 120;
  const shadowLayer = await rasterize(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${shW}" height="${shH}"><rect x="60" y="60" width="${DEV_W}" height="${DEV_H}" rx="${DEV_R}" ry="${DEV_R}" fill="#000000" fill-opacity="0.85"/></svg>`,
    shW,
    shH,
  );
  const shadowBlur = await sharp(shadowLayer, { raw: { width: shW, height: shH, channels: 4 } })
    .blur(26)
    .raw()
    .toBuffer();
  over(canvas, W, H, shadowBlur, shW, shH, DEV_X - 60, devY - 60 + 26);

  // 6. the device with the authentic screen
  const device = await buildDevice(rawPath);
  over(canvas, W, H, device, DEV_W, DEV_H, DEV_X, devY);

  // 7. copy
  // eyebrow rule
  const rule = await rasterize(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RULE_W}" height="${RULE_H}"><rect width="${RULE_W}" height="${RULE_H}" rx="2" fill="${EMERALD}"/></svg>`,
    RULE_W,
    RULE_H,
  );
  over(canvas, W, H, rule, RULE_W, RULE_H, ML, RULE_TOP);

  // eyebrow
  {
    const { svg, boxW, boxH } = lineSvg(frame.eyebrow, EYEBROW_SIZE, 600, EMERALD, EYEBROW_TRACK);
    const layer = await rasterize(svg, boxW, boxH);
    const box = inkBox(layer, boxW, boxH);
    over(canvas, W, H, layer, boxW, boxH, ML - box.x0, EYEBROW_TOP - box.y0);
  }

  // headline: fit the widest line to the text column
  let headlineBottom = HEADLINE_TOP;
  {
    const probeSize = 120;
    const probe = headlineSvg(frame.headline, probeSize, WHITE);
    const probeLayer = await rasterize(probe.svg, probe.boxW, probe.boxH);
    const probeBox = inkBox(probeLayer, probe.boxW, probe.boxH);
    const size = Math.floor((probeSize * TEXT_W) / probeBox.w);

    const final = headlineSvg(frame.headline, size, WHITE);
    const layer = await rasterize(final.svg, final.boxW, final.boxH);
    const box = inkBox(layer, final.boxW, final.boxH);
    const shadow = await withShadow(layer, final.boxW, final.boxH, 14, 0.78);
    over(canvas, W, H, shadow, final.boxW, final.boxH, ML - box.x0, HEADLINE_TOP - box.y0 + 4);
    over(canvas, W, H, layer, final.boxW, final.boxH, ML - box.x0, HEADLINE_TOP - box.y0);
    headlineBottom = HEADLINE_TOP + box.h;
  }

  // support line
  {
    const { svg, boxW, boxH } = lineSvg(frame.support, SUPPORT_SIZE, 400, SUPPORT_FILL);
    const layer = await rasterize(svg, boxW, boxH);
    const box = inkBox(layer, boxW, boxH);
    if (box.w > TEXT_W) throw new Error(`support line overflows for frame ${frame.id}`);
    const top = headlineBottom + SUPPORT_GAP;
    const shadow = await withShadow(layer, boxW, boxH, 10, 0.75);
    over(canvas, W, H, shadow, boxW, boxH, ML - box.x0, top - box.y0 + 3);
    over(canvas, W, H, layer, boxW, boxH, ML - box.x0, top - box.y0);
  }

  const outPath = path.join(OUT_DIR, `${frame.id}.png`);
  await sharp(canvas, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 9, effort: 10, palette: false })
    .toFile(outPath);

  return outPath;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const rawManifest = JSON.parse(await fs.readFile(path.join(RAW_DIR, 'manifest.json'), 'utf8'));
  const rawById = Object.fromEntries(rawManifest.frames.map((f) => [f.id, f]));

  const finals = [];
  for (const frame of FRAMES) {
    process.stdout.write(`building ${frame.id} ... `);
    const outPath = await buildFrame(frame);
    const stat = await fs.stat(outPath);
    const meta = await sharp(outPath).metadata();
    if (meta.width !== W || meta.height !== H) throw new Error(`bad size for ${frame.id}`);
    if (meta.channels !== 3) throw new Error(`${frame.id} is not RGB`);
    const rawPath = path.join(RAW_DIR, frame.raw);
    finals.push({
      id: frame.id,
      file: `en-US/${frame.id}.png`,
      width: meta.width,
      height: meta.height,
      color: 'RGB 8-bit PNG (no alpha)',
      bytes: stat.size,
      sha256: await sha256(outPath),
      headline: frame.headline.join(' '),
      support: frame.support,
      eyebrow: frame.eyebrow,
      raw_capture: {
        file: `raw/${frame.raw}`,
        sha256: await sha256(rawPath),
        sha256_from_raw_manifest: rawById[frame.id]?.sha256 ?? null,
        route: rawById[frame.id]?.route ?? null,
        captured_utc: rawById[frame.id]?.captured_utc ?? null,
      },
      plate: {
        file: `plates/${frame.plate}`,
        sha256: await sha256(path.join(PLATE_DIR, frame.plate)),
      },
      screen: {
        source_px: '1320x2868 (native capture)',
        placed_px: `${SCREEN_W}x${SCREEN_H}`,
        scale: Number((SCREEN_W / 1320).toFixed(5)),
        resample: 'lanczos3, downscale only',
        edits: 'none — the capture is placed unmodified inside a drawn hardware bezel; nothing is composited on top of it',
      },
      note: frame.screenNote,
    });
    console.log(`${path.basename(outPath)} ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  }

  const manifest = {
    generated_by: 'scripts/build-app-store-shots-34.mjs',
    spec: 'review33/app-store-handoff-33/SCREENSHOTS.md',
    locale: 'en-US',
    slot: '6.9 inch iPhone (1320x2868)',
    build: rawManifest.build,
    device: rawManifest.device,
    capture: {
      backend: rawManifest.capture?.backend,
      launch_arguments: rawManifest.capture?.launch_arguments,
      account_mode: rawManifest.account_mode ?? rawManifest.capture?.account_mode ?? 'signed out, practice',
    },
    compositing: {
      background: 'lifestyle plate art upscaled 851x1848/1849 -> 1320x2868 with lanczos3',
      plate_phone: 'the plates\' AI-generated phone is removed with a pull/push diffusion fill before the real device is drawn',
      plate_caption: 'the plates\' baked caption is removed the same way; the headline and support line are re-set from the spec table',
      ui: 'authentic capture, downscaled only, never retouched, nothing drawn over the screen rectangle',
      typography: 'SF Pro Display 700 headline / 400 support / 600 emerald eyebrow',
    },
    finals,
    missing: MISSING,
  };
  await fs.writeFile(path.join(SHOTS, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nmanifest -> ${path.join(SHOTS, 'manifest.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
