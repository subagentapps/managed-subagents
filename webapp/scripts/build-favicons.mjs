#!/usr/bin/env node
/**
 * Generates the webapp's favicon PNG set:
 *   - public/favicon-16.png        (16x16, browser tab)
 *   - public/favicon-32.png        (32x32, browser tab retina)
 *   - public/apple-touch-icon.png  (180x180, iOS home screen)
 *
 * Style: phosphor-green ">" character on solid black, monospace,
 * matching the brand established by og-image.png.
 *
 * Run with: node scripts/build-favicons.mjs
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { promises as fs } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");

const FG = "#00ff5f";
const BG = "#000000";

/** Build an SVG with a centered ">" glyph at ~70% of canvas size. */
function svgFor(size) {
  const fontSize = Math.round(size * 0.7);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="monospace" font-weight="700"
        font-size="${fontSize}" fill="${FG}">&gt;</text>
</svg>`;
}

const targets = [
  { name: "favicon-16.png", size: 16 },
  { name: "favicon-32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const { name, size } of targets) {
  const outPath = resolve(publicDir, name);
  await sharp(Buffer.from(svgFor(size)))
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const { size: bytes } = await fs.stat(outPath);
  console.log(`wrote ${outPath} (${bytes} bytes, ${size}x${size})`);
}
