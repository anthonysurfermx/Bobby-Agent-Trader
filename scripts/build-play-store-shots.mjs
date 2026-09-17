// Bobby for Google Play — phone screenshots, 1080 x 1920 (9:16, the ratio Play wants).
//
// Not a rescale of the App Store set: that one is 1320 x 2868 and everything in it
// (type size, phone geometry, how much plate is left around the device) is tuned for
// a much taller canvas. This lays the same six-beat story out again for 16:9.
//
// Screens are captured from the live web app at Pixel-8 metrics (412 x 892 @3),
// which is exactly what the Trusted Web Activity serves on Android — no iOS
// simulator UI anywhere in the set.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const W = 1080;
const H = 1920;

const platesDir = path.join(rootDir, "docs/play-store/plates");
const shotsDir = path.join(rootDir, "docs/play-store/shots-web");
const outDir = path.join(rootDir, "docs/play-store/final");
await mkdir(outDir, { recursive: true });

const MINT = "#7BF5A6";
const FONT = "Avenir Next, Helvetica Neue, Helvetica, Arial, sans-serif";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The phone is drawn here, not photographed: a neutral rounded slab with a hairline
// edge. No notch, no chin, no iOS status bar — nothing that claims a device it isn't.
const PHONE_W = 600;
const PHONE_X = 516;
const PHONE_Y = 690;
const BEZEL = 8;
const RADIUS = 52;

const frames = [
  { file: "01-ask.png", plate: "01-voice.jpg", capture: "04-desk-idle.png",
    kicker: "01 · YOU ASK", title: ["Say it out loud.", "Any market."],
    note: "Voice or text. BTC, NVDA, gold and 600 more." },
  { file: "02-debate.png", plate: "07-desk-dark.jpg", capture: "07-verdict-scrolled.png",
    kicker: "02 · THEY ARGUE", title: ["A desk.", "Not a chatbot."],
    note: "Alpha hunts the case, Red Team attacks it, the CIO rules." },
  { file: "03-verdict.png", plate: "03-rain.jpg", capture: "06-verdict.png",
    kicker: "03 · THE VERDICT", title: ["NO TRADE is", "a real answer."],
    note: "When nothing survives the debate, Bobby says so." },
  { file: "04-discipline.png", plate: "04-magenta.jpg", capture: "03-loadout.png",
    kicker: "04 · YOU EARN IT", title: ["Discipline levels", "you up."],
    note: "Reading and coming back. Never volume, never spending." },
  { file: "05-trader-land.png", plate: "05-floor.jpg", capture: "09-trader-land.png", crop: "left",
    kicker: "05 · YOUR WORLD", title: ["Every good call", "builds your island."],
    note: "Trader Land grows from the decisions you got right." },
  { file: "06-squad.png", plate: "08-friends.jpg", capture: "01-companion-picker.png",
    kicker: "06 · YOUR SQUAD", title: ["Ten companions.", "One desk."],
    note: "Each one reads the same data and says it differently." },
  { file: "07-risk.png", plate: "06-corridor.jpg", capture: "00-risk-gate.png", crop: "left",
    kicker: "07 · NO PROMISES", title: ["Analysis, not advice.", "You decide."],
    note: "Bobby never holds your funds or signs for you." },
];

async function build(frame) {
  const plate = await sharp(path.join(platesDir, frame.plate))
    .resize(W, H, { fit: "cover", position: frame.crop || "centre" })
    .toBuffer();

  const capPath = path.join(shotsDir, frame.capture);
  const meta = await sharp(capPath).metadata();
  const innerW = PHONE_W - BEZEL * 2;
  const innerH = Math.round((meta.height / meta.width) * innerW);
  const phoneH = innerH + BEZEL * 2;

  const scrim = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="head" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#05060A" stop-opacity="0.62"/>
        <stop offset="100%" stop-color="#05060A" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#05060A" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#05060A" stop-opacity="0.52"/>
      </linearGradient>
      <linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#05060A" stop-opacity="0"/>
        <stop offset="100%" stop-color="#05060A" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="800" fill="url(#head)"/>
    <rect width="${W}" height="${H}" fill="url(#side)"/>
    <rect y="${H - 460}" width="${W}" height="460" fill="url(#foot)"/>
  </svg>`);

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

  const x = 74;
  const titleSize = 62;
  const lead = 74;
  const y = 300;
  const lines = frame.title
    .map((t, i) => `<text x="${x}" y="${y + i * lead}" fill="#FFFFFF" font-size="${titleSize}"
      font-weight="500" letter-spacing="-1.4">${esc(t)}</text>`).join("");
  const noteY = y + frame.title.length * lead + 20;

  const copy = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <g font-family="${FONT}">
      <rect x="${x}" y="200" width="40" height="2" fill="${MINT}" fill-opacity="0.9"/>
      <text x="${x}" y="244" fill="${MINT}" fill-opacity="0.85" font-size="18"
        font-weight="600" letter-spacing="3">${esc(frame.kicker)}</text>
      ${lines}
      <text x="${x}" y="${noteY}" fill="#FFFFFF" fill-opacity="0.60" font-size="25"
        font-weight="400">${esc(frame.note)}</text>
    </g>
  </svg>`);

  await sharp(plate)
    .composite([{ input: scrim, top: 0, left: 0 }, { input: phone, top: PHONE_Y, left: PHONE_X }, { input: copy, top: 0, left: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, frame.file));
  console.log("built", frame.file);
}

for (const frame of frames) await build(frame);

// contact sheet, for reviewing the set in one look
const tiles = await Promise.all(frames.map((f) =>
  sharp(path.join(outDir, f.file)).resize(300, 533).toBuffer()));
await sharp({ create: { width: 300 * frames.length, height: 533, channels: 3, background: "#000" } })
  .composite(tiles.map((t, i) => ({ input: t, left: i * 300, top: 0 })))
  .jpeg({ quality: 82 })
  .toFile(path.join(outDir, "contact-sheet.jpg"));
console.log("built contact-sheet.jpg");
