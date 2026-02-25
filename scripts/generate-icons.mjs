/**
 * Generate PWA icons for Finance Radar.
 *
 * Usage:
 *   node scripts/generate-icons.mjs
 *
 * Creates PNG icons from inline SVG using sharp (install if missing:
 *   npm install -D sharp
 * ).
 *
 * If sharp is unavailable, SVG placeholders are written instead.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "public", "icons");

mkdirSync(iconsDir, { recursive: true });

function radarSVG(size, padding = 0) {
  const bg = "#0f1419";
  const accent = "#f7931a";
  const p = padding; // safe-zone padding for maskable
  const inner = size - p * 2;
  const cx = size / 2;
  const cy = size / 2;
  const r = inner * 0.35;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}" rx="${size * 0.15}"/>
  <!-- outer ring -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${accent}" stroke-width="${size * 0.015}" opacity="0.3"/>
  <!-- middle ring -->
  <circle cx="${cx}" cy="${cy}" r="${r * 0.65}" fill="none" stroke="${accent}" stroke-width="${size * 0.012}" opacity="0.5"/>
  <!-- inner ring -->
  <circle cx="${cx}" cy="${cy}" r="${r * 0.3}" fill="none" stroke="${accent}" stroke-width="${size * 0.01}" opacity="0.7"/>
  <!-- center dot -->
  <circle cx="${cx}" cy="${cy}" r="${size * 0.02}" fill="${accent}"/>
  <!-- sweep line -->
  <line x1="${cx}" y1="${cy}" x2="${cx + r * 0.85}" y2="${cy - r * 0.5}" stroke="${accent}" stroke-width="${size * 0.015}" stroke-linecap="round" opacity="0.9"/>
  <!-- signal blips -->
  <circle cx="${cx + r * 0.5}" cy="${cy - r * 0.3}" r="${size * 0.015}" fill="${accent}" opacity="0.8"/>
  <circle cx="${cx - r * 0.25}" cy="${cy - r * 0.55}" r="${size * 0.012}" fill="${accent}" opacity="0.6"/>
  <circle cx="${cx + r * 0.15}" cy="${cy + r * 0.45}" r="${size * 0.01}" fill="${accent}" opacity="0.5"/>
  <!-- FR text -->
  <text x="${cx}" y="${cy + inner * 0.28}" text-anchor="middle" fill="${accent}" font-family="system-ui, sans-serif" font-weight="700" font-size="${inner * 0.12}">FR</text>
</svg>`;
}

const configs = [
  { name: "icon-192.png", size: 192, padding: 0 },
  { name: "icon-512.png", size: 512, padding: 0 },
  { name: "icon-maskable-512.png", size: 512, padding: 80 },
];

async function generateWithSharp() {
  const sharp = (await import("sharp")).default;
  for (const { name, size, padding } of configs) {
    const svg = Buffer.from(radarSVG(size, padding));
    await sharp(svg).png().toFile(join(iconsDir, name));
    console.log(`  Created ${name} (${size}x${size})`);
  }
}

function generateSVGFallbacks() {
  for (const { name, size, padding } of configs) {
    const svgName = name.replace(".png", ".svg");
    writeFileSync(join(iconsDir, svgName), radarSVG(size, padding));
    console.log(`  Created ${svgName} (SVG fallback)`);
  }
  console.log(
    "\n  To convert to PNG, install sharp: npm install -D sharp\n  Then re-run: node scripts/generate-icons.mjs"
  );
}

console.log("Generating PWA icons...\n");
try {
  await generateWithSharp();
  console.log("\nDone! PNG icons generated.");
} catch {
  console.log("sharp not available, generating SVG fallbacks...\n");
  generateSVGFallbacks();
}
