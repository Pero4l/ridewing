/**
 * Generates the notification icons the service worker asks for.
 *
 * `public/sw.js` sets `icon` and `badge` to /icon-192.png, and the manifest
 * wants a 512 too. Neither file exists, and a push notification with a missing
 * icon is dropped outright on some Android builds — so they are generated from
 * source here rather than committed as opaque binaries nobody can edit.
 *
 * Run with: node scripts/generate-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const EMERALD = [5, 150, 105];
const WHITE = [255, 255, 255];

/** Signed distance to a rounded rectangle, used as a cheap antialiased mask. */
function roundedRectAlpha(x, y, size, inset, radius) {
  const left = inset;
  const top = inset;
  const right = size - inset;
  const bottom = size - inset;
  if (x < left || x > right || y < top || y > bottom) return 0;

  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  const distance = Math.hypot(dx, dy);
  return Math.min(1, Math.max(0, radius + 0.5 - distance));
}

/**
 * Distance from (x, y) to a thick line segment — draws the two wing strokes and
 * the mast of the mark.
 */
function segmentAlpha(x, y, ax, ay, bx, by, halfWidth) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = x - ax;
  const apy = y - ay;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, (apx * abx + apy * aby) / lengthSq));
  const px = apx - abx * t;
  const py = apy - aby * t;
  return Math.min(1, Math.max(0, halfWidth + 0.5 - Math.hypot(px, py)));
}

function blend(base, over, alpha) {
  return [
    Math.round(base[0] + (over[0] - base[0]) * alpha),
    Math.round(base[1] + (over[1] - base[1]) * alpha),
    Math.round(base[2] + (over[2] - base[2]) * alpha),
  ];
}

function renderIcon(size) {
  const s = size;
  // A stylised wing: two swept blades joined by a leading edge.
  const strokes = [
    [s * 0.24, s * 0.36, s * 0.6, s * 0.62, s * 0.085],
    [s * 0.24, s * 0.5, s * 0.6, s * 0.76, s * 0.085],
    [s * 0.24, s * 0.34, s * 0.24, s * 0.78, s * 0.075],
  ];

  const raw = Buffer.alloc(s * (s * 4 + 1));
  let offset = 0;
  for (let y = 0; y < s; y += 1) {
    raw[offset] = 0; // PNG filter type: none
    offset += 1;
    for (let x = 0; x < s; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      const plate = roundedRectAlpha(px, py, s, s * 0.02, s * 0.22);
      const ink = strokes.reduce(
        (max, [ax, ay, bx, by, halfWidth]) =>
          Math.max(max, segmentAlpha(px, py, ax, ay, bx, by, halfWidth)),
        0,
      );

      const rgb = blend(EMERALD, WHITE, ink);
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
      raw[offset + 3] = Math.round(Math.max(plate, ink) * 255);
      offset += 4;
    }
  }

  return encodePng(s, s, raw);
}

/** Minimal truecolour-with-alpha PNG encoder (filter type 0 on every row). */
function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  chunks.push(chunk("IHDR", ihdr));
  chunks.push(chunk("IDAT", deflateSync(raw, { level: 9 })));
  chunks.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log(`wrote ${file}`);
}
