// Bobby 1.1 App Store frames: generated lifestyle plate + real native capture
// in a device frame + one quiet headline set beside the phone.
// Deliberately minimal: small light type, one hairline accent, lots of air.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const W = 1320;
const H = 2868;

const platesDir = path.join(rootDir, "docs/app-store/v11-plates");
const capturesDir = path.join(rootDir, "docs/app-store/store-shots-build6");
const outDir = path.join(rootDir, "docs/app-store/v11");
await mkdir(outDir, { recursive: true });

const MINT = "#7BF5A6";
const FONT = "Avenir Next, Helvetica Neue, Helvetica, Arial, sans-serif";

// Phone geometry: sits in the right negative space, cropped by the bottom edge.
// The phone bleeds off the right and bottom edges so the frame reads as a crop
// of something larger, and the copy keeps a real column instead of a sliver.
const PHONE_W = 750;
const PHONE_X = 630;
const PHONE_Y = 1240;
const BEZEL = 9;
const RADIUS = 62;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frames = [
  { file: "01-live-voice.png", plate: "01-live-voice.png", capture: "05-desk-companion.png",
    kicker: "BOBBY LIVE", title: ["Talk to it.", "It talks back."],
    note: "Three free minutes a day, shared with the web." },
  { file: "02-no-trade.png", plate: "02b.png", capture: "09-verdict.png",
    kicker: "THE RISK GATE", title: ["NO TRADE is", "a real verdict."],
    note: "When nothing survives the debate, Bobby says so." },
  { file: "03-three-agents.png", plate: "03-three-agents.png", capture: "08-board.png",
    kicker: "THREE AGENTS", title: ["They argue.", "Then you decide."],
    note: "One builds the case, one attacks it, a third rules." },
  { file: "04-squad.png", plate: "04b.png", capture: "06-squad.png",
    kicker: "YOUR SQUAD", title: ["Pick the one", "that sounds like you."],
    note: "The voice changes. The analysis never does." },
  { file: "05-base-stocks.png", plate: "05-base-stocks.png", capture: "10-evolution.png",
    kicker: "DISCIPLINE", title: ["Waiting well", "is progress."],
    note: "Your companion levels up on process, not spending." },
];

async function build(frame) {
  const plate = await sharp(path.join(platesDir, frame.plate))
    .resize(W, H, { fit: "cover", position: "centre" })
    .toBuffer();

  // Scrim: darken globally, then deepen the right side so the UI reads cleanly.
  const scrim = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#05060A" stop-opacity="0.18"/>
        <stop offset="45%" stop-color="#05060A" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="#05060A" stop-opacity="0.66"/>
      </linearGradient>
      <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#05060A" stop-opacity="0"/>
        <stop offset="100%" stop-color="#05060A" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#side)"/>
    <rect y="${H - 900}" width="${W}" height="900" fill="url(#foot)"/>
  </svg>`);

  const capMeta = await sharp(path.join(capturesDir, frame.capture)).metadata();
  const innerW = PHONE_W - BEZEL * 2;
  const innerH = Math.round((capMeta.height / capMeta.width) * innerW);
  const phoneH = innerH + BEZEL * 2;

  const mask = Buffer.from(`<svg width="${innerW}" height="${innerH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${innerW}" height="${innerH}" rx="${RADIUS - BEZEL}" ry="${RADIUS - BEZEL}" fill="#fff"/></svg>`);
  const screen = await sharp(path.join(capturesDir, frame.capture))
    .resize(innerW, innerH, { fit: "cover", position: "top" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png().toBuffer();

  const body = Buffer.from(`<svg width="${PHONE_W}" height="${phoneH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${PHONE_W}" height="${phoneH}" rx="${RADIUS}" ry="${RADIUS}" fill="#0A0C10"/>
    <rect x="1" y="1" width="${PHONE_W - 2}" height="${phoneH - 2}" rx="${RADIUS - 1}" ry="${RADIUS - 1}"
      fill="none" stroke="#FFFFFF" stroke-opacity="0.20" stroke-width="2"/></svg>`);
  let phone = await sharp(body).composite([{ input: screen, top: BEZEL, left: BEZEL }]).png().toBuffer();
  // Clip whatever runs past the canvas: sharp refuses oversized composites.
  const clipW = Math.min(PHONE_W, W - PHONE_X);
  const clipH = Math.min(phoneH, H - PHONE_Y);
  if (clipW < PHONE_W || clipH < phoneH) {
    phone = await sharp(phone).extract({ left: 0, top: 0, width: clipW, height: clipH }).png().toBuffer();
  }

  // Copy block, left column, beside the phone. Small and quiet on purpose.
  const x = 92;
  const titleSize = 72;
  const lead = 86;
  let y = 452;
  const lines = frame.title
    .map((t, i) => `<text x="${x}" y="${y + i * lead}" fill="#FFFFFF" font-size="${titleSize}"
      font-weight="500" letter-spacing="-1.6">${esc(t)}</text>`).join("");
  const noteY = y + frame.title.length * lead + 30;

  const copy = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <g font-family="${FONT}">
      <rect x="${x}" y="330" width="46" height="2" fill="${MINT}" fill-opacity="0.9"/>
      <text x="${x}" y="382" fill="${MINT}" fill-opacity="0.85" font-size="21"
        font-weight="600" letter-spacing="3.4">${esc(frame.kicker)}</text>
      ${lines}
      <text x="${x}" y="${noteY}" fill="#FFFFFF" fill-opacity="0.55" font-size="27"
        font-weight="400" letter-spacing="0">${esc(frame.note)}</text>
    </g>
  </svg>`);

  await sharp(plate)
    .composite([
      { input: scrim, top: 0, left: 0 },
      { input: phone, top: PHONE_Y, left: PHONE_X },
      { input: copy, top: 0, left: 0 },
    ])
    .removeAlpha()
    .png()
    .toFile(path.join(outDir, frame.file));
  console.log("built", frame.file);
}

for (const f of frames) {
  try { await build(f); } catch (e) { console.log("skip", f.file, e.message); }
}
