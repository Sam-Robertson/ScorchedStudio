// Generates the raster logo the email templates use.
//
// Email needs this: the brand wordmark in public/illustrations is SVG, and
// Gmail, Outlook, and Yahoo all refuse to render SVG in a message body. Run
// this again if the wordmark changes.
//
//   node scripts/make-email-logo.mjs
//
// Then bump LOGO_VERSION in lib/marketing/email-render.ts, or Gmail's image
// proxy will keep serving the previous file from its cache.
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/illustrations/LogoWordmark.svg");

// 600px wide so it stays sharp on a retina screen at its 300px display width.
// Kept transparent: the card it sits on is white by default and editable per
// campaign, so any flattened color would show as a box on most of them. Gmail,
// Outlook, and Yahoo all composite PNG alpha correctly. Dark-mode clients that
// recolor backgrounds can dim a dark logo on transparency, and that is the
// accepted trade for a logo that matches every card color.
await sharp(svg, { density: 300 })
  .resize({ width: 600 })
  .png({ compressionLevel: 9 })
  .toFile("public/email/logo-wordmark.png");

const meta = await sharp("public/email/logo-wordmark.png").metadata();
console.log(`wrote public/email/logo-wordmark.png (${meta.width}x${meta.height})`);
