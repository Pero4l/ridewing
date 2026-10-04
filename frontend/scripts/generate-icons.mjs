/**
 * Derives every brand asset from `public/ridewinglogo.png`.
 *
 * The source logo is a 500×500 canvas holding a stacked lockup with a lot of
 * empty margin around it: the wing mark, then the RIDEWING wordmark, then the
 * "RIDE • CONNECT • GROW" tagline. Laying that canvas out directly is unusable —
 * it has to be cropped to its own ink before it can be sized with CSS — and the
 * notification icons the service worker asks for need to exist as real files,
 * because a push notification with a missing icon is dropped outright on some
 * Android builds.
 *
 * So rather than commit a folder of hand-cropped binaries nobody can re-derive,
 * everything is generated from the one source file:
 *
 *   public/ridewing-mark.png     the wing mark alone, trimmed
 *   public/ridewing-blades.png   the mark's green wing blades, trimmed
 *   public/ridewing-lockup.png   mark + wordmark + tagline, trimmed
 *   public/icon-192.png          mark on a dark plate (push notification icon)
 *   public/icon-512.png          the same, larger
 *   app/favicon.ico              32px, wrapped in an ICO container
 *
 * Both logos are white artwork, so they only read on a dark surface. That is why
 * the icons are composited onto a near-black plate rather than left transparent:
 * a transparent white logo is invisible on a light home screen.
 *
 * The icons use only the mark's three green wing blades, not the whole mark. The
 * full mark is a wide letterform with feathered strokes and it turns into an
 * illegible green smear below about 48px — measured at 16, 24 and 32px while
 * picking this. The blades are solid geometric shapes that survive the same
 * reduction, so the icons stay legible in a browser tab, on an Android home
 * screen and in a push notification. The full artwork is still what the app
 * itself displays, where there is room for it.
 *
 * Run with: node scripts/generate-icons.mjs
 */

import { deflateSync, inflateSync } from "node:zlib";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");
const SOURCE_LOGO = join(PUBLIC_DIR, "ridewinglogo.png");

/** Matches zinc-900 closely, with a hint of the brand green in it. */
const PLATE = [16, 19, 18];

/** Fraction of the plate width the mark occupies. */
const MARK_FILL = 0.76;

/** Ink bands closer together than this are one line of artwork, not two. */
const BAND_GAP_PX = 6;

// ─── PNG decoding ────────────────────────────────────────────────────────────

/**
 * Reads a non-interlaced 8-bit RGBA PNG. That is the only shape this script
 * needs to accept, and saying so plainly beats silently mis-decoding something
 * else: an interlaced or palette image throws here rather than producing a
 * corrupted crop.
 */
function decodePng(buffer) {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (buffer[i] !== SIGNATURE[i]) throw new Error("not a PNG");
  }

  let width = 0;
  let height = 0;
  const idat = [];
  let offset = 8;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}); expected 8-bit RGBA`);
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);

  // Reverse the per-row PNG filters (RFC 2083 §6). Each row is reconstructed
  // from the one above it plus already-recovered bytes to its left.
  let position = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position];
    position += 1;
    const row = raw.subarray(position, position + stride);
    position += stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;

      let value = row[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const dl = Math.abs(estimate - left);
        const du = Math.abs(estimate - up);
        const dul = Math.abs(estimate - upLeft);
        value += dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
      pixels[y * stride + x] = value & 0xff;
    }
  }

  return { width, height, pixels };
}

// ─── geometry ────────────────────────────────────────────────────────────────

/** Alpha above this counts as ink. */
const INK = 8;

function isInk(image, x, y) {
  return image.pixels[(y * image.width + x) * 4 + 3] > INK;
}

/** Rows containing any ink, grouped into bands separated by a real gap. */
function inkBands(image) {
  const rows = [];
  for (let y = 0; y < image.height; y += 1) {
    let count = 0;
    for (let x = 0; x < image.width; x += 1) if (isInk(image, x, y)) count += 1;
    rows.push(count);
  }

  const bands = [];
  let start = null;
  for (let y = 0; y < rows.length; y += 1) {
    if (rows[y] > 0 && start === null) start = y;
    else if (rows[y] === 0 && start !== null) {
      bands.push([start, y - 1]);
      start = null;
    }
  }
  if (start !== null) bands.push([start, rows.length - 1]);

  // Letter-spacing inside a word produces sub-threshold gaps; anything tighter
  // than BAND_GAP_PX is still one line of artwork.
  const merged = [];
  for (const band of bands) {
    const last = merged[merged.length - 1];
    if (last && band[0] - last[1] <= BAND_GAP_PX) last[1] = band[1];
    else merged.push([...band]);
  }
  return merged;
}

/** Tight ink bounds within a row range, with `pad` transparent pixels of slack. */
function crop(image, top, bottom, pad = 0) {
  let left = image.width;
  let right = -1;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!isInk(image, x, y)) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (right < left) throw new Error(`no ink between y=${top}..${bottom}`);

  left = Math.max(0, left - pad);
  right = Math.min(image.width - 1, right + pad);
  top = Math.max(0, top - pad);
  bottom = Math.min(image.height - 1, bottom + pad);

  const width = right - left + 1;
  const height = bottom - top + 1;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = ((top + y) * image.width + left) * 4;
    image.pixels.copy(pixels, y * width * 4, from, from + width * 4);
  }
  return { width, height, pixels };
}

/**
 * Box-filtered resample.
 *
 * Averaging every source pixel that falls in a destination pixel's footprint is
 * what keeps the wing's thin feathered strokes from breaking into dashes when
 * the mark is scaled down for a 32px favicon — nearest-neighbour would alias
 * badly at exactly these ratios.
 */
function resample(image, targetWidth, targetHeight) {
  const pixels = Buffer.alloc(targetWidth * targetHeight * 4);
  const scaleX = image.width / targetWidth;
  const scaleY = image.height / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * scaleY));

    for (let x = 0; x < targetWidth; x += 1) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * scaleX));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let samples = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * image.width + sx) * 4;
          const alpha = image.pixels[i + 3];
          // Weight colour by alpha so transparent pixels do not drag the edges
          // of the mark toward black when they are averaged in.
          r += image.pixels[i] * alpha;
          g += image.pixels[i + 1] * alpha;
          b += image.pixels[i + 2] * alpha;
          a += alpha;
          samples += 1;
        }
      }

      const o = (y * targetWidth + x) * 4;
      if (a === 0) {
        pixels[o] = pixels[o + 1] = pixels[o + 2] = pixels[o + 3] = 0;
      } else {
        pixels[o] = Math.round(r / a);
        pixels[o + 1] = Math.round(g / a);
        pixels[o + 2] = Math.round(b / a);
        pixels[o + 3] = Math.round(a / samples);
      }
    }
  }
  return { width: targetWidth, height: targetHeight, pixels };
}

/** Signed distance to a rounded rectangle, used as a cheap antialiased mask. */
function roundedRectAlpha(x, y, size, inset, radius) {
  const left = inset;
  const top = inset;
  const right = size - inset;
  const bottom = size - inset;
  if (x < left || x > right || y < top || y > bottom) return 0;

  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  return Math.min(1, Math.max(0, radius + 0.5 - Math.hypot(x - cx, y - cy)));
}

/**
 * The mark's three green wing blades, isolated from the rest of the artwork.
 *
 * Keyed on the brand green rather than cropped, because the blades and the thin
 * circular arc to their right are one connected drawing — cropping between them
 * slices through the letterform. Everything that is not green (the white
 * letterform and its feathered strokes) is dropped, and only the leftmost
 * remaining column run is kept, which is the blades and nothing else.
 */
function wingBlades(image) {
  const GREEN = { min: 110, overRed: 35, overBlue: 25 };
  // The blades are solid, so only their outermost antialiased fringe falls below
  // this. Keeping it out stops a stray half-transparent pixel from surviving as
  // a visible speck once the icon is scaled up.
  const MIN_ALPHA = 96;

  const painted = new Uint8Array(image.width * image.height);
  let paintedCount = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const i = (y * image.width + x) * 4;
      const alpha = image.pixels[i + 3];
      if (alpha < MIN_ALPHA) continue;
      const [r, g, b] = [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]];
      if (g > GREEN.min && g > r + GREEN.overRed && g > b + GREEN.overBlue) {
        painted[y * image.width + x] = 1;
        paintedCount += 1;
      }
    }
  }
  if (!paintedCount) throw new Error("no brand green found in the mark; has the logo changed?");

  // First contiguous run of green columns — the blades. The arc further right is
  // separated from them by empty columns, so this stops before it.
  let runStart = -1;
  let runEnd = -1;
  let seen = false;
  for (let x = 0; x < image.width; x += 1) {
    let columnHasInk = false;
    for (let y = 0; y < image.height; y += 1) {
      if (painted[y * image.width + x]) {
        columnHasInk = true;
        break;
      }
    }
    if (columnHasInk && !seen) {
      runStart = x;
      seen = true;
    } else if (!columnHasInk && seen && runEnd === -1) {
      runEnd = x - 1;
    }
  }
  if (runEnd === -1) runEnd = image.width - 1;

  const pixels = Buffer.alloc(image.width * image.height * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = runStart; x <= runEnd; x += 1) {
      if (!painted[y * image.width + x]) continue;
      const from = (y * image.width + x) * 4;
      image.pixels.copy(pixels, from, from, from + 4);
    }
  }
  return crop({ ...image, pixels }, 0, image.height - 1, 2);
}

/** Centres `mark` on a rounded dark plate of `size`, since the logo is white. */
function plateWithMark(mark, size) {
  const targetWidth = Math.round(size * MARK_FILL);
  const targetHeight = Math.max(1, Math.round((mark.height / mark.width) * targetWidth));
  const scaled = resample(mark, targetWidth, targetHeight);
  const offsetX = Math.round((size - targetWidth) / 2);
  const offsetY = Math.round((size - targetHeight) / 2);

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const plate = roundedRectAlpha(px, py, size, size * 0.02, size * 0.22);

      const o = (y * size + x) * 4;
      const sx = x - offsetX;
      const sy = y - offsetY;
      const inside = sx >= 0 && sx < scaled.width && sy >= 0 && sy < scaled.height;
      const s = inside ? (sy * scaled.width + sx) * 4 : -1;

      const markAlpha = s >= 0 ? scaled.pixels[s + 3] / 255 : 0;
      if (s >= 0 && markAlpha > 0) {
        pixels[o] = scaled.pixels[s];
        pixels[o + 1] = scaled.pixels[s + 1];
        pixels[o + 2] = scaled.pixels[s + 2];
      } else {
        pixels[o] = PLATE[0];
        pixels[o + 1] = PLATE[1];
        pixels[o + 2] = PLATE[2];
      }
      pixels[o + 3] = Math.round(plate * 255);
    }
  }
  return { width: size, height: size, pixels };
}

// ─── PNG / ICO encoding ──────────────────────────────────────────────────────

/** Minimal truecolour-with-alpha PNG encoder (filter type 0 on every row). */
function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Wraps a PNG in a single-image ICO container (Vista and later read PNG fine). */
function encodeIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // 0 means 256
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0; // palette size
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
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

// ─── build ───────────────────────────────────────────────────────────────────

mkdirSync(PUBLIC_DIR, { recursive: true });

const source = decodePng(readFileSync(SOURCE_LOGO));
const bands = inkBands(source);
if (bands.length < 2) {
  throw new Error(`expected a mark plus a wordmark in ${SOURCE_LOGO}, found ${bands.length} ink band(s)`);
}

// The topmost band is the wing mark on its own; everything down to the last band
// is the full lockup.
const mark = crop(source, bands[0][0], bands[0][1], 2);
const lockup = crop(source, bands[0][0], bands[bands.length - 1][1], 2);

console.log(`source ${source.width}×${source.height}, ${bands.length} ink bands`);
console.log(`  mark   ${mark.width}×${mark.height}`);
console.log(`  lockup ${lockup.width}×${lockup.height}`);

const blades = wingBlades(mark);
console.log(`  blades ${blades.width}×${blades.height} (icon source)`);

const outputs = [
  [join(PUBLIC_DIR, "ridewing-mark.png"), encodePng(mark.width, mark.height, mark.pixels)],
  [join(PUBLIC_DIR, "ridewing-blades.png"), encodePng(blades.width, blades.height, blades.pixels)],
  [join(PUBLIC_DIR, "ridewing-lockup.png"), encodePng(lockup.width, lockup.height, lockup.pixels)],
];

for (const size of [192, 512]) {
  const icon = plateWithMark(blades, size);
  outputs.push([join(PUBLIC_DIR, `icon-${size}.png`), encodePng(size, size, icon.pixels)]);
}

const favicon = plateWithMark(blades, 32);
outputs.push([join(ROOT, "app", "favicon.ico"), encodeIco(encodePng(32, 32, favicon.pixels), 32)]);

for (const [file, buffer] of outputs) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buffer);
  console.log(`wrote ${file.replace(`${ROOT}/`, "")} (${buffer.length} bytes)`);
}
