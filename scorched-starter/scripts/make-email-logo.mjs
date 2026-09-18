// Generates the raster logo the email templates use.
//
// Email needs this: the brand wordmark in public/illustrations is SVG, and
// Gmail, Outlook, and Yahoo all refuse to render SVG in a message body. Run
// this again if the wordmark changes.
//
//   node scripts/make-email-logo.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/illustrations/LogoWordmark.svg");

// 600px wide so it stays sharp on a retina screen at its 300px display width.
// Flattened onto the cream background because email clients do not agree on
// how to composite transparency, and a dark-mode client can turn a transparent
// PNG into black-on-black.
await sharp(svg, { density: 300 })
  .resize({ width: 600 })
  .flatten({ background: "#F7F6F3" })
  .png({ compressionLevel: 9 })
  .toFile("public/email/logo-wordmark.png");

const meta = await sharp("public/email/logo-wordmark.png").metadata();
console.log(`wrote public/email/logo-wordmark.png (${meta.width}x${meta.height})`);
