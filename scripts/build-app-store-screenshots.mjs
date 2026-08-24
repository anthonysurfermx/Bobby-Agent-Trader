import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const width = 1284;
const height = 2778;
const outputDirectory = path.join(rootDir, "docs/app-store/final-v3");
await mkdir(outputDirectory, { recursive: true });

const frames = [
  {
    file: "01-tu-mercado-tu-bobby.png",
    device: true,
    capture: "byte-current.png",
    kicker: "MORE THAN A CHATBOT",
    line1: "BOBBY DOESN'T JUST ANSWER.",
    line2: "IT DEBATES.",
    subtitle: "Three specialized agents challenge every market idea before you see the verdict.",
    headlineSize1: 61,
    headlineSize2: 82,
    subtitleSize: 24,
  },
  {
    file: "02-hablale-al-mercado.png",
    device: true,
    capture: "kora-current.png",
    kicker: "MORE THAN A CHATBOT",
    line1: "SEE WHAT THE MARKET",
    line2: "IS DOING RIGHT NOW.",
    subtitle: "Live prices, market context and risk levels replace generic explanations.",
    headlineSize1: 72,
    headlineSize2: 68,
    subtitleSize: 24,
  },
  {
    file: "03-tres-agentes-un-veredicto.png",
    device: true,
    capture: "glitch-current.png",
    kicker: "MORE THAN A CHATBOT",
    line1: "WHEN THERE IS NO EDGE,",
    line2: "BOBBY SAYS SO.",
    subtitle: "A NO TRADE verdict explains why waiting can protect your capital.",
    headlineSize1: 68,
    headlineSize2: 78,
    subtitleSize: 25,
  },
  {
    file: "04-tu-tesis-bajo-presion.png",
    line1: "CHOOSE A COMPANION",
    line2: "THAT SPEAKS YOUR LANGUAGE.",
    subtitle: "Choose your companion's voice and personality without changing the quality of the analysis.",
    experience1: "The same serious market intelligence,",
    experience2: "delivered in a way that feels like you.",
    headlineSize1: 76,
    headlineSize2: 61,
    subtitleSize: 23,
    experienceSize: 49,
  },
  {
    file: "05-no-trade-tambien-gana.png",
    line1: "WAITING CAN BE",
    line2: "A WIN.",
    subtitle: "Halo turns a disciplined NO TRADE decision into visible progress.",
    experience1: "Protecting your capital earns Discipline XP",
    experience2: "because good process matters.",
    headlineSize1: 88,
    headlineSize2: 100,
    subtitleSize: 25,
    experienceSize: 47,
  },
  {
    file: "06-ve-mas-que-el-precio.png",
    line1: "LEARN TO READ THE MARKET,",
    line2: "NOT CHASE IT.",
    subtitle: "Bobby connects price, context, risk and invalidation in one clear view.",
    experience1: "Every analysis shows what confirms the thesis",
    experience2: "and what would break it.",
    headlineSize1: 67,
    headlineSize2: 82,
    subtitleSize: 24,
    experienceSize: 47,
  },
  {
    file: "07-recuerda-lo-que-sigues.png",
    line1: "YOUR STREAK REWARDS",
    line2: "BETTER DECISIONS.",
    subtitle: "Discipline XP grows when you review, question and respect the risk.",
    experience1: "Opening the app earns nothing.",
    experience2: "Following the process does.",
    headlineSize1: 76,
    headlineSize2: 74,
    subtitleSize: 24,
    experienceSize: 52,
  },
  {
    file: "08-forja-tu-propia-aura.png",
    line1: "YOUR COMPANION EVOLVES",
    line2: "AS YOU DO.",
    subtitle: "New names, emotes and forms unlock through consistent, useful behavior.",
    experience1: "You never level up by spending more.",
    experience2: "You level up by thinking better.",
    headlineSize1: 70,
    headlineSize2: 94,
    subtitleSize: 24,
    experienceSize: 51,
  },
  {
    file: "09-elige-tu-squad-en-3d.png",
    line1: "CHOOSE A 3D COMPANION",
    line2: "THAT FEELS LIKE YOURS.",
    subtitle: "Rotate it, tap it and discover the personality behind every specialist.",
    experience1: "The analysis stays serious",
    experience2: "while the experience stays playful.",
    headlineSize1: 70,
    headlineSize2: 67,
    subtitleSize: 24,
    experienceSize: 52,
  },
  {
    file: "10-finanzas-serias.png",
    line1: "SERIOUS FINANCE WITHOUT",
    line2: "THE BANKING VIBE.",
    subtitle: "Bobby combines live data, three-agent debate and a companion you actually enjoy.",
    experience1: "It feels like a game,",
    experience2: "but it thinks like a market desk.",
    headlineSize1: 68,
    headlineSize2: 76,
    subtitleSize: 23,
    experienceSize: 52,
  },
];

const escapeXml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const captureWidth = 878;
const captureHeight = Math.round((2622 / 1206) * captureWidth);
const cornerRadius = 66;

const captureMask = Buffer.from(`
  <svg width="${captureWidth}" height="${captureHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${captureWidth}" height="${captureHeight}" rx="${cornerRadius}" fill="#fff"/>
  </svg>
`);

const captureCache = new Map();
const getFramedCapture = async (file = "desk-current.png") => {
  if (!captureCache.has(file)) {
    const capturePath = path.join(rootDir, "docs/app-store/ui-captures", file);
    captureCache.set(
      file,
      sharp(capturePath)
        .resize(captureWidth, captureHeight, { fit: "fill" })
        .composite([{ input: captureMask, blend: "dest-in" }])
        .png()
        .toBuffer(),
    );
  }
  return captureCache.get(file);
};

const frameWidth = captureWidth + 24;
const frameHeight = captureHeight + 24;
const frameSvg = Buffer.from(`
  <svg width="${frameWidth}" height="${frameHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="phoneShadow" x="-40%" y="-30%" width="180%" height="180%">
        <feDropShadow dx="0" dy="30" stdDeviation="34" flood-color="#000" flood-opacity="0.82"/>
      </filter>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#E8FFF0" stop-opacity="0.85"/>
        <stop offset="0.22" stop-color="#25312A"/>
        <stop offset="0.72" stop-color="#0A0D0B"/>
        <stop offset="1" stop-color="#7CFF9F" stop-opacity="0.7"/>
      </linearGradient>
    </defs>
    <rect x="12" y="12" width="${captureWidth}" height="${captureHeight}" rx="${cornerRadius + 2}"
      fill="#050505" stroke="url(#edge)" stroke-width="12" filter="url(#phoneShadow)"/>
  </svg>
`);

const overlaySvg = Buffer.from(`
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#030306" stop-opacity="0.86"/>
        <stop offset="0.27" stop-color="#030306" stop-opacity="0.36"/>
        <stop offset="0.58" stop-color="#030306" stop-opacity="0.13"/>
        <stop offset="1" stop-color="#030306" stop-opacity="0.67"/>
      </linearGradient>
      <radialGradient id="glow" cx="79%" cy="19%" r="48%">
        <stop offset="0" stop-color="#59ff9a" stop-opacity="0.14"/>
        <stop offset="1" stop-color="#59ff9a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#shade)"/>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
  </svg>
`);

for (const frame of frames) {
  const headlineSize1 = frame.headlineSize1 ?? 102;
  const headlineSize2 = frame.headlineSize2 ?? headlineSize1;
  const subtitleSize = frame.subtitleSize ?? 27;
  const headlineSvg = Buffer.from(`
    <svg width="${width}" height="700" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#000" flood-opacity="0.65"/>
        </filter>
      </defs>
      <g filter="url(#shadow)" font-family="Arial, Helvetica, sans-serif">
        <text x="642" y="130" fill="#B8FFCE" font-size="24" font-weight="700"
          letter-spacing="6" text-anchor="middle">${escapeXml(frame.kicker ?? "BOBBY · FINANCIAL AI COMPANION")}</text>
        <text x="642" y="278" fill="#FFFFFF" font-size="${headlineSize1}" font-weight="900"
          letter-spacing="-4" text-anchor="middle">${escapeXml(frame.line1)}</text>
        <text x="642" y="392" fill="#75FF9E" font-size="${headlineSize2}" font-weight="900"
          letter-spacing="-4" text-anchor="middle">${escapeXml(frame.line2)}</text>
        <text x="642" y="468" fill="#FFFFFF" fill-opacity="0.82" font-size="${subtitleSize}"
          font-weight="600" letter-spacing="0.3" text-anchor="middle">${escapeXml(frame.subtitle)}</text>
      </g>
    </svg>
  `);

  const experienceSize = frame.experienceSize ?? 52;
  const experienceSvg = frame.device ? null : Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.48" stop-color="#030306" stop-opacity="0"/>
          <stop offset="0.72" stop-color="#030306" stop-opacity="0.42"/>
          <stop offset="1" stop-color="#030306" stop-opacity="0.93"/>
        </linearGradient>
        <filter id="copyShadow" x="-20%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#000" flood-opacity="0.75"/>
        </filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bottomShade)"/>
      <g filter="url(#copyShadow)" font-family="Arial, Helvetica, sans-serif">
        <rect x="100" y="2166" width="94" height="8" rx="4" fill="#75FF9E"/>
        <text x="100" y="2290" fill="#FFFFFF" font-size="${experienceSize}" font-weight="900" letter-spacing="-1.5">${escapeXml(frame.experience1)}</text>
        <text x="100" y="2360" fill="#FFFFFF" font-size="${experienceSize}" font-weight="900" letter-spacing="-1.5">${escapeXml(frame.experience2)}</text>
      </g>
    </svg>
  `);

  const backgroundPath = path.join(rootDir, "docs/app-store/backgrounds", frame.file);
  const outputPath = path.join(outputDirectory, frame.file);
  const composites = [
    { input: overlaySvg, top: 0, left: 0 },
    { input: headlineSvg, top: 0, left: 0 },
  ];

  if (frame.device) {
    const framedCapture = await getFramedCapture(frame.capture);
    composites.push(
      { input: frameSvg, top: 662, left: Math.round((width - frameWidth) / 2) },
      { input: framedCapture, top: 674, left: Math.round((width - captureWidth) / 2) },
    );
  } else {
    composites.push({ input: experienceSvg, top: 0, left: 0 });
  }

  await sharp(backgroundPath)
    .resize(width, height, { fit: "cover", position: "centre" })
    .composite(composites)
    .flatten({ background: "#000000" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  console.log(outputPath);
}

const previewWidth = 246;
const previewHeight = Math.round((height / width) * previewWidth);
const gutter = 12;
const contactWidth = previewWidth * 5 + gutter * 6;
const contactHeight = previewHeight * 2 + gutter * 3;
const previews = await Promise.all(
  frames.map((frame) =>
    sharp(path.join(outputDirectory, frame.file))
      .resize(previewWidth, previewHeight)
      .jpeg({ quality: 88 })
      .toBuffer(),
  ),
);

await sharp({
  create: {
    width: contactWidth,
    height: contactHeight,
    channels: 3,
    background: "#080A09",
  },
})
  .composite(
    previews.map((input, index) => ({
      input,
      left: gutter + (index % 5) * (previewWidth + gutter),
      top: gutter + Math.floor(index / 5) * (previewHeight + gutter),
    })),
  )
  .jpeg({ quality: 90 })
  .toFile(path.join(outputDirectory, "contact-sheet.jpg"));
