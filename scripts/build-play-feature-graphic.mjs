// Play Store feature graphic — 1024 x 500, the banner at the top of the listing.
// Google crops and overlays this in places, so nothing important goes near the edges
// and the left third stays quiet enough for the play button Google draws on some surfaces.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 1024;
const H = 500;
const MINT = "#7BF5A6";
const FONT = "Avenir Next, Helvetica Neue, Helvetica, Arial, sans-serif";

const plate = await sharp(path.join(rootDir, "docs/play-store/plates/09-feature-wide.jpg"))
  .resize(W, H, { fit: "cover", position: "centre" })
  .toBuffer();

const scrim = Buffer.from(`
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#05060A" stop-opacity="0.15"/>
      <stop offset="42%" stop-color="#05060A" stop-opacity="0.70"/>
      <stop offset="100%" stop-color="#05060A" stop-opacity="0.88"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`);

const copy = Buffer.from(`
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <g font-family="${FONT}">
    <rect x="452" y="150" width="38" height="2" fill="${MINT}" fill-opacity="0.9"/>
    <text x="452" y="192" fill="${MINT}" fill-opacity="0.85" font-size="17"
      font-weight="600" letter-spacing="3.2">BOBBY PROTOCOL</text>
    <text x="452" y="268" fill="#FFFFFF" font-size="56" font-weight="500" letter-spacing="-1.4">The market</text>
    <text x="452" y="330" fill="#FFFFFF" font-size="56" font-weight="500" letter-spacing="-1.4">argues back.</text>
    <text x="452" y="384" fill="#FFFFFF" fill-opacity="0.62" font-size="23" font-weight="400">Three agents debate every call. You decide.</text>
  </g>
</svg>`);

await sharp(plate)
  .composite([{ input: scrim, top: 0, left: 0 }, { input: copy, top: 0, left: 0 }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(rootDir, "docs/play-store/final/feature-graphic-1024x500.png"));
console.log("built feature-graphic-1024x500.png");
