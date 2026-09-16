// Bobby 1.1 App Store frames, lifestyle only: generated plate + one quiet
// headline. No device, no UI. Kept deliberately sparse.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const W = 1320;
const H = 2868;

const platesDir = path.join(rootDir, "docs/app-store/v11-plates");
const outDir = path.join(rootDir, "docs/app-store/v11-clean");
await mkdir(outDir, { recursive: true });

const MINT = "#7BF5A6";
const FONT = "Avenir Next, Helvetica Neue, Helvetica, Arial, sans-serif";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frames = [
  { file: "01-live-voice.png", plate: "01-live-voice.png",
    kicker: "BOBBY LIVE", title: ["Talk to it.", "It talks back."],
    note: "Three free minutes a day, shared with the web." },
  { file: "02-no-trade.png", plate: "02b.png",
    kicker: "THE RISK GATE", title: ["NO TRADE is", "a real verdict."],
    note: "When nothing survives the debate, Bobby says so." },
  { file: "03-three-agents.png", plate: "03-three-agents.png",
    kicker: "THREE AGENTS", title: ["They argue.", "Then you decide."],
    note: "One builds the case, one attacks it, a third rules." },
  { file: "04-squad.png", plate: "04b.png",
    kicker: "YOUR SQUAD", title: ["Pick the one", "that sounds like you."],
    note: "The voice changes. The analysis never does." },
  { file: "05-base-stocks.png", plate: "05-base-stocks.png",
    kicker: "DISCIPLINE", title: ["Waiting well", "is progress."],
    note: "Your companion levels up on process, not spending." },
];

async function build(frame) {
  const plate = await sharp(path.join(platesDir, frame.plate))
    .resize(W, H, { fit: "cover", position: "centre" })
    .toBuffer();

  // Just enough scrim at the top for the type to hold, and a soft foot.
  const scrim = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="head" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#05060A" stop-opacity="0.62"/>
        <stop offset="100%" stop-color="#05060A" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#05060A" stop-opacity="0"/>
        <stop offset="100%" stop-color="#05060A" stop-opacity="0.5"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="1180" fill="url(#head)"/>
    <rect y="${H - 760}" width="${W}" height="760" fill="url(#foot)"/>
  </svg>`);

  const x = 92;
  const titleSize = 78;
  const lead = 94;
  const y = 466;
  const lines = frame.title
    .map((t, i) => `<text x="${x}" y="${y + i * lead}" fill="#FFFFFF" font-size="${titleSize}"
      font-weight="500" letter-spacing="-1.8">${esc(t)}</text>`).join("");

  const copy = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <g font-family="${FONT}">
      <rect x="${x}" y="330" width="46" height="2" fill="${MINT}" fill-opacity="0.9"/>
      <text x="${x}" y="382" fill="${MINT}" fill-opacity="0.85" font-size="21"
        font-weight="600" letter-spacing="3.4">${esc(frame.kicker)}</text>
      ${lines}
      <text x="${x}" y="${H - 150}" fill="#FFFFFF" fill-opacity="0.5" font-size="27"
        font-weight="400">${esc(frame.note)}</text>
    </g>
  </svg>`);

  await sharp(plate)
    .composite([{ input: scrim, top: 0, left: 0 }, { input: copy, top: 0, left: 0 }])
    .removeAlpha().png()
    .toFile(path.join(outDir, frame.file));
  console.log("built", frame.file);
}

for (const f of frames) {
  try { await build(f); } catch (e) { console.log("skip", f.file, e.message); }
}
