#!/usr/bin/env node
/**
 * Generates webapp/public/og-image.png — the 1200x630 social-unfurl image
 * referenced by index.html's og:image / twitter:image meta tags.
 *
 * Style: phosphor-green monospace on black, evoking a CRT terminal.
 * Run with: npm run og:image
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "..", "public", "og-image.png");

const W = 1200;
const H = 630;
const BORDER_INSET = 16;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#000000"/>
  <rect x="${BORDER_INSET}" y="${BORDER_INSET}"
        width="${W - BORDER_INSET * 2}" height="${H - BORDER_INSET * 2}"
        fill="none" stroke="#2a2a2a" stroke-width="2"/>
  <text x="50%" y="48%" text-anchor="middle"
        font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        font-size="92" font-weight="700" fill="#00ff5f">managedsubagents</text>
  <text x="50%" y="62%" text-anchor="middle"
        font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        font-size="36" font-weight="400" fill="#00ff5f" opacity="0.85">ship · review · merge — on loop.</text>
</svg>`;

await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9, palette: true })
  .toFile(outPath);

const { size } = await import("node:fs").then((m) => m.promises.stat(outPath));
console.log(`wrote ${outPath} (${size} bytes)`);
if (size > 60 * 1024) {
  console.warn(`warning: file size ${size} bytes exceeds 60kB target`);
}
