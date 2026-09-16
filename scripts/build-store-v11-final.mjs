// Bobby 1.1 App Store set — six frames telling one story: you ask, three agents
// argue, a verdict lands, discipline pays, your world grows, it all stays public.
// Frames 1 and 6 carry no device: they open and close the argument.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const W = 1320;
const H = 2868;

const platesDir = path.join(rootDir, "docs/app-store/v11-plates");
const shotsDir = path.join(rootDir, "docs/app-store/shots-build24");
const outDir = path.join(rootDir, "docs/app-store/v11-final");
await mkdir(outDir, { recursive: true });

const MINT = "#7BF5A6";
const FONT = "Avenir Next, Helvetica Neue, Helvetica, Arial, sans-serif";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PHONE_W = 750;
const PHONE_X = 630;
const PHONE_Y = 1240;
const BEZEL = 9;
const RADIUS = 62;

const frames = [
  { file: "01-ask.png", plate: "01-live-voice.png",
    kicker: "01 · YOU ASK", title: ["Say it out loud.", "Any market."],
    note: "Voice or text. BTC, NVDA, gold and 600 more." },
  { file: "02-debate.png", plate: "03-three-agents.png", capture: "01-desk.png",
    kicker: "02 · THEY ARGUE", title: ["A desk.", "Not a chatbot."],
    note: "Alpha hunts the case, Red Team attacks it, the CIO rules." },
  { file: "03-verdict.png", plate: "02b.png", capture: "03-verdict.png",
    kicker: "03 · THE VERDICT", title: ["NO TRADE is", "a real answer."],
    note: "When nothing survives the debate, Bobby says so." },
  { file: "04-discipline.png", plate: "04b.png", capture: "05-gear.png",
    kicker: "04 · YOU EARN IT", title: ["Discipline levels", "you up."],
    note: "Reads and coming back. Never volume, never spending." },
  { file: "05-trader-land.png", plate: "06-trader-land.png", capture: "02-trader-land.png", crop: "left",
    kicker: "05 · YOUR WORLD", title: ["Every good call", "builds your island."],
    note: "Trader Land grows from the decisions you got right." },
  { file: "06-record.png", plate: "07-record.png", crop: "left",
    kicker: "06 · ON THE RECORD", title: ["Written down", "before the outcome."],
    note: "Bobby's public calls are logged on-chain. Anyone can check." },
];

async function build(frame) {
  const plate = await sharp(path.join(platesDir, frame.plate))
    .resize(W, H, { fit: "cover", position: frame.crop || "centre" })
    .toBuffer();

  const hasPhone = Boolean(frame.capture);
  const scrim = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="head" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#05060A" stop-opacity="0.60"/>
        <stop offset="100%" stop-color="#05060A" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#05060A" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#05060A" stop-opacity="${hasPhone ? 0.5 : 0.18}"/>
      </linearGradient>
      <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#05060A" stop-opacity="0"/>
        <stop offset="100%" stop-color="#05060A" stop-opacity="0.5"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="1180" fill="url(#head)"/>
    <rect width="${W}" height="${H}" fill="url(#side)"/>
    <rect y="${H - 760}" width="${W}" height="760" fill="url(#foot)"/>
  </svg>`);

  const layers = [{ input: scrim, top: 0, left: 0 }];

  if (hasPhone) {
    const capPath = path.join(shotsDir, frame.capture);
    const meta = await sharp(capPath).metadata();
    const innerW = PHONE_W - BEZEL * 2;
    const innerH = Math.round((meta.height / meta.width) * innerW);
    const phoneH = innerH + BEZEL * 2;

    const mask = Buffer.from(`<svg width="${innerW}" height="${innerH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${innerW}" height="${innerH}" rx="${RADIUS - BEZEL}" ry="${RADIUS - BEZEL}" fill="#fff"/></svg>`);
    const screen = await sharp(capPath)
      .resize(innerW, innerH, { fit: "cover", position: "top" })
      .composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();

    const body = Buffer.from(`<svg width="${PHONE_W}" height="${phoneH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${PHONE_W}" height="${phoneH}" rx="${RADIUS}" ry="${RADIUS}" fill="#0A0C10"/>
      <rect x="1" y="1" width="${PHONE_W - 2}" height="${phoneH - 2}" rx="${RADIUS - 1}" ry="${RADIUS - 1}"
        fill="none" stroke="#FFFFFF" stroke-opacity="0.20" stroke-width="2"/></svg>`);
    let phone = await sharp(body).composite([{ input: screen, top: BEZEL, left: BEZEL }]).png().toBuffer();

    const clipW = Math.min(PHONE_W, W - PHONE_X);
    const clipH = Math.min(phoneH, H - PHONE_Y);
    if (clipW < PHONE_W || clipH < phoneH) {
      phone = await sharp(phone).extract({ left: 0, top: 0, width: clipW, height: clipH }).png().toBuffer();
    }
    layers.push({ input: phone, top: PHONE_Y, left: PHONE_X });
  }

  const x = 92;
  const titleSize = hasPhone ? 72 : 78;
  const lead = hasPhone ? 86 : 94;
  const y = hasPhone ? 452 : 466;
  const lines = frame.title
    .map((t, i) => `<text x="${x}" y="${y + i * lead}" fill="#FFFFFF" font-size="${titleSize}"
      font-weight="500" letter-spacing="-1.7">${esc(t)}</text>`).join("");
  const noteY = hasPhone ? y + frame.title.length * lead + 30 : H - 150;

  const copy = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <g font-family="${FONT}">
      <rect x="${x}" y="330" width="46" height="2" fill="${MINT}" fill-opacity="0.9"/>
      <text x="${x}" y="382" fill="${MINT}" fill-opacity="0.85" font-size="21"
        font-weight="600" letter-spacing="3.4">${esc(frame.kicker)}</text>
      ${lines}
      <text x="${x}" y="${noteY}" fill="#FFFFFF" fill-opacity="0.55" font-size="27"
        font-weight="400">${esc(frame.note)}</text>
    </g>
  </svg>`);
  layers.push({ input: copy, top: 0, left: 0 });

  await sharp(plate).composite(layers).removeAlpha().png()
    .toFile(path.join(outDir, frame.file));
  console.log("built", frame.file);
}

for (const f of frames) {
  try { await build(f); } catch (e) { console.log("FAIL", f.file, e.message); }
}
