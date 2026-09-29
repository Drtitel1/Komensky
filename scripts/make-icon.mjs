// Generates the PLACEHOLDER app icon (build/icon.png 512x512 and build/icon.ico with 16..256 px).
// To use your own icon: replace build/icon.ico (multi-size, at least 256x256) and build/icon.png (512x512) and commit them.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const png = (size, rgba) => {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};

// signed distance helpers on the unit square
const sdRoundRect = (x, y, r) => {
  const qx = Math.abs(x - 0.5) - (0.5 - r);
  const qy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdSegment = (px, py, ax, ay, bx, by) => {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
};

function shade(x, y) {
  if (sdRoundRect(x, y, 0.2) > 0) return [0, 0, 0, 0];
  const t = (x + y) / 2;
  let c = [91 + (60 - 91) * t, 75 + (52 - 75) * t, 219 + (170 - 219) * t]; // brand purple gradient
  const w = 0.075; // stroke half-width of the letter K
  const inK = sdSegment(x, y, 0.36, 0.24, 0.36, 0.76) < w || sdSegment(x, y, 0.66, 0.24, 0.38, 0.5) < w || sdSegment(x, y, 0.38, 0.5, 0.68, 0.77) < w;
  if (inK) c = [255, 255, 255];
  if (Math.hypot(x - 0.74, y - 0.27) < 0.055) c = [255, 184, 77]; // warm dot
  return [...c, 255];
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 3;
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const [cr, cg, cb, ca] = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      const o = (py * size + px) * 4;
      if (a > 0) { buf[o] = r / a; buf[o + 1] = g / a; buf[o + 2] = b / a; }
      buf[o + 3] = a / (ss * ss);
    }
  return png(size, buf);
}

mkdirSync("build", { recursive: true });
writeFileSync("build/icon.png", render(512));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map((s) => render(s));
const head = Buffer.alloc(6);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s === 256 ? 0 : s;
  e[1] = s === 256 ? 0 : s;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});
writeFileSync("build/icon.ico", Buffer.concat([head, ...dir, ...images]));
console.log("build/icon.png and build/icon.ico written");
